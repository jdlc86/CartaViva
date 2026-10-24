-- Candidate read-only administrative tables projection.
-- Never apply to operational Supabase without a separate reviewed activation.
-- The role has no LOGIN and no runtime role membership.
BEGIN;
CREATE ROLE sabora_admin_tables_reader NOLOGIN NOBYPASSRLS NOSUPERUSER
 NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA sabora TO sabora_admin_tables_reader;
GRANT SELECT (id,number,capacity,description,ordering_state)
 ON sabora.dining_tables TO sabora_admin_tables_reader;
CREATE POLICY admin_tables_reader_select_candidate ON sabora.dining_tables
 FOR SELECT TO sabora_admin_tables_reader USING (true);
COMMIT;
