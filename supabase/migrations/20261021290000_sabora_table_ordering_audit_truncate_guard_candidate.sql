-- Candidate audit ledger hardening: TRUNCATE must not bypass row-level
-- UPDATE/DELETE guards. No privileges are granted to runtime roles.
BEGIN;
CREATE TRIGGER table_ordering_audit_candidate_no_truncate
BEFORE TRUNCATE ON sabora.table_ordering_audit_candidate
FOR EACH STATEMENT
EXECUTE FUNCTION sabora.reject_table_ordering_audit_mutation_candidate();
COMMIT;
