-- Issue #61: one economic language.  Sabora records consumption and operational
-- closure; only provider-confirmed Stripe movements are accredited money.
-- An external cash desk/terminal is represented solely by a staff verification,
-- never by a cash receipt, refund or revenue entry.
BEGIN;

DO $cv005_early_owner_scope$
DECLARE ri record;
BEGIN
 FOR ri IN SELECT DISTINCT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication
 FROM pg_catalog.pg_roles r WHERE left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner' AND r.rolname<>current_user::text
 AND (EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=r.oid AND n.nspname='sabora')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=r.oid AND n.nspname='sabora'))
 LOOP
  IF ri.rolcanlogin OR ri.rolinherit OR ri.rolsuper OR ri.rolbypassrls OR ri.rolcreaterole OR ri.rolcreatedb OR ri.rolreplication
  THEN RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner' USING errcode='0P000'; END IF;
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',ri.rolname);
 END LOOP;
END;
$cv005_early_owner_scope$;

ALTER TABLE sabora.order_rounds DROP CONSTRAINT order_rounds_state_check;
ALTER TABLE sabora.order_rounds ADD CONSTRAINT order_rounds_state_check CHECK(state IN(
 'free_grouping','awaiting_authorization','awaiting_external_verification','grouping','payment_unknown',
 'capture_requested','captured','dispatch_requested','kitchen_acknowledged','payment_failed',
 'cancelled','compensation_required'));

CREATE TABLE sabora.economic_settlement_intents_candidate (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
 session_id uuid NOT NULL,
 payer_customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 payer_account_id uuid NOT NULL REFERENCES sabora.customer_accounts(id),
 request_key text NOT NULL CHECK(request_key~'^[A-Za-z0-9_-]{16,128}$'),
 request_fingerprint bytea NOT NULL CHECK(octet_length(request_fingerprint)=32),
 timing text NOT NULL CHECK(timing IN('pay_as_ordered','pay_at_end')),
 channel text NOT NULL CHECK(channel IN('stripe','external')),
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 state text NOT NULL CHECK(state IN(
  'external_pending','external_verified','stripe_authorization_requested',
  'stripe_requires_action','stripe_authorized','stripe_authorization_unknown',
  'stripe_failed','stripe_capture_requested','stripe_capture_unknown',
  'stripe_captured','stripe_refund_pending','stripe_partially_refunded','stripe_refunded','adjusted')),
 authorization_key text CHECK(authorization_key IS NULL OR authorization_key~'^h6_auth_[A-Za-z0-9_-]{16,96}$'),
 capture_key text CHECK(capture_key IS NULL OR capture_key~'^h6_capture_[A-Za-z0-9_-]{16,96}$'),
 provider_intent_id text UNIQUE CHECK(provider_intent_id IS NULL OR provider_intent_id~'^pi_[A-Za-z0-9]{8,128}$'),
 provider_charge_id text CHECK(provider_charge_id IS NULL OR provider_charge_id~'^ch_[A-Za-z0-9]{8,128}$'),
 capture_before timestamptz,
 provider_error_code text CHECK(provider_error_code IS NULL OR provider_error_code~'^[a-z0-9_]{1,80}$'),
 verified_by uuid REFERENCES sabora.staff_members(user_id),
 verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(payer_customer_id,request_key),
 CHECK((channel='external')=(authorization_key IS NULL)),
 CHECK((channel='external')=(capture_key IS NULL)),
 CHECK((verified_by IS NULL)=(verified_at IS NULL)),
 CHECK(channel='external' OR verified_by IS NULL)
);

CREATE TABLE sabora.economic_settlement_allocations_candidate (
 intent_id uuid NOT NULL REFERENCES sabora.economic_settlement_intents_candidate(id),
 round_id uuid NOT NULL REFERENCES sabora.order_rounds(id),
 account_id uuid NOT NULL REFERENCES sabora.customer_accounts(id),
 consumption_cents bigint NOT NULL CHECK(consumption_cents>0),
 adjusted_cents bigint NOT NULL DEFAULT 0 CHECK(adjusted_cents>=0 AND adjusted_cents<=consumption_cents),
 released_at timestamptz,
 PRIMARY KEY(intent_id,round_id)
);
CREATE UNIQUE INDEX economic_round_active_allocation_candidate
 ON sabora.economic_settlement_allocations_candidate(round_id) WHERE released_at IS NULL;

CREATE TABLE sabora.economic_refund_attempts_candidate (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 intent_id uuid NOT NULL REFERENCES sabora.economic_settlement_intents_candidate(id),
 incident_id uuid NOT NULL UNIQUE REFERENCES sabora.incident_cases(id),
 original_payer_customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 idempotency_key text NOT NULL UNIQUE CHECK(idempotency_key~'^h6_refund_[A-Za-z0-9_-]{16,96}$'),
 provider_refund_id text UNIQUE CHECK(provider_refund_id IS NULL OR provider_refund_id~'^re_[A-Za-z0-9]{8,128}$'),
 state text NOT NULL CHECK(state IN('requested','unknown','succeeded','failed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sabora.operational_account_closures_candidate (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
 session_id uuid NOT NULL,
 account_id uuid REFERENCES sabora.customer_accounts(id),
 scope text NOT NULL CHECK(scope IN('individual','table')),
 channel text CHECK(channel IN('stripe','external','mixed')),
 closed_by uuid NOT NULL REFERENCES sabora.staff_members(user_id),
 correlation_id text NOT NULL CHECK(correlation_id~'^[A-Za-z0-9_-]{8,128}$'),
 consumption_snapshot_cents bigint NOT NULL CHECK(consumption_snapshot_cents>=0),
 closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(closed_by,correlation_id),
 CHECK((scope='individual')=(account_id IS NOT NULL))
);
CREATE UNIQUE INDEX operational_table_closure_occupancy_unique_candidate
 ON sabora.operational_account_closures_candidate(table_id,session_id)
 WHERE scope='table';

DO $security$
DECLARE v text;
BEGIN
 FOREACH v IN ARRAY ARRAY['economic_settlement_intents_candidate',
  'economic_settlement_allocations_candidate','economic_refund_attempts_candidate',
  'operational_account_closures_candidate'] LOOP
  EXECUTE format('ALTER TABLE sabora.%I ENABLE ROW LEVEL SECURITY',v);
  EXECUTE format('ALTER TABLE sabora.%I FORCE ROW LEVEL SECURITY',v);
  EXECUTE format('REVOKE ALL ON sabora.%I FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,sabora_h6_customer_runtime,sabora_h6_provider_runtime,sabora_h6_operations_runtime,sabora_m3_catalog_runtime,sabora_m3_tables_runtime',v);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON sabora.%I TO sabora_h6_fn_owner',v);
  EXECUTE format('CREATE POLICY economic_owner_all ON sabora.%I FOR ALL TO sabora_h6_fn_owner USING(true) WITH CHECK(true)',v);
 END LOOP;
END;
$security$;

-- Staff projection needs the public dining alias but no profile contact or
-- session secret. Finance reads only provider-attributed intent/refund rows.
GRANT SELECT(id,public_id,alias) ON sabora.customer_profiles TO sabora_h6_fn_owner;
GRANT SELECT ON sabora.economic_settlement_intents_candidate,
 sabora.economic_refund_attempts_candidate TO sabora_m3_management_fn_owner;
CREATE POLICY economic_finance_intent_read ON sabora.economic_settlement_intents_candidate
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY economic_finance_refund_read ON sabora.economic_refund_attempts_candidate
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);

CREATE OR REPLACE FUNCTION sabora.verify_h6_staff_capability_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_action text,p_target_id uuid,p_correlation_id text,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $verify_staff$
DECLARE v_key bytea;v_role text;v_payload text;v_expected text;v_now bigint;
BEGIN
 v_now:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF p_key_id !~ '^[A-Za-z0-9_-]{8,64}$' OR p_database_role IS DISTINCT FROM session_user
  OR p_actor_user_id IS NULL OR p_staff_role NOT IN('admin','waiter','kitchen','root')
  OR p_action NOT IN('report_incident','resolve_incident','ack_dispatch',
   'read_events','close_account','set_catalog_sold_out',
   'verify_external_settlement','read_economic_accounts','close_operational_account',
   'close_operational_table')
  OR p_target_id IS NULL OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
  OR p_issued_at_ms>v_now+5000 OR p_issued_at_ms<v_now-60000 OR p_expires_at_ms<=v_now
  OR p_expires_at_ms>p_issued_at_ms+60000 OR p_signature_hex !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501'; END IF;
 SELECT k.hmac_key INTO v_key FROM sabora.order_operation_signing_keys k
  WHERE k.key_id=p_key_id AND k.disabled_at IS NULL AND k.not_before<=clock_timestamp()
   AND k.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501'; END IF;
 SELECT m.role INTO v_role FROM sabora.staff_members m
  WHERE m.user_id=p_actor_user_id AND m.state='active' FOR UPDATE;
 IF NOT FOUND OR v_role IS DISTINCT FROM p_staff_role THEN
  RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501'; END IF;
 v_payload:='h6-v1'||chr(10)||p_database_role||chr(10)||p_actor_user_id::text||chr(10)
  ||p_staff_role||chr(10)||p_action||chr(10)||p_target_id::text||chr(10)
  ||p_correlation_id||chr(10)||p_issued_at_ms::text||chr(10)||p_expires_at_ms::text;
 v_expected:=encode(extensions.hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
 IF length(v_expected)<>length(p_signature_hex)
  OR extensions.hmac(convert_to(v_expected,'UTF8'),convert_to('sabora-h6-capability-compare','UTF8'),'sha256')
   <>extensions.hmac(convert_to(p_signature_hex,'UTF8'),convert_to('sabora-h6-capability-compare','UTF8'),'sha256')
 THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501'; END IF;
 RETURN v_role;
END;
$verify_staff$;

CREATE FUNCTION sabora.read_customer_economic_consumption_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $read$
DECLARE v_customer uuid;v_session uuid;v_items jsonb;v_pending jsonb;
BEGIN
 SELECT s.customer_id,v.session_id INTO v_customer,v_session
 FROM sabora.customer_sessions s JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
  AND v.table_id=p_table_id AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
  AND v.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'economic_scope_forbidden' USING errcode='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'accountId',x.account_id,'customerCode',x.public_id,'customerAlias',x.alias,
  'own',x.customer_id=v_customer,'grossConsumptionCents',x.gross,
  'cancelledCents',x.cancelled,'netConsumptionCents',x.net,
  'outstandingCents',x.outstanding,'state',x.account_state,
  'rounds',coalesce((SELECT jsonb_agg(jsonb_build_object('roundId',r.id,
    'amountCents',greatest(r.amount_cents-coalesce((SELECT sum(i.affected_cents)
      FROM sabora.incident_cases i WHERE i.round_id=r.id AND i.resolved_at IS NOT NULL
       AND i.state IN('adjusted','refund_due','resolved')),0),0)) ORDER BY r.created_at,r.id)
   FROM sabora.order_rounds r WHERE r.account_id=x.account_id AND r.payment_mode='pay_at_end'
    AND NOT EXISTS(SELECT 1 FROM sabora.economic_settlement_allocations_candidate l
     WHERE l.round_id=r.id AND l.released_at IS NULL)
    AND r.amount_cents>coalesce((SELECT sum(i.affected_cents) FROM sabora.incident_cases i
     WHERE i.round_id=r.id AND i.resolved_at IS NOT NULL
      AND i.state IN('adjusted','refund_due','resolved')),0)),'[]'::jsonb)) ORDER BY x.own DESC,x.public_id),'[]'::jsonb)
 INTO v_items FROM (
  SELECT a.id account_id,a.customer_id,p.public_id,p.alias,a.state account_state,
   coalesce(sum(r.amount_cents),0)::bigint gross,
   coalesce((SELECT sum(i.affected_cents) FROM sabora.incident_cases i
    JOIN sabora.order_rounds ir ON ir.id=i.round_id WHERE ir.account_id=a.id
    AND i.resolved_at IS NOT NULL AND i.state IN('adjusted','refund_due','resolved')),0)::bigint cancelled,
   greatest(coalesce(sum(r.amount_cents),0)-coalesce((SELECT sum(i.affected_cents)
    FROM sabora.incident_cases i JOIN sabora.order_rounds ir ON ir.id=i.round_id
    WHERE ir.account_id=a.id AND i.resolved_at IS NOT NULL
    AND i.state IN('adjusted','refund_due','resolved')),0),0)::bigint net,
   a.outstanding_cents outstanding,(a.customer_id=v_customer) own
  FROM sabora.customer_accounts a
  JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
  JOIN sabora.customer_profiles p ON p.id=a.customer_id
  LEFT JOIN sabora.order_rounds r ON r.account_id=a.id
  WHERE b.table_id=p_table_id AND b.session_id=v_session
  GROUP BY a.id,p.public_id,p.alias
 ) x;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'intentId',e.id,'requestKey',e.request_key,'channel',e.channel,'state',e.state,
  'amountCents',e.amount_cents,'createdAt',e.created_at,
  'allocations',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'roundId',l.round_id,'amountCents',l.consumption_cents-l.adjusted_cents)
    ORDER BY l.round_id) FROM sabora.economic_settlement_allocations_candidate l
    WHERE l.intent_id=e.id AND l.released_at IS NULL),'[]'::jsonb))
  ORDER BY e.created_at,e.id),'[]'::jsonb)
 INTO v_pending FROM sabora.economic_settlement_intents_candidate e
 WHERE e.table_id=p_table_id AND e.session_id=v_session AND e.payer_customer_id=v_customer
  AND e.state IN('external_pending','stripe_authorization_requested','stripe_requires_action',
   'stripe_authorized','stripe_authorization_unknown','stripe_capture_requested','stripe_capture_unknown');
 RETURN jsonb_build_object('version',2,'tableId',p_table_id,
  'notice','Consumo operativo, no recaudacion ni facturacion acreditada',
  'items',v_items,'pendingSettlements',v_pending);
