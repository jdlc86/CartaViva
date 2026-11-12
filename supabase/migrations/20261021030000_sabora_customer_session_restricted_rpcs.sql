-- Sabora customer-session restricted RPCs. VERSIONED CANDIDATE ONLY.
-- Do not apply to operational Supabase without explicit authorization and
-- independent review of the API database connection and role membership.
BEGIN;

-- CV-005: existing sealed function owners are scoped to this transaction
-- before CREATE OR REPLACE or cross-owner ACL; no runtime LOGIN is granted.
DO $cv005_early_owner_scope$
DECLARE roleinfo record;
BEGIN
 FOR roleinfo IN
  SELECT DISTINCT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,
    r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication
  FROM pg_catalog.pg_roles r
  WHERE left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner'
   AND r.rolname<>current_user::text
   AND (EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n
     ON n.oid=p.pronamespace WHERE p.proowner=r.oid AND n.nspname='sabora')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n
     ON n.oid=c.relnamespace WHERE c.relowner=r.oid AND n.nspname='sabora'))
 LOOP
  IF roleinfo.rolcanlogin OR roleinfo.rolinherit OR roleinfo.rolsuper
    OR roleinfo.rolbypassrls OR roleinfo.rolcreaterole
    OR roleinfo.rolcreatedb OR roleinfo.rolreplication THEN
    RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner' USING errcode='0P000';
  END IF;
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',roleinfo.rolname);
 END LOOP;
END;
$cv005_early_owner_scope$;


CREATE ROLE sabora_customer_session_runtime NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE sabora_customer_session_fn_owner NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA sabora TO sabora_customer_session_fn_owner;
GRANT SELECT ON sabora.customer_sessions, sabora.customer_profiles TO sabora_customer_session_fn_owner;
GRANT UPDATE(revoked_at) ON sabora.customer_sessions TO sabora_customer_session_fn_owner;
CREATE POLICY customer_session_fn_read ON sabora.customer_sessions
 FOR SELECT TO sabora_customer_session_fn_owner USING (true);
CREATE POLICY customer_session_fn_revoke ON sabora.customer_sessions
 FOR UPDATE TO sabora_customer_session_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY customer_profile_fn_read ON sabora.customer_profiles
 FOR SELECT TO sabora_customer_session_fn_owner USING (true);
CREATE FUNCTION sabora.verify_customer_session_hash(p_hash bytea)
RETURNS TABLE(customer_id uuid, public_id text, alias text, company text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $verify$
 SELECT s.customer_id,p.public_id,p.alias,p.company
 FROM sabora.customer_sessions AS s
 JOIN sabora.customer_profiles AS p ON p.id=s.customer_id
 WHERE octet_length(p_hash)=32 AND s.token_hash=p_hash
 AND s.revoked_at IS NULL AND s.expires_at>now()
 LIMIT 1
$verify$;
-- CV-005 CANDIDATE (not approved): migration-only capability, revoked before COMMIT.
GRANT CREATE ON SCHEMA sabora TO sabora_customer_session_fn_owner;
GRANT sabora_customer_session_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.verify_customer_session_hash(bytea) OWNER TO sabora_customer_session_fn_owner;
CREATE FUNCTION sabora.revoke_customer_session_hash(p_hash bytea)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $revoke$
 WITH changed AS (
  UPDATE sabora.customer_sessions SET revoked_at=now()
  WHERE octet_length(p_hash)=32 AND token_hash=p_hash
   AND revoked_at IS NULL AND expires_at>now() RETURNING id
 ) SELECT EXISTS(SELECT 1 FROM changed)
$revoke$;
ALTER FUNCTION sabora.revoke_customer_session_hash(bytea) OWNER TO sabora_customer_session_fn_owner;
REVOKE ALL ON FUNCTION sabora.verify_customer_session_hash(bytea) FROM PUBLIC, anon, authenticated, sabora_admin_writer;
REVOKE ALL ON FUNCTION sabora.revoke_customer_session_hash(bytea) FROM PUBLIC, anon, authenticated, sabora_admin_writer;
GRANT USAGE ON SCHEMA sabora TO sabora_customer_session_runtime;
GRANT EXECUTE ON FUNCTION sabora.verify_customer_session_hash(bytea) TO sabora_customer_session_runtime;
GRANT EXECUTE ON FUNCTION sabora.revoke_customer_session_hash(bytea) TO sabora_customer_session_runtime;
-- Intentionally NO LOGIN, NO role membership and NO browser grants.
-- The application must not use this capability until a dedicated restricted
-- connection identity, backend query contract and negative tests are reviewed.
REVOKE sabora_customer_session_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_customer_session_fn_owner;


-- CV-005: revoke every DBA-issued membership on Sabora function owners.
DO $cv005_early_owner_release$
DECLARE role_name name;
BEGIN
 FOR role_name IN
  SELECT DISTINCT r.rolname FROM pg_catalog.pg_auth_members m
  JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
   AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
   AND left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner'
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',role_name); END LOOP;
END;
$cv005_early_owner_release$;

COMMIT;
