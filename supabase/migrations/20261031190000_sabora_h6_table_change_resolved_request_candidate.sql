-- F12/B3 isolated candidate: resolve the single open economic account inside
-- the SECURITY DEFINER boundary, never in an API login with table privileges.
-- The existing two-argument RPC remains sealed; no runtime EXECUTE is granted.
BEGIN;
-- CV-005 OPTION A: transaction-scoped owner membership for existing function ACL.
DO $cv005_existing_owner_access$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname,roles.rolcanlogin,roles.rolinherit,roles.rolsuper,roles.rolbypassrls,roles.rolcreaterole,roles.rolcreatedb,roles.rolreplication FROM pg_catalog.pg_roles roles
 WHERE roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner
CREATE FUNCTION sabora.request_customer_table_change_h6_resolved_candidate(
 p_session_hash bytea
) RETURNS TABLE(request_id uuid,request_status text,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $resolved$
DECLARE v_customer uuid;v_account_id uuid;v_open_count bigint;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 THEN
  RAISE EXCEPTION 'invalid_table_change_request' USING errcode='22023';
 END IF;
 SELECT s.customer_id INTO v_customer FROM sabora.customer_sessions s
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp();
 IF NOT FOUND THEN
  RAISE EXCEPTION 'customer_session_forbidden' USING errcode='42501';
 END IF;
 -- Serialize the uniqueness decision with H6 confirmation and staff decisions.
 -- This is a transaction-scoped advisory lock; the delegated RPC reacquires
 -- the same lock reentrantly and revalidates session, account and visit.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_customer::text,140630));
 SELECT count(*),min(a.id) INTO v_open_count,v_account_id
 FROM sabora.customer_accounts a
 WHERE a.customer_id=v_customer AND a.state='open';
 IF v_open_count<>1 THEN
  RAISE EXCEPTION 'table_change_account_forbidden' USING errcode='42501';
 END IF;
 RETURN QUERY SELECT r.request_id,r.request_status,r.expires_at
 FROM sabora.request_customer_table_change_h6_candidate(
  p_session_hash,v_account_id) r;
END;
$resolved$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.request_customer_table_change_h6_resolved_candidate(bytea)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.request_customer_table_change_h6_resolved_candidate(bytea)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
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

CREATE FUNCTION sabora.request_customer_table_change_h6_resolved_candidate(
 p_session_hash bytea
) RETURNS TABLE(request_id uuid,request_status text,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $resolved$
DECLARE v_customer uuid;v_account_id uuid;v_open_count bigint;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 THEN
  RAISE EXCEPTION 'invalid_table_change_request' USING errcode='22023';
 END IF;
 SELECT s.customer_id INTO v_customer FROM sabora.customer_sessions s
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp();
 IF NOT FOUND THEN
  RAISE EXCEPTION 'customer_session_forbidden' USING errcode='42501';
 END IF;
 -- Serialize the uniqueness decision with H6 confirmation and staff decisions.
 -- This is a transaction-scoped advisory lock; the delegated RPC reacquires
 -- the same lock reentrantly and revalidates session, account and visit.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_customer::text,140630));
 SELECT count(*),min(a.id) INTO v_open_count,v_account_id
 FROM sabora.customer_accounts a
 WHERE a.customer_id=v_customer AND a.state='open';
 IF v_open_count<>1 THEN
  RAISE EXCEPTION 'table_change_account_forbidden' USING errcode='42501';
 END IF;
 RETURN QUERY SELECT r.request_id,r.request_status,r.expires_at
 FROM sabora.request_customer_table_change_h6_candidate(
  p_session_hash,v_account_id) r;
END;
$resolved$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.request_customer_table_change_h6_resolved_candidate(bytea)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.request_customer_table_change_h6_resolved_candidate(bytea)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
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
