-- Candidate-only foundation for table-change lifecycle. No runtime grants or deployment.
-- Normative source: docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md
BEGIN;

ALTER TABLE sabora.restaurant_settings
 ADD COLUMN IF NOT EXISTS table_change_response_seconds integer NOT NULL DEFAULT 90
 CHECK (table_change_response_seconds BETWEEN 1 AND 600);

CREATE TABLE sabora.customer_table_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES sabora.customer_accounts(id),
 customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 visit_key text NOT NULL CHECK (visit_key ~ '^[A-Za-z0-9_-]{16,128}$'),
 source_table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
 status text NOT NULL DEFAULT 'pending'
   CHECK (status IN ('pending','approved','rejected','expired','consumed','revoked')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 decided_at timestamptz,
 decided_by uuid,
 destination_table_id uuid REFERENCES sabora.dining_tables(id),
 consumed_order_id uuid REFERENCES sabora.orders(id),
 consumed_at timestamptz,
 revoked_at timestamptz,
 CHECK (expires_at > created_at),
 CHECK (destination_table_id IS NULL OR destination_table_id <> source_table_id),
 CHECK ((status='consumed') = (destination_table_id IS NOT NULL AND consumed_order_id IS NOT NULL AND consumed_at IS NOT NULL)),
 CHECK ((status IN ('approved','rejected','consumed')) = (decided_at IS NOT NULL AND decided_by IS NOT NULL)),
 CHECK (status <> 'approved' OR (destination_table_id IS NULL AND consumed_order_id IS NULL)),
 CHECK (status <> 'rejected' OR (destination_table_id IS NULL AND consumed_order_id IS NULL)),
 CHECK (status <> 'pending' OR (decided_at IS NULL AND decided_by IS NULL AND revoked_at IS NULL)),
 CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
 CHECK (status <> 'expired' OR (decided_at IS NULL AND decided_by IS NULL)),
 CHECK (status <> 'consumed' OR consumed_at >= decided_at),
 CHECK (status <> 'revoked' OR (destination_table_id IS NULL AND consumed_order_id IS NULL)),
 CHECK (decided_at IS NULL OR decided_at >= created_at),
 CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

-- Prevent simultaneous pending requests and simultaneously active approvals.
-- The 90-second cooldown still requires a serialized account lock in the request function.
CREATE UNIQUE INDEX customer_table_change_one_pending
 ON sabora.customer_table_change_requests(account_id)
 WHERE status='pending';
-- Expiration is a persisted transition, not merely a read-time display state.
-- The request transaction must lock the account, expire old pending rows and
-- check cooldown before inserting a replacement.

-- Only one live approval per account; the cooldown is separately enforced
-- against the latest request while holding the account row lock.
CREATE UNIQUE INDEX customer_table_change_one_approval
 ON sabora.customer_table_change_requests(account_id)
 WHERE status='approved';
-- One confirmed order may consume at most one table-change grant.
CREATE UNIQUE INDEX customer_table_change_one_grant_per_order
 ON sabora.customer_table_change_requests(consumed_order_id)
 WHERE consumed_order_id IS NOT NULL;
CREATE INDEX customer_table_change_account_history
 ON sabora.customer_table_change_requests(account_id,created_at DESC,id DESC);
CREATE INDEX customer_table_change_pending_deadline
 ON sabora.customer_table_change_requests(expires_at)
 WHERE status='pending';

-- Audit columns are immutable to runtime callers except via narrowly scoped
-- transaction functions; no generic UPDATE grant is provided.
ALTER TABLE sabora.customer_table_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.customer_table_change_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.customer_table_change_requests FROM PUBLIC,anon,authenticated;
-- No direct policy or grants: subsequent SECURITY DEFINER functions must
-- verify customer/staff identities and acquire account/request row locks.
COMMIT;
