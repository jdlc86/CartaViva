-- S42 / AUD-S42-001: durable H6 provider identity against signed Stripe
-- metadata and retryable receipt-free handling before provider_intent_id
-- is persisted. Never edit the already published 101-migration history.
-- This migration replaces only the sealed provider webhook wrapper and does
-- not grant runtime access to historical unverified functions.
BEGIN;

DO $cv005_owner_scope$
DECLARE ri record;
BEGIN
 FOR ri IN SELECT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,
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
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;

CREATE OR REPLACE FUNCTION sabora.ingest_stripe_webhook_verified_candidate(
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
  IF FOUND THEN
   -- Never trust Stripe metadata from an expanded Charge as an alias for a
   -- different durable H6 order. Compare against the persisted round owner.
   IF (p_event_type='payment_intent.amount_capturable_updated' AND
       p_sabora_order_id IS NULL)
      OR (p_sabora_order_id IS NOT NULL AND p_sabora_order_id IS DISTINCT FROM
       (SELECT r.order_id FROM sabora.order_rounds r WHERE r.id=v_payment.round_id))
   THEN RAISE EXCEPTION 'h6_provider_order_mismatch' USING errcode='23514'; END IF;
  ELSIF p_sabora_order_id IS NOT NULL AND EXISTS(
   SELECT 1 FROM sabora.payment_attempts p
   JOIN sabora.order_rounds r ON r.id=p.round_id
   WHERE r.order_id=p_sabora_order_id
    AND p.state IN('authorization_requested','authorization_unknown','requires_action')
    AND (p.provider_intent_id IS NULL OR
         p.provider_intent_id IS DISTINCT FROM p_provider_object_id)
  ) THEN
   -- An authentic Stripe event may race the write of provider_intent_id.
   -- Do not insert an 'ignored' immutable receipt that will mask all retries.
   -- The transaction rolls back and the HTTP boundary replies 503.
   RAISE EXCEPTION 'h6_provider_identity_not_committed' USING errcode='P0001';
  END IF;
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

ALTER FUNCTION sabora.ingest_stripe_webhook_verified_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text,uuid,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.ingest_stripe_webhook_verified_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text,uuid,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
 sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.ingest_stripe_webhook_verified_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text,uuid,bigint,text)
 TO sabora_h6_provider_runtime;
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
