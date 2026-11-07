-- M4 third-party CASH payment candidate: the existing H6 payment/refund contracts
-- remain authoritative. Only one Sabora restaurant. No remote Stripe, credentials,
-- login creation, deployment or operational Supabase mutation.
-- A payer explicitly selects positive unpaid rounds of other diners in the same
-- live table/session. Every funded round has ONE original payer and cash receipt.
-- A later refund requires proof freshly issued to that original authenticated payer.
BEGIN;

CREATE TABLE sabora.third_party_cash_intents_candidate (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payer_customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
 table_session_id uuid NOT NULL,
 request_key text NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{16,128}$'),
 request_fingerprint bytea NOT NULL CHECK(octet_length(request_fingerprint)=32),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','paid')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 paid_at timestamptz,
 paid_by_staff uuid REFERENCES sabora.staff_members(user_id),
 UNIQUE(payer_customer_id,request_key),
 CHECK((state='pending' AND paid_at IS NULL AND paid_by_staff IS NULL)
   OR (state='paid' AND paid_at IS NOT NULL AND paid_by_staff IS NOT NULL))
);

CREATE TABLE sabora.third_party_cash_intent_rounds_candidate (
 intent_id uuid NOT NULL REFERENCES sabora.third_party_cash_intents_candidate(id),
 round_id uuid NOT NULL REFERENCES sabora.order_rounds(id),
 account_id uuid NOT NULL REFERENCES sabora.customer_accounts(id),
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 PRIMARY KEY(intent_id,round_id)
);