END;
$read$;

CREATE FUNCTION sabora.create_customer_economic_settlement_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text,p_request_key text,
 p_channel text,p_allocations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $create$
DECLARE v_customer uuid;v_session uuid;v_payer_account uuid;v_id uuid;v_total bigint;
 v_fingerprint bytea;v_existing sabora.economic_settlement_intents_candidate%ROWTYPE;
 v_item jsonb;v_round sabora.order_rounds%ROWTYPE;v_remaining bigint;
BEGIN
 IF p_channel NOT IN('stripe','external') OR p_request_key!~'^[A-Za-z0-9_-]{16,128}$'
  OR jsonb_typeof(p_allocations)<>'array' OR jsonb_array_length(p_allocations)<1
  OR jsonb_array_length(p_allocations)>50
 THEN RAISE EXCEPTION 'invalid_economic_settlement' USING errcode='22023'; END IF;
 SELECT s.customer_id,v.session_id INTO v_customer,v_session
 FROM sabora.customer_sessions s JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
  AND v.table_id=p_table_id AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
  AND v.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'economic_scope_forbidden' USING errcode='42501'; END IF;
 SELECT a.id INTO v_payer_account FROM sabora.customer_accounts a
  JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
  WHERE b.table_id=p_table_id AND b.session_id=v_session AND b.visit_key=p_visit_key
   AND a.customer_id=v_customer ORDER BY a.created_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'economic_account_not_found' USING errcode='P0002'; END IF;
 v_fingerprint:=sha256(convert_to(p_channel||':'||p_allocations::text,'UTF8'));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  v_customer::text||':'||p_request_key,6115));
 SELECT * INTO v_existing FROM sabora.economic_settlement_intents_candidate
  WHERE payer_customer_id=v_customer AND request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
  IF v_existing.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'economic_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN jsonb_build_object('version',2,'intentId',v_existing.id,'channel',v_existing.channel,
   'state',v_existing.state,'amountCents',v_existing.amount_cents,'repeated',true,
   'authorizationKey',v_existing.authorization_key);
 END IF;
 v_total:=0;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
  IF jsonb_typeof(v_item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v_item))<>2
   OR v_item->>'roundId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR v_item->>'amountCents' !~ '^[1-9][0-9]{0,11}$'
  THEN RAISE EXCEPTION 'invalid_economic_allocation' USING errcode='22023'; END IF;
  SELECT r.* INTO v_round FROM sabora.order_rounds r
   JOIN sabora.customer_accounts a ON a.id=r.account_id
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   WHERE r.id=(v_item->>'roundId')::uuid AND b.table_id=p_table_id AND b.session_id=v_session
   AND r.payment_mode='pay_at_end' FOR UPDATE OF r;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM sabora.economic_settlement_allocations_candidate e
    WHERE e.round_id=v_round.id AND e.released_at IS NULL) THEN
   RAISE EXCEPTION 'economic_round_unavailable' USING errcode='23514'; END IF;
  v_remaining:=v_round.amount_cents-coalesce((SELECT sum(i.affected_cents) FROM sabora.incident_cases i
   WHERE i.round_id=v_round.id AND i.resolved_at IS NOT NULL
    AND i.state IN('adjusted','refund_due','resolved')),0);
  IF (v_item->>'amountCents')::bigint<>v_remaining OR v_remaining<=0 THEN
   RAISE EXCEPTION 'economic_allocation_mismatch' USING errcode='23514'; END IF;
  v_total:=v_total+v_remaining;
 END LOOP;
 INSERT INTO sabora.economic_settlement_intents_candidate(table_id,session_id,payer_customer_id,
  payer_account_id,request_key,request_fingerprint,timing,channel,amount_cents,state,
  authorization_key,capture_key)
 VALUES(p_table_id,v_session,v_customer,v_payer_account,p_request_key,v_fingerprint,'pay_at_end',
  p_channel,v_total,CASE p_channel WHEN 'external' THEN 'external_pending'
   ELSE 'stripe_authorization_requested' END,
  CASE p_channel WHEN 'stripe' THEN 'h6_auth_'||replace(gen_random_uuid()::text,'-','_') END,
  CASE p_channel WHEN 'stripe' THEN 'h6_capture_'||replace(gen_random_uuid()::text,'-','_') END)
 RETURNING id INTO v_id;
 INSERT INTO sabora.economic_settlement_allocations_candidate(intent_id,round_id,account_id,consumption_cents)
 SELECT v_id,(x.value->>'roundId')::uuid,r.account_id,(x.value->>'amountCents')::bigint
 FROM jsonb_array_elements(p_allocations) x(value) JOIN sabora.order_rounds r ON r.id=(x.value->>'roundId')::uuid;
 RETURN jsonb_build_object('version',2,'intentId',v_id,'channel',p_channel,
  'state',CASE p_channel WHEN 'external' THEN 'external_pending' ELSE 'stripe_authorization_requested' END,
  'amountCents',v_total,'repeated',false,'authorizationKey',
  CASE p_channel WHEN 'stripe' THEN (SELECT authorization_key FROM sabora.economic_settlement_intents_candidate WHERE id=v_id) END);
END;
$create$;

