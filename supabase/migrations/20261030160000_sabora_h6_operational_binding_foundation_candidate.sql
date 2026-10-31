-- Block B foundation: additive, candidate-only schema. No runtime cutover.
-- Normative: docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md
-- This migration does NOT implement transfer. The fail-closed H6 guard remains active.
BEGIN;

-- An economic account retains its original immutable table/visit columns.
-- Its current operational scope lives here, separately from historical orders.
CREATE TABLE sabora.customer_account_operational_bindings (
  account_id uuid PRIMARY KEY REFERENCES sabora.customer_accounts(id),
  table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
  session_id uuid NOT NULL,
  visit_key text NOT NULL CHECK (visit_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  binding_version bigint NOT NULL DEFAULT 1 CHECK (binding_version > 0),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (table_id,session_id,visit_key,account_id)
);

-- Each round's delivery destination is independent from the historical order.
-- Future transfer logic must update this only for nonterminal deliveries.
CREATE TABLE sabora.order_round_delivery_destinations (
  round_id uuid PRIMARY KEY REFERENCES sabora.order_rounds(id),
  account_id uuid NOT NULL REFERENCES sabora.customer_accounts(id),
  table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
  session_id uuid NOT NULL,
  visit_key text NOT NULL CHECK (visit_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  destination_version bigint NOT NULL DEFAULT 1 CHECK (destination_version > 0),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (round_id,account_id)
);
CREATE INDEX order_round_delivery_by_table
  ON sabora.order_round_delivery_destinations(table_id,session_id);

-- Existing accounts and rounds are migrated without altering original orders,
-- economic identity, balances, payment attempts or dispatch records.
INSERT INTO sabora.customer_account_operational_bindings
  (account_id,table_id,session_id,visit_key)
SELECT id,table_id,session_id,visit_key FROM sabora.customer_accounts;

INSERT INTO sabora.order_round_delivery_destinations
  (round_id,account_id,table_id,session_id,visit_key)
SELECT r.id,r.account_id,o.table_id,o.session_id,o.customer_visit_key
FROM sabora.order_rounds r
JOIN sabora.orders o ON o.id=r.order_id;

-- Abort rather than silently accept an incomplete migration.
DO $validate$
BEGIN
 IF (SELECT count(*) FROM sabora.customer_account_operational_bindings)
    <> (SELECT count(*) FROM sabora.customer_accounts) THEN
   RAISE EXCEPTION 'account_binding_backfill_incomplete';
 END IF;
 IF (SELECT count(*) FROM sabora.order_round_delivery_destinations)
    <> (SELECT count(*) FROM sabora.order_rounds) THEN
   RAISE EXCEPTION 'round_delivery_backfill_incomplete';
 END IF;
END;
$validate$;

ALTER TABLE sabora.customer_account_operational_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.customer_account_operational_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.order_round_delivery_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.order_round_delivery_destinations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.customer_account_operational_bindings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON sabora.order_round_delivery_destinations FROM PUBLIC,anon,authenticated;
-- No direct runtime grants. Only audited SECURITY DEFINER functions may mutate.
COMMIT;