CREATE TABLE sabora.third_party_cash_round_funding_candidate (
 round_id uuid PRIMARY KEY REFERENCES sabora.order_rounds(id),
 intent_id uuid NOT NULL REFERENCES sabora.third_party_cash_intents_candidate(id),
 account_id uuid NOT NULL REFERENCES sabora.customer_accounts(id),
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 cash_settlement_id uuid NOT NULL UNIQUE REFERENCES sabora.cash_settlements(id),
 confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sabora.third_party_cash_refund_claims_candidate (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id uuid NOT NULL REFERENCES sabora.incident_cases(id),
 payer_customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 proof_sha256 bytea NOT NULL CHECK(octet_length(proof_sha256)=32),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 consumed_at timestamptz,
 CHECK(expires_at>created_at),
 CHECK(NOT (revoked_at IS NOT NULL AND consumed_at IS NOT NULL))
);

CREATE TABLE sabora.third_party_cash_refunds_candidate (
 incident_id uuid PRIMARY KEY REFERENCES sabora.incident_cases(id),
 original_intent_id uuid NOT NULL REFERENCES sabora.third_party_cash_intents_candidate(id),
 original_payer_customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 claim_id uuid NOT NULL UNIQUE REFERENCES sabora.third_party_cash_refund_claims_candidate(id),
 cash_settlement_id uuid NOT NULL UNIQUE REFERENCES sabora.cash_settlements(id)
   DEFERRABLE INITIALLY DEFERRED,
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 recorded_by uuid NOT NULL REFERENCES sabora.staff_members(user_id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

DO $security$
DECLARE v text;
BEGIN
 FOREACH v IN ARRAY ARRAY[
   'third_party_cash_intents_candidate','third_party_cash_intent_rounds_candidate',
   'third_party_cash_round_funding_candidate','third_party_cash_refund_claims_candidate',
   'third_party_cash_refunds_candidate'
 ] LOOP
   EXECUTE format('ALTER TABLE sabora.%I ENABLE ROW LEVEL SECURITY',v);
   EXECUTE format('ALTER TABLE sabora.%I FORCE ROW LEVEL SECURITY',v);
   EXECUTE format('REVOKE ALL ON sabora.%I FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_provider_runtime,sabora_h6_operations_runtime',v);
   EXECUTE format('GRANT SELECT,INSERT ON sabora.%I TO sabora_h6_fn_owner',v);
   EXECUTE format('CREATE POLICY tp_h6_owner_read ON sabora.%I FOR SELECT TO sabora_h6_fn_owner USING(true)',v);
   EXECUTE format('CREATE POLICY tp_h6_owner_insert ON sabora.%I FOR INSERT TO sabora_h6_fn_owner WITH CHECK(true)',v);
 END LOOP;
END; $security$;
GRANT UPDATE ON sabora.third_party_cash_intents_candidate,
 sabora.third_party_cash_refund_claims_candidate TO sabora_h6_fn_owner;
CREATE POLICY tp_h6_owner_update ON sabora.third_party_cash_intents_candidate
 FOR UPDATE TO sabora_h6_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY tp_h6_owner_update ON sabora.third_party_cash_refund_claims_candidate
 FOR UPDATE TO sabora_h6_fn_owner USING(true) WITH CHECK(true);

CREATE TRIGGER tp_intent_rounds_immutable BEFORE UPDATE OR DELETE
 ON sabora.third_party_cash_intent_rounds_candidate
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER tp_round_funding_immutable BEFORE UPDATE OR DELETE
 ON sabora.third_party_cash_round_funding_candidate
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER tp_refunds_immutable BEFORE UPDATE OR DELETE
 ON sabora.third_party_cash_refunds_candidate
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER tp_intent_rounds_no_truncate BEFORE TRUNCATE
 ON sabora.third_party_cash_intent_rounds_candidate
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER tp_round_funding_no_truncate BEFORE TRUNCATE
 ON sabora.third_party_cash_round_funding_candidate
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER tp_refunds_no_truncate BEFORE TRUNCATE
 ON sabora.third_party_cash_refunds_candidate
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_h6_history_mutation();

-- The internal helper is NOT a browser or SQL-runtime API.
CREATE FUNCTION sabora.third_party_payer_scope_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text
) RETURNS TABLE(payer_id uuid,active_session_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32
   OR p_table_id IS NULL OR p_visit_key IS NULL
   OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$'
 THEN RAISE EXCEPTION 'invalid_third_party_scope' USING errcode='22023'; END IF;
 RETURN QUERY SELECT s.customer_id,t.session_id
  FROM sabora.customer_sessions s
  JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
  JOIN sabora.dining_tables t ON t.id=v.table_id AND t.session_id=v.session_id
  WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp()
   AND v.table_id=p_table_id AND v.visit_key=p_visit_key
   AND v.revoked_at IS NULL AND v.expires_at>clock_timestamp()
   AND v.authorized_qr_version=t.qr_version
  FOR SHARE OF s,v,t;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'third_party_scope_forbidden' USING errcode='42501'; END IF;
END; $fn$;
ALTER FUNCTION sabora.third_party_payer_scope_candidate(bytea,uuid,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.third_party_payer_scope_candidate(bytea,uuid,text)
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.third_party_payer_scope_candidate(bytea,uuid,text)
 TO sabora_h6_fn_owner;

-- Limit the new option to a round whose debt has unambiguous provenance.
-- Existing unattributed cash receipts never become silently assigned to a
-- chosen round. Already funded other rounds may coexist with this round.
CREATE FUNCTION sabora.third_party_round_eligible_candidate(
 p_round_id uuid,p_payer_id uuid,p_table_id uuid,p_session_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT EXISTS(
  SELECT 1 FROM sabora.order_rounds r
  JOIN sabora.customer_accounts a ON a.id=r.account_id
  JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
  WHERE r.id=p_round_id AND r.amount_cents>0
   AND r.payment_mode='pay_at_end' AND r.state NOT IN('cancelled','payment_failed','compensation_required')
   AND a.state='open' AND a.payment_mode='pay_at_end'
   AND a.customer_id<>p_payer_id
   AND b.table_id=p_table_id AND b.session_id=p_session_id
   AND a.outstanding_cents>=r.amount_cents
   AND NOT EXISTS(SELECT 1 FROM sabora.incident_cases i WHERE i.round_id=r.id
     AND i.state<>'rejected_customer_request')
   AND NOT EXISTS(SELECT 1 FROM sabora.third_party_cash_round_funding_candidate f
     WHERE f.round_id=r.id)
   AND NOT EXISTS(SELECT 1 FROM sabora.payment_attempts p WHERE p.account_id=a.id
     AND p.state IN('authorization_requested','authorization_unknown',
      'capture_requested','capture_unknown'))
   AND NOT EXISTS(
      SELECT 1 FROM sabora.cash_settlements c WHERE c.account_id=a.id AND c.kind='payment'
      AND NOT EXISTS(SELECT 1 FROM sabora.third_party_cash_round_funding_candidate f
        WHERE f.cash_settlement_id=c.id))
 );
$fn$;
ALTER FUNCTION sabora.third_party_round_eligible_candidate(uuid,uuid,uuid,uuid)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.third_party_round_eligible_candidate(uuid,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,sabora_h6_operations_runtime,
  sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.third_party_round_eligible_candidate(uuid,uuid,uuid,uuid)
 TO sabora_h6_fn_owner;

CREATE FUNCTION sabora.read_third_party_cash_debts_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_payer uuid;v_session uuid;v_items jsonb;
BEGIN
 SELECT payer_id,active_session_id INTO v_payer,v_session
  FROM sabora.third_party_payer_scope_candidate(p_session_hash,p_table_id,p_visit_key);
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'roundId',q.round_id,'accountId',q.account_id,
  'customerCode',q.public_id,'amountCents',q.amount_cents)
  ORDER BY q.public_id,q.round_id),'[]'::jsonb) INTO v_items
 FROM (
  SELECT r.id AS round_id,r.account_id,p.public_id,r.amount_cents
  FROM sabora.order_rounds r
  JOIN sabora.customer_accounts a ON a.id=r.account_id
  JOIN sabora.customer_profiles p ON p.id=a.customer_id
  JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
  WHERE b.table_id=p_table_id AND b.session_id=v_session AND a.customer_id<>v_payer
   AND sabora.third_party_round_eligible_candidate(r.id,v_payer,p_table_id,v_session)
  ORDER BY p.public_id,r.id LIMIT 50
 ) q;
 RETURN jsonb_build_object('version',1,'items',v_items);
END; $fn$;
ALTER FUNCTION sabora.read_third_party_cash_debts_candidate(bytea,uuid,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_third_party_cash_debts_candidate(bytea,uuid,text)
 FROM PUBLIC,anon,authenticated,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_third_party_cash_debts_candidate(bytea,uuid,text)
 TO sabora_h6_customer_runtime;

CREATE FUNCTION sabora.create_third_party_cash_intent_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text,
 p_rounds jsonb,p_request_key text,p_consent boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_payer uuid;v_session uuid;v_hash bytea;v_intent sabora.third_party_cash_intents_candidate%ROWTYPE;
 v_item jsonb;v_round uuid;v_amount bigint;v_previous uuid;v_account uuid;
 v_total bigint:=0;v_count integer:=0;
BEGIN
 IF p_consent IS DISTINCT FROM true OR p_rounds IS NULL
  OR jsonb_typeof(p_rounds)<>'array' OR jsonb_array_length(p_rounds) NOT BETWEEN 1 AND 10
  OR p_request_key !~ '^[A-Za-z0-9_-]{16,128}$'
 THEN RAISE EXCEPTION 'invalid_third_party_intent' USING errcode='22023'; END IF;
 SELECT payer_id,active_session_id INTO v_payer,v_session
  FROM sabora.third_party_payer_scope_candidate(p_session_hash,p_table_id,p_visit_key);
 -- Explicit payload, not an implied agreement from scanning a QR.
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_rounds) LOOP
  IF jsonb_typeof(v_item)<>'object'
   OR (SELECT count(*) FROM jsonb_object_keys(v_item))<>2
   OR NOT(v_item?'roundId') OR NOT(v_item?'amountCents')
   OR (v_item->>'roundId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR (v_item->>'amountCents') !~ '^[1-9][0-9]{0,11}$'
  THEN RAISE EXCEPTION 'invalid_third_party_intent' USING errcode='22023'; END IF;
 END LOOP;
 v_hash:=sha256(convert_to(p_table_id::text||':'||v_session::text||':'||p_rounds::text,'UTF8'));
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('tp:'||v_payer::text||':'||p_request_key,0));
 SELECT * INTO v_intent FROM sabora.third_party_cash_intents_candidate
  WHERE payer_customer_id=v_payer AND request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
  IF v_intent.request_fingerprint<>v_hash THEN
   RAISE EXCEPTION 'third_party_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN jsonb_build_object('version',1,'intentId',v_intent.id,
   'state',v_intent.state,'repeated',true,
   'totalCents',(SELECT sum(i.amount_cents) FROM sabora.third_party_cash_intent_rounds_candidate i
     WHERE i.intent_id=v_intent.id));
 END IF;
 -- Canonical, ascending row lock order independent of request array order.
 INSERT INTO sabora.third_party_cash_intents_candidate
  (payer_customer_id,table_id,table_session_id,request_key,request_fingerprint)
 VALUES(v_payer,p_table_id,v_session,p_request_key,v_hash) RETURNING * INTO v_intent;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_rounds)
   ORDER BY value->>'roundId' LOOP
  v_round:=(v_item->>'roundId')::uuid;v_amount:=(v_item->>'amountCents')::bigint;
  IF v_previous IS NOT NULL AND v_round<=v_previous THEN
   RAISE EXCEPTION 'invalid_third_party_intent' USING errcode='22023'; END IF;
  v_previous:=v_round;
  SELECT r.account_id INTO v_account FROM sabora.order_rounds r WHERE r.id=v_round FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'third_party_debt_unavailable' USING errcode='23514'; END IF;
  PERFORM 1 FROM sabora.customer_accounts a WHERE a.id=v_account FOR UPDATE;
  IF NOT sabora.third_party_round_eligible_candidate(v_round,v_payer,p_table_id,v_session)
   OR v_amount IS DISTINCT FROM (SELECT amount_cents FROM sabora.order_rounds WHERE id=v_round)
  THEN RAISE EXCEPTION 'third_party_debt_unavailable' USING errcode='23514'; END IF;
  v_total:=v_total+v_amount;v_count:=v_count+1;
  INSERT INTO sabora.third_party_cash_intent_rounds_candidate(intent_id,round_id,account_id,amount_cents)
   VALUES(v_intent.id,v_round,v_account,v_amount);
 END LOOP;
 IF v_total<=0 OR v_total>999999999999 THEN
   RAISE EXCEPTION 'invalid_third_party_intent' USING errcode='22023'; END IF;
 RETURN jsonb_build_object('version',1,'intentId',v_intent.id,
  'state','pending','repeated',false,'totalCents',v_total);
END; $fn$;
ALTER FUNCTION sabora.create_third_party_cash_intent_candidate(bytea,uuid,text,jsonb,text,boolean)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.create_third_party_cash_intent_candidate(bytea,uuid,text,jsonb,text,boolean)
 FROM PUBLIC,anon,authenticated,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.create_third_party_cash_intent_candidate(bytea,uuid,text,jsonb,text,boolean)
 TO sabora_h6_customer_runtime;

CREATE FUNCTION sabora.read_third_party_cash_pending_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_role text;v_items jsonb;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(
  p_key_id,p_database_role,p_actor_user_id,p_staff_role,'read_cash_accounts',
  p_actor_user_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('admin','root','waiter') THEN
  RAISE EXCEPTION 'third_party_cash_forbidden' USING errcode='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('intentId',q.id,
  'payerCode',q.public_id,'totalCents',q.amount_cents,'rounds',q.rounds,
  'createdAt',q.created_at) ORDER BY q.created_at DESC,q.id),'[]'::jsonb)
 INTO v_items FROM (
  SELECT i.id,p.public_id,i.created_at,sum(ir.amount_cents)::bigint AS amount_cents,
   jsonb_agg(jsonb_build_object('roundId',ir.round_id,
     'accountId',ir.account_id,'amountCents',ir.amount_cents)
     ORDER BY ir.round_id) AS rounds
  FROM sabora.third_party_cash_intents_candidate i
  JOIN sabora.customer_profiles p ON p.id=i.payer_customer_id
  JOIN sabora.third_party_cash_intent_rounds_candidate ir ON ir.intent_id=i.id
  JOIN sabora.dining_tables t ON t.id=i.table_id AND t.session_id=i.table_session_id
  WHERE i.state='pending'
  GROUP BY i.id,p.public_id,i.created_at
  ORDER BY i.created_at DESC,i.id LIMIT 50
 ) q;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 RETURN jsonb_build_object('version',1,'items',v_items);
