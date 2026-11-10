-- Sabora customer-session restricted RPCs. VERSIONED CANDIDATE ONLY.
-- Do not apply to operational Supabase without explicit authorization and
-- independent review of the API database connection and role membership.
BEGIN;
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
COMMIT;
