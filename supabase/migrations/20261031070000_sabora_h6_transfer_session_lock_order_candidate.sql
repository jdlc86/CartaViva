-- Candidate-only deadlock prevention: acquire the per-customer advisory lock
-- before any customer-session row lock. No runtime EXECUTE is introduced.
BEGIN;

-- CV-005: scoped role access for existing function owners before REPLACE/ACL.
DO $cv005_early_owner_scope$
DECLARE ri record;
BEGIN
 FOR ri IN SELECT DISTINCT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication
 FROM pg_catalog.pg_roles r WHERE left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner' AND r.rolname<>current_user::text
 AND (EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=r.oid AND n.nspname='sabora')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=r.oid AND n.nspname='sabora'))
 LOOP
 IF ri.rolcanlogin OR ri.rolinherit OR ri.rolsuper OR ri.rolbypassrls OR ri.rolcreaterole OR ri.rolcreatedb OR ri.rolreplication THEN
  RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner' USING errcode='0P000';
 END IF;
 EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',ri.rolname);
 END LOOP;
END;
$cv005_early_owner_scope$;


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


-- CV-005: no DBA-issued function-owner membership may survive COMMIT.
DO $cv005_early_owner_release$
DECLARE role_name name;
BEGIN
 FOR role_name IN SELECT DISTINCT r.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
 WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner'
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',role_name); END LOOP;
END;
$cv005_early_owner_release$;

COMMIT;
