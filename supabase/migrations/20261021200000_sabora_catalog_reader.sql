-- Minimal published-catalog reader. No draft or admin-table access.
-- Candidate migration: not applied to operational Supabase.
BEGIN;

-- CV-005: existing sealed function owners are scoped to this transaction
-- before CREATE OR REPLACE or cross-owner ACL; no runtime LOGIN is granted.
DO $cv005_early_owner_scope$
DECLARE roleinfo record;
BEGIN
 FOR roleinfo IN
  SELECT DISTINCT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,
    r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication
  FROM pg_catalog.pg_roles r
  WHERE left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner'
   AND r.rolname<>current_user::text
   AND (EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n
     ON n.oid=p.pronamespace WHERE p.proowner=r.oid AND n.nspname='sabora')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n
     ON n.oid=c.relnamespace WHERE c.relowner=r.oid AND n.nspname='sabora'))
 LOOP
  IF roleinfo.rolcanlogin OR roleinfo.rolinherit OR roleinfo.rolsuper
    OR roleinfo.rolbypassrls OR roleinfo.rolcreaterole
    OR roleinfo.rolcreatedb OR roleinfo.rolreplication THEN
    RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner' USING errcode='0P000';
  END IF;
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',roleinfo.rolname);
 END LOOP;
END;
$cv005_early_owner_scope$;


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


-- CV-005: revoke every DBA-issued membership on Sabora function owners.
DO $cv005_early_owner_release$
DECLARE role_name name;
BEGIN
 FOR role_name IN
  SELECT DISTINCT r.rolname FROM pg_catalog.pg_auth_members m
  JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
   AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
   AND left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner'
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',role_name); END LOOP;
END;
$cv005_early_owner_release$;

COMMIT;
