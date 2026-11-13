-- B3 opt-in: durable, per-authenticated-customer table-change read projection.
-- No runtime grants are created; only the independently verified CI role
-- may receive EXECUTE on this function. No direct relation access by API.
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


CREATE FUNCTION sabora.read_customer_table_change_h6_candidate(
 p_session_hash bytea
) RETURNS TABLE(
 bound_table_id uuid,change_state text,change_expires_at timestamptz,server_time timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $read_state$
DECLARE v_customer uuid;v_account_id uuid;v_open_count bigint;v_table uuid;
 v_latest_status text;v_latest_expires timestamptz;v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 THEN
  RAISE EXCEPTION 'invalid_table_change_state' USING errcode='22023';
 END IF;
 SELECT s.customer_id INTO v_customer FROM sabora.customer_sessions s
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>v_now;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'customer_session_forbidden' USING errcode='42501';
 END IF;
 SELECT count(*),min(a.id::text)::uuid INTO v_open_count,v_account_id
 FROM sabora.customer_accounts a WHERE a.customer_id=v_customer AND a.state='open';
 IF v_open_count>1 THEN
  RAISE EXCEPTION 'table_change_account_forbidden' USING errcode='42501';
 END IF;
 IF v_open_count=0 THEN
  RETURN QUERY SELECT NULL::uuid,'unbound'::text,NULL::timestamptz,v_now;
  RETURN;
 END IF;
 SELECT b.table_id INTO v_table FROM sabora.customer_account_operational_bindings b
 WHERE b.account_id=v_account_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'table_change_binding_missing' USING errcode='55000';
 END IF;
 SELECT q.status,q.expires_at INTO v_latest_status,v_latest_expires
 FROM sabora.customer_table_change_requests q WHERE q.account_id=v_account_id
 ORDER BY q.created_at DESC,q.id DESC LIMIT 1;
 IF v_latest_status='approved' THEN
  RETURN QUERY SELECT v_table,'approved'::text,NULL::timestamptz,v_now;
 ELSIF v_latest_status='pending' AND v_latest_expires>v_now THEN
  RETURN QUERY SELECT v_table,'pending'::text,v_latest_expires,v_now;
 ELSIF v_latest_status='rejected' AND v_latest_expires>v_now THEN
  RETURN QUERY SELECT v_table,'rejected'::text,v_latest_expires,v_now;
 ELSE
  RETURN QUERY SELECT v_table,'bound'::text,NULL::timestamptz,v_now;
 END IF;
END;
$read_state$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_customer_table_change_h6_candidate(bytea)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_table_change_h6_candidate(bytea)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
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
