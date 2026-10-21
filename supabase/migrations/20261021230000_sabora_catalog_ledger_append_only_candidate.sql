-- Candidate append-only protection for the two private economic ledgers.
-- No grants, no runtime writer, no HTTP activation. Applied only in isolated CI.
BEGIN;
CREATE FUNCTION sabora.reject_catalog_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, sabora
AS $body$
BEGIN
 RAISE EXCEPTION 'catalog_ledger_append_only'
  USING ERRCODE = '23514';
END
$body$;
REVOKE ALL ON FUNCTION sabora.reject_catalog_ledger_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER catalog_displayed_quotes_append_only
 BEFORE UPDATE OR DELETE ON sabora.catalog_displayed_quotes
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_catalog_ledger_mutation();
CREATE TRIGGER catalog_confirmation_attempts_append_only
 BEFORE UPDATE OR DELETE ON sabora.catalog_confirmation_attempts
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_catalog_ledger_mutation();
-- TRUNCATE does not fire row-level DELETE triggers. Protect this path too.
CREATE TRIGGER catalog_displayed_quotes_no_truncate
 BEFORE TRUNCATE ON sabora.catalog_displayed_quotes
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_catalog_ledger_mutation();
CREATE TRIGGER catalog_confirmation_attempts_no_truncate
 BEFORE TRUNCATE ON sabora.catalog_confirmation_attempts
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_catalog_ledger_mutation();
COMMIT;
