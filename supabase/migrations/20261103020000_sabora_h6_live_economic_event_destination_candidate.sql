-- Economic F20 transfer safety: emitted payment, capture, incident and refund
-- events follow the current account operational destination after an A->D transfer.
-- Preserve original signed/function roles and FORCE RLS; no direct runtime grants.
-- Reads are scoped by the ledger's account_id; never accept a table from the caller.
-- This candidate fixes post-commit delivery scope. Interleaved A->D/provider races
-- require separate acceptance; no Stripe network calls are made by this migration.
BEGIN;
-- Repair live table events for record_h6_authorization_outcome_candidate: 1 emission(s).
CREATE OR REPLACE FUNCTION sabora.record_h6_authorization_outcome_candidate(
  p_order_id uuid,p_outcome text,p_provider_intent_id text,
  p_capture_before timestamptz,p_error_code text DEFAULT NULL
)
RETURNS TABLE(payment_attempt_id uuid,payment_state text,round_state text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $authorization_outcome$
DECLARE v_live_binding record; v_round sabora.order_rounds%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;v_repeated boolean:=false;
 v_next text;v_round_next text;
BEGIN
  IF p_order_id IS NULL OR p_outcome NOT IN ('authorized','requires_action','failed','unknown')
    OR (p_outcome IN ('authorized','requires_action') AND p_provider_intent_id !~ '^pi_[A-Za-z0-9]{8,128}$')
    OR (p_capture_before IS NOT NULL AND p_capture_before<=clock_timestamp())
    OR (p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_]{1,80}$')
  THEN RAISE EXCEPTION 'invalid_authorization_outcome' USING errcode='22023'; END IF;
  SELECT * INTO v_round FROM sabora.order_rounds WHERE order_id=p_order_id FOR UPDATE;
  SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
  SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT table_id,session_id,visit_key INTO v_live_binding
 FROM sabora.customer_account_operational_bindings WHERE account_id=v_account.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'h6_economic_binding_missing' USING errcode='42501'; END IF;
  SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
   INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
   FROM sabora.orders o WHERE o.id=p_order_id;
  IF NOT FOUND OR v_payment.id IS NULL THEN RAISE EXCEPTION 'payment_attempt_not_found' USING errcode='P0002'; END IF;
  v_next:=CASE p_outcome WHEN 'authorized' THEN 'authorized' WHEN 'requires_action' THEN 'requires_action'
    WHEN 'failed' THEN 'authorization_failed' ELSE 'authorization_unknown' END;
  v_round_next:=CASE p_outcome WHEN 'authorized' THEN 'grouping' WHEN 'requires_action' THEN 'awaiting_authorization'
    WHEN 'failed' THEN 'payment_failed' ELSE 'payment_unknown' END;
  IF v_payment.state=v_next THEN v_repeated:=true;
  ELSIF v_payment.state NOT IN ('authorization_requested','authorization_unknown','requires_action') THEN
    RAISE EXCEPTION 'invalid_authorization_transition' USING errcode='23514';
  ELSE
    UPDATE sabora.payment_attempts SET state=v_next,
      provider_intent_id=COALESCE(p_provider_intent_id,provider_intent_id),
      capture_before=CASE WHEN p_outcome='authorized' THEN p_capture_before ELSE capture_before END,
      provider_error_code=p_error_code,updated_at=clock_timestamp()
     WHERE id=v_payment.id RETURNING * INTO v_payment;
    UPDATE sabora.order_rounds SET state=v_round_next,updated_at=clock_timestamp()
     WHERE id=v_round.id RETURNING * INTO v_round;
    PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,v_live_binding.visit_key,
      v_account.customer_id,v_account.id,NULL,'customer','sabora.payment.'||v_next,
      v_payment.id,2,jsonb_build_object('orderId',p_order_id,'paymentAttemptId',v_payment.id,'state',v_next));
  END IF;
  RETURN QUERY SELECT v_payment.id,v_payment.state,v_round.state,v_repeated;
