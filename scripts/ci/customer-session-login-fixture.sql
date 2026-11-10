-- Disposable PostgreSQL 17 ONLY: simulate a real login with a scoped membership.
-- Never run this fixture against Supabase or any operational database.
BEGIN;
CREATE ROLE sabora_customer_session_login LOGIN PASSWORD 'ci_disposable_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
GRANT sabora_customer_session_runtime TO sabora_customer_session_login;
-- A NOINHERIT login cannot acquire the runtime capability without SET ROLE.
DO $gate$
BEGIN
 IF has_function_privilege('sabora_customer_session_login','sabora.verify_customer_session_hash(bytea)','EXECUTE')
 OR has_function_privilege('sabora_customer_session_login','sabora.revoke_customer_session_hash(bytea)','EXECUTE') THEN
  RAISE EXCEPTION 'login inherited RPC privileges unexpectedly';
 END IF;
 IF pg_has_role('sabora_customer_session_login','sabora_customer_session_fn_owner','MEMBER') THEN
  RAISE EXCEPTION 'login belongs to privileged function owner';
 END IF;
END $gate$;
COMMIT;
