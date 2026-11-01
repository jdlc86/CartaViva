-- F12 candidate-only: never mint a second economic account when an existing
-- open account has lost its operational binding. Fail before order persistence.
-- Rewrites ONLY the sealed candidate; active H6 confirmation remains unchanged.
BEGIN;
DO $guard$
DECLARE v_body text; v_new text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora'
  AND p.oid=to_regprocedure('sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)');
 IF v_body IS NULL THEN RAISE EXCEPTION 'h6_transfer_candidate_signature_drift'; END IF;
 IF (length(v_body)-length(replace(v_body,
  'IF FOUND AND v_binding.table_id<>p_table_id THEN','')))
  <>length('IF FOUND AND v_binding.table_id<>p_table_id THEN') THEN
  RAISE EXCEPTION 'h6_transfer_binding_guard_drift';
 END IF;
 v_new:=replace(v_body,
  'IF FOUND AND v_binding.table_id<>p_table_id THEN',
  'IF v_binding.id IS NULL AND EXISTS ('||
  'SELECT 1 FROM sabora.customer_accounts a '||
  'WHERE a.customer_id=v_session.customer_id AND a.state=''open'') THEN '||
  'RAISE EXCEPTION ''h6_open_account_binding_missing'' USING errcode=''42501''; '||
  'END IF; '||
  'IF v_binding.id IS NOT NULL AND v_binding.table_id<>p_table_id THEN');
 EXECUTE v_new;
END;
$guard$;
ALTER FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_provider_runtime,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
COMMIT;
