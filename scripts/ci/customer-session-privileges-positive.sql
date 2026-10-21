-- Disposable PostgreSQL 17 only. Test an EXECUTE-only, scoped RPC design.
-- No migration to operative Supabase and no public HTTP endpoint.
BEGIN;
CREATE ROLE sabora_customer_session_ci NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
-- The owner remains the schema owner. FORCE RLS remains enabled: functions
-- are backed by an explicit policy scoped to a dedicated function owner.
CREATE ROLE sabora_session_fn_ci NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA sabora TO sabora_session_fn_ci;
GRANT SELECT ON sabora.customer_sessions, sabora.customer_profiles TO sabora_session_fn_ci;
GRANT UPDATE(revoked_at) ON sabora.customer_sessions TO sabora_session_fn_ci;
CREATE POLICY session_fn_select_ci ON sabora.customer_sessions FOR SELECT TO sabora_session_fn_ci USING (true);
CREATE POLICY session_fn_update_ci ON sabora.customer_sessions FOR UPDATE TO sabora_session_fn_ci USING (true) WITH CHECK (true);
CREATE POLICY session_fn_profiles_ci ON sabora.customer_profiles FOR SELECT TO sabora_session_fn_ci USING (true);
-- Never grant the function owner to the runtime role.
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
DO $fixture$
DECLARE v_id uuid; v_hash bytea:=decode(repeat('bd',32),'hex');
BEGIN
 INSERT INTO sabora.customer_profiles(public_id,alias) VALUES('SB-YYYYYYYYYYYY','CI Session')
 RETURNING id INTO v_id;
 INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
 VALUES(v_id,v_hash,now()+interval '1 day');
END $fixture$;
SET LOCAL ROLE sabora_customer_session_ci;
DO $$
DECLARE v_hash bytea:=decode(repeat('bd',32),'hex'); v_count int;
BEGIN
 SELECT count(*) INTO v_count FROM sabora.ci_verify_customer_session(v_hash);
 IF v_count<>1 THEN RAISE EXCEPTION 'valid session not verified'; END IF;
 SELECT count(*) INTO v_count FROM sabora.ci_verify_customer_session(decode(repeat('ef',32),'hex'));
 IF v_count<>0 THEN RAISE EXCEPTION 'unknown session accepted'; END IF;
 IF NOT sabora.ci_revoke_customer_session(v_hash) THEN RAISE EXCEPTION 'revocation failed'; END IF;
 IF sabora.ci_revoke_customer_session(v_hash) THEN RAISE EXCEPTION 'revocation not idempotent'; END IF;
 SELECT count(*) INTO v_count FROM sabora.ci_verify_customer_session(v_hash);
 IF v_count<>0 THEN RAISE EXCEPTION 'revoked session accepted'; END IF;
 BEGIN
  PERFORM count(*) FROM sabora.customer_sessions;
  RAISE EXCEPTION 'direct session read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM count(*) FROM sabora.customer_profiles;
  RAISE EXCEPTION 'direct profile read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
