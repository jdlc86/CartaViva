-- Candidate-only guard: prevent cross-table H6 economic account splitting.
-- Does not implement transfer; fail closed before persisting a new order.
-- Normative: docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md
-- Requires 20261027122858 H6 migration; isolated PG17 verification mandatory.
BEGIN;
CREATE OR REPLACE FUNCTION sabora.confirm_customer_round_h6_candidate(
  p_session_hash bytea,p_table_id uuid,p_qr_token text,p_visit_key text,
  p_basket_id text,p_request_key text,p_request_fingerprint bytea,
  p_batch_id uuid,p_order_id uuid,p_lines jsonb,p_accepted_reprice boolean,
  p_payment_mode text
)
RETURNS TABLE(
  persisted_order_id uuid,persisted_grouping text,repeated boolean,
  account_id uuid,round_id uuid,amount_cents bigint,effective_payment_mode text,
  round_state text,payment_attempt_id uuid,authorization_key text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $confirm_h6$
DECLARE
  v_persist record; v_session record; v_visit record; v_table record;
  v_account sabora.customer_accounts%ROWTYPE;
  v_round sabora.order_rounds%ROWTYPE; v_payment sabora.payment_attempts%ROWTYPE;
  v_amount bigint; v_mode text; v_deadline timestamptz;
BEGIN
  IF p_payment_mode IS NOT NULL AND p_payment_mode NOT IN ('pay_now','pay_at_end') THEN
    RAISE EXCEPTION 'invalid_payment_mode' USING errcode='22023';
  END IF;

  -- Fail closed before any order is persisted: the current H6 account lookup
  -- is table-scoped and would otherwise open a second economic account.
  -- This is NOT a transfer implementation. It preserves the invariant until
  -- the atomic transfer/round lookup/delivery refactor is certified.
  SELECT s.customer_id INTO v_session FROM sabora.customer_sessions s
   WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
     AND s.expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_session_forbidden' USING errcode='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_session.customer_id::text, 140630));
  IF EXISTS (
    SELECT 1 FROM sabora.customer_accounts a
    WHERE a.customer_id=v_session.customer_id AND a.state='open'
      AND a.table_id<>p_table_id
  ) THEN
    RAISE EXCEPTION 'table_change_transfer_not_integrated' USING errcode='23514';
  END IF;

  SELECT * INTO v_persist FROM sabora.persist_customer_order_candidate(
    p_session_hash,p_table_id,p_qr_token,p_visit_key,p_basket_id,p_request_key,
    p_request_fingerprint,p_batch_id,p_order_id,p_lines,p_accepted_reprice
  );
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_h6_order_result' USING errcode='55000'; END IF;

  SELECT s.customer_id INTO v_session FROM sabora.customer_sessions s
   WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
     AND s.expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_session_forbidden' USING errcode='42501'; END IF;
  SELECT v.customer_id,v.table_id,v.session_id,v.visit_key INTO v_visit
   FROM sabora.customer_table_visits v
   WHERE v.customer_id=v_session.customer_id AND v.table_id=p_table_id
     AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
     AND v.expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_visit_forbidden' USING errcode='42501'; END IF;
  SELECT t.session_id,t.require_pay_as_ordered,t.payment_policy_version,
         t.first_confirmed_at,t.grouping_window_seconds
    INTO v_table FROM sabora.dining_tables t
   WHERE t.id=p_table_id AND t.session_id=v_visit.session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_table_forbidden' USING errcode='42501'; END IF;

  SELECT COALESCE(sum((line.value->'evidence'->>'totalCents')::bigint),0)
    INTO v_amount FROM jsonb_array_elements(p_lines) line(value);
  IF v_amount<0 THEN RAISE EXCEPTION 'invalid_h6_order_amount' USING errcode='22023'; END IF;

  INSERT INTO sabora.customer_accounts(table_id,session_id,visit_key,customer_id)
  VALUES(p_table_id,v_table.session_id,p_visit_key,v_session.customer_id)
  ON CONFLICT(table_id,session_id,visit_key,customer_id) DO NOTHING;
  SELECT * INTO v_account FROM sabora.customer_accounts a
   WHERE a.table_id=p_table_id AND a.session_id=v_table.session_id
     AND a.visit_key=p_visit_key AND a.customer_id=v_session.customer_id FOR UPDATE;

  SELECT * INTO v_round FROM sabora.order_rounds r
   WHERE r.order_id=v_persist.persisted_order_id FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_payment FROM sabora.payment_attempts p WHERE p.round_id=v_round.id;
    RETURN QUERY SELECT v_persist.persisted_order_id,v_persist.persisted_grouping,true,
      v_account.id,v_round.id,v_round.amount_cents,v_round.payment_mode,v_round.state,
      v_payment.id,v_payment.authorization_key;
    RETURN;
  END IF;

  IF v_amount=0 THEN
    v_mode:=NULL;
  ELSE
    IF v_account.payment_mode IS NULL THEN
      IF p_payment_mode IS NULL THEN RAISE EXCEPTION 'payment_mode_required' USING errcode='22023'; END IF;
      IF v_table.require_pay_as_ordered AND p_payment_mode<>'pay_now' THEN
        RAISE EXCEPTION 'table_requires_pay_now' USING errcode='23514';
      END IF;
      UPDATE sabora.customer_accounts SET payment_mode=p_payment_mode,
        payment_mode_selected_at=clock_timestamp(),updated_at=clock_timestamp()
       WHERE id=v_account.id RETURNING * INTO v_account;
    ELSIF p_payment_mode IS NOT NULL AND p_payment_mode<>v_account.payment_mode THEN
      RAISE EXCEPTION 'payment_mode_conflict' USING errcode='23505';
    END IF;
    IF v_table.require_pay_as_ordered AND v_account.payment_mode='pay_at_end' THEN
      RAISE EXCEPTION 'payment_policy_conflict' USING errcode='23514';
    END IF;
    v_mode:=v_account.payment_mode;
  END IF;

  v_deadline:=COALESCE(v_table.first_confirmed_at,clock_timestamp())
    +make_interval(secs=>v_table.grouping_window_seconds);
  INSERT INTO sabora.order_rounds(order_id,account_id,amount_cents,payment_mode,
    payment_policy_version,grouping_deadline,state)
  VALUES(v_persist.persisted_order_id,v_account.id,v_amount,v_mode,
    v_table.payment_policy_version,v_deadline,
    CASE WHEN v_amount=0 THEN 'free_grouping'
      WHEN v_mode='pay_now' THEN 'awaiting_authorization' ELSE 'grouping' END)
  RETURNING * INTO v_round;

  INSERT INTO sabora.kitchen_dispatches(round_id,order_id,revision_number,dispatch_key,state)
  VALUES(v_round.id,v_round.order_id,v_round.revision_number,
    'h6_dispatch_'||replace(v_round.order_id::text,'-','_'),'blocked');

  IF v_amount>0 AND v_mode='pay_now' THEN
    INSERT INTO sabora.payment_attempts(round_id,account_id,amount_cents,
      authorization_key,capture_key,state)
    VALUES(v_round.id,v_account.id,v_amount,
      'h6_auth_'||replace(v_round.order_id::text,'-','_'),
      'h6_capture_'||replace(v_round.order_id::text,'-','_'),'authorization_requested')
    RETURNING * INTO v_payment;
  ELSIF v_amount>0 AND v_mode='pay_at_end' THEN
    UPDATE sabora.customer_accounts SET outstanding_cents=outstanding_cents+v_amount,
      updated_at=clock_timestamp() WHERE id=v_account.id RETURNING * INTO v_account;
  END IF;

  PERFORM sabora.emit_h6_event_candidate(p_table_id,v_table.session_id,p_visit_key,
    v_session.customer_id,v_account.id,NULL,'customer','sabora.round.confirmed',
    v_round.id,1,jsonb_build_object('orderId',v_round.order_id,'roundId',v_round.id,
      'amountCents',v_amount,'paymentMode',v_mode,'state',v_round.state));
  IF v_mode='pay_now' THEN
    PERFORM sabora.emit_h6_event_candidate(p_table_id,v_table.session_id,p_visit_key,
      v_session.customer_id,v_account.id,NULL,'customer','sabora.payment.authorization_requested',
      v_payment.id,1,jsonb_build_object('orderId',v_round.order_id,'paymentAttemptId',v_payment.id,
        'amountCents',v_amount));
  END IF;

  RETURN QUERY SELECT v_persist.persisted_order_id,v_persist.persisted_grouping,
    v_persist.repeated,v_account.id,v_round.id,v_amount,v_mode,v_round.state,
    v_payment.id,v_payment.authorization_key;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'invalid_h6_order_input' USING errcode='22023';
END;
$confirm_h6$;
ALTER FUNCTION sabora.confirm_customer_round_h6_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.confirm_customer_round_h6_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT USAGE ON SCHEMA sabora TO sabora_h6_customer_runtime;
GRANT EXECUTE ON FUNCTION sabora.confirm_customer_round_h6_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 TO sabora_h6_customer_runtime;

COMMIT;
