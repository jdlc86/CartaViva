-- B2 candidate requires only the existing order identifier column for ownership check.
-- Do not grant table-wide privileges or runtime EXECUTE.
BEGIN;
GRANT SELECT(customer_identifier) ON sabora.orders TO sabora_h6_fn_owner;
COMMIT;
