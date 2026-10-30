-- Candidate-only deadlock prevention: acquire the per-customer advisory lock
-- before any customer-session row lock. No runtime EXECUTE is introduced.
BEGIN;
DO $rewrite$
DECLARE v_body text; v_new text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora'
  AND p.proname='confirm_customer_round_h6_transfer_integration_candidate';
 IF v_body IS NULL THEN RAISE EXCEPTION 'h6_integration_candidate_missing'; END IF;
 -- Both session lookups previously took FOR UPDATE before/after the advisory
 -- lock; a concurrent session-revocation path can invert lock acquisition.
 -- The session is only read for identity and revocation checks here. The
 -- advisory lock serializes all candidate confirmations for that customer.
 IF (length(v_body)-length(replace(v_body,
   'AND s.expires_at>clock_timestamp() FOR UPDATE',
   'AND s.expires_at>clock_timestamp()')))
    / length(' FOR UPDATE') <> 2 THEN
  RAISE EXCEPTION 'h6_session_lock_order_drift';
 END IF;
 v_new:=replace(v_body,
  'AND s.expires_at>clock_timestamp() FOR UPDATE',
  'AND s.expires_at>clock_timestamp()');
 EXECUTE v_new;
END;
$rewrite$;
ALTER FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_provider_runtime,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
COMMIT;