END;
$authorization_outcome$;
ALTER FUNCTION sabora.record_h6_authorization_outcome_candidate(uuid,text,text,timestamptz,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.record_h6_authorization_outcome_candidate(uuid,text,text,timestamptz,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime;
GRANT USAGE ON SCHEMA sabora TO sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.record_h6_authorization_outcome_candidate(uuid,text,text,timestamptz,text)
 TO sabora_h6_provider_runtime;

-- Repair live table events for request_h6_capture_dispatch_candidate: 2 emission(s).
CREATE OR REPLACE FUNCTION sabora.request_h6_capture_dispatch_candidate(p_order_id uuid,p_now timestamptz)
RETURNS TABLE(payment_attempt_id uuid,provider_intent_id text,capture_key text,
 dispatch_id uuid,dispatch_key text,action text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $request_capture$
DECLARE v_live_binding record; v_round sabora.order_rounds%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_dispatch sabora.kitchen_dispatches%ROWTYPE;v_account sabora.customer_accounts%ROWTYPE;
 v_order sabora.orders%ROWTYPE;v_repeated boolean:=false;
BEGIN
  IF p_order_id IS NULL OR p_now IS NULL THEN RAISE EXCEPTION 'invalid_capture_request' USING errcode='22023'; END IF;
  SELECT * INTO v_round FROM sabora.order_rounds WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round_not_found' USING errcode='P0002'; END IF;
  SELECT * INTO v_dispatch FROM sabora.kitchen_dispatches WHERE round_id=v_round.id FOR UPDATE;
  SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT table_id,session_id,visit_key INTO v_live_binding
 FROM sabora.customer_account_operational_bindings WHERE account_id=v_account.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'h6_economic_binding_missing' USING errcode='42501'; END IF;
  SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
   INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
   FROM sabora.orders o WHERE o.id=p_order_id;
  IF p_now<v_round.grouping_deadline THEN RAISE EXCEPTION 'grouping_window_open' USING errcode='23514'; END IF;
  IF v_dispatch.state IN ('requested','acknowledged') THEN
    RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text,v_dispatch.id,v_dispatch.dispatch_key,'dispatch',true;RETURN;
  END IF;
  IF v_round.amount_cents=0 OR v_round.payment_mode='pay_at_end' THEN
    UPDATE sabora.kitchen_dispatches SET state='requested',requested_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_dispatch.id RETURNING * INTO v_dispatch;
    UPDATE sabora.order_rounds SET state='dispatch_requested',updated_at=clock_timestamp()
     WHERE id=v_round.id RETURNING * INTO v_round;
    PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,NULL,NULL,NULL,
      'kitchen','kitchen','sabora.kitchen.dispatch_requested',v_dispatch.id,1,
      jsonb_build_object('orderId',p_order_id,'roundId',v_round.id,
       'dispatchId',v_dispatch.id,'revisionNumber',1));
    RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text,v_dispatch.id,v_dispatch.dispatch_key,'dispatch',false;RETURN;
  END IF;
  SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
  IF v_payment.state IN ('capture_requested','capture_unknown') THEN v_repeated:=true;
  ELSIF v_payment.state<>'authorized' THEN RAISE EXCEPTION 'payment_not_capturable' USING errcode='23514';
  ELSE
    IF v_payment.capture_before IS NULL OR v_payment.capture_before<=p_now THEN
      RAISE EXCEPTION 'authorization_expired' USING errcode='23514';
    END IF;
    UPDATE sabora.payment_attempts SET state='capture_requested',updated_at=clock_timestamp()
     WHERE id=v_payment.id RETURNING * INTO v_payment;
    UPDATE sabora.order_rounds SET state='capture_requested',updated_at=clock_timestamp()
     WHERE id=v_round.id;
    PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,v_live_binding.visit_key,
      v_account.customer_id,v_account.id,NULL,'customer','sabora.payment.capture_requested',
      v_payment.id,3,jsonb_build_object('orderId',p_order_id,'paymentAttemptId',v_payment.id));
  END IF;
  RETURN QUERY SELECT v_payment.id,v_payment.provider_intent_id,v_payment.capture_key,
    v_dispatch.id,v_dispatch.dispatch_key,'capture',v_repeated;
END;
$request_capture$;
ALTER FUNCTION sabora.request_h6_capture_dispatch_candidate(uuid,timestamptz) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.request_h6_capture_dispatch_candidate(uuid,timestamptz)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.request_h6_capture_dispatch_candidate(uuid,timestamptz)
 TO sabora_h6_provider_runtime;

-- Repair live table events for record_h6_capture_outcome_candidate: 2 emission(s).
CREATE OR REPLACE FUNCTION sabora.record_h6_capture_outcome_candidate(
 p_order_id uuid,p_outcome text,p_provider_charge_id text DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS TABLE(payment_state text,round_state text,dispatch_id uuid,dispatch_state text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $capture_outcome$
DECLARE v_live_binding record; v_round sabora.order_rounds%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_dispatch sabora.kitchen_dispatches%ROWTYPE;v_account sabora.customer_accounts%ROWTYPE;
 v_order sabora.orders%ROWTYPE;v_repeated boolean:=false;v_state text;
BEGIN
 IF p_outcome NOT IN ('captured','failed','unknown')
   OR (p_outcome='captured' AND p_provider_charge_id !~ '^ch_[A-Za-z0-9]{8,128}$')
   OR (p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_]{1,80}$')
 THEN RAISE EXCEPTION 'invalid_capture_outcome' USING errcode='22023'; END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE order_id=p_order_id FOR UPDATE;
 SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
 SELECT * INTO v_dispatch FROM sabora.kitchen_dispatches WHERE round_id=v_round.id FOR UPDATE;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT table_id,session_id,visit_key INTO v_live_binding
 FROM sabora.customer_account_operational_bindings WHERE account_id=v_account.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'h6_economic_binding_missing' USING errcode='42501'; END IF;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=p_order_id;
 v_state:=CASE p_outcome WHEN 'captured' THEN 'captured' WHEN 'failed' THEN 'capture_failed' ELSE 'capture_unknown' END;
 IF v_payment.state=v_state THEN v_repeated:=true;
 ELSIF v_payment.state NOT IN ('capture_requested','capture_unknown') THEN
   RAISE EXCEPTION 'invalid_capture_transition' USING errcode='23514';
 ELSE
   UPDATE sabora.payment_attempts SET state=v_state,
     provider_charge_id=COALESCE(p_provider_charge_id,provider_charge_id),
     provider_error_code=p_error_code,updated_at=clock_timestamp()
    WHERE id=v_payment.id RETURNING * INTO v_payment;
   IF p_outcome='captured' THEN
     UPDATE sabora.kitchen_dispatches SET state='requested',requested_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE id=v_dispatch.id RETURNING * INTO v_dispatch;
     UPDATE sabora.order_rounds SET state='dispatch_requested',updated_at=clock_timestamp()
      WHERE id=v_round.id RETURNING * INTO v_round;
     PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,NULL,NULL,NULL,
       'kitchen','kitchen','sabora.kitchen.dispatch_requested',v_dispatch.id,1,
       jsonb_build_object('orderId',p_order_id,'roundId',v_round.id,
        'dispatchId',v_dispatch.id,'revisionNumber',1));
   ELSE
     UPDATE sabora.order_rounds SET state=CASE p_outcome WHEN 'unknown' THEN 'payment_unknown' ELSE 'payment_failed' END,
       updated_at=clock_timestamp() WHERE id=v_round.id RETURNING * INTO v_round;
   END IF;
   PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,v_live_binding.visit_key,
     v_account.customer_id,v_account.id,NULL,'customer','sabora.payment.'||v_state,
     v_payment.id,4,jsonb_build_object('orderId',p_order_id,'paymentAttemptId',v_payment.id,'state',v_state));
 END IF;
 RETURN QUERY SELECT v_payment.state,v_round.state,v_dispatch.id,v_dispatch.state,v_repeated;
END;
$capture_outcome$;
ALTER FUNCTION sabora.record_h6_capture_outcome_candidate(uuid,text,text,text) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.record_h6_capture_outcome_candidate(uuid,text,text,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.record_h6_capture_outcome_candidate(uuid,text,text,text)
 TO sabora_h6_provider_runtime;

-- Repair live table events for ingest_stripe_webhook_h6_candidate: 2 emission(s).
CREATE OR REPLACE FUNCTION sabora.ingest_stripe_webhook_h6_candidate(
 p_event_id text,p_event_type text,p_provider_object_id text,p_provider_created_at timestamptz,
 p_payload_sha256 bytea,p_provider_charge_id text DEFAULT NULL,p_capture_before timestamptz DEFAULT NULL,
 p_refund_attempt_id uuid DEFAULT NULL,p_refund_status text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $stripe_webhook$
DECLARE v_live_binding record; v_existing sabora.stripe_webhook_events%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_round sabora.order_rounds%ROWTYPE;v_dispatch sabora.kitchen_dispatches%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;v_outcome text:='ignored';
BEGIN
 IF p_event_id !~ '^evt_[A-Za-z0-9]{8,128}$' OR p_event_type NOT IN (
  'payment_intent.amount_capturable_updated','payment_intent.payment_failed',
  'payment_intent.succeeded','payment_intent.canceled','charge.refunded','refund.updated')
  OR p_provider_object_id !~ '^(pi|ch|re)_[A-Za-z0-9]{8,128}$'
  OR p_provider_created_at IS NULL OR p_payload_sha256 IS NULL OR octet_length(p_payload_sha256)<>32
 OR (p_event_type='payment_intent.amount_capturable_updated' AND p_capture_before IS NULL)
  OR (p_event_type='refund.updated' AND (p_refund_attempt_id IS NULL OR
      p_refund_status NOT IN ('pending','requires_action','succeeded','failed','canceled')
      OR p_provider_charge_id IS NULL OR p_provider_charge_id !~ '^ch_[A-Za-z0-9]{8,128}$'))
 THEN RAISE EXCEPTION 'invalid_stripe_webhook' USING errcode='22023'; END IF;
 SELECT * INTO v_existing FROM sabora.stripe_webhook_events WHERE event_id=p_event_id;
 IF FOUND THEN
  IF v_existing.payload_sha256<>p_payload_sha256 OR v_existing.event_type<>p_event_type
  THEN RAISE EXCEPTION 'stripe_event_identity_conflict' USING errcode='23505'; END IF;
  RETURN jsonb_build_object('eventId',p_event_id,'outcome',v_existing.outcome,'repeated',true);
 END IF;
 INSERT INTO sabora.stripe_webhook_events(event_id,event_type,provider_object_id,provider_created_at,payload_sha256)
 VALUES(p_event_id,p_event_type,p_provider_object_id,p_provider_created_at,p_payload_sha256);

 SELECT * INTO v_payment FROM sabora.payment_attempts p
  WHERE p.provider_intent_id=p_provider_object_id FOR UPDATE;
 IF FOUND THEN
  SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_payment.round_id FOR UPDATE;
  SELECT * INTO v_dispatch FROM sabora.kitchen_dispatches WHERE round_id=v_round.id FOR UPDATE;
  SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT table_id,session_id,visit_key INTO v_live_binding
 FROM sabora.customer_account_operational_bindings WHERE account_id=v_account.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'h6_economic_binding_missing' USING errcode='42501'; END IF;
  SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
   INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
   FROM sabora.orders o WHERE o.id=v_round.order_id;
  IF p_event_type='payment_intent.amount_capturable_updated'
    AND v_payment.state IN ('authorization_requested','authorization_unknown','requires_action') THEN
    UPDATE sabora.payment_attempts SET state=CASE WHEN p_capture_before>clock_timestamp()
      THEN 'authorized' ELSE 'authorization_failed' END,capture_before=p_capture_before,
      provider_error_code=CASE WHEN p_capture_before<=clock_timestamp() THEN 'authorization_expired' ELSE NULL END,
      updated_at=clock_timestamp() WHERE id=v_payment.id;
    UPDATE sabora.order_rounds SET state=CASE WHEN p_capture_before>clock_timestamp()
      THEN 'grouping' ELSE 'payment_failed' END,updated_at=clock_timestamp() WHERE id=v_round.id;
    v_outcome:='applied';
  ELSIF p_event_type='payment_intent.succeeded'
    AND v_payment.state IN ('capture_requested','capture_unknown') THEN
    UPDATE sabora.payment_attempts SET state='captured',provider_charge_id=COALESCE(p_provider_charge_id,provider_charge_id),
      updated_at=clock_timestamp() WHERE id=v_payment.id;
    UPDATE sabora.kitchen_dispatches SET state='requested',requested_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE id=v_dispatch.id;
    UPDATE sabora.order_rounds SET state='dispatch_requested',updated_at=clock_timestamp() WHERE id=v_round.id;
    PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,NULL,NULL,NULL,
      'kitchen','kitchen','sabora.kitchen.dispatch_requested',v_dispatch.id,1,
      jsonb_build_object('orderId',v_order.id,'roundId',v_round.id,
       'dispatchId',v_dispatch.id,'revisionNumber',1));
    v_outcome:='applied';
  ELSIF p_event_type='payment_intent.payment_failed'
    AND v_payment.state IN ('authorization_requested','authorization_unknown','requires_action','capture_requested','capture_unknown') THEN
    UPDATE sabora.payment_attempts SET state=CASE WHEN v_payment.state LIKE 'capture_%' THEN 'capture_failed' ELSE 'authorization_failed' END,
      updated_at=clock_timestamp() WHERE id=v_payment.id;
    UPDATE sabora.order_rounds SET state='payment_failed',updated_at=clock_timestamp() WHERE id=v_round.id;
    v_outcome:='applied';
  ELSIF p_event_type='payment_intent.canceled'
    AND v_payment.state NOT IN ('captured','released') THEN
    UPDATE sabora.payment_attempts SET state='released',updated_at=clock_timestamp() WHERE id=v_payment.id;
    UPDATE sabora.order_rounds SET state='payment_failed',updated_at=clock_timestamp() WHERE id=v_round.id;
    v_outcome:='applied';
  ELSE v_outcome:='stale'; END IF;
  IF v_outcome='applied' THEN
   PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,v_live_binding.visit_key,
    v_account.customer_id,v_account.id,NULL,'customer','sabora.stripe.webhook_applied',v_payment.id,5,
    jsonb_build_object('orderId',v_order.id,'paymentAttemptId',v_payment.id,'eventType',p_event_type));
  END IF;
 END IF;
 IF v_payment.id IS NULL AND p_event_type='refund.updated' THEN
  -- Only the original captured charge may settle this refund attempt.
  IF NOT EXISTS(SELECT 1 FROM sabora.refund_attempts r
    JOIN sabora.payment_attempts p ON p.id=r.payment_attempt_id
    WHERE r.id=p_refund_attempt_id AND p.provider_charge_id=p_provider_charge_id
      AND (r.provider_refund_id IS NULL OR r.provider_refund_id=p_provider_object_id)) THEN
   v_outcome:='ignored';
  ELSIF p_refund_status IN ('succeeded','failed') THEN
   PERFORM sabora.record_h6_refund_outcome_candidate(p_refund_attempt_id,p_refund_status,
    CASE WHEN p_refund_status='succeeded' THEN p_provider_object_id ELSE NULL END);
   v_outcome:='applied';
  ELSE v_outcome:='stale'; END IF;
 END IF;
 UPDATE sabora.stripe_webhook_events SET processed_at=clock_timestamp(),outcome=v_outcome WHERE event_id=p_event_id;
 RETURN jsonb_build_object('eventId',p_event_id,'outcome',v_outcome,'repeated',false);
END;
$stripe_webhook$;
ALTER FUNCTION sabora.ingest_stripe_webhook_h6_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.ingest_stripe_webhook_h6_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.ingest_stripe_webhook_h6_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text)
 TO sabora_h6_provider_runtime;

