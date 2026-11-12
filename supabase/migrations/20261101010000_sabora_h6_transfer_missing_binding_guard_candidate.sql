-- F12 candidate-only: never mint a second economic account when an existing
-- open account has lost its operational binding. Fail before order persistence.
-- Rewrites ONLY the sealed candidate; active H6 confirmation remains unchanged.
BEGIN;
-- CV-005 OPTION A: transaction-scoped owner membership for existing function ACL.
DO $cv005_existing_owner_access$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname,roles.rolcanlogin,roles.rolinherit,roles.rolsuper,roles.rolbypassrls,roles.rolcreaterole,roles.rolcreatedb,roles.rolreplication FROM pg_catalog.pg_roles roles
 WHERE roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner
DO $guard$
DECLARE v_body text; v_new text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora'
  AND p.oid=to_regprocedure('sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)');
 IF v_body IS NULL THEN RAISE EXCEPTION 'h6_transfer_candidate_signature_drift'; END IF;
 -- pg_get_functiondef normalizes whitespace/operators; match the semantic
 -- branch once rather than relying on original migration source formatting.
 IF (SELECT count(*) FROM regexp_matches(v_body,
  'IF[[:space:]]+v_binding_id[[:space:]]+IS[[:space:]]+NOT[[:space:]]+NULL[[:space:]]+AND[[:space:]]+v_binding[.]table_id[[:space:]]*<>[[:space:]]*p_table_id[[:space:]]+THEN','g'))<>1 THEN
  RAISE EXCEPTION 'h6_transfer_binding_guard_drift';
 END IF;
 v_new:=regexp_replace(v_body,
  'IF[[:space:]]+v_binding_id[[:space:]]+IS[[:space:]]+NOT[[:space:]]+NULL[[:space:]]+AND[[:space:]]+v_binding[.]table_id[[:space:]]*<>[[:space:]]*p_table_id[[:space:]]+THEN',
  'IF v_binding_id IS NULL AND EXISTS ('||
  'SELECT 1 FROM sabora.customer_accounts a '||
  'WHERE a.customer_id=v_session.customer_id AND a.state=''open'') THEN '||
  'RAISE EXCEPTION ''h6_open_account_binding_missing'' USING errcode=''42501''; '||
  'END IF; '||
  'IF v_binding_id IS NOT NULL AND v_binding.table_id<>p_table_id THEN');
 EXECUTE v_new;
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
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_provider_runtime,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
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
DECLARE v_body text; v_new text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora'
  AND p.oid=to_regprocedure('sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)');
 IF v_body IS NULL THEN RAISE EXCEPTION 'h6_transfer_candidate_signature_drift'; END IF;
 -- pg_get_functiondef normalizes whitespace/operators; match the semantic
 -- branch once rather than relying on original migration source formatting.
 IF (SELECT count(*) FROM regexp_matches(v_body,
  'IF[[:space:]]+v_binding_id[[:space:]]+IS[[:space:]]+NOT[[:space:]]+NULL[[:space:]]+AND[[:space:]]+v_binding[.]table_id[[:space:]]*<>[[:space:]]*p_table_id[[:space:]]+THEN','g'))<>1 THEN
  RAISE EXCEPTION 'h6_transfer_binding_guard_drift';
 END IF;
 v_new:=regexp_replace(v_body,
  'IF[[:space:]]+v_binding_id[[:space:]]+IS[[:space:]]+NOT[[:space:]]+NULL[[:space:]]+AND[[:space:]]+v_binding[.]table_id[[:space:]]*<>[[:space:]]*p_table_id[[:space:]]+THEN',
  'IF v_binding_id IS NULL AND EXISTS ('||
  'SELECT 1 FROM sabora.customer_accounts a '||
  'WHERE a.customer_id=v_session.customer_id AND a.state=''open'') THEN '||
  'RAISE EXCEPTION ''h6_open_account_binding_missing'' USING errcode=''42501''; '||
  'END IF; '||
  'IF v_binding_id IS NOT NULL AND v_binding.table_id<>p_table_id THEN');
 EXECUTE v_new;
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
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_provider_runtime,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
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