CREATE FUNCTION sabora.convert_customer_round_to_external_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text,p_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $convert$
DECLARE v_customer uuid;v_session uuid;v_round sabora.order_rounds%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;v_intent uuid;
BEGIN
 SELECT s.customer_id,v.session_id INTO v_customer,v_session
 FROM sabora.customer_sessions s JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
  AND v.table_id=p_table_id AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
  AND v.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'economic_scope_forbidden' USING errcode='42501'; END IF;
 SELECT a.* INTO v_account FROM sabora.customer_accounts a
 JOIN sabora.order_rounds r ON r.account_id=a.id
 JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
 WHERE r.id=p_round_id AND a.customer_id=v_customer AND b.table_id=p_table_id
  AND b.session_id=v_session FOR UPDATE OF a,b;
 IF NOT FOUND THEN RAISE EXCEPTION 'economic_round_unavailable' USING errcode='23514'; END IF;
 SELECT r.* INTO v_round FROM sabora.order_rounds r
  WHERE r.id=p_round_id AND r.account_id=v_account.id FOR UPDATE;
 IF NOT FOUND OR v_round.payment_mode<>'pay_now' OR v_round.amount_cents<=0 THEN
  RAISE EXCEPTION 'economic_round_unavailable' USING errcode='23514'; END IF;
 SELECT e.id INTO v_intent FROM sabora.economic_settlement_intents_candidate e
  JOIN sabora.economic_settlement_allocations_candidate l ON l.intent_id=e.id
  WHERE l.round_id=v_round.id;
 IF FOUND THEN
  RETURN jsonb_build_object('version',2,'intentId',v_intent,'channel','external',
   'state',v_round.state,'roundId',v_round.id,'repeated',true); END IF;
 SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
 IF NOT FOUND OR v_payment.state<>'authorization_requested' OR v_payment.provider_intent_id IS NOT NULL THEN
  RAISE EXCEPTION 'economic_provider_already_started' USING errcode='23514'; END IF;
 DELETE FROM sabora.payment_attempts WHERE id=v_payment.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'economic_provider_already_started' USING errcode='23514'; END IF;
 UPDATE sabora.order_rounds SET state='awaiting_external_verification',updated_at=clock_timestamp()
  WHERE id=v_round.id RETURNING * INTO v_round;
 INSERT INTO sabora.economic_settlement_intents_candidate(table_id,session_id,payer_customer_id,
  payer_account_id,request_key,request_fingerprint,timing,channel,amount_cents,state)
 VALUES(p_table_id,v_session,v_customer,v_account.id,'external_round_'||replace(v_round.id::text,'-','_'),
  sha256(convert_to('external:'||v_round.id::text,'UTF8')),'pay_as_ordered','external',
  v_round.amount_cents,'external_pending') RETURNING id INTO v_intent;
 INSERT INTO sabora.economic_settlement_allocations_candidate(intent_id,round_id,account_id,consumption_cents)
 VALUES(v_intent,v_round.id,v_account.id,v_round.amount_cents);
 PERFORM sabora.emit_h6_event_candidate(p_table_id,v_session,p_visit_key,v_customer,v_account.id,NULL,
  'customer','sabora.external.verification_required',v_intent,1,
  jsonb_build_object('roundId',v_round.id,'intentId',v_intent,'amountCents',v_round.amount_cents,
   'notice','External operational verification; no accredited money'));
 RETURN jsonb_build_object('version',2,'intentId',v_intent,'channel','external',
  'state','awaiting_external_verification','roundId',v_round.id,'repeated',false);
END;
$convert$;

-- The sealed conversion removes only the unstarted Stripe draft created in
-- the same customer transaction. Runtime roles retain no direct DELETE.
GRANT DELETE ON sabora.payment_attempts TO sabora_h6_fn_owner;
CREATE POLICY h6_owner_unstarted_payment_delete_issue61_candidate
 ON sabora.payment_attempts FOR DELETE TO sabora_h6_fn_owner
 USING(state='authorization_requested' AND provider_intent_id IS NULL
  AND provider_charge_id IS NULL);

CREATE FUNCTION sabora.record_economic_stripe_authorization_candidate(
 p_intent_id uuid,p_outcome text,p_provider_intent_id text,p_capture_before timestamptz,p_error_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $record$
DECLARE v sabora.economic_settlement_intents_candidate%ROWTYPE;v_state text;
BEGIN
 IF p_outcome NOT IN('authorized','requires_action','failed','unknown')
  OR (p_outcome IN('authorized','requires_action') AND
   p_provider_intent_id!~'^pi_[A-Za-z0-9]{8,128}$')
  OR (p_error_code IS NOT NULL AND p_error_code!~'^[a-z0-9_]{1,80}$') THEN
  RAISE EXCEPTION 'invalid_economic_provider_outcome' USING errcode='22023'; END IF;
 SELECT * INTO v FROM sabora.economic_settlement_intents_candidate WHERE id=p_intent_id FOR UPDATE;
 IF NOT FOUND OR v.channel<>'stripe' THEN RAISE EXCEPTION 'economic_intent_not_found' USING errcode='P0002'; END IF;
 IF v.state IN('stripe_captured','stripe_refund_pending','stripe_partially_refunded','stripe_refunded') THEN
  RETURN jsonb_build_object('version',2,'intentId',v.id,'state',v.state,'repeated',true); END IF;
 IF v.state='stripe_authorized' AND p_outcome='authorized'
  AND v.provider_intent_id IS NOT DISTINCT FROM p_provider_intent_id THEN
  RETURN jsonb_build_object('version',2,'intentId',v.id,'state',v.state,'repeated',true); END IF;
 IF v.state='stripe_failed' AND p_outcome='failed' THEN
  RETURN jsonb_build_object('version',2,'intentId',v.id,'state',v.state,'repeated',true); END IF;
 IF v.state NOT IN('stripe_authorization_requested','stripe_authorization_unknown','stripe_requires_action') THEN
  RAISE EXCEPTION 'invalid_economic_provider_transition' USING errcode='23514'; END IF;
 v_state:=CASE p_outcome WHEN 'authorized' THEN 'stripe_authorized'
  WHEN 'requires_action' THEN 'stripe_requires_action' WHEN 'failed' THEN 'stripe_failed'
  ELSE 'stripe_authorization_unknown' END;
 UPDATE sabora.economic_settlement_intents_candidate SET state=v_state,
  provider_intent_id=coalesce(p_provider_intent_id,provider_intent_id),capture_before=p_capture_before,
  provider_error_code=p_error_code,updated_at=clock_timestamp() WHERE id=v.id;
 IF p_outcome='failed' THEN
  UPDATE sabora.economic_settlement_allocations_candidate SET released_at=clock_timestamp()
   WHERE intent_id=v.id AND released_at IS NULL;
 END IF;
 RETURN jsonb_build_object('version',2,'intentId',v.id,'state',v_state,'repeated',false);
END;
$record$;

CREATE FUNCTION sabora.request_economic_stripe_capture_candidate(p_intent_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $capture$
DECLARE v sabora.economic_settlement_intents_candidate%ROWTYPE;
BEGIN
 SELECT * INTO v FROM sabora.economic_settlement_intents_candidate WHERE id=p_intent_id FOR UPDATE;
 IF NOT FOUND OR v.channel<>'stripe' THEN RAISE EXCEPTION 'economic_intent_not_found' USING errcode='P0002'; END IF;
 IF v.state IN('stripe_capture_requested','stripe_capture_unknown') THEN
  RETURN jsonb_build_object('version',2,'intentId',v.id,'action','capture','repeated',true,
   'providerIntentId',v.provider_intent_id,'captureKey',v.capture_key,'amountCents',v.amount_cents); END IF;
 IF v.state<>'stripe_authorized' THEN RAISE EXCEPTION 'economic_not_capturable' USING errcode='23514'; END IF;
 UPDATE sabora.economic_settlement_intents_candidate SET state='stripe_capture_requested',updated_at=clock_timestamp()
  WHERE id=v.id;
 RETURN jsonb_build_object('version',2,'intentId',v.id,'action','capture','repeated',false,
  'providerIntentId',v.provider_intent_id,'captureKey',v.capture_key,'amountCents',v.amount_cents);
END;
$capture$;

CREATE FUNCTION sabora.record_economic_stripe_capture_candidate(
 p_intent_id uuid,p_outcome text,p_provider_charge_id text,p_error_code text,
 p_provider_amount_cents bigint,p_provider_currency text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $record$
DECLARE v sabora.economic_settlement_intents_candidate%ROWTYPE;v_state text;
BEGIN
 IF p_outcome NOT IN('captured','failed','unknown')
  OR (p_outcome='captured' AND p_provider_charge_id!~'^ch_[A-Za-z0-9]{8,128}$')
  OR (p_error_code IS NOT NULL AND p_error_code!~'^[a-z0-9_]{1,80}$') THEN
  RAISE EXCEPTION 'invalid_economic_provider_outcome' USING errcode='22023'; END IF;
 SELECT * INTO v FROM sabora.economic_settlement_intents_candidate WHERE id=p_intent_id FOR UPDATE;
 IF NOT FOUND OR v.channel<>'stripe' THEN RAISE EXCEPTION 'economic_intent_not_found' USING errcode='P0002'; END IF;
  IF p_outcome='captured' AND (p_provider_amount_cents IS DISTINCT FROM v.amount_cents
  OR p_provider_currency IS DISTINCT FROM 'eur') THEN
  RAISE EXCEPTION 'economic_provider_money_mismatch' USING errcode='23514'; END IF;
 IF v.state='stripe_captured' THEN
  IF v.provider_charge_id IS DISTINCT FROM p_provider_charge_id THEN
   RAISE EXCEPTION 'economic_provider_conflict' USING errcode='23505'; END IF;
  RETURN jsonb_build_object('version',2,'intentId',v.id,'state',v.state,'repeated',true); END IF;
 IF v.state NOT IN('stripe_capture_requested','stripe_capture_unknown') THEN
  RAISE EXCEPTION 'invalid_economic_provider_transition' USING errcode='23514'; END IF;
 v_state:=CASE p_outcome WHEN 'captured' THEN 'stripe_captured'
  WHEN 'failed' THEN 'stripe_failed' ELSE 'stripe_capture_unknown' END;
 UPDATE sabora.economic_settlement_intents_candidate SET state=v_state,
  provider_charge_id=CASE WHEN p_outcome='captured' THEN p_provider_charge_id ELSE provider_charge_id END,
  provider_error_code=p_error_code,updated_at=clock_timestamp() WHERE id=v.id;
 IF p_outcome='failed' THEN
  UPDATE sabora.economic_settlement_allocations_candidate SET released_at=clock_timestamp()
   WHERE intent_id=v.id AND released_at IS NULL;
 END IF;
 IF p_outcome='captured' THEN
  UPDATE sabora.customer_accounts a SET outstanding_cents=greatest(a.outstanding_cents-x.cents,0),
   updated_at=clock_timestamp() FROM (SELECT account_id,sum(consumption_cents-adjusted_cents)::bigint cents
    FROM sabora.economic_settlement_allocations_candidate WHERE intent_id=v.id GROUP BY account_id) x
   WHERE a.id=x.account_id;
 END IF;
 RETURN jsonb_build_object('version',2,'intentId',v.id,'state',v_state,'repeated',false);
END;
$record$;

CREATE FUNCTION sabora.verify_external_settlement_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_intent_id uuid,p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $verify$
DECLARE v sabora.economic_settlement_intents_candidate%ROWTYPE;v_result jsonb;
BEGIN
 PERFORM sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'verify_external_settlement',p_intent_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF p_staff_role NOT IN('waiter','admin','root') THEN RAISE EXCEPTION 'economic_staff_forbidden' USING errcode='42501'; END IF;
 SELECT * INTO v FROM sabora.economic_settlement_intents_candidate WHERE id=p_intent_id FOR UPDATE;
 IF NOT FOUND OR v.channel<>'external' THEN RAISE EXCEPTION 'economic_intent_not_found' USING errcode='P0002'; END IF;
 IF v.state='external_verified' THEN
  RETURN jsonb_build_object('version',2,'intentId',v.id,'state',v.state,'repeated',true); END IF;
 IF v.state<>'external_pending' THEN RAISE EXCEPTION 'economic_external_conflict' USING errcode='23514'; END IF;
 UPDATE sabora.economic_settlement_intents_candidate SET state='external_verified',
  verified_by=p_actor_user_id,verified_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=v.id;
 UPDATE sabora.customer_accounts a SET outstanding_cents=greatest(a.outstanding_cents-x.cents,0),
  updated_at=clock_timestamp() FROM (SELECT account_id,sum(consumption_cents-adjusted_cents)::bigint cents
   FROM sabora.economic_settlement_allocations_candidate WHERE intent_id=v.id GROUP BY account_id) x
  WHERE a.id=x.account_id;
 IF v.timing='pay_as_ordered' THEN
  UPDATE sabora.kitchen_dispatches SET state='requested',requested_at=clock_timestamp(),
   updated_at=clock_timestamp() WHERE round_id IN(
    SELECT round_id FROM sabora.economic_settlement_allocations_candidate WHERE intent_id=v.id)
   AND state='blocked';
  UPDATE sabora.order_rounds SET state='dispatch_requested',updated_at=clock_timestamp()
   WHERE id IN(SELECT round_id FROM sabora.economic_settlement_allocations_candidate WHERE intent_id=v.id)
   AND state='awaiting_external_verification';
  PERFORM sabora.emit_h6_event_candidate(v.table_id,v.session_id,NULL,NULL,NULL,'kitchen','kitchen',
   'sabora.kitchen.dispatch_requested',v.id,1,
   jsonb_build_object('intentId',v.id,'channel','external','verifiedBy',p_actor_user_id));
 END IF;
 v_result:=jsonb_build_object('version',2,'intentId',v.id,'state','external_verified','repeated',false,
  'notice','Verificacion operativa externa; no acredita cobro, devolucion, recaudacion ni factura');
 RETURN v_result;
END;
$verify$;

CREATE FUNCTION sabora.read_staff_economic_accounts_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $read$
DECLARE v_items jsonb;
BEGIN
 PERFORM sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'read_economic_accounts',p_actor_user_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF p_staff_role NOT IN('waiter','admin','root') THEN RAISE EXCEPTION 'economic_staff_forbidden' USING errcode='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('accountId',a.id,'tableId',b.table_id,'sessionId',b.session_id,
  'customerCode',p.public_id,'customerAlias',p.alias,'paymentTiming',a.payment_mode,
  'grossConsumptionCents',coalesce(x.gross,0),'cancelledCents',coalesce(x.cancelled,0),
  'netConsumptionCents',greatest(coalesce(x.gross,0)-coalesce(x.cancelled,0),0),
  'stripeCapturedCents',coalesce(m.captured,0),'stripeRefundedCents',coalesce(m.refunded,0),
  'stripeNetCents',greatest(coalesce(m.captured,0)-coalesce(m.refunded,0),0),
  'outstandingCents',a.outstanding_cents,'operationalState',a.state,
  'settlements',coalesce(all_settlements.items,'[]'::jsonb),
   'settlementIntentId',s.id,'settlementChannel',s.channel,'settlementState',s.state,
  'providerConfirmed',coalesce(s.state IN('stripe_captured','stripe_partially_refunded','stripe_refunded'),false),
  'externalVerified',coalesce(s.state='external_verified',false)) ORDER BY b.table_id,p.public_id),'[]'::jsonb)
 INTO v_items FROM sabora.customer_accounts a
 JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
 JOIN sabora.dining_tables t ON t.id=b.table_id AND t.session_id=b.session_id
 JOIN sabora.customer_profiles p ON p.id=a.customer_id
 LEFT JOIN LATERAL (SELECT sum(r.amount_cents)::bigint gross,
  coalesce((SELECT sum(i.affected_cents) FROM sabora.incident_cases i JOIN sabora.order_rounds z ON z.id=i.round_id
   WHERE z.account_id=a.id AND i.resolved_at IS NOT NULL AND i.state IN('adjusted','refund_due','resolved')),0)::bigint cancelled
  FROM sabora.order_rounds r WHERE r.account_id=a.id) x ON true
 LEFT JOIN LATERAL (SELECT e.id,e.channel,e.state FROM sabora.economic_settlement_allocations_candidate l
  JOIN sabora.economic_settlement_intents_candidate e ON e.id=l.intent_id
  WHERE l.account_id=a.id ORDER BY e.created_at DESC LIMIT 1) s ON true
 LEFT JOIN LATERAL (SELECT coalesce(jsonb_agg(jsonb_build_object(
  'intentId',z.id,'channel',z.channel,'state',z.state,
  'allocatedCents',z.allocated_cents,'providerConfirmed',z.state IN(
   'stripe_captured','stripe_refund_pending','stripe_partially_refunded','stripe_refunded'),
  'externalVerified',z.state='external_verified'
 ) ORDER BY z.created_at,z.id),'[]'::jsonb) items FROM (
  SELECT e.id,e.channel,e.state,e.created_at,
   sum(l.consumption_cents-l.adjusted_cents)::bigint allocated_cents
  FROM sabora.economic_settlement_allocations_candidate l
  JOIN sabora.economic_settlement_intents_candidate e ON e.id=l.intent_id
  WHERE l.account_id=a.id AND l.released_at IS NULL
  GROUP BY e.id
 ) z) all_settlements ON true
 LEFT JOIN LATERAL (SELECT
  (coalesce((SELECT sum(l.consumption_cents-l.adjusted_cents)
   FROM sabora.economic_settlement_allocations_candidate l
   JOIN sabora.economic_settlement_intents_candidate e ON e.id=l.intent_id
   WHERE l.account_id=a.id AND e.channel='stripe' AND e.state IN(
    'stripe_captured','stripe_refund_pending','stripe_partially_refunded','stripe_refunded')),0)
   +coalesce((SELECT sum(pa.amount_cents) FROM sabora.payment_attempts pa
    WHERE pa.account_id=a.id AND pa.provider_charge_id IS NOT NULL),0))::bigint captured,
  (coalesce((SELECT sum(rf.amount_cents) FROM sabora.economic_refund_attempts_candidate rf
   JOIN sabora.incident_cases i ON i.id=rf.incident_id
   JOIN sabora.order_rounds rr ON rr.id=i.round_id
   WHERE rr.account_id=a.id AND rf.state='succeeded'),0)
   +coalesce((SELECT sum(r.amount_cents) FROM sabora.refund_attempts r
    JOIN sabora.payment_attempts pa ON pa.id=r.payment_attempt_id
    WHERE pa.account_id=a.id AND r.state='succeeded'),0))::bigint refunded) m ON true
 WHERE a.state IN('open','settled','blocked');
 RETURN jsonb_build_object('version',2,'notice','Consumo operativo, no recaudacion ni facturacion acreditada','items',v_items);
