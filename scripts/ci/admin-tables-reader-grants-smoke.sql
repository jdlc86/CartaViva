-- Disposable PostgreSQL 17 only. Verify effective read and negative grants.
BEGIN;
DO $gate$
DECLARE
 role_name text := 'sabora_admin_tables_reader';
 col text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name
  AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolsuper
  AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit)
 THEN RAISE EXCEPTION 'admin tables reader role unsafe'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles child ON child.oid=m.member
  JOIN pg_roles parent ON parent.oid=m.roleid WHERE child.rolname=role_name)
 THEN RAISE EXCEPTION 'admin tables reader unexpectedly inherits a role'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid
  JOIN pg_roles child ON child.oid=m.member WHERE parent.rolname=role_name
  AND child.rolname IN ('anon','authenticated','sabora_catalog_reader'))
 THEN RAISE EXCEPTION 'admin tables reader membership leaked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='sabora.dining_tables'::regclass
  AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'admin tables require FORCE RLS'; END IF;
 FOREACH col IN ARRAY ARRAY['id','number','capacity','description','ordering_state'] LOOP
  IF NOT has_column_privilege(role_name,'sabora.dining_tables',col,'SELECT')
  THEN RAISE EXCEPTION 'missing permitted table column %',col; END IF;
 END LOOP;
 FOREACH col IN ARRAY ARRAY['qr_token_hash','pause_until','ordering_state_changed_at'] LOOP
  IF has_column_privilege(role_name,'sabora.dining_tables',col,'SELECT')
  THEN RAISE EXCEPTION 'sensitive table column leaked %',col; END IF;
 END LOOP;
 IF has_table_privilege(role_name,'sabora.dining_tables','INSERT')
  OR has_table_privilege(role_name,'sabora.dining_tables','UPDATE')
  OR has_table_privilege(role_name,'sabora.dining_tables','DELETE')
  OR has_table_privilege(role_name,'sabora.dining_tables','TRUNCATE')
  OR has_table_privilege(role_name,'sabora.catalog_items','SELECT')
  OR has_table_privilege(role_name,'sabora.staff_members','SELECT')
 THEN RAISE EXCEPTION 'admin tables reader privilege escalation'; END IF;
 IF has_column_privilege('anon','sabora.dining_tables','qr_token_hash','SELECT')
  OR has_column_privilege('authenticated','sabora.dining_tables','qr_token_hash','SELECT')
 THEN RAISE EXCEPTION 'QR hash exposed to browser roles'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies
  WHERE schemaname='sabora' AND tablename='dining_tables'
   AND policyname='admin_tables_reader_select_candidate'
   AND cmd='SELECT' AND 'sabora_admin_tables_reader'=ANY(roles))
 THEN RAISE EXCEPTION 'admin tables reader RLS policy missing'; END IF;
END $gate$;
ROLLBACK;
