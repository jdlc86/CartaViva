-- Minimal published-catalog reader. No draft or admin-table access.
-- Candidate migration: not applied to operational Supabase.
BEGIN;
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
ALTER FUNCTION sabora.read_published_catalog() OWNER TO sabora_catalog_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_published_catalog()
 FROM PUBLIC, anon, authenticated, sabora_admin_writer, sabora_customer_session_runtime;
GRANT USAGE ON SCHEMA sabora TO sabora_catalog_reader;
GRANT EXECUTE ON FUNCTION sabora.read_published_catalog() TO sabora_catalog_reader;
-- No login or role membership is provided. A reviewed API connection is required.
COMMIT;
