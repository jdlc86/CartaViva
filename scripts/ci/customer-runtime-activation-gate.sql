-- CI-only, disposable PostgreSQL 17 activation boundary.
-- Read-only catalog may be exposed through an explicitly scoped role;
-- the economic writer and customer login identities remain unprovisioned.
-- This is NOT a provisioning script and does not modify operational grants.
BEGIN;
DO $gate$
DECLARE
 login_name text;
 role_name text;
BEGIN
 FOREACH login_name IN ARRAY ARRAY['sabora_catalog_login','sabora_order_login'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=login_name) THEN
   RAISE EXCEPTION 'unapproved customer runtime login exists: %',login_name;
  END IF;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM pg_roles
   WHERE rolname='sabora_catalog_reader' AND NOT rolcanlogin
     AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb
     AND NOT rolcreaterole AND NOT rolreplication AND NOT rolinherit) THEN
  RAISE EXCEPTION 'catalog reader role attributes unsafe';
 END IF;
 IF EXISTS (
  SELECT 1 FROM pg_auth_members m
  JOIN pg_roles parent ON parent.oid=m.roleid
  JOIN pg_roles child ON child.oid=m.member
  WHERE parent.rolname='sabora_catalog_reader'
    AND child.rolname IN ('anon','authenticated','sabora_admin_writer',
                         'sabora_staff_reader','sabora_admin_tables_reader')
 ) THEN
  RAISE EXCEPTION 'catalog reader membership leaked';
 END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','sabora_catalog_reader'] LOOP
  IF has_table_privilege(role_name,'sabora.orders','INSERT,UPDATE,DELETE')
     OR has_table_privilege(role_name,'sabora.catalog_confirmation_attempts',
                            'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege(role_name,'sabora.catalog_displayed_quotes',
                            'SELECT,INSERT,UPDATE,DELETE') THEN
   RAISE EXCEPTION 'unapproved economic write privilege: %',role_name;
  END IF;
 END LOOP;
END
$gate$;
ROLLBACK;