END;
$read$;

CREATE FUNCTION sabora.close_economic_table_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_table_id uuid,p_session_id uuid,p_correlation_id text,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $close_table$
DECLARE v_existing sabora.operational_account_closures_candidate%ROWTYPE;
 v_count integer;v_snapshot bigint;v_closed_at timestamptz;
BEGIN
 PERFORM sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'close_operational_table',p_table_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF p_staff_role NOT IN('waiter','admin','root') THEN
  RAISE EXCEPTION 'economic_staff_forbidden' USING errcode='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_table_id::text||':'||p_session_id::text,6115));
 PERFORM 1 FROM sabora.dining_tables t
  WHERE t.id=p_table_id AND t.session_id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'economic_table_not_found' USING errcode='P0002'; END IF;
 SELECT * INTO v_existing FROM sabora.operational_account_closures_candidate
  WHERE closed_by=p_actor_user_id AND correlation_id=p_correlation_id FOR UPDATE;
 IF FOUND THEN
  IF v_existing.scope<>'table' OR v_existing.table_id<>p_table_id
   OR v_existing.session_id<>p_session_id THEN
   RAISE EXCEPTION 'economic_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN jsonb_build_object('version',2,'tableId',p_table_id,'sessionId',p_session_id,
   'state','settled','closedAt',v_existing.closed_at,'repeated',true); END IF;
 SELECT * INTO v_existing FROM sabora.operational_account_closures_candidate
  WHERE scope='table' AND table_id=p_table_id AND session_id=p_session_id FOR UPDATE;
 IF FOUND THEN
  RETURN jsonb_build_object('version',2,'tableId',p_table_id,'sessionId',p_session_id,
   'state','settled','closedAt',v_existing.closed_at,'repeated',true); END IF;
 SELECT count(*)::integer INTO v_count FROM sabora.customer_accounts a
  JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
  WHERE b.table_id=p_table_id AND b.session_id=p_session_id AND a.state IN('open','settled');
 IF v_count=0 THEN RAISE EXCEPTION 'economic_table_not_found' USING errcode='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM sabora.customer_accounts a
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   WHERE b.table_id=p_table_id AND b.session_id=p_session_id
    AND (a.state NOT IN('open','settled') OR a.outstanding_cents<>0))
  OR EXISTS(SELECT 1 FROM sabora.payment_attempts p JOIN sabora.customer_accounts a ON a.id=p.account_id
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   WHERE b.table_id=p_table_id AND b.session_id=p_session_id AND p.state NOT IN(
    'captured','released','authorization_failed','capture_failed'))
  OR EXISTS(SELECT 1 FROM sabora.refund_attempts f JOIN sabora.payment_attempts p ON p.id=f.payment_attempt_id
   JOIN sabora.customer_accounts a ON a.id=p.account_id
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   WHERE b.table_id=p_table_id AND b.session_id=p_session_id AND f.state<>'succeeded')
  OR EXISTS(SELECT 1 FROM sabora.economic_settlement_allocations_candidate l
   JOIN sabora.economic_settlement_intents_candidate e ON e.id=l.intent_id
   JOIN sabora.customer_accounts a ON a.id=l.account_id
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   WHERE b.table_id=p_table_id AND b.session_id=p_session_id AND l.released_at IS NULL
    AND e.state NOT IN(
    'external_verified','stripe_captured','stripe_partially_refunded','stripe_refunded','adjusted'))
  OR EXISTS(SELECT 1 FROM sabora.economic_refund_attempts_candidate f
   JOIN sabora.economic_settlement_intents_candidate e ON e.id=f.intent_id
   JOIN sabora.economic_settlement_allocations_candidate l ON l.intent_id=e.id
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=l.account_id
   WHERE b.table_id=p_table_id AND b.session_id=p_session_id AND f.state<>'succeeded')
  OR EXISTS(SELECT 1 FROM sabora.incident_cases i JOIN sabora.order_rounds r ON r.id=i.round_id
   JOIN sabora.customer_accounts a ON a.id=r.account_id
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   WHERE b.table_id=p_table_id AND b.session_id=p_session_id
    AND i.state NOT IN('adjusted','rejected_customer_request','resolved'))
  OR EXISTS(SELECT 1 FROM sabora.order_rounds r JOIN sabora.customer_accounts a ON a.id=r.account_id
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   WHERE b.table_id=p_table_id AND b.session_id=p_session_id
    AND r.state NOT IN('kitchen_acknowledged','cancelled'))
  OR EXISTS(SELECT 1 FROM sabora.order_rounds r JOIN sabora.customer_accounts a ON a.id=r.account_id
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   JOIN sabora.order_lines l ON l.order_id=r.order_id
   WHERE b.table_id=p_table_id AND b.session_id=p_session_id AND
    (l.status NOT IN('ready','picked_up') OR (l.status='ready' AND NOT EXISTS(
     SELECT 1 FROM sabora.pickup_tasks t WHERE t.order_line_id=l.id AND t.state IN('ready','claimed')))))
 THEN RAISE EXCEPTION 'economic_table_close_unresolved' USING errcode='23514'; END IF;
 SELECT greatest(coalesce(sum(r.amount_cents),0)-coalesce((SELECT sum(i.affected_cents)
  FROM sabora.incident_cases i JOIN sabora.order_rounds ir ON ir.id=i.round_id
  JOIN sabora.customer_accounts ia ON ia.id=ir.account_id
  JOIN sabora.customer_account_operational_bindings ib ON ib.account_id=ia.id
  WHERE ib.table_id=p_table_id AND ib.session_id=p_session_id AND i.resolved_at IS NOT NULL
   AND i.state IN('adjusted','refund_due','resolved')),0),0)::bigint
 INTO v_snapshot FROM sabora.order_rounds r JOIN sabora.customer_accounts a ON a.id=r.account_id
 JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
 WHERE b.table_id=p_table_id AND b.session_id=p_session_id;
 v_closed_at:=clock_timestamp();
 UPDATE sabora.customer_accounts SET state='settled',closed_at=v_closed_at,
  closed_by=p_actor_user_id,close_correlation_id=p_correlation_id,updated_at=v_closed_at
  WHERE state='open' AND EXISTS(SELECT 1 FROM sabora.customer_account_operational_bindings b
   WHERE b.account_id=customer_accounts.id AND b.table_id=p_table_id AND b.session_id=p_session_id);
 INSERT INTO sabora.operational_account_closures_candidate(table_id,session_id,scope,channel,
  closed_by,correlation_id,consumption_snapshot_cents,closed_at)
 VALUES(p_table_id,p_session_id,'table','mixed',p_actor_user_id,p_correlation_id,v_snapshot,v_closed_at);
 PERFORM sabora.emit_h6_event_candidate(p_table_id,p_session_id,NULL,NULL,NULL,'waiter','waiter',
  'sabora.table.closed',p_table_id,1,jsonb_build_object('tableId',p_table_id,'sessionId',p_session_id,
   'accountCount',v_count,'closedBy',p_actor_user_id,'closedAt',v_closed_at));
 RETURN jsonb_build_object('version',2,'tableId',p_table_id,'sessionId',p_session_id,
  'state','settled','accountCount',v_count,'closedAt',v_closed_at,'repeated',false,
  'notice','Cierre operativo; no acredita cobro, devolucion, recaudacion ni factura');
