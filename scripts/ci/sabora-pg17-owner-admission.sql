-- CV-005 first-install admission; read-only, no secrets or external endpoints.
-- A PREFLIGHT_ONLY result is not permission for a deployment.
-- The normative zero-membership sealed-owner contract cannot be
-- installed by a PostgreSQL 17 non-superuser CREATEROLE account.
SELECT CASE
 WHEN current_setting('server_version_num')::int / 10000 <> 17
   THEN 'NO_GO:postgres_17_required'
 WHEN to_regnamespace('sabora') IS NOT NULL
   OR to_regclass('public.sabora_migration_meta') IS NOT NULL
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname LIKE 'sabora\_%' ESCAPE '\')
   THEN 'NO_GO:first_install_state_not_clean'
 WHEN (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) IS NOT TRUE
   THEN 'NO_GO:sealed_owner_privileged_provider_required'
 ELSE 'PREFLIGHT_ONLY:privileged_executor_not_approval'
END AS sabora_owner_admission;
