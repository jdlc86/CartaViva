-- Candidate compatibility bridge for catalog-backed orders.
-- NO runtime grants, policies, endpoint, writer or production deployment.
-- Existing legacy orders and the kitchen line trigger remain intact.
BEGIN;

ALTER TABLE sabora.orders
  ADD COLUMN customer_alias text,
  ADD COLUMN customer_identifier text,
  ADD COLUMN customer_visit_key text,
  ADD COLUMN economic_snapshot jsonb;

-- Legacy company and employee number must not be fabricated for the new
-- customer identity. Existing non-null values are preserved without rewrite.
ALTER TABLE sabora.orders
  ALTER COLUMN company DROP NOT NULL,
  ALTER COLUMN employee_number DROP NOT NULL;

-- New identity must be complete, while historical rows retain the legacy pair.
ALTER TABLE sabora.orders
  ADD CONSTRAINT sabora_order_identity_mode CHECK (
    (
      company IS NOT NULL AND employee_number IS NOT NULL
      AND customer_alias IS NULL AND customer_identifier IS NULL
      AND customer_visit_key IS NULL AND economic_snapshot IS NULL
    )
    OR
    (
      company IS NULL AND employee_number IS NULL
      AND customer_alias IS NOT NULL AND customer_identifier IS NOT NULL
      AND customer_visit_key IS NOT NULL AND economic_snapshot IS NOT NULL
    )
  ),
  ADD CONSTRAINT sabora_order_customer_alias_valid CHECK (
    customer_alias IS NULL OR length(btrim(customer_alias)) BETWEEN 1 AND 160
  ),
  ADD CONSTRAINT sabora_order_customer_identifier_valid CHECK (
    customer_identifier IS NULL OR
    length(btrim(customer_identifier)) BETWEEN 1 AND 80
  ),
  ADD CONSTRAINT sabora_order_customer_visit_key_valid CHECK (
    customer_visit_key IS NULL OR
    (length(customer_visit_key) BETWEEN 1 AND 128
      AND customer_visit_key ~ '^[A-Za-z0-9_-]+$')
  ),
  ADD CONSTRAINT sabora_order_economic_snapshot_valid CHECK (
    economic_snapshot IS NULL OR
    (jsonb_typeof(economic_snapshot) = 'object'
      AND economic_snapshot->>'schemaVersion' = '1')
  );

COMMENT ON COLUMN sabora.orders.economic_snapshot IS
  'Candidate immutable catalog-derived economic evidence; not an operational payment record';
COMMENT ON COLUMN sabora.orders.customer_visit_key IS
  'Candidate scoped customer visit identifier; authorization requires independent locked DB checks';

-- Preserve FORCE RLS and deny all client/runtime grants.
REVOKE ALL ON sabora.orders FROM PUBLIC, anon, authenticated;
COMMIT;