END;
$close_table$;

-- Reconcile cancellations against the channel that funded the exact round.
-- External settlement never creates a refund or money record; Stripe refunds
-- are durable, provider-owned attempts tied to the original payer and charge.
CREATE OR REPLACE FUNCTION sabora.apply_h6_incident_economic_effect_candidate(p_incident_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $incident_effect$
DECLARE v_incident sabora.incident_cases%ROWTYPE;v_round sabora.order_rounds%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_allocation sabora.economic_settlement_allocations_candidate%ROWTYPE;
 v_intent sabora.economic_settlement_intents_candidate%ROWTYPE;v_prior bigint;
BEGIN
 SELECT * INTO v_incident FROM sabora.incident_cases WHERE id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found' USING errcode='P0002'; END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_incident.round_id FOR UPDATE;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id FOR UPDATE;
 IF v_incident.affected_cents=0 THEN RETURN 'resolved'; END IF;
 SELECT * INTO v_allocation FROM sabora.economic_settlement_allocations_candidate
  WHERE round_id=v_round.id AND released_at IS NULL FOR UPDATE;
 IF FOUND THEN
  SELECT * INTO v_intent FROM sabora.economic_settlement_intents_candidate
   WHERE id=v_allocation.intent_id FOR UPDATE;
  v_prior:=coalesce((SELECT sum(i.affected_cents) FROM sabora.incident_cases i
   WHERE i.round_id=v_round.id AND i.id<>v_incident.id
    AND i.state NOT IN('rejected_customer_request','awaiting_admin')),0);
  IF v_prior+v_incident.affected_cents>v_allocation.consumption_cents THEN
   RAISE EXCEPTION 'incident_exceeds_settled_consumption' USING errcode='23514'; END IF;
  IF v_intent.channel='external' THEN
   UPDATE sabora.economic_settlement_allocations_candidate
    SET adjusted_cents=adjusted_cents+v_incident.affected_cents
    WHERE intent_id=v_intent.id AND round_id=v_round.id;
   IF v_intent.state='external_pending' THEN
    UPDATE sabora.customer_accounts SET
     outstanding_cents=greatest(outstanding_cents-v_incident.affected_cents,0),
     updated_at=clock_timestamp() WHERE id=v_account.id;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM sabora.economic_settlement_allocations_candidate
     WHERE intent_id=v_intent.id AND consumption_cents>adjusted_cents) THEN
    UPDATE sabora.economic_settlement_intents_candidate SET state='adjusted',
     updated_at=clock_timestamp() WHERE id=v_intent.id;
    UPDATE sabora.economic_settlement_allocations_candidate SET released_at=clock_timestamp()
     WHERE intent_id=v_intent.id AND released_at IS NULL;
   END IF;
   UPDATE sabora.incident_cases SET cash_refund_cents=0 WHERE id=v_incident.id;
   RETURN 'adjusted';
  END IF;
  IF v_intent.state IN('stripe_authorization_requested','stripe_requires_action','stripe_authorized',
    'stripe_authorization_unknown','stripe_capture_requested','stripe_capture_unknown') THEN
   RAISE EXCEPTION 'payment_outcome_unknown' USING errcode='23514';
  ELSIF v_intent.state='stripe_failed' THEN
   UPDATE sabora.economic_settlement_allocations_candidate
    SET adjusted_cents=adjusted_cents+v_incident.affected_cents
    WHERE intent_id=v_intent.id AND round_id=v_round.id;
   UPDATE sabora.customer_accounts SET
    outstanding_cents=greatest(outstanding_cents-v_incident.affected_cents,0),
    updated_at=clock_timestamp() WHERE id=v_account.id;
   RETURN 'adjusted';
  ELSIF v_intent.state IN('stripe_captured','stripe_partially_refunded','stripe_refund_pending') THEN
   INSERT INTO sabora.economic_refund_attempts_candidate(intent_id,incident_id,
    original_payer_customer_id,amount_cents,idempotency_key,state)
   VALUES(v_intent.id,v_incident.id,v_intent.payer_customer_id,v_incident.affected_cents,
    'h6_refund_'||replace(v_incident.id::text,'-','_'),'requested');
   UPDATE sabora.economic_settlement_intents_candidate SET state='stripe_refund_pending',
    updated_at=clock_timestamp() WHERE id=v_intent.id;
   RETURN 'refund_due';
  ELSIF v_intent.state='stripe_refunded' THEN
   RAISE EXCEPTION 'incident_exceeds_settled_consumption' USING errcode='23514';
  ELSE
   RAISE EXCEPTION 'incident_payment_not_reconcilable' USING errcode='23514';
  END IF;
 END IF;
 IF v_round.payment_mode='pay_at_end' THEN
  UPDATE sabora.customer_accounts SET
   outstanding_cents=greatest(outstanding_cents-v_incident.affected_cents,0),
   updated_at=clock_timestamp() WHERE id=v_account.id;
  UPDATE sabora.incident_cases SET cash_refund_cents=0 WHERE id=v_incident.id;
  RETURN 'adjusted';
 END IF;
 SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
 IF v_payment.state IN('authorization_unknown','capture_unknown') THEN
  RAISE EXCEPTION 'payment_outcome_unknown' USING errcode='23514';
 ELSIF v_payment.state='captured' THEN
  IF coalesce((SELECT sum(r.amount_cents) FROM sabora.refund_attempts r
    WHERE r.payment_attempt_id=v_payment.id),0)+v_incident.affected_cents>v_payment.amount_cents
  THEN RAISE EXCEPTION 'incident_exceeds_captured_amount' USING errcode='23514'; END IF;
  INSERT INTO sabora.refund_attempts(incident_id,payment_attempt_id,amount_cents,idempotency_key,state)
  VALUES(v_incident.id,v_payment.id,v_incident.affected_cents,
   'h6_refund_'||replace(v_incident.id::text,'-','_'),'requested');
  RETURN 'refund_due';
 ELSIF v_payment.state IN('authorized','capture_requested') THEN
  UPDATE sabora.payment_attempts SET state='release_requested',updated_at=clock_timestamp()
   WHERE id=v_payment.id;
  RETURN 'refund_due';
 ELSIF v_payment.state IN('authorization_failed','capture_failed','released') THEN RETURN 'resolved';
 END IF;
 RAISE EXCEPTION 'incident_payment_not_reconcilable' USING errcode='23514';
