-- Candidate-only F12 pending reader capability. No login, membership or API cutover.
-- This separate role may execute exactly one function, never staff decisions.
BEGIN;
CREATE ROLE sabora_f12_pending_reader_runtime NOLOGIN NOINHERIT
 NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA sabora TO sabora_f12_pending_reader_runtime;
GRANT EXECUTE ON FUNCTION sabora.list_pending_table_changes_h6_candidate(uuid)
 TO sabora_f12_pending_reader_runtime;

-- The function owner is not BYPASSRLS. Explicit, column-limited reads
-- and policies are required for FORCE RLS relations; no runtime table grants.
GRANT SELECT(user_id,role,state) ON sabora.staff_members TO sabora_h6_fn_owner;
GRANT SELECT(id,account_id,source_table_id,status,expires_at,created_at)
 ON sabora.customer_table_change_requests TO sabora_h6_fn_owner;
GRANT SELECT(id,number) ON sabora.dining_tables TO sabora_h6_fn_owner;
GRANT SELECT(id,state) ON sabora.customer_accounts TO sabora_h6_fn_owner;
CREATE POLICY sabora_h6_pending_owner_staff_read ON sabora.staff_members
 FOR SELECT TO sabora_h6_fn_owner USING (true);
CREATE POLICY sabora_h6_pending_owner_tables_read ON sabora.dining_tables
 FOR SELECT TO sabora_h6_fn_owner USING (true);
CREATE POLICY sabora_h6_pending_owner_accounts_read ON sabora.customer_accounts
 FOR SELECT TO sabora_h6_fn_owner USING (true);
-- Existing h6_owner_table_change_select policy supplies request read access.
-- This migration deliberately does not grant SET ROLE to any login.
COMMIT;