-- Repair live table events for report_h6_incident_authorized_candidate: 3 emission(s).
CREATE OR REPLACE FUNCTION sabora.report_h6_incident_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_round_id uuid,p_order_line_id uuid,p_origin text,p_reason text,p_affected_cents bigint,
 p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $report_incident$
DECLARE v_live_binding record; v_role text;v_round sabora.order_rounds%ROWTYPE;v_account sabora.customer_accounts%ROWTYPE;
 v_order sabora.orders%ROWTYPE;v_requires boolean;v_refunds_approval boolean;v_incident sabora.incident_cases%ROWTYPE;
 v_result jsonb;v_existing record;v_fingerprint bytea;v_state text;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'report_incident',p_round_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF p_origin NOT IN ('kitchen','waiter_customer','waiter_restaurant') OR p_reason IS NULL
   OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_affected_cents<0
   OR (p_origin='kitchen' AND v_role NOT IN ('kitchen','admin'))
   OR (p_origin LIKE 'waiter_%' AND v_role NOT IN ('waiter','admin'))
 THEN RAISE EXCEPTION 'invalid_incident_request' USING errcode='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_actor_user_id::text||':'||p_correlation_id,0));
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to(p_round_id::text||':'||coalesce(p_order_line_id::text,'')||':'
  ||p_origin||':'||btrim(p_reason)||':'||p_affected_cents::text,'UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests
  WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE id=p_round_id FOR UPDATE;
 IF NOT FOUND OR p_affected_cents>v_round.amount_cents THEN
  RAISE EXCEPTION 'invalid_incident_amount' USING errcode='23514'; END IF;
 IF p_order_line_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM sabora.order_lines l WHERE l.id=p_order_line_id AND l.order_id=v_round.order_id
 ) THEN RAISE EXCEPTION 'incident_line_scope_forbidden' USING errcode='42501'; END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 SELECT refunds_require_approval INTO v_refunds_approval FROM sabora.restaurant_settings WHERE singleton=true;
 IF p_origin='waiter_customer' AND NOT coalesce(v_refunds_approval,true) THEN
  RAISE EXCEPTION 'customer_cancellation_limits_not_configured' USING errcode='23514';
 END IF;
 v_requires:=p_origin IN ('kitchen','waiter_customer');
 INSERT INTO sabora.incident_cases(round_id,order_line_id,origin,actor_user_id,correlation_id,
   reason,affected_cents,state,requires_arbitration)
 VALUES(p_round_id,p_order_line_id,p_origin,p_actor_user_id,p_correlation_id,btrim(p_reason),
   p_affected_cents,CASE WHEN v_requires THEN 'awaiting_admin' ELSE 'refund_due' END,v_requires)
 RETURNING * INTO v_incident;
 IF NOT v_requires THEN
  v_state:=sabora.apply_h6_incident_economic_effect_candidate(v_incident.id);
  UPDATE sabora.incident_cases SET state=v_state,resolved_by=p_actor_user_id,
    resolution_reason='restaurant_origin_automatic_due',resolved_at=clock_timestamp()
   WHERE id=v_incident.id RETURNING * INTO v_incident;
 END IF;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT table_id,session_id,visit_key INTO v_live_binding
 FROM sabora.customer_account_operational_bindings WHERE account_id=v_account.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'h6_economic_binding_missing' USING errcode='42501'; END IF;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=v_round.order_id;
 PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,v_live_binding.visit_key,
   v_account.customer_id,v_account.id,NULL,'customer','sabora.incident.'||v_incident.state,
   v_incident.id,1,jsonb_build_object('incidentId',v_incident.id,'orderId',v_order.id,
    'origin',v_incident.origin,'state',v_incident.state,'affectedCents',v_incident.affected_cents));
 IF v_incident.state='cash_refund_due' THEN
  PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,NULL,NULL,NULL,
   'waiter','waiter','sabora.incident.cash_refund_due',v_incident.id,2,
   jsonb_build_object('incidentId',v_incident.id,'orderId',v_order.id,'accountId',v_account.id,
    'amountCents',v_incident.cash_refund_cents));
 END IF;
 IF v_requires THEN
  PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,NULL,NULL,NULL,
   'admin','admin','sabora.incident.awaiting_admin',v_incident.id,1,
   jsonb_build_object('incidentId',v_incident.id,'orderId',v_order.id,'origin',v_incident.origin));
 END IF;
 v_result:=jsonb_build_object('incidentId',v_incident.id,'state',v_incident.state,
  'requiresArbitration',v_incident.requires_arbitration);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'report_incident',v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$report_incident$;
