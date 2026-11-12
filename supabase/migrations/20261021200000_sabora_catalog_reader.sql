-- Minimal published-catalog reader. No draft or admin-table access.
-- Candidate migration: not applied to operational Supabase.
BEGIN;

-- CV-005 OPTION A: existing Sabora function owners must be temporarily
-- visible to this DBA before CREATE OR REPLACE or legacy cross-owner ACL.
-- The only durable membership allowed remains bootstrap ADMIN/NOSET/NOINHERIT.
DO $cv005_existing_owner_access$
DECLARE owner_role name; role_info record;
BEGIN
 FOR role_info IN
  SELECT DISTINCT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,
   r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication
  FROM pg_catalog.pg_roles r
  WHERE r.rolname ~ '^sabora_[a-z0-9_]+_fn_owner$'
   AND r.rolname<>current_user::text
   AND (EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
     JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE p.proowner=r.oid AND n.nspname='sabora')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relowner=r.oid AND n.nspname='sabora'))
 LOOP
  IF role_info.rolcanlogin OR role_info.rolinherit OR role_info.rolsuper
    OR role_info.rolbypassrls OR role_info.rolcreaterole
    OR role_info.rolcreatedb OR role_info.rolreplication THEN
   RAISE EXCEPTION 'cv005_unsafe_preexisting_fn_owner' USING errcode='0P000';
  END IF;
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',role_info.rolname);
 END LOOP;
END;
$cv005_existing_owner_access$;

CREATE ROLE sabora_catalog_reader NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE sabora_catalog_fn_owner NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA sabora TO sabora_catalog_fn_owner;
GRANT SELECT (id,published_snapshot,published_revision,published_at,withdrawn_at,sold_out)
 ON sabora.catalog_items TO sabora_catalog_fn_owner;
CREATE POLICY catalog_fn_read_published ON sabora.catalog_items
 FOR SELECT TO sabora_catalog_fn_owner
 USING (published_snapshot IS NOT NULL AND withdrawn_at IS NULL);
CREATE FUNCTION sabora.read_published_catalog()
RETURNS TABLE(id uuid,published_snapshot jsonb,sold_out boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $read$
 SELECT c.id,c.published_snapshot,c.sold_out
 FROM sabora.catalog_items c
 WHERE c.published_snapshot IS NOT NULL AND c.withdrawn_at IS NULL
 ORDER BY c.published_at DESC,c.id
 LIMIT 500
$read$;
-- CV-005 CANDIDATE (not approved): migration-only capability, revoked before COMMIT.
GRANT CREATE ON SCHEMA sabora TO sabora_catalog_fn_owner;
GRANT sabora_catalog_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_published_catalog() OWNER TO sabora_catalog_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_published_catalog()
 FROM PUBLIC, anon, authenticated, sabora_admin_writer, sabora_customer_session_runtime;
GRANT USAGE ON SCHEMA sabora TO sabora_catalog_reader;
GRANT EXECUTE ON FUNCTION sabora.read_published_catalog() TO sabora_catalog_reader;
-- No login or role membership is provided. A reviewed API connection is required.
REVOKE sabora_catalog_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_catalog_fn_owner;

-- CV-005: no role access issued by this installer may survive COMMIT.
-- The PostgreSQL bootstrap superuser-issued ADMIN/SET FALSE/INHERIT FALSE row
-- is intentionally retained and checked by the PG17 provider harness.
DO $cv005_existing_owner_release$
DECLARE owner_role name;
BEGIN
 FOR owner_role IN
  SELECT DISTINCT roles.rolname FROM pg_catalog.pg_auth_members m
   JOIN pg_catalog.pg_roles roles ON roles.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
   AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
   AND roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner$'
 LOOP
  EXECUTE format('REVOKE %I FROM CURRENT_USER',owner_role);
 END LOOP;
END;
$cv005_existing_owner_release$;

COMMIT;