END; $fn$;
ALTER FUNCTION sabora.read_third_party_cash_pending_candidate(text,text,uuid,text,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_third_party_cash_pending_candidate(text,text,uuid,text,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_third_party_cash_pending_candidate(text,text,uuid,text,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;

CREATE FUNCTION sabora.settle_third_party_cash_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_intent_id uuid,p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_role text;v_intent sabora.third_party_cash_intents_candidate%ROWTYPE;
 v_row record;v_account sabora.customer_accounts%ROWTYPE;v_receipt uuid;
 v_fingerprint bytea;v_existing record;v_result jsonb;v_total bigint:=0;
 v_binding record;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(
  p_key_id,p_database_role,p_actor_user_id,p_staff_role,'settle_cash',
  p_intent_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN('waiter','admin','root') THEN
  RAISE EXCEPTION 'third_party_cash_forbidden' USING errcode='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_actor_user_id::text||':'||p_correlation_id,0));
 v_fingerprint:=sha256(convert_to('tp_cash:'||p_intent_id::text,'UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests
  WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_intent FROM sabora.third_party_cash_intents_candidate
  WHERE id=p_intent_id FOR UPDATE;
 IF NOT FOUND OR v_intent.state<>'pending' THEN
  RAISE EXCEPTION 'third_party_cash_conflict' USING errcode='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sabora.dining_tables t
  WHERE t.id=v_intent.table_id AND t.session_id=v_intent.table_session_id)
 THEN RAISE EXCEPTION 'third_party_cash_conflict' USING errcode='23514'; END IF;
 -- Deterministic account order; locks are held through the multi-round commit.
 FOR v_row IN SELECT a.id,sum(ir.amount_cents)::bigint AS due
  FROM sabora.third_party_cash_intent_rounds_candidate ir
  JOIN sabora.customer_accounts a ON a.id=ir.account_id
  WHERE ir.intent_id=p_intent_id GROUP BY a.id ORDER BY a.id LOOP
  SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_row.id FOR UPDATE;
  IF v_account.state<>'open' OR v_account.payment_mode<>'pay_at_end'
    OR v_account.outstanding_cents<v_row.due
  THEN RAISE EXCEPTION 'third_party_cash_conflict' USING errcode='23514'; END IF;
 END LOOP;
 FOR v_row IN SELECT ir.* FROM sabora.third_party_cash_intent_rounds_candidate ir
  WHERE ir.intent_id=p_intent_id ORDER BY ir.round_id LOOP
  IF NOT sabora.third_party_round_eligible_candidate(
    v_row.round_id,v_intent.payer_customer_id,v_intent.table_id,v_intent.table_session_id)
  THEN RAISE EXCEPTION 'third_party_cash_conflict' USING errcode='23514'; END IF;
  v_receipt:=gen_random_uuid();
  INSERT INTO sabora.cash_settlements(id,account_id,actor_user_id,correlation_id,amount_cents,kind)
   VALUES(v_receipt,v_row.account_id,p_actor_user_id,
    'tp_cash_'||replace(v_receipt::text,'-',''),v_row.amount_cents,'payment');
  UPDATE sabora.customer_accounts SET
   outstanding_cents=outstanding_cents-v_row.amount_cents,
   cash_settled_cents=cash_settled_cents+v_row.amount_cents,
   updated_at=clock_timestamp() WHERE id=v_row.account_id;
  INSERT INTO sabora.third_party_cash_round_funding_candidate(
    round_id,intent_id,account_id,amount_cents,cash_settlement_id)
  VALUES(v_row.round_id,p_intent_id,v_row.account_id,v_row.amount_cents,v_receipt);
  SELECT b.table_id,b.session_id,b.visit_key,a.customer_id INTO v_binding
   FROM sabora.customer_account_operational_bindings b
   JOIN sabora.customer_accounts a ON a.id=b.account_id
   WHERE b.account_id=v_row.account_id;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'third_party_cash_conflict' USING errcode='23514'; END IF;
  PERFORM sabora.emit_h6_event_candidate(
   v_binding.table_id,v_binding.session_id,v_binding.visit_key,v_binding.customer_id,
   v_row.account_id,NULL,'customer','sabora.account.third_party_cash_paid',v_receipt,1,
   jsonb_build_object('accountId',v_row.account_id,'roundId',v_row.round_id,
    'amountCents',v_row.amount_cents,'outstandingCents',
     (SELECT outstanding_cents FROM sabora.customer_accounts WHERE id=v_row.account_id)));
  v_total:=v_total+v_row.amount_cents;
 END LOOP;
 UPDATE sabora.third_party_cash_intents_candidate SET state='paid',
   paid_at=clock_timestamp(),paid_by_staff=p_actor_user_id WHERE id=p_intent_id;
 v_result:=jsonb_build_object('version',1,'intentId',p_intent_id,
  'state','paid','totalCents',v_total);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'settle_cash',v_result);
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 RETURN v_result||jsonb_build_object('repeated',false);
END; $fn$;
ALTER FUNCTION sabora.settle_third_party_cash_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.settle_third_party_cash_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.settle_third_party_cash_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;

-- A third-party-funded round must refund against THAT round, never against
-- future debt left on the beneficiary account. Keep all original H6 branches
-- unchanged for rounds not funded by a third party.

CREATE OR REPLACE FUNCTION sabora.apply_h6_incident_economic_effect_candidate(p_incident_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $incident_effect$
DECLARE v_incident sabora.incident_cases%ROWTYPE;v_round sabora.order_rounds%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_cash_refund bigint;
BEGIN
 SELECT * INTO v_incident FROM sabora.incident_cases WHERE id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found' USING errcode='P0002'; END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_incident.round_id FOR UPDATE;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id FOR UPDATE;
 IF v_incident.affected_cents=0 THEN RETURN 'resolved'; END IF;
 IF v_round.payment_mode='pay_at_end' THEN
   -- A paid round is financed by a specific third party, independently of
   -- the beneficiary account's later orders or open balance. Never consume
   -- a different round's debt instead of returning funds to that payer.
   IF EXISTS(SELECT 1 FROM sabora.third_party_cash_round_funding_candidate f
      WHERE f.round_id=v_round.id) THEN
     IF v_incident.affected_cents+COALESCE((
       SELECT sum(i.affected_cents) FROM sabora.incident_cases i
       WHERE i.round_id=v_round.id AND i.id<>v_incident.id
         AND i.state NOT IN ('rejected_customer_request','awaiting_admin')
     ),0)>v_round.amount_cents THEN
       RAISE EXCEPTION 'third_party_refund_exceeds_funding' USING errcode='23514';
     END IF;
     UPDATE sabora.incident_cases SET cash_refund_cents=v_incident.affected_cents
       WHERE id=v_incident.id;
     RETURN 'cash_refund_due';
   END IF;
   v_cash_refund:=greatest(v_incident.affected_cents-v_account.outstanding_cents,0);
   IF v_cash_refund>COALESCE((SELECT sum(CASE WHEN c.kind='payment' THEN c.amount_cents ELSE -c.amount_cents END)
      FROM sabora.cash_settlements c WHERE c.account_id=v_account.id),0) THEN
     RAISE EXCEPTION 'incident_exceeds_cash_paid' USING errcode='23514';
   END IF;
   UPDATE sabora.customer_accounts SET outstanding_cents=greatest(outstanding_cents-v_incident.affected_cents,0),
     state=CASE WHEN greatest(outstanding_cents-v_incident.affected_cents,0)=0 THEN 'settled' ELSE state END,
     updated_at=clock_timestamp() WHERE id=v_account.id;
   UPDATE sabora.incident_cases SET cash_refund_cents=v_cash_refund WHERE id=v_incident.id;
   RETURN CASE WHEN v_cash_refund>0 THEN 'cash_refund_due' ELSE 'adjusted' END;
 END IF;
 IF v_round.payment_mode='pay_now' THEN
   SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
   IF v_payment.state IN ('authorization_unknown','capture_unknown') THEN
     RAISE EXCEPTION 'payment_outcome_unknown' USING errcode='23514';
   ELSIF v_payment.state='captured' THEN
     IF COALESCE((SELECT sum(r.amount_cents) FROM sabora.refund_attempts r
       WHERE r.payment_attempt_id=v_payment.id),0)+v_incident.affected_cents>v_payment.amount_cents
     THEN RAISE EXCEPTION 'incident_exceeds_captured_amount' USING errcode='23514'; END IF;
     INSERT INTO sabora.refund_attempts(incident_id,payment_attempt_id,amount_cents,idempotency_key,state)
     VALUES(v_incident.id,v_payment.id,v_incident.affected_cents,
       'h6_refund_'||replace(v_incident.id::text,'-','_'),'requested');
     RETURN 'refund_due';
   ELSIF v_payment.state IN ('authorized','capture_requested') THEN
     UPDATE sabora.payment_attempts SET state='release_requested',updated_at=clock_timestamp()
      WHERE id=v_payment.id;
     RETURN 'refund_due';
   ELSIF v_payment.state IN ('authorization_failed','capture_failed','released') THEN
     RETURN 'resolved';
   ELSE
     RAISE EXCEPTION 'incident_payment_not_reconcilable' USING errcode='23514';
   END IF;
 END IF;
 RETURN 'resolved';
END;
$incident_effect$;
ALTER FUNCTION sabora.apply_h6_incident_economic_effect_candidate(uuid) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.apply_h6_incident_economic_effect_candidate(uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.apply_h6_incident_economic_effect_candidate(uuid) TO sabora_h6_fn_owner;


-- A legacy "refundCash" request must not silently pay a beneficiary or an
-- unknown attendee when the paid round belongs to a third-party payer.
CREATE FUNCTION sabora.guard_third_party_cash_refund_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF NEW.kind='refund' AND NEW.incident_id IS NOT NULL
  AND EXISTS(SELECT 1 FROM sabora.incident_cases i
   JOIN sabora.third_party_cash_round_funding_candidate f ON f.round_id=i.round_id
   WHERE i.id=NEW.incident_id)
  AND NOT EXISTS(SELECT 1 FROM sabora.third_party_cash_refunds_candidate r
    WHERE r.incident_id=NEW.incident_id AND r.cash_settlement_id=NEW.id)
 THEN
  RAISE EXCEPTION 'third_party_payer_proof_required' USING errcode='23514';
 END IF;
 RETURN NEW;
END; $fn$;
ALTER FUNCTION sabora.guard_third_party_cash_refund_candidate() OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.guard_third_party_cash_refund_candidate()
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
  sabora_h6_provider_runtime,sabora_h6_operations_runtime;
CREATE TRIGGER guard_third_party_refund_cash
 BEFORE INSERT ON sabora.cash_settlements FOR EACH ROW
 EXECUTE FUNCTION sabora.guard_third_party_cash_refund_candidate();

CREATE FUNCTION sabora.read_third_party_cash_refunds_candidate(p_session_hash bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_payer uuid;v_items jsonb;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 THEN
   RAISE EXCEPTION 'invalid_third_party_scope' USING errcode='22023'; END IF;
 SELECT s.customer_id INTO v_payer FROM sabora.customer_sessions s
  WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'third_party_scope_forbidden' USING errcode='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'incidentId',q.id,'amountCents',q.cash_refund_cents) ORDER BY q.id),'[]'::jsonb)
 INTO v_items FROM (
  SELECT i.id,i.cash_refund_cents FROM sabora.incident_cases i
  JOIN sabora.third_party_cash_round_funding_candidate f ON f.round_id=i.round_id
  JOIN sabora.third_party_cash_intents_candidate p ON p.id=f.intent_id
  WHERE p.payer_customer_id=v_payer AND p.state='paid'
   AND i.state='cash_refund_due' AND i.cash_refund_cents>0
  ORDER BY i.id LIMIT 50
 ) q;
 RETURN jsonb_build_object('version',1,'items',v_items);
END; $fn$;
ALTER FUNCTION sabora.read_third_party_cash_refunds_candidate(bytea)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_third_party_cash_refunds_candidate(bytea)
 FROM PUBLIC,anon,authenticated,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_third_party_cash_refunds_candidate(bytea)
 TO sabora_h6_customer_runtime;

GRANT EXECUTE ON FUNCTION extensions.gen_random_bytes(integer) TO sabora_h6_fn_owner;
CREATE FUNCTION sabora.issue_third_party_cash_refund_proof_candidate(
 p_session_hash bytea,p_incident_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_payer uuid;v_claim sabora.third_party_cash_refund_claims_candidate%ROWTYPE;
 v_code text;v_due bigint;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 OR p_incident_id IS NULL
 THEN RAISE EXCEPTION 'invalid_third_party_scope' USING errcode='22023'; END IF;
 SELECT s.customer_id INTO v_payer FROM sabora.customer_sessions s
  WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'third_party_scope_forbidden' USING errcode='42501'; END IF;
 SELECT i.cash_refund_cents INTO v_due FROM sabora.incident_cases i
 JOIN sabora.third_party_cash_round_funding_candidate f ON f.round_id=i.round_id
 JOIN sabora.third_party_cash_intents_candidate p ON p.id=f.intent_id
 WHERE i.id=p_incident_id AND i.state='cash_refund_due'
  AND i.cash_refund_cents>0 AND p.payer_customer_id=v_payer AND p.state='paid'
 FOR UPDATE OF i;
 IF NOT FOUND THEN RAISE EXCEPTION 'third_party_refund_unavailable' USING errcode='42501'; END IF;
 UPDATE sabora.third_party_cash_refund_claims_candidate SET revoked_at=clock_timestamp()
  WHERE incident_id=p_incident_id AND payer_customer_id=v_payer
    AND revoked_at IS NULL AND consumed_at IS NULL;
 v_code:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO sabora.third_party_cash_refund_claims_candidate
   (incident_id,payer_customer_id,proof_sha256,expires_at)
 VALUES(p_incident_id,v_payer,sha256(convert_to(v_code,'UTF8')),
   clock_timestamp()+interval '15 minutes') RETURNING * INTO v_claim;
 RETURN jsonb_build_object('version',1,'claimId',v_claim.id,'incidentId',p_incident_id,
   'proof',v_code,'amountCents',v_due,'expiresAt',v_claim.expires_at);
END; $fn$;
ALTER FUNCTION sabora.issue_third_party_cash_refund_proof_candidate(bytea,uuid)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.issue_third_party_cash_refund_proof_candidate(bytea,uuid)
 FROM PUBLIC,anon,authenticated,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.issue_third_party_cash_refund_proof_candidate(bytea,uuid)
 TO sabora_h6_customer_runtime;

CREATE FUNCTION sabora.refund_third_party_cash_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_incident_id uuid,p_claim_id uuid,p_proof text,p_correlation_id text,
 p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_role text;v_incident sabora.incident_cases%ROWTYPE;
 v_claim sabora.third_party_cash_refund_claims_candidate%ROWTYPE;
 v_original record;v_staff_result jsonb;v_fingerprint bytea;
 v_existing record;v_settlement_id uuid;v_binding record;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(
  p_key_id,p_database_role,p_actor_user_id,p_staff_role,'refund_cash',
  p_incident_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('waiter','admin','root')
  OR p_claim_id IS NULL OR p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'third_party_refund_forbidden' USING errcode='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_actor_user_id::text||':'||p_correlation_id,0));
 v_fingerprint:=sha256(convert_to('tp_refund:'||p_incident_id::text||':'||
   p_claim_id::text||':'||p_proof,'UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests
  WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_incident FROM sabora.incident_cases
  WHERE id=p_incident_id FOR UPDATE;
 IF NOT FOUND OR v_incident.state<>'cash_refund_due' OR v_incident.cash_refund_cents<=0
 THEN RAISE EXCEPTION 'third_party_refund_unavailable' USING errcode='23514'; END IF;
 SELECT f.intent_id,p.payer_customer_id,f.account_id,f.amount_cents
  INTO v_original FROM sabora.third_party_cash_round_funding_candidate f
  JOIN sabora.third_party_cash_intents_candidate p ON p.id=f.intent_id
  WHERE f.round_id=v_incident.round_id AND p.state='paid';
 IF NOT FOUND OR v_incident.cash_refund_cents>v_original.amount_cents THEN
  RAISE EXCEPTION 'third_party_refund_unavailable' USING errcode='23514'; END IF;
 SELECT * INTO v_claim FROM sabora.third_party_cash_refund_claims_candidate
  WHERE id=p_claim_id FOR UPDATE;
 IF NOT FOUND OR v_claim.incident_id<>p_incident_id
  OR v_claim.payer_customer_id<>v_original.payer_customer_id
  OR v_claim.expires_at<=clock_timestamp() OR v_claim.revoked_at IS NOT NULL
  OR v_claim.consumed_at IS NOT NULL
  OR v_claim.proof_sha256<>sha256(convert_to(p_proof,'UTF8'))
 THEN RAISE EXCEPTION 'third_party_refund_proof_invalid' USING errcode='42501'; END IF;
 v_settlement_id:=gen_random_uuid();
 -- Deferred FK permits the guard to see this validated, immutable attribution
 -- before it permits cash_settlements INSERT. Legacy refundCash lacks it and fails.
 INSERT INTO sabora.third_party_cash_refunds_candidate(
  incident_id,original_intent_id,original_payer_customer_id,
  claim_id,cash_settlement_id,amount_cents,recorded_by)
 VALUES(p_incident_id,v_original.intent_id,v_original.payer_customer_id,
  p_claim_id,v_settlement_id,v_incident.cash_refund_cents,p_actor_user_id);
 INSERT INTO sabora.cash_settlements(
  id,account_id,actor_user_id,correlation_id,amount_cents,kind,incident_id)
 VALUES(v_settlement_id,v_original.account_id,p_actor_user_id,
  'tp_refund_'||replace(v_settlement_id::text,'-',''),
  v_incident.cash_refund_cents,'refund',p_incident_id);
 UPDATE sabora.incident_cases SET state='resolved' WHERE id=p_incident_id;
 UPDATE sabora.third_party_cash_refund_claims_candidate SET consumed_at=clock_timestamp()
  WHERE id=p_claim_id;
 SELECT b.table_id,b.session_id,b.visit_key,a.customer_id INTO v_binding
  FROM sabora.customer_account_operational_bindings b
  JOIN sabora.customer_accounts a ON a.id=b.account_id
  WHERE b.account_id=v_original.account_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'third_party_refund_unavailable' USING errcode='23514'; END IF;
 PERFORM sabora.emit_h6_event_candidate(
  v_binding.table_id,v_binding.session_id,v_binding.visit_key,v_binding.customer_id,
  v_original.account_id,NULL,'customer','sabora.refund.cash_recorded',v_settlement_id,1,
  jsonb_build_object('incidentId',p_incident_id,'amountCents',v_incident.cash_refund_cents,
    'refundToOriginalPayer',true));
 v_staff_result:=jsonb_build_object('version',1,'incidentId',p_incident_id,
  'state','resolved','settlementId',v_settlement_id,
  'amountCents',v_incident.cash_refund_cents);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'refund_cash',v_staff_result);
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 RETURN v_staff_result||jsonb_build_object('repeated',false);
END; $fn$;
ALTER FUNCTION sabora.refund_third_party_cash_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.refund_third_party_cash_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.refund_third_party_cash_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;
COMMIT;
