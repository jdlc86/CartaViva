-- H6 account closure candidate: conservatively close only a fully reconciled,
-- operationally completed account, with a separate signed staff action.
-- NO production cutover; caller must have the dedicated operations capability.
-- Contract: paying cash in full does not automatically close an account.
BEGIN;

ALTER TABLE sabora.customer_accounts
 ADD COLUMN closed_at timestamptz,
 ADD COLUMN closed_by uuid REFERENCES sabora.staff_members(user_id),
 ADD COLUMN close_correlation_id text
  CHECK (close_correlation_id IS NULL OR close_correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
 ADD CONSTRAINT h6_account_close_fields_consistent
  CHECK ((closed_at IS NULL AND closed_by IS NULL AND close_correlation_id IS NULL)
     OR (closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_correlation_id IS NOT NULL
         AND state='settled'));

-- A distinct HMAC action. Never allow 'settle_cash' to authorize closure.
ALTER TABLE sabora.h6_action_requests
 DROP CONSTRAINT h6_action_requests_action_check;
ALTER TABLE sabora.h6_action_requests
 ADD CONSTRAINT h6_action_requests_action_check
 CHECK (action IN ('report_incident','resolve_incident','settle_cash','refund_cash',
   'ack_dispatch','claim_pickup','cancel_pickup','correct_ready','close_account'));

-- Extend only the exact signed action allowlist. Preserve the original
-- staff state check, key revocation, TTL, database-login binding and HMAC.
CREATE OR REPLACE FUNCTION sabora.verify_h6_staff_capability_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_action text,p_target_id uuid,p_correlation_id text,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $verify_staff$
DECLARE v_key bytea;v_key_expiry timestamptz;v_role text;v_payload text;v_expected text;v_now bigint;
BEGIN
 v_now:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF p_key_id !~ '^[A-Za-z0-9_-]{8,64}$' OR p_database_role IS DISTINCT FROM session_user
   OR p_actor_user_id IS NULL OR p_staff_role NOT IN ('admin','waiter','kitchen','root')
   OR p_action NOT IN ('report_incident','resolve_incident','settle_cash','refund_cash',
                      'ack_dispatch','read_events','close_account')
   OR p_target_id IS NULL OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
   OR p_issued_at_ms>v_now+5000 OR p_issued_at_ms<v_now-60000
   OR p_expires_at_ms<=v_now OR p_expires_at_ms>p_issued_at_ms+60000
   OR p_signature_hex !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501'; END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_key_expiry
  FROM sabora.order_operation_signing_keys k WHERE k.key_id=p_key_id
    AND k.disabled_at IS NULL AND k.not_before<=clock_timestamp()
    AND k.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501'; END IF;
 SELECT m.role INTO v_role FROM sabora.staff_members m
  WHERE m.user_id=p_actor_user_id AND m.state='active' FOR UPDATE;
 IF NOT FOUND OR v_role IS DISTINCT FROM p_staff_role THEN
   RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501';
 END IF;
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
ALTER FUNCTION sabora.verify_h6_staff_capability_candidate(text,text,uuid,text,text,uuid,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.verify_h6_staff_capability_candidate(text,text,uuid,text,text,uuid,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.verify_h6_staff_capability_candidate(text,text,uuid,text,text,uuid,text,bigint,bigint,text)
 TO sabora_h6_fn_owner;

CREATE FUNCTION sabora.close_h6_account_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_account_id uuid,p_correlation_id text,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $close_account$
DECLARE v_role text;v_account sabora.customer_accounts%ROWTYPE;
 v_customer uuid;v_existing record;v_fingerprint bytea;v_result jsonb;v_binding record;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(
  p_key_id,p_database_role,p_actor_user_id,p_staff_role,
  'close_account',p_account_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('waiter','admin','root') OR p_account_id IS NULL THEN
  RAISE EXCEPTION 'account_close_forbidden' USING errcode='42501'; END IF;
 -- A repeated correlation has one response and cannot be reused for another action.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_actor_user_id::text||':'||p_correlation_id,0));
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to('close_account:'||p_account_id::text,'UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests
  WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.action<>'close_account' OR v_existing.fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505';
  END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT customer_id INTO v_customer FROM sabora.customer_accounts WHERE id=p_account_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'account_close_forbidden' USING errcode='42501'; END IF;
 -- Same customer advisory lock as H6 confirmation, request and staff decision.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_customer::text,140630));
 SELECT * INTO v_account FROM sabora.customer_accounts a
  WHERE a.id=p_account_id AND a.customer_id=v_customer FOR UPDATE;
 IF v_account.state<>'open' OR v_account.outstanding_cents<>0 THEN
  RAISE EXCEPTION 'account_close_conflict' USING errcode='23514'; END IF;
 -- A zero debt is not sufficient while monetary, operational or refund
 -- obligations are unresolved. Do not guess from a Stripe timeout.
 IF EXISTS(SELECT 1 FROM sabora.payment_attempts p
    WHERE p.account_id=p_account_id AND p.state NOT IN
    ('captured','released','authorization_failed','capture_failed'))
  OR EXISTS(SELECT 1 FROM sabora.refund_attempts f
    JOIN sabora.payment_attempts p ON p.id=f.payment_attempt_id
    WHERE p.account_id=p_account_id AND f.state<>'succeeded')
  OR EXISTS(SELECT 1 FROM sabora.incident_cases i
    JOIN sabora.order_rounds r ON r.id=i.round_id
    WHERE r.account_id=p_account_id
    AND i.state NOT IN ('adjusted','rejected_customer_request','resolved'))
  OR EXISTS(SELECT 1 FROM sabora.order_rounds r
    WHERE r.account_id=p_account_id AND r.state NOT IN ('kitchen_acknowledged','cancelled'))
  OR EXISTS(SELECT 1 FROM sabora.order_rounds r
    JOIN sabora.order_lines l ON l.order_id=r.order_id
    WHERE r.account_id=p_account_id AND l.status<>'picked_up')
  THEN RAISE EXCEPTION 'account_close_unresolved' USING errcode='23514'; END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 SELECT b.table_id,b.session_id,b.visit_key INTO v_binding
  FROM sabora.customer_account_operational_bindings b
  WHERE b.account_id=p_account_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account_close_binding_missing' USING errcode='42501'; END IF;
 UPDATE sabora.customer_accounts SET state='settled',closed_at=clock_timestamp(),
  closed_by=p_actor_user_id,close_correlation_id=p_correlation_id,
  updated_at=clock_timestamp() WHERE id=p_account_id RETURNING * INTO v_account;
 -- A still-pending request is explicitly terminal. For an approved grant,
 -- retain its original decided_at/decided_by audit columns: it is unusable
 -- because all confirmation paths require account.state='open'.
 UPDATE sabora.customer_table_change_requests SET status='revoked',
  revoked_at=clock_timestamp() WHERE account_id=p_account_id AND status='pending';
 UPDATE sabora.customer_table_change_requests SET revoked_at=clock_timestamp()
  WHERE account_id=p_account_id AND status='approved' AND revoked_at IS NULL;
 PERFORM sabora.emit_h6_event_candidate(v_binding.table_id,v_binding.session_id,
  v_binding.visit_key,v_account.customer_id,v_account.id,NULL,'customer',
  'sabora.account.closed',v_account.id,1,
  jsonb_build_object('accountId',v_account.id,'state','settled','outstandingCents',0));
 v_result:=jsonb_build_object('accountId',v_account.id,'state','settled',
  'outstandingCents',0,'closedAt',v_account.closed_at);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'close_account',v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$close_account$;
ALTER FUNCTION sabora.close_h6_account_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.close_h6_account_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_provider_runtime,sabora_h6_operations_runtime;
-- Do NOT widen sabora_h6_operations_runtime: its existing exact-three-
-- function surface is a security invariant checked by PG17 integration.
-- A separate NOLOGIN capability may execute only this one sealed function.
CREATE ROLE sabora_h6_account_close_runtime NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA sabora TO sabora_h6_account_close_runtime;
GRANT EXECUTE ON FUNCTION sabora.close_h6_account_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 TO sabora_h6_account_close_runtime;

-- An old authenticated customer session must not create a new account or
-- replay the old order after closure. A future session plus a new authorized
-- visit remains a separately revalidated customer journey. Apply this guard
-- BEFORE persist_customer_order_candidate writes any ledger row.
GRANT SELECT(created_at) ON sabora.customer_sessions TO sabora_h6_fn_owner;
DO $closed_session_guard$
DECLARE v_def text;v_guard text;v_anchor text;
BEGIN
 SELECT pg_get_functiondef(
  'sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)'::regprocedure
 ) INTO v_def;
 v_anchor:='SELECT * INTO v_persist FROM sabora.persist_customer_order_candidate(';
 IF v_def IS NULL OR (length(v_def)-length(replace(v_def,v_anchor,'')))<>length(v_anchor)
 THEN RAISE EXCEPTION 'h6_account_close_confirmation_signature_drift'; END IF;
 v_guard:='IF EXISTS(SELECT 1 FROM sabora.customer_accounts a
  JOIN sabora.customer_sessions s ON s.customer_id=a.customer_id
  WHERE s.token_hash=p_session_hash AND a.state=''settled''
    AND a.closed_at IS NOT NULL AND s.created_at<=a.closed_at)
  THEN RAISE EXCEPTION ''customer_session_forbidden'' USING errcode=''42501''; END IF;
  SELECT * INTO v_persist FROM sabora.persist_customer_order_candidate(';
 EXECUTE replace(v_def,v_anchor,v_guard);
END;
$closed_session_guard$;
ALTER FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
 sabora_h6_operations_runtime,sabora_h6_provider_runtime;
COMMIT;
