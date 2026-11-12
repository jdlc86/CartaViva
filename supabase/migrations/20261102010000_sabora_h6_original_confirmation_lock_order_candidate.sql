-- H6: preserve row-level revocation protection while avoiding session/visit
-- UPDATE-lock inversion with the quote/lookup path, which locks table first.
-- This is a candidate migration for isolated PG17 acceptance, not a deploy.
BEGIN;
DO $rewrite$
DECLARE
 v_definition text;
 v_updated text;
 v_signature text := 'sabora.confirm_customer_round_h6_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
 v_session_pattern text := 'AND s.expires_at>clock_timestamp() FOR UPDATE';
 v_visit_pattern text := 'AND v.expires_at>clock_timestamp() FOR UPDATE';
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND p.proname='confirm_customer_round_h6_candidate'
   AND pg_get_function_identity_arguments(p.oid) =
     'p_session_hash bytea, p_table_id uuid, p_qr_token text, p_visit_key text, p_basket_id text, p_request_key text, p_request_fingerprint bytea, p_batch_id uuid, p_order_id uuid, p_lines jsonb, p_accepted_reprice boolean, p_payment_mode text';
 IF v_definition IS NULL THEN
  RAISE EXCEPTION 'h6_original_confirmation_missing';
 END IF;
 IF (length(v_definition)-length(replace(v_definition,v_session_pattern,'')))
      / length(v_session_pattern) <> 2
    OR (length(v_definition)-length(replace(v_definition,v_visit_pattern,'')))
      / length(v_visit_pattern) <> 2 THEN
  RAISE EXCEPTION 'h6_original_confirmation_lock_order_drift';
 END IF;
 -- A shared row lock still conflicts with revocation UPDATE/DELETE and
 -- rechecks the active session/visit, but does not conflict with the shared
 -- locks taken by the first-phase lookup and quote preparation.
 v_updated := replace(v_definition,v_session_pattern,
   'AND s.expires_at>clock_timestamp() FOR SHARE');
 v_updated := replace(v_updated,v_visit_pattern,
   'AND v.expires_at>clock_timestamp() FOR SHARE');
 EXECUTE v_updated;
END;
$rewrite$;
ALTER FUNCTION sabora.confirm_customer_round_h6_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.confirm_customer_round_h6_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_provider_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.confirm_customer_round_h6_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 TO sabora_h6_customer_runtime;
COMMIT;
