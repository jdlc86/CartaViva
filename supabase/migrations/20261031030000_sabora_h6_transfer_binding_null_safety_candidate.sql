-- B2 candidate: replace isolated confirmation body with a null-safe binding
-- lookup when a customer has no prior open account. No runtime cutover.
BEGIN;
-- CV-005 OPTION A: transaction-scoped owner membership for existing function ACL.
DO $cv005_existing_owner_access$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname,roles.rolcanlogin,roles.rolinherit,roles.rolsuper,roles.rolbypassrls,roles.rolcreaterole,roles.rolcreatedb,roles.rolreplication FROM pg_catalog.pg_roles roles
 WHERE roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner
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
   '  v_binding_id:=v_binding.id;' || chr(10) || '  IF v_binding_id IS NOT NULL AND v_binding.table_id<>p_table_id THEN');
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
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
 sabora_h6_operations_runtime,sabora_h6_provider_runtime;
REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;
COMMIT;
 AND roles.rolname<>current_user::text
 AND (EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=roles.oid AND n.nspname='sabora')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=roles.oid AND n.nspname='sabora'))
 LOOP
  IF r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication THEN RAISE EXCEPTION 'cv005_unsafe_preexisting_fn_owner' USING errcode='0P000'; END IF;
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',r.rolname);
 END LOOP;
END;
$cv005_existing_owner_access$;

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
   '  v_binding_id:=v_binding.id;' || chr(10) || '  IF v_binding_id IS NOT NULL AND v_binding.table_id<>p_table_id THEN');
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
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
 sabora_h6_operations_runtime,sabora_h6_provider_runtime;
REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;

-- CV-005: release every own-granted owner membership before COMMIT.
DO $cv005_existing_owner_release$
DECLARE r name;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles roles ON roles.oid=m.roleid
 WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',r); END LOOP;
END;
$cv005_existing_owner_release$;
COMMIT;
