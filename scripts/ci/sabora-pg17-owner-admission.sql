-- CV-005 first-install admission; read-only, no secrets or external endpoints.
-- A PREFLIGHT_ONLY result is not permission for a deployment.
-- Option A admits only the observed managed DBA profile. Runtime identities
-- and partial/previous Sabora installations remain fail-closed.
SELECT CASE
 WHEN current_setting('server_version_num')::int / 10000 <> 17
   THEN 'NO_GO:postgres_17_required'
 WHEN to_regnamespace('sabora') IS NOT NULL
   OR to_regnamespace('sabora_migration_meta') IS NOT NULL
   OR to_regclass('sabora_migration_meta.applied_migrations') IS NOT NULL
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname LIKE 'sabora\_%' ESCAPE '\')
   THEN 'NO_GO:first_install_state_not_clean'
 WHEN NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles
  WHERE rolname=current_user::text
    AND rolcanlogin AND rolcreaterole AND rolbypassrls AND NOT rolsuper
 ) THEN 'NO_GO:option_a_dba_attributes_required'
 ELSE 'PREFLIGHT_ONLY:option_a_managed_dba_candidate'
END AS sabora_owner_admission;
