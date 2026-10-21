-- Disposable PostgreSQL 17 only: negative privilege regression.
-- This file is not an operational migration. All changes are rolled back.
BEGIN;
CREATE ROLE sabora_customer_session_ci NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE sabora_session_fn_ci NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA sabora TO sabora_session_fn_ci;
GRANT SELECT ON sabora.customer_sessions, sabora.customer_profiles TO sabora_session_fn_ci;
GRANT UPDATE(revoked_at) ON sabora.customer_sessions TO sabora_session_fn_ci;
CREATE POLICY session_fn_select_ci ON sabora.customer_sessions FOR SELECT TO sabora_session_fn_ci USING (true);
CREATE POLICY session_fn_update_ci ON sabora.customer_sessions FOR UPDATE TO sabora_session_fn_ci USING (true) WITH CHECK (true);
CREATE POLICY session_fn_profiles_ci ON sabora.customer_profiles FOR SELECT TO sabora_session_fn_ci USING (true);
CREATE FUNCTION sabora.ci_verify_customer_session(p_hash bytea)
RETURNS TABLE(customer_id uuid, public_id text, alias text, company text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
 SELECT s.customer_id,p.public_id,p.alias,p.company
 FROM sabora.customer_sessions s JOIN sabora.customer_profiles p ON p.id=s.customer_id
 WHERE s.token_hash=p_hash AND octet_length(p_hash)=32
 AND s.revoked_at IS NULL AND s.expires_at > now() LIMIT 1
$$;
ALTER FUNCTION sabora.ci_verify_customer_session(bytea) OWNER TO sabora_session_fn_ci;
CREATE FUNCTION sabora.ci_revoke_customer_session(p_hash bytea)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
 WITH changed AS (
  UPDATE sabora.customer_sessions SET revoked_at=now()
  WHERE token_hash=p_hash AND octet_length(p_hash)=32
   AND revoked_at IS NULL AND expires_at>now() RETURNING id
 )
 SELECT EXISTS(SELECT 1 FROM changed)
$$;
ALTER FUNCTION sabora.ci_revoke_customer_session(bytea) OWNER TO sabora_session_fn_ci;
REVOKE ALL ON FUNCTION sabora.ci_verify_customer_session(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION sabora.ci_revoke_customer_session(bytea) FROM PUBLIC;
GRANT USAGE ON SCHEMA sabora TO sabora_customer_session_ci;
GRANT EXECUTE ON FUNCTION sabora.ci_verify_customer_session(bytea) TO sabora_customer_session_ci;
GRANT EXECUTE ON FUNCTION sabora.ci_revoke_customer_session(bytea) TO sabora_customer_session_ci;
DO $$
DECLARE v_role text;
BEGIN
 FOREACH v_role IN ARRAY ARRAY['anon','authenticated','sabora_admin_writer'] LOOP
  IF has_function_privilege(v_role,'sabora.ci_verify_customer_session(bytea)','EXECUTE')
   OR has_function_privilege(v_role,'sabora.ci_revoke_customer_session(bytea)','EXECUTE') THEN
   RAISE EXCEPTION 'forbidden role % gained session RPC',v_role;
  END IF;
 END LOOP;
 IF has_table_privilege('sabora_customer_session_ci','sabora.customer_sessions','SELECT')
 OR has_table_privilege('sabora_customer_session_ci','sabora.customer_sessions','UPDATE')
 OR has_table_privilege('sabora_customer_session_ci','sabora.customer_profiles','SELECT') THEN
  RAISE EXCEPTION 'runtime gained direct table privileges';
 END IF;
 IF (SELECT rolbypassrls FROM pg_roles WHERE rolname='sabora_session_fn_ci')
 OR (SELECT rolbypassrls FROM pg_roles WHERE rolname='sabora_customer_session_ci') THEN
  RAISE EXCEPTION 'role bypasses RLS';
 END IF;
END $$;
SET LOCAL ROLE anon;
DO $$
BEGIN
 BEGIN
  PERFORM * FROM sabora.ci_verify_customer_session(decode(repeat('00',32),'hex'));
  RAISE EXCEPTION 'anon executed verify RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
SET LOCAL ROLE sabora_customer_session_ci;
DO $$
BEGIN
 BEGIN
  DELETE FROM sabora.customer_sessions;
  RAISE EXCEPTION 'runtime deleted sessions';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE sabora.customer_sessions SET revoked_at=now();
  RAISE EXCEPTION 'runtime updated sessions';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  SELECT count(*) INTO STRICT _missing FROM sabora.customer_profiles;
  RAISE EXCEPTION 'runtime read profiles';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