ALTER FUNCTION sabora.report_h6_incident_authorized_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.report_h6_incident_authorized_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.report_h6_incident_authorized_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;

-- Repair live table events for record_h6_refund_outcome_candidate: 1 emission(s).
CREATE OR REPLACE FUNCTION sabora.record_h6_refund_outcome_candidate(
 p_refund_attempt_id uuid,p_outcome text,p_provider_refund_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $refund_outcome$
DECLARE v_live_binding record; v_refund sabora.refund_attempts%ROWTYPE;v_incident sabora.incident_cases%ROWTYPE;
 v_round sabora.order_rounds%ROWTYPE;v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;
 v_next text;v_repeated boolean:=false;
BEGIN
 IF p_outcome NOT IN ('succeeded','failed','unknown') OR (p_outcome='succeeded'
   AND p_provider_refund_id !~ '^re_[A-Za-z0-9]{8,128}$') THEN
  RAISE EXCEPTION 'invalid_refund_outcome' USING errcode='22023'; END IF;
 SELECT * INTO v_refund FROM sabora.refund_attempts WHERE id=p_refund_attempt_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found' USING errcode='P0002'; END IF;
 v_next:=p_outcome;
 IF v_refund.state=v_next THEN v_repeated:=true;
 ELSIF v_refund.state NOT IN ('requested','unknown') THEN RAISE EXCEPTION 'invalid_refund_transition' USING errcode='23514';
 ELSE UPDATE sabora.refund_attempts SET state=v_next,provider_refund_id=COALESCE(p_provider_refund_id,provider_refund_id),
  updated_at=clock_timestamp() WHERE id=v_refund.id RETURNING * INTO v_refund; END IF;
 IF v_refund.incident_id IS NULL THEN
  SELECT r.* INTO v_round FROM sabora.order_rounds r WHERE r.id=(
   SELECT p.round_id FROM sabora.payment_attempts p WHERE p.id=v_refund.payment_attempt_id);
 ELSE
  SELECT * INTO v_incident FROM sabora.incident_cases WHERE id=v_refund.incident_id;
  SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_incident.round_id;
 END IF;
 IF p_outcome='succeeded' AND v_refund.incident_id IS NOT NULL THEN
  UPDATE sabora.incident_cases SET state='resolved' WHERE id=v_refund.incident_id;
 ELSIF p_outcome='succeeded' AND v_refund.incident_id IS NULL THEN
  UPDATE sabora.payment_attempts SET state='released',updated_at=clock_timestamp()
   WHERE id=v_refund.payment_attempt_id;
  UPDATE sabora.order_rounds SET state='cancelled',updated_at=clock_timestamp() WHERE id=v_round.id;
  UPDATE sabora.kitchen_dispatches SET state='failed',failure_code='compensated_refund',
   updated_at=clock_timestamp() WHERE round_id=v_round.id AND state='compensation_required';
 END IF;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT table_id,session_id,visit_key INTO v_live_binding
 FROM sabora.customer_account_operational_bindings WHERE account_id=v_account.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'h6_economic_binding_missing' USING errcode='42501'; END IF;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=v_round.order_id;
 PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,v_live_binding.visit_key,
  v_account.customer_id,v_account.id,NULL,'customer','sabora.refund.'||v_next,v_refund.id,2,
  jsonb_build_object('orderId',v_order.id,'refundAttemptId',v_refund.id,'state',v_next,
   'amountCents',v_refund.amount_cents));
 RETURN jsonb_build_object('refundAttemptId',v_refund.id,'state',v_next,'repeated',v_repeated);
