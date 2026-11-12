-- M4 cash tips: separate from consumption, no mock Stripe, provider or
-- Fleetia/VPS/Supabase operational writes. Six approved options, zero default,
-- server-side integer-cent calculation. The cash handover is staff-attested.
BEGIN;
ALTER TABLE sabora.third_party_cash_intents_candidate
 ADD COLUMN tip_option text,
 ADD COLUMN tip_cents bigint NOT NULL DEFAULT 0
  CHECK(tip_cents>=0 AND tip_cents<=999999999999),
 ADD CONSTRAINT cash_tip_choice_candidate CHECK(
  (tip_option IS NULL AND tip_cents=0)
  OR (tip_option='none' AND tip_cents=0)
  OR (tip_option IN ('percent5','percent10','fixed100','fixed200','fixed500') AND tip_cents>0)
 );

CREATE TABLE sabora.cash_tip_collections_candidate (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 intent_id uuid NOT NULL UNIQUE REFERENCES sabora.third_party_cash_intents_candidate(id),
 payer_customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 consumption_cents bigint NOT NULL CHECK(consumption_cents>0),
 tip_cents bigint NOT NULL CHECK(tip_cents>0),
 tip_option text NOT NULL CHECK(tip_option IN ('percent5','percent10','fixed100','fixed200','fixed500')),
 method text NOT NULL DEFAULT 'cash' CHECK(method='cash'),
 recorded_by_staff uuid NOT NULL REFERENCES sabora.staff_members(user_id),
 collected_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE sabora.cash_tip_refund_claims_candidate (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 collection_id uuid NOT NULL REFERENCES sabora.cash_tip_collections_candidate(id),
 payer_customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 proof_sha256 bytea NOT NULL CHECK(octet_length(proof_sha256)=32),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 consumed_at timestamptz,
 CHECK(expires_at>created_at),
 CHECK(NOT (revoked_at IS NOT NULL AND consumed_at IS NOT NULL))
);
CREATE TABLE sabora.cash_tip_refunds_candidate (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 collection_id uuid NOT NULL UNIQUE REFERENCES sabora.cash_tip_collections_candidate(id),
 original_payer_customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 claim_id uuid NOT NULL UNIQUE REFERENCES sabora.cash_tip_refund_claims_candidate(id),
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 recorded_by_staff uuid NOT NULL REFERENCES sabora.staff_members(user_id),
 refunded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $security$
DECLARE v text;
BEGIN
 FOREACH v IN ARRAY ARRAY[
  'cash_tip_collections_candidate','cash_tip_refund_claims_candidate',
  'cash_tip_refunds_candidate'
 ] LOOP
  EXECUTE format('ALTER TABLE sabora.%I ENABLE ROW LEVEL SECURITY',v);
  EXECUTE format('ALTER TABLE sabora.%I FORCE ROW LEVEL SECURITY',v);
  EXECUTE format('REVOKE ALL ON sabora.%I FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,sabora_h6_customer_runtime,sabora_h6_provider_runtime,sabora_h6_operations_runtime,sabora_m3_catalog_runtime,sabora_m3_tables_runtime',v);
  EXECUTE format('GRANT SELECT,INSERT ON sabora.%I TO sabora_h6_fn_owner',v);
  EXECUTE format('CREATE POLICY tip_owner_select ON sabora.%I FOR SELECT TO sabora_h6_fn_owner USING(true)',v);
  EXECUTE format('CREATE POLICY tip_owner_insert ON sabora.%I FOR INSERT TO sabora_h6_fn_owner WITH CHECK(true)',v);
 END LOOP;
END; $security$;
GRANT UPDATE ON sabora.cash_tip_refund_claims_candidate TO sabora_h6_fn_owner;
CREATE POLICY tip_owner_update ON sabora.cash_tip_refund_claims_candidate
 FOR UPDATE TO sabora_h6_fn_owner USING(true) WITH CHECK(true);
GRANT SELECT ON sabora.cash_tip_collections_candidate,sabora.cash_tip_refunds_candidate
 TO sabora_m3_management_fn_owner;
CREATE POLICY tip_m3_select ON sabora.cash_tip_collections_candidate
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY tip_m3_select ON sabora.cash_tip_refunds_candidate
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE TRIGGER tip_collection_immutable BEFORE UPDATE OR DELETE ON sabora.cash_tip_collections_candidate
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER tip_refund_immutable BEFORE UPDATE OR DELETE ON sabora.cash_tip_refunds_candidate
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER tip_collection_no_truncate BEFORE TRUNCATE ON sabora.cash_tip_collections_candidate
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER tip_refund_no_truncate BEFORE TRUNCATE ON sabora.cash_tip_refunds_candidate
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_h6_history_mutation();

CREATE OR REPLACE FUNCTION sabora.third_party_round_eligible_candidate(
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
   -- Own or explicitly chosen other accounts: neither implies account ownership.
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

CREATE OR REPLACE FUNCTION sabora.read_third_party_cash_debts_candidate(
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
  WHERE b.table_id=p_table_id AND b.session_id=v_session 
   AND sabora.third_party_round_eligible_candidate(r.id,v_payer,p_table_id,v_session)
  ORDER BY p.public_id,r.id LIMIT 50
 ) q;
 RETURN jsonb_build_object('version',1,'items',v_items);
END; $fn$;
;

-- A single immutable voluntary choice for a specific consent/request key.
-- Previous six-argument M4 intent remains a zero-tip legacy option.
CREATE FUNCTION sabora.create_cash_tip_intent_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text,
 p_rounds jsonb,p_request_key text,p_consent boolean,p_tip_option text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_response jsonb;v_row sabora.third_party_cash_intents_candidate%ROWTYPE;
 v_base bigint;v_tip bigint;
BEGIN
 IF p_tip_option IS NULL OR p_tip_option NOT IN
  ('none','percent5','percent10','fixed100','fixed200','fixed500')
 THEN RAISE EXCEPTION 'invalid_tip_choice' USING errcode='22023'; END IF;
 v_response:=sabora.create_third_party_cash_intent_candidate(
  p_session_hash,p_table_id,p_visit_key,p_rounds,p_request_key,p_consent);
 SELECT * INTO v_row FROM sabora.third_party_cash_intents_candidate
 WHERE id=(v_response->>'intentId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_tip_intent' USING errcode='23514'; END IF;
 SELECT coalesce(sum(amount_cents),0)::bigint INTO v_base
 FROM sabora.third_party_cash_intent_rounds_candidate WHERE intent_id=v_row.id;
 v_tip:=CASE p_tip_option
   WHEN 'none' THEN 0 WHEN 'percent5' THEN (v_base*5+50)/100
   WHEN 'percent10' THEN (v_base*10+50)/100
   WHEN 'fixed100' THEN 100 WHEN 'fixed200' THEN 200 WHEN 'fixed500' THEN 500 END;
 IF v_tip IS NULL OR v_tip<0 OR v_base+v_tip>999999999999
 THEN RAISE EXCEPTION 'invalid_tip_choice' USING errcode='22023'; END IF;
 IF (v_response->>'repeated')::boolean THEN
  IF v_row.tip_option IS DISTINCT FROM p_tip_option OR v_row.tip_cents<>v_tip
  THEN RAISE EXCEPTION 'tip_idempotency_conflict' USING errcode='23505'; END IF;
 ELSE
  UPDATE sabora.third_party_cash_intents_candidate
   SET tip_option=p_tip_option,tip_cents=v_tip WHERE id=v_row.id;
 END IF;
 RETURN v_response||jsonb_build_object('consumptionCents',v_base,'tipCents',v_tip,
  'totalCents',v_base+v_tip,'tipOption',p_tip_option);
END; $fn$;
ALTER FUNCTION sabora.create_cash_tip_intent_candidate(bytea,uuid,text,jsonb,text,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.create_cash_tip_intent_candidate(bytea,uuid,text,jsonb,text,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.create_cash_tip_intent_candidate(bytea,uuid,text,jsonb,text,boolean,text)
 TO sabora_h6_customer_runtime;

CREATE OR REPLACE FUNCTION sabora.read_third_party_cash_pending_candidate(
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
  'payerCode',q.public_id,'consumptionCents',q.amount_cents,'tipCents',q.tip_cents,'totalCents',q.amount_cents+q.tip_cents,'rounds',q.rounds,
  'createdAt',q.created_at) ORDER BY q.created_at DESC,q.id),'[]'::jsonb)
 INTO v_items FROM (
  SELECT i.id,p.public_id,i.created_at,i.tip_cents,sum(ir.amount_cents)::bigint AS amount_cents,
   jsonb_agg(jsonb_build_object('roundId',ir.round_id,
     'accountId',ir.account_id,'amountCents',ir.amount_cents)
     ORDER BY ir.round_id) AS rounds
  FROM sabora.third_party_cash_intents_candidate i
  JOIN sabora.customer_profiles p ON p.id=i.payer_customer_id
  JOIN sabora.third_party_cash_intent_rounds_candidate ir ON ir.intent_id=i.id
  JOIN sabora.dining_tables t ON t.id=i.table_id AND t.session_id=i.table_session_id
  WHERE i.state='pending'
  GROUP BY i.id,p.public_id,i.created_at,i.tip_cents
  ORDER BY i.created_at DESC,i.id LIMIT 50
 ) q;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 RETURN jsonb_build_object('version',1,'items',v_items);
END; $fn$;
;
CREATE OR REPLACE FUNCTION sabora.settle_third_party_cash_candidate(
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

 IF v_intent.tip_cents>0 THEN
  INSERT INTO sabora.cash_tip_collections_candidate(
   intent_id,payer_customer_id,consumption_cents,tip_cents,tip_option,recorded_by_staff)
  VALUES(v_intent.id,v_intent.payer_customer_id,v_total,v_intent.tip_cents,
    v_intent.tip_option,p_actor_user_id);
 END IF;
 UPDATE sabora.third_party_cash_intents_candidate SET state='paid',
   paid_at=clock_timestamp(),paid_by_staff=p_actor_user_id WHERE id=p_intent_id;
 v_result:=jsonb_build_object('version',1,'intentId',p_intent_id,
  'state','paid','consumptionCents',v_total,'tipCents',v_intent.tip_cents,
  'totalCents',v_total+v_intent.tip_cents);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'settle_cash',v_result);
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 RETURN v_result||jsonb_build_object('repeated',false);
END; $fn$;
;

-- Customer session is always the funding payer's session; an account owner
-- cannot request the payer's proof simply because they know a QR or receipt ID.
CREATE FUNCTION sabora.read_my_cash_tips_candidate(p_session_hash bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_payer uuid;v_items jsonb;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32
 THEN RAISE EXCEPTION 'invalid_tip_scope' USING errcode='22023'; END IF;
 SELECT s.customer_id INTO v_payer FROM sabora.customer_sessions s
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
  AND s.expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'tip_payer_forbidden' USING errcode='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('collectionId',c.id,
   'tipCents',c.tip_cents,'collectedAt',c.collected_at)
   ORDER BY c.collected_at DESC,c.id),'[]'::jsonb) INTO v_items
 FROM (SELECT * FROM sabora.cash_tip_collections_candidate col
  WHERE col.payer_customer_id=v_payer
   AND NOT EXISTS(SELECT 1 FROM sabora.cash_tip_refunds_candidate r
    WHERE r.collection_id=col.id)
  ORDER BY col.collected_at DESC,col.id LIMIT 50) c;
 RETURN jsonb_build_object('version',1,'items',v_items);
END; $fn$;
-- PostgreSQL 17 non-superuser: temporary CREATE for function ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
ALTER FUNCTION sabora.read_my_cash_tips_candidate(bytea) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_my_cash_tips_candidate(bytea)
 FROM PUBLIC,anon,authenticated,sabora_h6_provider_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_my_cash_tips_candidate(bytea)
 TO sabora_h6_customer_runtime;

CREATE FUNCTION sabora.issue_cash_tip_refund_proof_candidate(p_session_hash bytea,p_collection_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_payer uuid;v_collection sabora.cash_tip_collections_candidate%ROWTYPE;
 v_claim sabora.cash_tip_refund_claims_candidate%ROWTYPE;v_secret text;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 OR p_collection_id IS NULL
 THEN RAISE EXCEPTION 'invalid_tip_scope' USING errcode='22023'; END IF;
 SELECT s.customer_id INTO v_payer FROM sabora.customer_sessions s
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
  AND s.expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'tip_payer_forbidden' USING errcode='42501'; END IF;
 SELECT * INTO v_collection FROM sabora.cash_tip_collections_candidate
 WHERE id=p_collection_id AND payer_customer_id=v_payer;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM sabora.cash_tip_refunds_candidate r
  WHERE r.collection_id=p_collection_id)
 THEN RAISE EXCEPTION 'tip_payer_forbidden' USING errcode='42501'; END IF;
 UPDATE sabora.cash_tip_refund_claims_candidate SET revoked_at=clock_timestamp()
 WHERE collection_id=p_collection_id AND payer_customer_id=v_payer
 AND revoked_at IS NULL AND consumed_at IS NULL;
 v_secret:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO sabora.cash_tip_refund_claims_candidate
 (collection_id,payer_customer_id,proof_sha256,expires_at)
 VALUES(p_collection_id,v_payer,sha256(convert_to(v_secret,'UTF8')),
   clock_timestamp()+interval '15 minutes') RETURNING * INTO v_claim;
 RETURN jsonb_build_object('version',1,'collectionId',p_collection_id,
  'claimId',v_claim.id,'proof',v_secret,'tipCents',v_collection.tip_cents,
  'expiresAt',v_claim.expires_at);
END; $fn$;
ALTER FUNCTION sabora.issue_cash_tip_refund_proof_candidate(bytea,uuid) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.issue_cash_tip_refund_proof_candidate(bytea,uuid)
 FROM PUBLIC,anon,authenticated,sabora_h6_provider_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.issue_cash_tip_refund_proof_candidate(bytea,uuid)
 TO sabora_h6_customer_runtime;

-- Explicit staff action, full tip amount only, admin/root. No automatic
-- refund is triggered by an incident on the consumption.
CREATE FUNCTION sabora.refund_cash_tip_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_collection_id uuid,p_claim_id uuid,p_proof text,p_correlation_id text,
 p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_role text;v_collection sabora.cash_tip_collections_candidate%ROWTYPE;
 v_claim sabora.cash_tip_refund_claims_candidate%ROWTYPE;v_fingerprint bytea;
 v_existing sabora.h6_action_requests%ROWTYPE;v_result jsonb;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(
  p_key_id,p_database_role,p_actor_user_id,p_staff_role,'refund_cash',
  p_collection_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('admin','root') OR p_proof IS NULL OR
  p_proof !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'tip_refund_forbidden' USING errcode='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_actor_user_id::text||':'||p_correlation_id,0));
 v_fingerprint:=sha256(convert_to('cash_tip_refund:'||p_collection_id::text||
  ':'||p_claim_id::text||':'||p_proof,'UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests
 WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_collection FROM sabora.cash_tip_collections_candidate
  WHERE id=p_collection_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'tip_refund_unavailable' USING errcode='23514'; END IF;
 IF EXISTS(SELECT 1 FROM sabora.cash_tip_refunds_candidate
  WHERE collection_id=p_collection_id) THEN
  RAISE EXCEPTION 'tip_refund_unavailable' USING errcode='23514'; END IF;
 SELECT * INTO v_claim FROM sabora.cash_tip_refund_claims_candidate
 WHERE id=p_claim_id FOR UPDATE;
 IF NOT FOUND OR v_claim.collection_id<>p_collection_id
  OR v_claim.payer_customer_id<>v_collection.payer_customer_id
  OR v_claim.proof_sha256<>sha256(convert_to(p_proof,'UTF8'))
  OR v_claim.expires_at<=clock_timestamp() OR v_claim.revoked_at IS NOT NULL
  OR v_claim.consumed_at IS NOT NULL
 THEN RAISE EXCEPTION 'tip_refund_forbidden' USING errcode='42501'; END IF;
 INSERT INTO sabora.cash_tip_refunds_candidate(
  collection_id,original_payer_customer_id,claim_id,amount_cents,recorded_by_staff)
 VALUES(p_collection_id,v_collection.payer_customer_id,p_claim_id,
  v_collection.tip_cents,p_actor_user_id);
 UPDATE sabora.cash_tip_refund_claims_candidate SET consumed_at=clock_timestamp()
 WHERE id=p_claim_id;
 v_result:=jsonb_build_object('version',1,'collectionId',p_collection_id,
  'state','refunded','tipCents',v_collection.tip_cents);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'refund_cash',v_result);
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 RETURN v_result||jsonb_build_object('repeated',false);
END; $fn$;
ALTER FUNCTION sabora.refund_cash_tip_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.refund_cash_tip_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.refund_cash_tip_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;

CREATE OR REPLACE FUNCTION sabora.read_admin_finance_dashboard_candidate(
 p_capability jsonb,p_period text,p_month text,p_time_zone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $read$
DECLARE
 v_role text;v_asof timestamptz:=clock_timestamp();
 v_day date;v_month date;v_from timestamptz;v_to timestamptz;
 v_prev_from timestamptz;v_prev_to timestamptz;
 v_month_from timestamptz;v_month_to timestamptz;
 v_zone text;v_sales bigint;v_prev_sales bigint;v_today_sales bigint;v_month_sales bigint;
 v_day_from timestamptz;v_day_to timestamptz;v_current_month_from timestamptz;v_current_month_to timestamptz;
 v_orders bigint;v_accounts bigint;v_pending bigint;v_cash bigint;v_card bigint;
 v_tips bigint:=0;v_tip_collected bigint:=0;v_tip_refunded bigint:=0;v_cash_prev bigint;v_card_prev bigint;
 v_today_cash bigint;v_month_cash bigint;v_today_card bigint;v_month_card bigint;
 v_trend jsonb;v_top jsonb;v_gaps bigint;v_ranking_gaps bigint;
BEGIN
 v_role:=sabora.verify_management_capability_m3(p_capability,
  'finance:'||coalesce(p_period,'')||':'||coalesce(p_month,'')||':'||coalesce(p_time_zone,''));
 IF p_capability->>'action'<>'finance.read' OR v_role NOT IN('admin','root')
 THEN RAISE EXCEPTION 'm3_management_forbidden' USING errcode='42501'; END IF;
 IF p_period NOT IN ('today','last7','thisMonth','previousMonth')
   OR p_period IS NULL OR
   (p_month IS NOT NULL AND p_month !~ '^(20[0-9]{2})-(0[1-9]|1[0-2])$')
   OR (p_month IS NOT NULL AND p_period<>'thisMonth')
   OR p_time_zone IS NULL OR length(p_time_zone)>80
   OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_time_zone)
 THEN RAISE EXCEPTION 'invalid_finance_period' USING errcode='22023';END IF;
 v_zone:=p_time_zone;
 v_day:=(v_asof AT TIME ZONE v_zone)::date;
 v_month:=date_trunc('month',v_day::timestamp)::date;
 v_day_from:=v_day::timestamp AT TIME ZONE v_zone;
 v_day_to:=(v_day+1)::timestamp AT TIME ZONE v_zone;
 v_current_month_from:=v_month::timestamp AT TIME ZONE v_zone;
 v_current_month_to:=(v_month+interval '1 month') AT TIME ZONE v_zone;
 IF p_month IS NOT NULL THEN
  v_month:=to_date(p_month||'-01','YYYY-MM-DD');
  IF v_month>date_trunc('month',v_day::timestamp)::date
     OR v_month<date_trunc('month',v_day::timestamp)::date-interval '60 months'
  THEN RAISE EXCEPTION 'invalid_finance_period' USING errcode='22023';END IF;
 END IF;
 CASE p_period
 WHEN 'today' THEN v_from:=v_day::timestamp AT TIME ZONE v_zone;
   v_to:=(v_day+1)::timestamp AT TIME ZONE v_zone;
   v_prev_from:=(v_day-1)::timestamp AT TIME ZONE v_zone;
 WHEN 'last7' THEN v_from:=(v_day-6)::timestamp AT TIME ZONE v_zone;
   v_to:=(v_day+1)::timestamp AT TIME ZONE v_zone;
   v_prev_from:=(v_day-13)::timestamp AT TIME ZONE v_zone;
 WHEN 'thisMonth' THEN v_from:=v_month::timestamp AT TIME ZONE v_zone;
   v_to:=(v_month+interval '1 month') AT TIME ZONE v_zone;
   v_prev_from:=(v_month-interval '1 month') AT TIME ZONE v_zone;
 WHEN 'previousMonth' THEN v_from:=(v_month-interval '1 month') AT TIME ZONE v_zone;
   v_to:=v_month::timestamp AT TIME ZONE v_zone;
   v_prev_from:=(v_month-interval '2 months') AT TIME ZONE v_zone;
 END CASE;
 v_prev_to:=v_from;
 -- The trend follows the selected comparison month, not always today.
 IF p_period='previousMonth' THEN v_month:=(v_month-interval '1 month')::date; END IF;
 v_month_from:=v_month::timestamp AT TIME ZONE v_zone;
 v_month_to:=(v_month+interval '1 month') AT TIME ZONE v_zone;
 -- No fake historical capture dates. A preexisting charge without its
 -- append-only confirmed event makes payment KPIs unavailable, not zero.
 SELECT count(*) INTO v_gaps FROM (
  SELECT p.id FROM sabora.payment_attempts p
   WHERE p.state IN('captured','refund_required') AND p.provider_charge_id IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM sabora.finance_provider_events_candidate e
    WHERE e.kind='capture' AND e.source_id=p.id)
  UNION ALL
  SELECT r.id FROM sabora.refund_attempts r
   WHERE r.state='succeeded'
   AND NOT EXISTS(SELECT 1 FROM sabora.finance_provider_events_candidate e
    WHERE e.kind='refund' AND e.source_id=r.id)
 ) missing;
 -- Attributed to original confirmed consumption date; a later approved
 -- restaurant adjustment is attributed to the adjustment completion date.
 WITH movements AS (
  SELECT o.confirmed_at AS at,r.amount_cents AS amount
   FROM sabora.order_rounds r JOIN sabora.orders o ON o.id=r.order_id
   WHERE r.state NOT IN('cancelled','payment_failed')
  UNION ALL
  SELECT i.resolved_at AS at,-i.affected_cents AS amount
   FROM sabora.incident_cases i
   WHERE i.resolved_at IS NOT NULL
     AND i.state IN('adjusted','refund_due','cash_refund_due','resolved')
 )
 SELECT coalesce(sum(amount) FILTER(WHERE at>=v_from AND at<v_to),0)::bigint,
  coalesce(sum(amount) FILTER(WHERE at>=v_prev_from AND at<v_prev_to),0)::bigint,
  coalesce(sum(amount) FILTER(WHERE at>=v_day_from AND at<v_day_to),0)::bigint,
  coalesce(sum(amount) FILTER(WHERE at>=v_current_month_from AND at<v_current_month_to),0)::bigint
 INTO v_sales,v_prev_sales,v_today_sales,v_month_sales FROM movements;
 SELECT count(DISTINCT r.order_id),count(DISTINCT r.account_id) FILTER(WHERE r.amount_cents>0)
 INTO v_orders,v_accounts FROM sabora.order_rounds r
 JOIN sabora.orders o ON o.id=r.order_id
 WHERE o.confirmed_at>=v_from AND o.confirmed_at<v_to
   AND r.state NOT IN('cancelled','payment_failed');
 SELECT coalesce(sum(outstanding_cents),0)::bigint INTO v_pending
 FROM sabora.customer_accounts WHERE state IN('open','blocked');
 WITH movements AS (
  SELECT c.created_at AS at,
   CASE WHEN kind='payment' THEN c.amount_cents ELSE -c.amount_cents END AS amount
  FROM sabora.cash_settlements c
 ) SELECT coalesce(sum(amount) FILTER(WHERE at>=v_from AND at<v_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_prev_from AND at<v_prev_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_day_from AND at<v_day_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_current_month_from AND at<v_current_month_to),0)::bigint
 INTO v_cash,v_cash_prev,v_today_cash,v_month_cash FROM movements;
 WITH movements AS (
 SELECT e.confirmed_at AS at,
   CASE WHEN e.kind='capture' THEN e.amount_cents ELSE -e.amount_cents END AS amount
 FROM sabora.finance_provider_events_candidate e
 ) SELECT coalesce(sum(amount) FILTER(WHERE at>=v_from AND at<v_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_prev_from AND at<v_prev_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_day_from AND at<v_day_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_current_month_from AND at<v_current_month_to),0)::bigint
 INTO v_card,v_card_prev,v_today_card,v_month_card FROM movements;
 SELECT coalesce(sum(tip_cents),0)::bigint INTO v_tip_collected
 FROM sabora.cash_tip_collections_candidate
 WHERE collected_at>=v_from AND collected_at<v_to;
 SELECT coalesce(sum(amount_cents),0)::bigint INTO v_tip_refunded
 FROM sabora.cash_tip_refunds_candidate
 WHERE refunded_at>=v_from AND refunded_at<v_to;
 v_tips:=v_tip_collected-v_tip_refunded;
 WITH days AS (
  SELECT generate_series(v_month::timestamp,
   (v_month+interval '1 month'-interval '1 day')::timestamp,
   interval '1 day')::date AS day
 ),movements AS (
  SELECT o.confirmed_at AS at,r.amount_cents AS amount
   FROM sabora.order_rounds r JOIN sabora.orders o ON o.id=r.order_id
   WHERE r.state NOT IN('cancelled','payment_failed') AND
    o.confirmed_at>=v_month_from AND o.confirmed_at<v_month_to
  UNION ALL
  SELECT i.resolved_at AS at,-i.affected_cents AS amount
   FROM sabora.incident_cases i WHERE i.resolved_at>=v_month_from
    AND i.resolved_at<v_month_to AND
    i.state IN('adjusted','refund_due','cash_refund_due','resolved')
 ), daily AS (
  SELECT (at AT TIME ZONE v_zone)::date AS day,sum(amount)::bigint AS cents
  FROM movements GROUP BY 1
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'date',to_char(d.day,'YYYY-MM-DD'),'netSalesCents',coalesce(m.cents,0)) ORDER BY d.day),'[]'::jsonb)
 INTO v_trend FROM days d LEFT JOIN daily m ON m.day=d.day;
 -- Product ranking must not invent item identities for old revision snapshots.
 SELECT count(*) INTO v_ranking_gaps FROM sabora.order_rounds r
 JOIN sabora.orders o ON o.id=r.order_id
 LEFT JOIN sabora.order_revisions v ON v.round_id=r.id AND v.revision_number=r.revision_number
 WHERE o.confirmed_at>=v_from AND o.confirmed_at<v_to
  AND r.state NOT IN('cancelled','payment_failed') AND r.amount_cents>0
  AND (v.id IS NULL OR jsonb_array_length(v.economic_snapshot->'lines')=0 OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(v.economic_snapshot->'lines') x
    WHERE x->>'itemId' IS NULL OR x->'evidence'->>'itemName' IS NULL OR x->'evidence'->>'quantity' IS NULL
      OR x->'evidence'->>'totalCents' IS NULL));
 -- A whole-round cancellation without item scope prevents a truthful
 -- per-product ranking; suppress ranking rather than guessing attribution.
 IF EXISTS(SELECT 1 FROM sabora.incident_cases i JOIN sabora.order_rounds r ON r.id=i.round_id
   JOIN sabora.orders o ON o.id=r.order_id
   WHERE o.confirmed_at>=v_from AND o.confirmed_at<v_to
    AND i.resolved_at IS NOT NULL AND i.affected_cents>0
    AND i.order_line_id IS NULL AND i.state IN('adjusted','refund_due','cash_refund_due','resolved'))
 THEN v_ranking_gaps:=v_ranking_gaps+1; END IF;
 IF v_ranking_gaps=0 THEN
  WITH item_lines AS (
   SELECT x.line->>'itemId' AS item_id,
    x.line->'evidence'->>'itemName' AS item_name,
    (x.line->'evidence'->>'quantity')::bigint AS quantity,
    (x.line->'evidence'->>'totalCents')::bigint AS amount,
    l.id AS line_id
   FROM sabora.order_rounds r JOIN sabora.orders o ON o.id=r.order_id
   JOIN sabora.order_revisions v ON v.round_id=r.id AND v.revision_number=r.revision_number
   CROSS JOIN LATERAL jsonb_array_elements(v.economic_snapshot->'lines')
    WITH ORDINALITY x(line,line_number)
   LEFT JOIN sabora.order_lines l ON l.order_id=r.order_id
     AND l.revision_number=r.revision_number AND l.line_number=x.line_number
   WHERE o.confirmed_at>=v_from AND o.confirmed_at<v_to
    AND r.state NOT IN('cancelled','payment_failed')
  ), net AS (
   SELECT i.item_id,i.item_name,
    sum(CASE WHEN EXISTS(SELECT 1 FROM sabora.incident_cases c
      WHERE c.order_line_id=i.line_id AND c.affected_cents>=i.amount
        AND c.resolved_at IS NOT NULL AND c.state IN('adjusted','refund_due','cash_refund_due','resolved'))
      THEN 0 ELSE i.quantity END)::bigint AS units,
    (sum(i.amount)-coalesce((SELECT sum(c.affected_cents)
       FROM sabora.incident_cases c WHERE c.order_line_id IN
        (SELECT x.line_id FROM item_lines x WHERE x.item_id=i.item_id)
        AND c.resolved_at IS NOT NULL AND c.state IN('adjusted','refund_due','cash_refund_due','resolved')),0))::bigint AS cents
   FROM item_lines i GROUP BY i.item_id,i.item_name
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',item_id,'name',item_name,
   'units',units,'netSalesCents',cents) ORDER BY units DESC,cents DESC,item_id),'[]'::jsonb)
  INTO v_top FROM (SELECT * FROM net ORDER BY units DESC,cents DESC,item_id LIMIT 10) ranked;
 ELSE v_top:=NULL; END IF;
 RETURN jsonb_build_object('version',1,'status','ready','timeZone',v_zone,
  'asOf',v_asof,'period',p_period,'month',to_char(v_month,'YYYY-MM'),
  'from',v_from,'to',v_to,
  'salesCents',v_sales,'previousSalesCents',v_prev_sales,
  'todaySalesCents',v_today_sales,'monthSalesCents',v_month_sales,
  'todayCollectedCents',CASE WHEN v_gaps=0 THEN v_today_cash+v_today_card ELSE NULL END,
  'monthCollectedCents',CASE WHEN v_gaps=0 THEN v_month_cash+v_month_card ELSE NULL END,
  'ordersCount',v_orders,'consumingAccounts',v_accounts,
  'averageTicketCents',CASE WHEN v_accounts>0 THEN round(v_sales::numeric/v_accounts)::bigint ELSE NULL END,
  'outstandingCents',v_pending,
  'cashCollectedCents',v_cash,
  'stripeCollectedCents',CASE WHEN v_gaps=0 THEN v_card ELSE NULL END,
  'collectedCents',CASE WHEN v_gaps=0 THEN v_cash+v_card ELSE NULL END,
  'previousCollectedCents',CASE WHEN v_gaps=0 THEN v_cash_prev+v_card_prev ELSE NULL END,
  'tipsCents',v_tips,'tipsCollectedCents',v_tip_collected,
  'tipsRefundedCents',v_tip_refunded,'tipsAvailable',true,'tipsCoverage','cash',
  'historicalCoverage',CASE WHEN v_gaps=0 THEN 'complete' ELSE 'incomplete' END,
  'rankingComplete',v_ranking_gaps=0,'dailySales',v_trend,'topItems',v_top);
END;
$read$;

REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;
COMMIT;
