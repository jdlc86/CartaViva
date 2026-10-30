-- B2 candidate: replace isolated confirmation body with a null-safe binding
-- lookup when a customer has no prior open account. No runtime cutover.
BEGIN;
DO $guard$
DECLARE v_body text;v_new text;v_signature text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora'
 AND p.proname='confirm_customer_round_h6_transfer_integration_candidate';
 IF v_body IS NULL THEN RAISE EXCEPTION 'h6_transfer_candidate_missing'; END IF;
 -- The prior SELECT INTO record leaves a record with null fields when no
 -- account exists; use a typed UUID scalar to make the branch unambiguous.
 v_new:=replace(v_body,
   'v_transfer boolean:=false; v_binding record; v_approval_id uuid;',
   'v_transfer boolean:=false; v_binding record; v_binding_id uuid; v_approval_id uuid;');
 IF v_new=v_body THEN RAISE EXCEPTION 'h6_binding_declaration_drift'; END IF;
 v_body:=v_new;
 v_new:=replace(v_body,
   '  IF FOUND AND v_binding.table_id<>p_table_id THEN',
   '  v_binding_id:=v_binding.id;\n  IF v_binding_id IS NOT NULL AND v_binding.table_id<>p_table_id THEN');
 IF v_new=v_body THEN RAISE EXCEPTION 'h6_binding_lookup_drift'; END IF;
 v_body:=v_new;
 v_new:=replace(v_body,
   '  IF v_binding.id IS NOT NULL THEN',
   '  IF v_binding_id IS NOT NULL THEN');
 IF v_new=v_body THEN RAISE EXCEPTION 'h6_binding_branch_drift'; END IF;
 v_body:=v_new;
 EXECUTE v_body;
END;
$guard$;
ALTER FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
 sabora_h6_operations_runtime,sabora_h6_provider_runtime;
COMMIT;
