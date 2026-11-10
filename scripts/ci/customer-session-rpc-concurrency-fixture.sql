-- Run in a disposable PG17 container only, never in operational Supabase.
-- Create the same isolated RPC privilege boundary as the positive SQL gate.
BEGIN;
CREATE ROLE sabora_customer_session_ci NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE sabora_session_fn_ci NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA sabora TO sabora_session_fn_ci;
GRANT SELECT ON sabora.customer_sessions,sabora.customer_profiles TO sabora_session_fn_ci;
GRANT UPDATE(revoked_at) ON sabora.customer_sessions TO sabora_session_fn_ci;
CREATE POLICY session_fn_select_ci ON sabora.customer_sessions FOR SELECT TO sabora_session_fn_ci USING (true);
CREATE POLICY session_fn_update_ci ON sabora.customer_sessions FOR UPDATE TO sabora_session_fn_ci USING (true) WITH CHECK (true);
CREATE POLICY session_fn_profiles_ci ON sabora.customer_profiles FOR SELECT TO sabora_session_fn_ci USING (true);
CREATE FUNCTION sabora.ci_revoke_customer_session(p_hash bytea)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH changed AS (
 UPDATE sabora.customer_sessions SET revoked_at=now()
 WHERE token_hash=p_hash AND octet_length(p_hash)=32
 AND revoked_at IS NULL AND expires_at>now() RETURNING id
 ) SELECT EXISTS(SELECT 1 FROM changed)
$$;
ALTER FUNCTION sabora.ci_revoke_customer_session(bytea) OWNER TO sabora_session_fn_ci;
REVOKE ALL ON FUNCTION sabora.ci_revoke_customer_session(bytea) FROM PUBLIC;
GRANT USAGE ON SCHEMA sabora TO sabora_customer_session_ci;
GRANT EXECUTE ON FUNCTION sabora.ci_revoke_customer_session(bytea) TO sabora_customer_session_ci;
INSERT INTO sabora.customer_profiles(public_id,alias)
VALUES('SB-VVVVVVVVVVVV','RPC Concurrent CI');
INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
SELECT id,decode(repeat('c5',32),'hex'),now()+interval '1 day'
FROM sabora.customer_profiles WHERE public_id='SB-VVVVVVVVVVVV';
COMMIT;
