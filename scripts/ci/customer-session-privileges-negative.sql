-- Negative privilege baseline for future customer session runtime role.
-- Run ONLY on disposable PostgreSQL 17 after all migrations.
BEGIN;
CREATE ROLE sabora_customer_session_ci NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
DO $$
DECLARE v_role text := 'sabora_customer_session_ci';
BEGIN
 IF (SELECT rolbypassrls FROM pg_roles WHERE rolname=v_role) THEN
  RAISE EXCEPTION 'session runtime role bypasses RLS';
 END IF;
 IF has_schema_privilege(v_role,'sabora','USAGE') THEN
  RAISE EXCEPTION 'session role has unexpected schema access';
 END IF;
 IF has_table_privilege(v_role,'sabora.customer_sessions','SELECT')
    OR has_table_privilege(v_role,'sabora.customer_sessions','UPDATE')
    OR has_table_privilege(v_role,'sabora.customer_profiles','SELECT') THEN
  RAISE EXCEPTION 'session role has unexpected direct table access';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relname='customer_sessions'
    AND c.relrowsecurity AND c.relforcerowsecurity
 ) THEN
  RAISE EXCEPTION 'session RLS/FORCE RLS missing';
 END IF;
END $$;
SET LOCAL ROLE sabora_customer_session_ci;
DO $$
BEGIN
 BEGIN
  PERFORM count(*) FROM sabora.customer_sessions;
  RAISE EXCEPTION 'session role unexpectedly reads sessions';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM count(*) FROM sabora.customer_profiles;
  RAISE EXCEPTION 'session role unexpectedly reads profiles';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE sabora.customer_sessions SET revoked_at=now();
  RAISE EXCEPTION 'session role unexpectedly updates sessions';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
ROLLBACK;
