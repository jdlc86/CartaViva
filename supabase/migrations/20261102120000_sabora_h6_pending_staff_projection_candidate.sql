-- Candidate-only staff pending-request projection. No runtime EXECUTE grant.
-- Do not activate until an isolated read capability/login and PG17 preflight
-- are approved; existing F12 operations identity remains decision-only.
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


CREATE FUNCTION sabora.list_pending_table_changes_h6_candidate(
 p_staff_id uuid
) RETURNS TABLE(request_id uuid,source_table_number integer,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $pending$
BEGIN
 IF p_staff_id IS NULL THEN
  RAISE EXCEPTION 'table_change_staff_forbidden' USING errcode='42501';
 END IF;
 PERFORM 1 FROM sabora.staff_members m
 WHERE m.user_id=p_staff_id AND m.state='active'
 AND m.role IN ('waiter','admin');
 IF NOT FOUND THEN
  RAISE EXCEPTION 'table_change_staff_forbidden' USING errcode='42501';
 END IF;
 RETURN QUERY
 SELECT q.id,t.number,q.expires_at
 FROM sabora.customer_table_change_requests q
 JOIN sabora.dining_tables t ON t.id=q.source_table_id
 JOIN sabora.customer_accounts a ON a.id=q.account_id
 WHERE q.status='pending' AND q.expires_at>clock_timestamp()
 AND a.state='open'
 ORDER BY q.created_at ASC,q.id ASC
 LIMIT 100;
END;
$pending$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.list_pending_table_changes_h6_candidate(uuid)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.list_pending_table_changes_h6_candidate(uuid)
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
 sabora_h6_operations_runtime,sabora_h6_provider_runtime;
-- No GRANT EXECUTE to a runtime identity. The operations identity's
-- single-function F12 capability contract must not be silently expanded.
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