END;
$incident_effect$;

CREATE FUNCTION sabora.request_economic_stripe_refund_candidate(p_incident_id uuid)
RETURNS TABLE(refund_attempt_id uuid,provider_charge_id text,amount_cents bigint,
 idempotency_key text,action text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $request_refund$
DECLARE v_refund sabora.economic_refund_attempts_candidate%ROWTYPE;
 v_intent sabora.economic_settlement_intents_candidate%ROWTYPE;
BEGIN
 SELECT * INTO v_refund FROM sabora.economic_refund_attempts_candidate
  WHERE incident_id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found' USING errcode='P0002'; END IF;
 SELECT * INTO v_intent FROM sabora.economic_settlement_intents_candidate
  WHERE id=v_refund.intent_id FOR UPDATE;
 IF v_refund.state='succeeded' THEN
  RETURN QUERY SELECT v_refund.id,v_intent.provider_charge_id,v_refund.amount_cents,
   v_refund.idempotency_key,'done',true;RETURN;
 ELSIF v_refund.state='failed' THEN
  RETURN QUERY SELECT v_refund.id,v_intent.provider_charge_id,v_refund.amount_cents,
   v_refund.idempotency_key,'blocked',true;RETURN;
 ELSIF v_intent.provider_charge_id IS NULL OR v_intent.channel<>'stripe' THEN
  RAISE EXCEPTION 'refund_source_unavailable' USING errcode='23514';
 END IF;
 RETURN QUERY SELECT v_refund.id,v_intent.provider_charge_id,v_refund.amount_cents,
  v_refund.idempotency_key,'refund',(v_refund.state='unknown');
END;
$request_refund$;

CREATE FUNCTION sabora.record_economic_stripe_refund_candidate(
 p_refund_attempt_id uuid,p_outcome text,p_provider_refund_id text,p_error_code text,
 p_provider_amount_cents bigint,p_provider_charge_id text,p_provider_currency text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $record_refund$
DECLARE v_refund sabora.economic_refund_attempts_candidate%ROWTYPE;
 v_intent sabora.economic_settlement_intents_candidate%ROWTYPE;v_next text;v_refunded bigint;
BEGIN
 IF p_outcome NOT IN('succeeded','failed','unknown') OR
  (p_outcome='succeeded' AND p_provider_refund_id!~'^re_[A-Za-z0-9]{8,128}$')
 THEN RAISE EXCEPTION 'invalid_refund_outcome' USING errcode='22023'; END IF;
 SELECT * INTO v_refund FROM sabora.economic_refund_attempts_candidate
  WHERE id=p_refund_attempt_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found' USING errcode='P0002'; END IF;
 SELECT * INTO v_intent FROM sabora.economic_settlement_intents_candidate
  WHERE id=v_refund.intent_id FOR UPDATE;
 IF p_outcome='succeeded' AND (p_provider_amount_cents IS DISTINCT FROM v_refund.amount_cents
  OR p_provider_charge_id IS DISTINCT FROM v_intent.provider_charge_id
  OR p_provider_currency IS DISTINCT FROM 'eur') THEN
  RAISE EXCEPTION 'economic_refund_money_mismatch' USING errcode='23514'; END IF;
 IF v_refund.state='succeeded' THEN
  IF p_outcome<>'succeeded' OR v_refund.provider_refund_id IS DISTINCT FROM p_provider_refund_id
   THEN RAISE EXCEPTION 'invalid_refund_transition' USING errcode='23514'; END IF;
  RETURN jsonb_build_object('version',2,'refundAttemptId',v_refund.id,'state','succeeded','repeated',true);
 END IF;
 IF v_refund.state='failed' THEN RAISE EXCEPTION 'invalid_refund_transition' USING errcode='23514'; END IF;
 v_next:=p_outcome;
 UPDATE sabora.economic_refund_attempts_candidate SET state=v_next,
  provider_refund_id=CASE WHEN p_outcome='succeeded' THEN p_provider_refund_id ELSE provider_refund_id END,
  updated_at=clock_timestamp() WHERE id=v_refund.id RETURNING * INTO v_refund;
 IF p_outcome='succeeded' THEN
  UPDATE sabora.incident_cases SET state='resolved' WHERE id=v_refund.incident_id;
  SELECT coalesce(sum(amount_cents),0) INTO v_refunded
   FROM sabora.economic_refund_attempts_candidate WHERE intent_id=v_intent.id AND state='succeeded';
  UPDATE sabora.economic_settlement_intents_candidate SET
   state=CASE WHEN v_refunded>=amount_cents THEN 'stripe_refunded' ELSE 'stripe_partially_refunded' END,
   provider_error_code=NULL,updated_at=clock_timestamp() WHERE id=v_intent.id;
 ELSE
  UPDATE sabora.economic_settlement_intents_candidate SET state='stripe_refund_pending',
   provider_error_code=p_error_code,updated_at=clock_timestamp() WHERE id=v_intent.id;
 END IF;
 PERFORM sabora.emit_h6_event_candidate(v_intent.table_id,v_intent.session_id,NULL,
  v_intent.payer_customer_id,v_intent.payer_account_id,NULL,'customer',
  'sabora.refund.'||v_next,v_refund.id,1,jsonb_build_object('incidentId',v_refund.incident_id,
   'refundAttemptId',v_refund.id,'amountCents',v_refund.amount_cents,'state',v_next));
 RETURN jsonb_build_object('version',2,'refundAttemptId',v_refund.id,'state',v_next,'repeated',false);
END;
$record_refund$;

-- Keep one durable Stripe ingress and one event identity ledger for the
-- historic pay-as-ordered flow and the issue #61 pay-at-end flow. Ownership
-- is selected before the append-only event row is inserted, so no delivery
-- can be processed by both ledgers or rewrite a finalized outcome.
CREATE FUNCTION sabora.ingest_stripe_webhook_issue61_candidate(
 p_event_id text,p_event_type text,p_provider_object_id text,p_provider_created_at timestamptz,
 p_payload_sha256 bytea,p_provider_charge_id text DEFAULT NULL,p_capture_before timestamptz DEFAULT NULL,
 p_refund_attempt_id uuid DEFAULT NULL,p_refund_status text DEFAULT NULL,
 p_sabora_order_id uuid DEFAULT NULL,p_provider_amount_cents bigint DEFAULT NULL,
 p_provider_currency text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $stripe_issue61$
DECLARE v_existing sabora.stripe_webhook_events%ROWTYPE;
 v_intent sabora.economic_settlement_intents_candidate%ROWTYPE;
 v_refund sabora.economic_refund_attempts_candidate%ROWTYPE;v_outcome text:='stale';
BEGIN
 IF p_event_id !~ '^evt_[A-Za-z0-9]{8,128}$' OR p_event_type NOT IN(
  'payment_intent.amount_capturable_updated','payment_intent.payment_failed',
  'payment_intent.succeeded','payment_intent.canceled','charge.refunded','refund.updated')
  OR p_provider_object_id !~ '^(pi|ch|re)_[A-Za-z0-9]{8,128}$'
  OR p_provider_created_at IS NULL OR p_payload_sha256 IS NULL OR octet_length(p_payload_sha256)<>32
  OR (p_event_type='payment_intent.amount_capturable_updated' AND p_capture_before IS NULL)
  OR (p_event_type='refund.updated' AND (p_refund_attempt_id IS NULL
   OR p_refund_status NOT IN('pending','requires_action','succeeded','failed','canceled')
   OR p_provider_charge_id IS NULL OR p_provider_charge_id!~'^ch_[A-Za-z0-9]{8,128}$'))
 THEN RAISE EXCEPTION 'invalid_stripe_webhook' USING errcode='22023'; END IF;

 -- Select exactly one owner before writing the shared immutable event ledger.
 -- Existing pay-as-ordered attempts/refunds retain their original ingester.
 IF p_event_type LIKE 'payment_intent.%' AND EXISTS(
   SELECT 1 FROM sabora.payment_attempts p WHERE p.provider_intent_id=p_provider_object_id)
  OR p_event_type='refund.updated' AND EXISTS(
   SELECT 1 FROM sabora.refund_attempts r WHERE r.id=p_refund_attempt_id)
  OR p_event_type='charge.refunded'
 THEN RETURN sabora.ingest_stripe_webhook_h6_candidate(p_event_id,p_event_type,p_provider_object_id,
   p_provider_created_at,p_payload_sha256,p_provider_charge_id,p_capture_before,
   p_refund_attempt_id,p_refund_status); END IF;

 IF p_event_type LIKE 'payment_intent.%' THEN
  SELECT * INTO v_intent FROM sabora.economic_settlement_intents_candidate e
   WHERE e.provider_intent_id=p_provider_object_id
    OR (p_sabora_order_id IS NOT NULL AND e.id=p_sabora_order_id)
   ORDER BY (e.provider_intent_id=p_provider_object_id) DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN sabora.ingest_stripe_webhook_h6_candidate(
    p_event_id,p_event_type,p_provider_object_id,p_provider_created_at,p_payload_sha256,
    p_provider_charge_id,p_capture_before,p_refund_attempt_id,p_refund_status); END IF;
   IF p_event_type IN('payment_intent.amount_capturable_updated','payment_intent.succeeded')
    AND (p_provider_amount_cents IS DISTINCT FROM v_intent.amount_cents
     OR p_provider_currency IS DISTINCT FROM 'eur') THEN
    RAISE EXCEPTION 'economic_provider_money_mismatch' USING errcode='23514'; END IF;
  ELSIF p_event_type='refund.updated' THEN
  SELECT * INTO v_refund FROM sabora.economic_refund_attempts_candidate r
   WHERE r.id=p_refund_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN sabora.ingest_stripe_webhook_h6_candidate(
    p_event_id,p_event_type,p_provider_object_id,p_provider_created_at,p_payload_sha256,
    p_provider_charge_id,p_capture_before,p_refund_attempt_id,p_refund_status); END IF;
   IF p_provider_amount_cents IS DISTINCT FROM v_refund.amount_cents
    OR p_provider_currency IS DISTINCT FROM 'eur' THEN
    RAISE EXCEPTION 'economic_refund_money_mismatch' USING errcode='23514'; END IF;
  ELSE
  RETURN sabora.ingest_stripe_webhook_h6_candidate(p_event_id,p_event_type,p_provider_object_id,
   p_provider_created_at,p_payload_sha256,p_provider_charge_id,p_capture_before,
   p_refund_attempt_id,p_refund_status);
 END IF;

 SELECT * INTO v_existing FROM sabora.stripe_webhook_events WHERE event_id=p_event_id;
 IF FOUND THEN
  IF v_existing.payload_sha256<>p_payload_sha256 OR v_existing.event_type<>p_event_type
   THEN RAISE EXCEPTION 'stripe_event_identity_conflict' USING errcode='23505'; END IF;
  RETURN jsonb_build_object('eventId',p_event_id,'outcome',v_existing.outcome,'repeated',true);
 END IF;
 INSERT INTO sabora.stripe_webhook_events(event_id,event_type,provider_object_id,
  provider_created_at,payload_sha256)
 VALUES(p_event_id,p_event_type,p_provider_object_id,p_provider_created_at,p_payload_sha256);

 IF p_event_type LIKE 'payment_intent.%' THEN
  IF v_intent.provider_intent_id IS NULL OR v_intent.provider_intent_id=p_provider_object_id THEN
   IF p_event_type='payment_intent.amount_capturable_updated'
    AND v_intent.state IN('stripe_authorization_requested','stripe_authorization_unknown','stripe_requires_action') THEN
    PERFORM sabora.record_economic_stripe_authorization_candidate(v_intent.id,
     CASE WHEN p_capture_before>clock_timestamp() THEN 'authorized' ELSE 'failed' END,
     p_provider_object_id,p_capture_before,
     CASE WHEN p_capture_before<=clock_timestamp() THEN 'authorization_expired' END);
    v_outcome:='applied';
   ELSIF p_event_type='payment_intent.succeeded' AND v_intent.state IN(
    'stripe_authorization_requested','stripe_authorization_unknown','stripe_requires_action',
    'stripe_authorized','stripe_capture_requested','stripe_capture_unknown') THEN
    IF v_intent.state IN('stripe_authorization_requested','stripe_authorization_unknown','stripe_requires_action') THEN
     PERFORM sabora.record_economic_stripe_authorization_candidate(v_intent.id,'authorized',
      p_provider_object_id,NULL,NULL);
     v_intent.state:='stripe_authorized';
    END IF;
    IF v_intent.state='stripe_authorized' THEN
     PERFORM sabora.request_economic_stripe_capture_candidate(v_intent.id);
    END IF;
    PERFORM sabora.record_economic_stripe_capture_candidate(v_intent.id,'captured',
     p_provider_charge_id,NULL,p_provider_amount_cents,p_provider_currency);
    v_outcome:='applied';
   ELSIF p_event_type IN('payment_intent.payment_failed','payment_intent.canceled')
    AND v_intent.state IN('stripe_authorization_requested','stripe_authorization_unknown',
     'stripe_requires_action','stripe_authorized','stripe_capture_requested','stripe_capture_unknown') THEN
    IF v_intent.state IN('stripe_authorization_requested','stripe_authorization_unknown','stripe_requires_action') THEN
     PERFORM sabora.record_economic_stripe_authorization_candidate(v_intent.id,'failed',
      p_provider_object_id,NULL,'provider_webhook_failed');
    ELSE
     IF v_intent.state='stripe_authorized' THEN
      PERFORM sabora.request_economic_stripe_capture_candidate(v_intent.id);
     END IF;
     PERFORM sabora.record_economic_stripe_capture_candidate(v_intent.id,'failed',NULL,
      'provider_webhook_failed',NULL,NULL);
    END IF;
    v_outcome:='applied';
   END IF;
  END IF;
 ELSIF p_event_type='refund.updated' THEN
  IF EXISTS(SELECT 1 FROM sabora.economic_settlement_intents_candidate e
    WHERE e.id=v_refund.intent_id AND e.provider_charge_id=p_provider_charge_id)
   AND (v_refund.provider_refund_id IS NULL OR v_refund.provider_refund_id=p_provider_object_id) THEN
   IF p_refund_status IN('succeeded','failed','canceled') THEN
    PERFORM sabora.record_economic_stripe_refund_candidate(v_refund.id,
     CASE WHEN p_refund_status='succeeded' THEN 'succeeded' ELSE 'failed' END,
     CASE WHEN p_refund_status='succeeded' THEN p_provider_object_id END,NULL,
      p_provider_amount_cents,p_provider_charge_id,p_provider_currency);
    v_outcome:='applied';
   END IF;
  END IF;
 END IF;
 UPDATE sabora.stripe_webhook_events SET processed_at=clock_timestamp(),outcome=v_outcome
  WHERE event_id=p_event_id;
 RETURN jsonb_build_object('eventId',p_event_id,'outcome',v_outcome,'repeated',false);
END;
$stripe_issue61$;

-- The old cash recording endpoints are not composed by the new runtime.  Keep
-- historical tables immutable so old audit evidence remains intelligible.
COMMENT ON TABLE sabora.cash_settlements IS
 'Historical candidate ledger superseded by issue #61; not an operational money API.';
COMMENT ON TABLE sabora.third_party_cash_intents_candidate IS
 'Historical candidate superseded by economic_settlement_intents_candidate.';

-- Feed the existing immutable Stripe finance event stream from both the
-- pay-as-ordered ledger and the reconciled pay-at-end ledger. External
-- verification deliberately has no trigger and can never become revenue.
CREATE OR REPLACE FUNCTION sabora.append_finance_provider_event_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF TG_TABLE_NAME='payment_attempts' THEN
  IF NEW.state IN('captured','refund_required') AND NEW.provider_charge_id IS NOT NULL
   AND (OLD.state IS DISTINCT FROM NEW.state OR OLD.provider_charge_id IS DISTINCT FROM NEW.provider_charge_id)
  THEN INSERT INTO sabora.finance_provider_events_candidate(kind,source_id,account_id,amount_cents)
   VALUES('capture',NEW.id,NEW.account_id,NEW.amount_cents) ON CONFLICT DO NOTHING; END IF;
 ELSIF TG_TABLE_NAME='refund_attempts' THEN
  IF NEW.state='succeeded' AND OLD.state IS DISTINCT FROM NEW.state THEN
   INSERT INTO sabora.finance_provider_events_candidate(kind,source_id,account_id,amount_cents)
   SELECT 'refund',NEW.id,p.account_id,NEW.amount_cents FROM sabora.payment_attempts p
   WHERE p.id=NEW.payment_attempt_id ON CONFLICT DO NOTHING; END IF;
 ELSIF TG_TABLE_NAME='economic_settlement_intents_candidate' THEN
  IF NEW.state IN('stripe_captured','stripe_refund_pending','stripe_partially_refunded','stripe_refunded')
   AND NEW.provider_charge_id IS NOT NULL
   AND (OLD.state IS DISTINCT FROM NEW.state OR OLD.provider_charge_id IS DISTINCT FROM NEW.provider_charge_id)
  THEN INSERT INTO sabora.finance_provider_events_candidate(kind,source_id,account_id,amount_cents)
   VALUES('capture',NEW.id,NEW.payer_account_id,NEW.amount_cents) ON CONFLICT DO NOTHING; END IF;
 ELSIF TG_TABLE_NAME='economic_refund_attempts_candidate' THEN
  IF NEW.state='succeeded' AND OLD.state IS DISTINCT FROM NEW.state THEN
   INSERT INTO sabora.finance_provider_events_candidate(kind,source_id,account_id,amount_cents)
   SELECT 'refund',NEW.id,e.payer_account_id,NEW.amount_cents
   FROM sabora.economic_settlement_intents_candidate e WHERE e.id=NEW.intent_id
   ON CONFLICT DO NOTHING; END IF;
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER append_finance_economic_capture_candidate
 AFTER UPDATE OF state,provider_charge_id ON sabora.economic_settlement_intents_candidate
 FOR EACH ROW EXECUTE FUNCTION sabora.append_finance_provider_event_candidate();
CREATE TRIGGER append_finance_economic_refund_candidate
 AFTER UPDATE OF state ON sabora.economic_refund_attempts_candidate
 FOR EACH ROW EXECUTE FUNCTION sabora.append_finance_provider_event_candidate();

-- Preserve the previous calculator as inaccessible history and wrap it with
-- the owner-approved money boundary. Operational consumption remains in its
-- period fields; every collection field now comes only from confirmed Stripe
-- events, while cash/tips ledgers are excluded from operational reporting.
ALTER FUNCTION sabora.read_admin_finance_dashboard_candidate(jsonb,text,text,text)
 RENAME TO read_admin_finance_dashboard_pre_issue61_candidate;
REVOKE ALL ON FUNCTION sabora.read_admin_finance_dashboard_pre_issue61_candidate(jsonb,text,text,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_tables_runtime,sabora_m3_catalog_runtime,sabora_h6_provider_runtime,
  sabora_h6_customer_runtime,sabora_h6_operations_runtime;
GRANT CREATE ON SCHEMA sabora TO sabora_m3_management_fn_owner;
GRANT sabora_m3_management_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
CREATE FUNCTION sabora.read_admin_finance_dashboard_candidate(
 p_capability jsonb,p_period text,p_month text,p_time_zone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $finance_issue61$
DECLARE v jsonb;v_from timestamptz;v_to timestamptz;v_prev_from timestamptz;
 v_day_from timestamptz;v_day_to timestamptz;v_month_from timestamptz;v_month_to timestamptz;
 v_period bigint;v_previous bigint;v_today bigint;v_month bigint;v_gaps bigint;
BEGIN
 v:=sabora.read_admin_finance_dashboard_pre_issue61_candidate(
  p_capability,p_period,p_month,p_time_zone);
 v_from:=(v->>'from')::timestamptz;v_to:=(v->>'to')::timestamptz;
 v_prev_from:=CASE p_period
  WHEN 'today' THEN (((v_from AT TIME ZONE (v->>'timeZone'))::date-1)::timestamp AT TIME ZONE (v->>'timeZone'))
  WHEN 'last7' THEN (((v_from AT TIME ZONE (v->>'timeZone'))::date-7)::timestamp AT TIME ZONE (v->>'timeZone'))
  ELSE ((v_from AT TIME ZONE (v->>'timeZone'))-interval '1 month') AT TIME ZONE (v->>'timeZone') END;
 v_day_from:=((v->>'asOf')::timestamptz AT TIME ZONE (v->>'timeZone'))::date::timestamp
  AT TIME ZONE (v->>'timeZone');
 v_day_to:=(((v_day_from AT TIME ZONE (v->>'timeZone'))::date+1)::timestamp
  AT TIME ZONE (v->>'timeZone'));
 v_month_from:=date_trunc('month',(v->>'asOf')::timestamptz AT TIME ZONE (v->>'timeZone'))
  AT TIME ZONE (v->>'timeZone');
 v_month_to:=((v_month_from AT TIME ZONE (v->>'timeZone'))+interval '1 month')
  AT TIME ZONE (v->>'timeZone');
 SELECT count(*) INTO v_gaps FROM (
  SELECT e.id FROM sabora.economic_settlement_intents_candidate e
   WHERE e.channel='stripe' AND e.state IN(
    'stripe_captured','stripe_refund_pending','stripe_partially_refunded','stripe_refunded')
   AND e.provider_charge_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM sabora.finance_provider_events_candidate f WHERE f.kind='capture' AND f.source_id=e.id)
  UNION ALL
  SELECT r.id FROM sabora.economic_refund_attempts_candidate r WHERE r.state='succeeded'
   AND NOT EXISTS(SELECT 1 FROM sabora.finance_provider_events_candidate f
    WHERE f.kind='refund' AND f.source_id=r.id)
 ) missing;
 WITH movements AS (SELECT confirmed_at AS at,
  CASE kind WHEN 'capture' THEN amount_cents ELSE -amount_cents END AS amount
  FROM sabora.finance_provider_events_candidate)
 SELECT coalesce(sum(amount) FILTER(WHERE at>=v_from AND at<v_to),0)::bigint,
  coalesce(sum(amount) FILTER(WHERE at>=v_prev_from AND at<v_from),0)::bigint,
  coalesce(sum(amount) FILTER(WHERE at>=v_day_from AND at<v_day_to),0)::bigint,
  coalesce(sum(amount) FILTER(WHERE at>=v_month_from AND at<v_month_to),0)::bigint
 INTO v_period,v_previous,v_today,v_month FROM movements;
 IF v_gaps>0 OR v->>'historicalCoverage'='incomplete' THEN
  RETURN v||jsonb_build_object('todayCollectedCents',NULL,'monthCollectedCents',NULL,
   'cashCollectedCents',0,'stripeCollectedCents',NULL,'collectedCents',NULL,
   'previousCollectedCents',NULL,'tipsCents',NULL,'tipsAvailable',false,
   'historicalCoverage','incomplete','moneyBoundary','stripe_only');
 END IF;
 RETURN v||jsonb_build_object('todayCollectedCents',v_today,'monthCollectedCents',v_month,
  'cashCollectedCents',0,'stripeCollectedCents',v_period,'collectedCents',v_period,
  'previousCollectedCents',v_previous,'tipsCents',NULL,'tipsAvailable',false,
  'historicalCoverage','complete','moneyBoundary','stripe_only');
END;
$finance_issue61$;
ALTER FUNCTION sabora.read_admin_finance_dashboard_candidate(jsonb,text,text,text)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_finance_dashboard_candidate(jsonb,text,text,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_tables_runtime,sabora_h6_provider_runtime,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_admin_finance_dashboard_candidate(jsonb,text,text,text)
 TO sabora_m3_catalog_runtime;
REVOKE sabora_m3_management_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_m3_management_fn_owner;

GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE,INHERIT TRUE;
DO $owners$
DECLARE f regprocedure;
BEGIN
 FOREACH f IN ARRAY ARRAY[
  'sabora.read_customer_economic_consumption_candidate(bytea,uuid,text)'::regprocedure,
  'sabora.create_customer_economic_settlement_candidate(bytea,uuid,text,text,text,jsonb)'::regprocedure,
  'sabora.convert_customer_round_to_external_candidate(bytea,uuid,text,uuid)'::regprocedure,
  'sabora.record_economic_stripe_authorization_candidate(uuid,text,text,timestamptz,text)'::regprocedure,
  'sabora.request_economic_stripe_capture_candidate(uuid)'::regprocedure,
  'sabora.record_economic_stripe_capture_candidate(uuid,text,text,text,bigint,text)'::regprocedure,
  'sabora.verify_external_settlement_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)'::regprocedure,
  'sabora.read_staff_economic_accounts_candidate(text,text,uuid,text,text,bigint,bigint,text)'::regprocedure
  ,'sabora.close_economic_table_authorized_candidate(text,text,uuid,text,uuid,uuid,text,bigint,bigint,text)'::regprocedure
  ,'sabora.apply_h6_incident_economic_effect_candidate(uuid)'::regprocedure
  ,'sabora.request_economic_stripe_refund_candidate(uuid)'::regprocedure
  ,'sabora.record_economic_stripe_refund_candidate(uuid,text,text,text,bigint,text,text)'::regprocedure
  ,'sabora.ingest_stripe_webhook_issue61_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text,uuid,bigint,text)'::regprocedure
 ] LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO sabora_h6_fn_owner',f); END LOOP;
END;
$owners$;
REVOKE ALL ON FUNCTION sabora.read_customer_economic_consumption_candidate(bytea,uuid,text) FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,sabora_h6_operations_runtime;
REVOKE ALL ON FUNCTION sabora.create_customer_economic_settlement_candidate(bytea,uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_economic_consumption_candidate(bytea,uuid,text),sabora.create_customer_economic_settlement_candidate(bytea,uuid,text,text,text,jsonb) TO sabora_h6_customer_runtime;
REVOKE ALL ON FUNCTION sabora.convert_customer_round_to_external_candidate(bytea,uuid,text,uuid) FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.convert_customer_round_to_external_candidate(bytea,uuid,text,uuid) TO sabora_h6_customer_runtime,sabora_b3_confirmation_runtime;
REVOKE ALL ON FUNCTION sabora.record_economic_stripe_authorization_candidate(uuid,text,text,timestamptz,text),sabora.request_economic_stripe_capture_candidate(uuid),sabora.record_economic_stripe_capture_candidate(uuid,text,text,text,bigint,text) FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.record_economic_stripe_authorization_candidate(uuid,text,text,timestamptz,text),sabora.request_economic_stripe_capture_candidate(uuid),sabora.record_economic_stripe_capture_candidate(uuid,text,text,text,bigint,text) TO sabora_h6_provider_runtime;
REVOKE ALL ON FUNCTION sabora.request_economic_stripe_refund_candidate(uuid),sabora.record_economic_stripe_refund_candidate(uuid,text,text,text,bigint,text,text) FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.request_economic_stripe_refund_candidate(uuid),sabora.record_economic_stripe_refund_candidate(uuid,text,text,text,bigint,text,text) TO sabora_h6_provider_runtime;
REVOKE ALL ON FUNCTION sabora.ingest_stripe_webhook_issue61_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text,uuid,bigint,text) FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.ingest_stripe_webhook_issue61_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text,uuid,bigint,text) TO sabora_h6_provider_runtime;
REVOKE ALL ON FUNCTION sabora.ingest_stripe_webhook_h6_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text) FROM sabora_h6_provider_runtime;
REVOKE ALL ON FUNCTION sabora.apply_h6_incident_economic_effect_candidate(uuid) FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.apply_h6_incident_economic_effect_candidate(uuid) TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.verify_external_settlement_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text),sabora.read_staff_economic_accounts_candidate(text,text,uuid,text,text,bigint,bigint,text) FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.verify_external_settlement_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text),sabora.read_staff_economic_accounts_candidate(text,text,uuid,text,text,bigint,bigint,text) TO sabora_h6_operations_runtime;
REVOKE ALL ON FUNCTION sabora.close_economic_table_authorized_candidate(text,text,uuid,text,uuid,uuid,text,bigint,bigint,text) FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.close_economic_table_authorized_candidate(text,text,uuid,text,uuid,uuid,text,bigint,bigint,text) TO sabora_h6_operations_runtime;

-- Superseded cash, third-party payment and tip entry points remain as sealed
-- history only. Runtime LOGIN roles must not be able to recompose them.
DO $retire_legacy_money$
DECLARE p record;r name;
BEGIN
 FOR p IN SELECT proc.oid,proc.proname,pg_catalog.pg_get_function_identity_arguments(proc.oid) args
  FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_namespace n ON n.oid=proc.pronamespace
  WHERE n.nspname='sabora' AND proc.proname=ANY(ARRAY[
   'read_h6_cash_accounts_candidate','settle_h6_account_cash_authorized_candidate',
   'refund_h6_cash_authorized_candidate','read_third_party_cash_debts_candidate',
   'create_third_party_cash_intent_candidate','read_third_party_cash_refunds_candidate',
   'issue_third_party_cash_refund_proof_candidate','read_third_party_cash_pending_candidate',
   'settle_third_party_cash_candidate','refund_third_party_cash_candidate',
   'create_cash_tip_intent_candidate','read_my_cash_tips_candidate',
   'issue_cash_tip_refund_proof_candidate','refund_cash_tip_candidate'])
 LOOP
  FOREACH r IN ARRAY ARRAY['sabora_h6_customer_runtime'::name,'sabora_h6_operations_runtime'::name]
  LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM %I','sabora',p.proname,p.args,r);
  END LOOP;
 END LOOP;
END;
$retire_legacy_money$;
REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;

DO $cv005_early_owner_release$
DECLARE role_name name;
BEGIN
 FOR role_name IN SELECT DISTINCT r.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
 WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner'
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',role_name); END LOOP;
END;
$cv005_early_owner_release$;

COMMIT;
