-- Candidate trusted displayed quote and explicit acceptance ledger.
-- Isolated schema only; NO runtime grants, policies, writers or HTTP routes.
-- Applying this migration in disposable CI does not activate orders.
BEGIN;
CREATE TABLE sabora.catalog_displayed_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
 session_id uuid NOT NULL,
 visit_id text NOT NULL CHECK (length(visit_id) BETWEEN 1 AND 128 AND visit_id ~ '^[A-Za-z0-9_-]+$'),
 basket_id text NOT NULL CHECK (length(basket_id) BETWEEN 1 AND 128 AND basket_id ~ '^[A-Za-z0-9_-]+$'),
 actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128 AND actor_id ~ '^[A-Za-z0-9_-]+$'),
 item_id uuid NOT NULL REFERENCES sabora.catalog_items(id),
 published_revision bigint NOT NULL CHECK (published_revision > 0),
 subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
 discount_cents bigint NOT NULL CHECK (discount_cents >= 0),
 total_cents bigint NOT NULL CHECK (total_cents >= 0),
 evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 CONSTRAINT catalog_displayed_quote_amounts CHECK (
  discount_cents <= subtotal_cents AND total_cents = subtotal_cents - discount_cents
 ),
 CONSTRAINT catalog_displayed_quote_lifetime CHECK (
  expires_at > created_at AND expires_at <= created_at + interval '30 minutes'
 ),
 UNIQUE (table_id,session_id,visit_id,basket_id,actor_id,item_id,id)
);
CREATE INDEX catalog_displayed_quote_lookup ON sabora.catalog_displayed_quotes
 (table_id,session_id,visit_id,basket_id,actor_id,item_id,created_at DESC);

CREATE TABLE sabora.catalog_confirmation_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
 session_id uuid NOT NULL,
 visit_id text NOT NULL CHECK (length(visit_id) BETWEEN 1 AND 128 AND visit_id ~ '^[A-Za-z0-9_-]+$'),
 basket_id text NOT NULL CHECK (length(basket_id) BETWEEN 1 AND 128 AND basket_id ~ '^[A-Za-z0-9_-]+$'),
 actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128 AND actor_id ~ '^[A-Za-z0-9_-]+$'),
 item_id uuid NOT NULL REFERENCES sabora.catalog_items(id),
 request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{8,128}
 request_fingerprint text NOT NULL CHECK (length(request_fingerprint) BETWEEN 1 AND 16384),
 quote_id uuid NOT NULL REFERENCES sabora.catalog_displayed_quotes(id),
 accepted_reprice boolean NOT NULL DEFAULT false,
 accepted_at timestamptz,
 economic_evidence jsonb NOT NULL CHECK (jsonb_typeof(economic_evidence) = 'object'),
 order_id uuid NOT NULL REFERENCES sabora.orders(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT catalog_confirmation_acceptance_consistency CHECK (
  (accepted_reprice AND accepted_at IS NOT NULL)
  OR (NOT accepted_reprice AND accepted_at IS NULL)
 ),
 CONSTRAINT catalog_confirmation_idempotency UNIQUE
  (table_id,session_id,visit_id,basket_id,actor_id,request_key),
 CONSTRAINT catalog_confirmation_order_once UNIQUE (order_id),
 CONSTRAINT catalog_confirmation_order_scope FOREIGN KEY (table_id,session_id,order_id)
  REFERENCES sabora.orders (table_id,session_id,id),
 CONSTRAINT catalog_confirmation_quote_scope FOREIGN KEY
  (table_id,session_id,visit_id,basket_id,actor_id,item_id,quote_id)
  REFERENCES sabora.catalog_displayed_quotes
  (table_id,session_id,visit_id,basket_id,actor_id,item_id,id)
);
-- No UPDATE or DELETE policies: evidence and acceptance remain append-only.
ALTER TABLE sabora.catalog_displayed_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.catalog_displayed_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.catalog_confirmation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.catalog_confirmation_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.catalog_displayed_quotes,sabora.catalog_confirmation_attempts
 FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE sabora.catalog_displayed_quotes IS
 'Candidate server-issued displayed quote, not a browser-authoritative price; writer capability not installed';
COMMENT ON TABLE sabora.catalog_confirmation_attempts IS
 'Candidate append-only confirmation and idempotency evidence; no runtime writer grant';
COMMIT;
),
 request_fingerprint text NOT NULL CHECK (length(request_fingerprint) BETWEEN 1 AND 16384),
 quote_id uuid NOT NULL REFERENCES sabora.catalog_displayed_quotes(id),
 accepted_reprice boolean NOT NULL DEFAULT false,
 accepted_at timestamptz,
 economic_evidence jsonb NOT NULL CHECK (jsonb_typeof(economic_evidence) = 'object'),
 order_id uuid NOT NULL REFERENCES sabora.orders(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT catalog_confirmation_acceptance_consistency CHECK (
  (accepted_reprice AND accepted_at IS NOT NULL)
  OR (NOT accepted_reprice AND accepted_at IS NULL)
 ),
 CONSTRAINT catalog_confirmation_idempotency UNIQUE
  (table_id,session_id,visit_id,basket_id,actor_id,request_key),
 CONSTRAINT catalog_confirmation_order_once UNIQUE (order_id),
 CONSTRAINT catalog_confirmation_quote_scope FOREIGN KEY
  (table_id,session_id,visit_id,basket_id,actor_id,quote_id)
  REFERENCES sabora.catalog_displayed_quotes
  (table_id,session_id,visit_id,basket_id,actor_id,id)
);
-- No UPDATE or DELETE policies: evidence and acceptance remain append-only.
ALTER TABLE sabora.catalog_displayed_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.catalog_displayed_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.catalog_confirmation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.catalog_confirmation_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.catalog_displayed_quotes,sabora.catalog_confirmation_attempts
 FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE sabora.catalog_displayed_quotes IS
 'Candidate server-issued displayed quote, not a browser-authoritative price; writer capability not installed';
COMMENT ON TABLE sabora.catalog_confirmation_attempts IS
 'Candidate append-only confirmation and idempotency evidence; no runtime writer grant';
COMMIT;
