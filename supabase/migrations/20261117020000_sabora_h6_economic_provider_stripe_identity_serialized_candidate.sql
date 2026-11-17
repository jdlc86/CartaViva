-- S42 / AUD-S42-F01, F02: serialize signed Stripe ingress with H6 and
-- economic Issue61 durable identities. Repair 102 append-only; do not
-- rewrite previously committed SQL migrations or the shared event ledger.
-- One sealed provider-only SECURITY DEFINER wrapper. No stored secrets.
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
DECLARE
 v_round sabora.order_rounds%ROWTYPE;
 v_payment sabora.payment_attempts%ROWTYPE;
 v_economic sabora.economic_settlement_intents_candidate%ROWTYPE;
 v_refund sabora.refund_attempts%ROWTYPE;
BEGIN
 IF p_event_type LIKE 'payment_intent.%' THEN
  -- Stripe's signed metadata is mandatory for routing both payment ledgers.
  -- Missing metadata cannot create an immutable ignored receipt that masks
  -- subsequent retries while provider_intent_id is being persisted.
  IF p_sabora_order_id IS NULL THEN
   RAISE EXCEPTION 'h6_provider_order_identity_missing' USING errcode='23514';
  END IF;

  -- Same lock order as record_h6_authorization_outcome_candidate:
  -- order_rounds then payment_attempts. READ COMMITTED never mixes an old
  -- PL/pgSQL FOUND flag with a newer EXISTS statement snapshot.
  SELECT * INTO v_round FROM sabora.order_rounds
   WHERE order_id=p_sabora_order_id FOR UPDATE;
  IF v_round.id IS NOT NULL THEN
   SELECT * INTO v_payment FROM sabora.payment_attempts
    WHERE round_id=v_round.id FOR UPDATE;
   IF v_payment.id IS NULL THEN
    -- Pay-at-end, free and converted-to-external orders are not an H6
    -- Stripe attempt. Do not poison the shared event ledger.
    RAISE EXCEPTION 'h6_provider_intent_order_conflict' USING errcode='23514';
   END IF;
   IF v_payment.provider_intent_id IS NOT NULL AND
     v_payment.provider_intent_id IS DISTINCT FROM p_provider_object_id THEN
    RAISE EXCEPTION 'h6_provider_intent_order_conflict' USING errcode='23514';
   END IF;
   IF p_provider_amount_cents IS DISTINCT FROM v_payment.amount_cents
      OR p_provider_currency IS DISTINCT FROM v_payment.currency THEN
    RAISE EXCEPTION 'h6_provider_money_mismatch' USING errcode='23514';
   END IF;
   IF v_payment.provider_intent_id IS NULL THEN
    IF v_payment.state='authorization_unknown' AND
       p_event_type='payment_intent.amount_capturable_updated' AND
       p_capture_before>clock_timestamp() AND
       p_provider_charge_id ~ '^ch_[A-Za-z0-9]{8,128}$' THEN
     -- Stripe already supplied unambiguous signed authorization evidence.
     -- Reconcile through the existing sealed function. It writes the PI
     -- durably and advances the round, while the delegated event becomes
     -- stale/idempotent; do not invent capture or dispatch.
     PERFORM sabora.record_h6_authorization_outcome_candidate(
      p_sabora_order_id,'authorized',p_provider_object_id,p_capture_before,NULL);
    ELSIF v_payment.state IN
      ('authorization_requested','authorization_unknown','requires_action') THEN
     -- A pending request cannot be linked by arbitrary PI metadata alone.
     -- Leave the event UNRECORDED for retry and manual reconciliation.
     RAISE EXCEPTION 'h6_provider_identity_not_committed' USING errcode='P0001';
    ELSE
     RAISE EXCEPTION 'h6_provider_intent_order_conflict' USING errcode='23514';
    END IF;
   END IF;
  ELSE
   -- Economic Issue61 metadata holds the settlement intent UUID, not the
   -- H6 order UUID. Lock the exact durable intent before delegating; no
   -- provider object may replace the already bound PaymentIntent.
   SELECT * INTO v_economic FROM sabora.economic_settlement_intents_candidate
    WHERE id=p_sabora_order_id FOR UPDATE;
   IF v_economic.id IS NULL THEN
    RAISE EXCEPTION 'h6_provider_untracked_payment_intent' USING errcode='P0001';
   END IF;
   IF v_economic.channel<>'stripe' OR
      (v_economic.provider_intent_id IS NOT NULL AND
       v_economic.provider_intent_id IS DISTINCT FROM p_provider_object_id) THEN
    RAISE EXCEPTION 'h6_provider_intent_order_conflict' USING errcode='23514';
   END IF;
   -- Required for ALL payment_intent.* types, not only capturable/succeeded:
   -- failed/canceled events must not release allocations on absent cents/EUR.
   IF p_provider_amount_cents IS DISTINCT FROM v_economic.amount_cents
      OR p_provider_currency IS DISTINCT FROM 'eur' THEN
    RAISE EXCEPTION 'economic_provider_money_mismatch' USING errcode='23514';
   END IF;
   IF v_economic.provider_intent_id IS NULL THEN
    IF v_economic.state NOT IN
     ('stripe_authorization_requested','stripe_authorization_unknown',
      'stripe_requires_action') THEN
     RAISE EXCEPTION 'h6_provider_intent_order_conflict' USING errcode='23514';
    END IF;
    IF p_event_type<>'payment_intent.amount_capturable_updated' OR
       p_capture_before<=clock_timestamp() OR p_capture_before IS NULL THEN
     -- Only verified capturable evidence may establish an unbound economic
     -- PI. Other ambiguous Stripe results require point reconciliation.
     RAISE EXCEPTION 'h6_provider_identity_not_committed' USING errcode='P0001';
    END IF;
    -- The legacy economic handler may now assign the PI inside this SAME
    -- transaction; our FOR UPDATE lock prevents concurrent identity races.
   END IF;
  END IF;
 ELSIF p_event_type='refund.updated' THEN
  SELECT * INTO v_refund FROM sabora.refund_attempts WHERE id=p_refund_attempt_id;
  IF v_refund.id IS NOT NULL THEN
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
