-- S41-rv02 / Issue #61: close the historical pay-as-ordered Stripe
-- evidence bypass without rewriting any of the first 100 migrations.
-- Provider runtime can only invoke sealed, money-checked entrypoints.
BEGIN;

DO $cv005_owner_scope$
DECLARE ri record;
BEGIN
 FOR ri IN SELECT DISTINCT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,
   r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication
 FROM pg_catalog.pg_roles r
 WHERE r.rolname='sabora_h6_fn_owner' AND r.rolname<>current_user::text
 LOOP
  IF ri.rolcanlogin OR ri.rolinherit OR ri.rolsuper OR ri.rolbypassrls
    OR ri.rolcreaterole OR ri.rolcreatedb OR ri.rolreplication
  THEN RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner' USING errcode='0P000'; END IF;
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',ri.rolname);
 END LOOP;
END;
$cv005_owner_scope$;

GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE,INHERIT TRUE;

-- Append expected money from the locked durable payment attempt to the
-- historical capture-request result. Never read H6 tables from the LOGIN role.
CREATE FUNCTION sabora.request_h6_capture_evidence_candidate(
 p_order_id uuid,p_now timestamptz)
RETURNS TABLE(payment_attempt_id uuid,provider_intent_id text,capture_key text,
 dispatch_id uuid,dispatch_key text,action text,repeated boolean,amount_cents bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $request_evidence$
BEGIN
 RETURN QUERY SELECT q.payment_attempt_id,q.provider_intent_id,q.capture_key,
  q.dispatch_id,q.dispatch_key,q.action,q.repeated,p.amount_cents
 FROM sabora.request_h6_capture_dispatch_candidate(p_order_id,p_now) q
 LEFT JOIN sabora.payment_attempts p ON p.id=q.payment_attempt_id;
END;
$request_evidence$;

-- One-shot, provider-only read, never an additional charge or capture.
-- Critical for point reconciliation after an uncertain Stripe response.
CREATE FUNCTION sabora.read_h6_provider_evidence_candidate(p_order_id uuid)
RETURNS TABLE(amount_cents bigint,provider_intent_id text,provider_charge_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $read_evidence$
BEGIN
 RETURN QUERY SELECT p.amount_cents,p.provider_intent_id,p.provider_charge_id
 FROM sabora.order_rounds r
 JOIN sabora.payment_attempts p ON p.round_id=r.id
 WHERE r.order_id=p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'payment_attempt_not_found' USING errcode='P0002'; END IF;
END;
$read_evidence$;

-- Reconcile amount, EUR and the same PaymentIntent before the original
-- transaction may mark captured or dispatch to the kitchen.
CREATE FUNCTION sabora.record_h6_capture_verified_candidate(
 p_order_id uuid,p_outcome text,p_provider_charge_id text,p_error_code text,
 p_provider_intent_id text,p_provider_amount_cents bigint,p_provider_currency text)
RETURNS TABLE(payment_state text,round_state text,dispatch_id uuid,
 dispatch_state text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $capture_evidence$
DECLARE v_payment sabora.payment_attempts%ROWTYPE;
BEGIN
 SELECT p.* INTO v_payment FROM sabora.payment_attempts p
 JOIN sabora.order_rounds r ON r.id=p.round_id
 WHERE r.order_id=p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'payment_attempt_not_found' USING errcode='P0002'; END IF;
 IF p_outcome='captured' AND (
  p_provider_amount_cents IS DISTINCT FROM v_payment.amount_cents
  OR p_provider_currency IS DISTINCT FROM v_payment.currency
  OR p_provider_intent_id IS DISTINCT FROM v_payment.provider_intent_id
  OR (v_payment.state='captured' AND p_provider_charge_id IS DISTINCT FROM v_payment.provider_charge_id))
 THEN RAISE EXCEPTION 'h6_provider_money_mismatch' USING errcode='23514'; END IF;
 RETURN QUERY SELECT q.payment_state,q.round_state,q.dispatch_id,
  q.dispatch_state,q.repeated
 FROM sabora.record_h6_capture_outcome_candidate(
  p_order_id,p_outcome,p_provider_charge_id,p_error_code) q;
END;
$capture_evidence$;

-- Preserve original recipient and charge for refunds, including exact
-- replays; failure/unknown never claims money returned.
CREATE FUNCTION sabora.record_h6_refund_verified_candidate(
 p_refund_attempt_id uuid,p_outcome text,p_provider_refund_id text,
 p_provider_amount_cents bigint,p_provider_charge_id text,p_provider_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $refund_evidence$
DECLARE v_refund sabora.refund_attempts%ROWTYPE;
 v_payment sabora.payment_attempts%ROWTYPE;
BEGIN
 SELECT * INTO v_refund FROM sabora.refund_attempts WHERE id=p_refund_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found' USING errcode='P0002'; END IF;
 SELECT * INTO v_payment FROM sabora.payment_attempts
 WHERE id=v_refund.payment_attempt_id;
 IF p_outcome='succeeded' AND (
  p_provider_amount_cents IS DISTINCT FROM v_refund.amount_cents
  OR p_provider_charge_id IS DISTINCT FROM v_payment.provider_charge_id
  OR p_provider_currency IS DISTINCT FROM v_payment.currency
  OR (v_refund.state='succeeded'
   AND p_provider_refund_id IS DISTINCT FROM v_refund.provider_refund_id))
 THEN RAISE EXCEPTION 'h6_refund_money_mismatch' USING errcode='23514'; END IF;
 RETURN sabora.record_h6_refund_outcome_candidate(
  p_refund_attempt_id,p_outcome,p_provider_refund_id);
END;
$refund_evidence$;

-- Capture compensation is a monetary state transition too. Match the exact
-- provider receipt to the sealed attempt before creating any refund due.
CREATE FUNCTION sabora.record_h6_capture_compensation_verified_candidate(
 p_order_id uuid,p_provider_charge_id text,p_error_code text,
 p_provider_intent_id text,p_provider_amount_cents bigint,p_provider_currency text)
RETURNS TABLE(payment_state text,round_state text,dispatch_id uuid,
 dispatch_state text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $compensation_evidence$
DECLARE v_payment sabora.payment_attempts%ROWTYPE;
BEGIN
 SELECT p.* INTO v_payment FROM sabora.payment_attempts p
 JOIN sabora.order_rounds r ON r.id=p.round_id WHERE r.order_id=p_order_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'payment_attempt_not_found' USING errcode='P0002'; END IF;
 IF p_provider_amount_cents IS DISTINCT FROM v_payment.amount_cents
  OR p_provider_currency IS DISTINCT FROM v_payment.currency
  OR p_provider_intent_id IS DISTINCT FROM v_payment.provider_intent_id
  OR (v_payment.state='refund_required'
   AND p_provider_charge_id IS DISTINCT FROM v_payment.provider_charge_id)
 THEN RAISE EXCEPTION 'h6_provider_money_mismatch' USING errcode='23514'; END IF;
 RETURN QUERY SELECT q.payment_state,q.round_state,q.dispatch_id,
  q.dispatch_state,q.repeated
 FROM sabora.record_h6_capture_compensation_candidate(
  p_order_id,p_provider_charge_id,p_error_code) q;
END;
$compensation_evidence$;

-- Single server ingress for the *same* signed Stripe event. Inspect which
-- ledger owns it before delegating to the already sealed H6/Issue61 handler.
-- Do not create a second webhook receipt or permit unsigned browser calls.
CREATE FUNCTION sabora.ingest_stripe_webhook_verified_candidate(
 p_event_id text,p_event_type text,p_provider_object_id text,
 p_provider_created_at timestamptz,p_payload_sha256 bytea,
 p_provider_charge_id text DEFAULT NULL,p_capture_before timestamptz DEFAULT NULL,
 p_refund_attempt_id uuid DEFAULT NULL,p_refund_status text DEFAULT NULL,
 p_sabora_order_id uuid DEFAULT NULL,p_provider_amount_cents bigint DEFAULT NULL,
 p_provider_currency text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $webhook_evidence$
DECLARE v_payment sabora.payment_attempts%ROWTYPE;
 v_refund sabora.refund_attempts%ROWTYPE;
BEGIN
 IF p_event_type LIKE 'payment_intent.%' THEN
  SELECT * INTO v_payment FROM sabora.payment_attempts
   WHERE provider_intent_id=p_provider_object_id;
  IF FOUND AND p_event_type IN('payment_intent.amount_capturable_updated',
    'payment_intent.succeeded') AND (
     p_provider_amount_cents IS DISTINCT FROM v_payment.amount_cents
     OR p_provider_currency IS DISTINCT FROM v_payment.currency
     OR (p_event_type='payment_intent.succeeded'
      AND v_payment.state='captured'
      AND p_provider_charge_id IS DISTINCT FROM v_payment.provider_charge_id))
  THEN RAISE EXCEPTION 'h6_provider_money_mismatch' USING errcode='23514'; END IF;
 ELSIF p_event_type='refund.updated' THEN
  SELECT * INTO v_refund FROM sabora.refund_attempts WHERE id=p_refund_attempt_id;
  IF FOUND THEN
   SELECT * INTO v_payment FROM sabora.payment_attempts WHERE id=v_refund.payment_attempt_id;
   IF p_provider_amount_cents IS DISTINCT FROM v_refund.amount_cents
    OR p_provider_currency IS DISTINCT FROM v_payment.currency
    OR p_provider_charge_id IS DISTINCT FROM v_payment.provider_charge_id
    OR (v_refund.state='succeeded'
     AND p_provider_object_id IS DISTINCT FROM v_refund.provider_refund_id)
   THEN RAISE EXCEPTION 'h6_refund_money_mismatch' USING errcode='23514'; END IF;
  END IF;
 END IF;
 RETURN sabora.ingest_stripe_webhook_issue61_candidate(
  p_event_id,p_event_type,p_provider_object_id,p_provider_created_at,
  p_payload_sha256,p_provider_charge_id,p_capture_before,p_refund_attempt_id,
  p_refund_status,p_sabora_order_id,p_provider_amount_cents,p_provider_currency);
END;
$webhook_evidence$;

DO $owner_acl$
DECLARE f regprocedure;
BEGIN
 FOREACH f IN ARRAY ARRAY[
  'sabora.request_h6_capture_evidence_candidate(uuid,timestamptz)'::regprocedure,
  'sabora.read_h6_provider_evidence_candidate(uuid)'::regprocedure,
  'sabora.record_h6_capture_verified_candidate(uuid,text,text,text,text,bigint,text)'::regprocedure,
  'sabora.record_h6_capture_compensation_verified_candidate(uuid,text,text,text,bigint,text)'::regprocedure,
  'sabora.record_h6_refund_verified_candidate(uuid,text,text,bigint,text,text)'::regprocedure,
  'sabora.ingest_stripe_webhook_verified_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text,uuid,bigint,text)'::regprocedure
 ] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO sabora_h6_fn_owner',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_operations_runtime',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO sabora_h6_provider_runtime',f);
 END LOOP;
END;
$owner_acl$;

-- No runtime path may invoke the pre-evidence recorders or webhook ingress.
-- They remain callable only by the sealed NOLOGIN function owner.
REVOKE ALL ON FUNCTION
 sabora.record_h6_capture_outcome_candidate(uuid,text,text,text),
 sabora.record_h6_capture_compensation_candidate(uuid,text,text),
 sabora.record_h6_refund_outcome_candidate(uuid,text,text),
 sabora.ingest_stripe_webhook_issue61_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text,uuid,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
 sabora_h6_operations_runtime,sabora_h6_provider_runtime;

-- Retire the unaugmented request; the wrapper supplies the immutable amount.
REVOKE ALL ON FUNCTION
 sabora.request_h6_capture_dispatch_candidate(uuid,timestamptz)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
 sabora_h6_operations_runtime,sabora_h6_provider_runtime;

REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;
REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
DO $cv005_owner_release$
DECLARE ri record;
BEGIN
 FOR ri IN SELECT r.rolname
 FROM pg_catalog.pg_auth_members m
 JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
 WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
  AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
  AND r.rolname='sabora_h6_fn_owner'
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',ri.rolname); END LOOP;
END;
$cv005_owner_release$;
COMMIT;