END;
$refund_outcome$;
ALTER FUNCTION sabora.record_h6_refund_outcome_candidate(uuid,text,text) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.record_h6_refund_outcome_candidate(uuid,text,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.record_h6_refund_outcome_candidate(uuid,text,text)
 TO sabora_h6_provider_runtime;

-- Repair live table events for refund_h6_cash_authorized_candidate: 1 emission(s).
CREATE OR REPLACE FUNCTION sabora.refund_h6_cash_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_incident_id uuid,p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $refund_cash$
DECLARE v_live_binding record; v_role text;v_incident sabora.incident_cases%ROWTYPE;v_round sabora.order_rounds%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;v_existing record;
 v_fingerprint bytea;v_settlement sabora.cash_settlements%ROWTYPE;v_result jsonb;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'refund_cash',p_incident_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('waiter','admin','root') THEN RAISE EXCEPTION 'cash_refund_forbidden' USING errcode='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_actor_user_id::text||':'||p_correlation_id,0));
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to('refund_cash:'||p_incident_id::text,'UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests
  WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_incident FROM sabora.incident_cases WHERE id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found' USING errcode='P0002'; END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 IF v_incident.state<>'cash_refund_due' OR v_incident.cash_refund_cents<=0 THEN
  RAISE EXCEPTION 'cash_refund_not_due' USING errcode='23514'; END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_incident.round_id;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id FOR UPDATE;
 SELECT table_id,session_id,visit_key INTO v_live_binding
 FROM sabora.customer_account_operational_bindings WHERE account_id=v_account.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'h6_economic_binding_missing' USING errcode='42501'; END IF;
 INSERT INTO sabora.cash_settlements(account_id,actor_user_id,correlation_id,amount_cents,kind,incident_id)
  VALUES(v_account.id,p_actor_user_id,p_correlation_id,v_incident.cash_refund_cents,'refund',v_incident.id)
  RETURNING * INTO v_settlement;
 UPDATE sabora.incident_cases SET state='resolved' WHERE id=v_incident.id RETURNING * INTO v_incident;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=v_round.order_id;
 PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,v_live_binding.visit_key,
  v_account.customer_id,v_account.id,NULL,'customer','sabora.refund.cash_recorded',v_settlement.id,1,
  jsonb_build_object('incidentId',v_incident.id,'orderId',v_order.id,'amountCents',v_settlement.amount_cents));
 v_result:=jsonb_build_object('incidentId',v_incident.id,'settlementId',v_settlement.id,
  'state','resolved','amountCents',v_settlement.amount_cents);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
  VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'refund_cash',v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$refund_cash$;
ALTER FUNCTION sabora.refund_h6_cash_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.refund_h6_cash_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,sabora_h6_customer_runtime;
GRANT EXECUTE ON FUNCTION sabora.refund_h6_cash_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;
-- Also follow the live table when acknowledging a captured kitchen dispatch.
CREATE OR REPLACE FUNCTION sabora.acknowledge_kitchen_dispatch_h6_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_dispatch_id uuid,p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $ack_dispatch$
DECLARE v_live_binding record; v_role text;v_dispatch sabora.kitchen_dispatches%ROWTYPE;v_round sabora.order_rounds%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;v_existing jsonb;v_result jsonb;v_fingerprint bytea;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'ack_dispatch',p_dispatch_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('kitchen','admin') THEN RAISE EXCEPTION 'h6_staff_action_forbidden' USING errcode='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_actor_user_id::text||':'||p_correlation_id,0));
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
   RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to('ack_dispatch:'||p_dispatch_id::text,'UTF8'));
 SELECT r.result INTO v_existing FROM sabora.h6_action_requests r
  WHERE r.actor_user_id=p_actor_user_id AND r.correlation_id=p_correlation_id;
 IF FOUND THEN
   IF (SELECT fingerprint FROM sabora.h6_action_requests WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id)<>v_fingerprint
   THEN RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
   RETURN v_existing||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_dispatch FROM sabora.kitchen_dispatches d WHERE d.id=p_dispatch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'dispatch_not_found' USING errcode='P0002'; END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
   RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_dispatch.round_id FOR UPDATE;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT table_id,session_id,visit_key INTO v_live_binding
 FROM sabora.customer_account_operational_bindings WHERE account_id=v_account.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'h6_economic_binding_missing' USING errcode='42501'; END IF;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=v_round.order_id;
 IF v_dispatch.state='acknowledged' THEN
   v_result:=jsonb_build_object('dispatchId',v_dispatch.id,'orderId',v_order.id,'state','acknowledged');
 ELSIF v_dispatch.state<>'requested' THEN RAISE EXCEPTION 'dispatch_not_acknowledgeable' USING errcode='23514';
 ELSE
   UPDATE sabora.kitchen_dispatches SET state='acknowledged',acknowledged_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=v_dispatch.id RETURNING * INTO v_dispatch;
   UPDATE sabora.order_rounds SET state='kitchen_acknowledged',updated_at=clock_timestamp()
    WHERE id=v_round.id;
   PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,v_live_binding.visit_key,
    v_account.customer_id,v_account.id,NULL,'customer','sabora.kitchen.dispatch_acknowledged',
    v_dispatch.id,2,jsonb_build_object('orderId',v_order.id,'dispatchId',v_dispatch.id));
   PERFORM sabora.emit_h6_event_candidate(v_live_binding.table_id,v_live_binding.session_id,NULL,NULL,NULL,
    'waiter','waiter','sabora.kitchen.dispatch_acknowledged',v_dispatch.id,2,
    jsonb_build_object('orderId',v_order.id,'roundId',v_round.id,'dispatchId',v_dispatch.id));
   v_result:=jsonb_build_object('dispatchId',v_dispatch.id,'orderId',v_order.id,'state','acknowledged');
 END IF;
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'ack_dispatch',v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$ack_dispatch$;
ALTER FUNCTION sabora.acknowledge_kitchen_dispatch_h6_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.acknowledge_kitchen_dispatch_h6_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT USAGE ON SCHEMA sabora TO sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.acknowledge_kitchen_dispatch_h6_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;
COMMIT;
