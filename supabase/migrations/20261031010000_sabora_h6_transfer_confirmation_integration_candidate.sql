-- B2 full candidate integration: grant consumption occurs inside confirmation.
-- Isolated function name, NO runtime EXECUTE: current H6 entrypoint stays fail-closed.
BEGIN;
CREATE OR REPLACE FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
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
  v_transfer boolean:=false; v_binding record; v_approval_id uuid;
BEGIN
  IF p_payment_mode IS NOT NULL AND p_payment_mode NOT IN ('pay_now','pay_at_end') THEN
    RAISE EXCEPTION 'invalid_payment_mode' USING errcode='22023';
  END IF;

  -- Serialize all confirmations for this customer before the first write.
  -- Advisory lock must be taken by every H6 confirmation path using this
  -- function, including the first order on a table.
  SELECT s.customer_id INTO v_session FROM sabora.customer_sessions s
   WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
     AND s.expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_session_forbidden' USING errcode='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_session.customer_id::text, 140630));

  -- Table sessions may differ across tables. Reject any other open account
  -- until transfer continuity is implemented; old open accounts may also block.
  SELECT v.session_id INTO v_visit
    FROM sabora.customer_table_visits v
   WHERE v.customer_id=v_session.customer_id AND v.table_id=p_table_id
     AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
     AND v.expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_visit_forbidden' USING errcode='42501'; END IF;
  -- Resolve the one open economic account before writing the destination order.
  -- An approved grant permits a new destination; no grant means fail closed.
  SELECT a.id,b.table_id,b.session_id,b.visit_key
    INTO v_binding
  FROM sabora.customer_accounts a
  JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
  WHERE a.customer_id=v_session.customer_id AND a.state='open'
  ORDER BY a.created_at,a.id LIMIT 1 FOR UPDATE OF a,b;
  IF FOUND AND v_binding.table_id<>p_table_id THEN
    PERFORM 1 FROM sabora.customer_table_change_requests q
    WHERE q.account_id=v_binding.id AND q.customer_id=v_session.customer_id
      AND q.status='approved' AND q.source_table_id=v_binding.table_id
      AND q.visit_key=v_binding.visit_key
      AND q.requesting_session_hash=p_session_hash;
    IF NOT FOUND THEN RAISE EXCEPTION 'table_change_approval_required' USING errcode='23514'; END IF;
    v_transfer:=true;
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

  IF v_binding.id IS NOT NULL THEN
    SELECT * INTO v_account FROM sabora.customer_accounts a
     WHERE a.id=v_binding.id AND a.customer_id=v_session.customer_id
       AND a.state='open' FOR UPDATE;
  ELSE
    INSERT INTO sabora.customer_accounts(table_id,session_id,visit_key,customer_id)
    VALUES(p_table_id,v_table.session_id,p_visit_key,v_session.customer_id)
    ON CONFLICT(table_id,session_id,visit_key,customer_id) DO NOTHING;
    SELECT * INTO v_account FROM sabora.customer_accounts a
     WHERE a.table_id=p_table_id AND a.session_id=v_table.session_id
       AND a.visit_key=p_visit_key AND a.customer_id=v_session.customer_id FOR UPDATE;
  END IF;
  -- Every confirmed account has exactly one current operational binding.
  -- The provisional cross-table guard still forbids transfers.
  INSERT INTO sabora.customer_account_operational_bindings
    (account_id,table_id,session_id,visit_key)
  VALUES(v_account.id,p_table_id,v_table.session_id,p_visit_key)
  ON CONFLICT ON CONSTRAINT customer_account_operational_bindings_pkey DO NOTHING;
  PERFORM 1 FROM sabora.customer_account_operational_bindings b
   WHERE b.account_id=v_account.id AND
     (v_transfer OR (b.table_id=p_table_id
       AND b.session_id=v_table.session_id AND b.visit_key=p_visit_key))
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'h6_account_binding_scope_conflict' USING errcode='42501'; END IF;

  SELECT * INTO v_round FROM sabora.order_rounds r
   WHERE r.order_id=v_persist.persisted_order_id FOR UPDATE;
  IF FOUND THEN
    -- Idempotency is anchored to the persisted round, never to a newly
    -- selected table account. A replay cannot consume a transfer or re-charge.
    IF v_round.account_id<>v_account.id THEN
      RAISE EXCEPTION 'h6_replay_account_scope_conflict' USING errcode='42501';
    END IF;
    SELECT * INTO v_payment FROM sabora.payment_attempts p WHERE p.round_id=v_round.id;
    RETURN QUERY SELECT v_persist.persisted_order_id,v_persist.persisted_grouping,true,
      v_round.account_id,v_round.id,v_round.amount_cents,v_round.payment_mode,v_round.state,
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

  -- Destination is a mutable projection; the order retains historical scope.
  -- This insert shares the order/round transaction and rolls back with it.
  INSERT INTO sabora.order_round_delivery_destinations
    (round_id,account_id,table_id,session_id,visit_key)
  VALUES(v_round.id,v_account.id,p_table_id,v_table.session_id,p_visit_key);

  -- Every newly confirmed nonterminal line receives its own destination.
  -- The original order and its immutable table remain untouched.
  INSERT INTO sabora.order_line_delivery_destinations
    (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
  SELECT l.id,v_round.id,v_account.id,v_round.order_id,
         p_table_id,v_table.session_id,p_visit_key
  FROM sabora.order_lines l
  WHERE l.order_id=v_round.order_id AND l.status<>'picked_up';

  -- Persisted order and economic round now exist; grant consumption and
  -- pending-delivery redirect are part of the SAME confirmation transaction.
  IF v_transfer THEN
    v_approval_id:=sabora.consume_customer_table_change_h6_candidate(
      v_account.id,v_session.customer_id,p_session_hash,
      p_table_id,v_table.session_id,p_visit_key,v_round.order_id);
  END IF;

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
-- Preserve the existing sealed owner and exact customer runtime boundary.
ALTER FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
-- No runtime grant until PG17 and browser acceptance are complete.
COMMIT;
