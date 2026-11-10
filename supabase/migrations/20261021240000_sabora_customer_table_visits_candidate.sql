-- Candidate visit-scoped ordering grants. Not an operational authorization path.
-- A QR scan may establish a grant only after independent backend identity
-- verification. Re-scan renews the grant; an order does not extend expiry.
BEGIN;
CREATE TABLE sabora.customer_table_visits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
 session_id uuid NOT NULL,
 customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 visit_key text NOT NULL CHECK (visit_key ~ '^[A-Za-z0-9_-]{1,128}$'),
 actor_id text NOT NULL CHECK (actor_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 authorized_qr_version integer NOT NULL CHECK (authorized_qr_version>0),
 granted_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT customer_table_visit_lifetime CHECK (expires_at>granted_at),
 CONSTRAINT customer_table_visit_revocation CHECK (revoked_at IS NULL OR revoked_at>=granted_at),
 CONSTRAINT customer_table_visit_unique_scope UNIQUE
  (table_id,session_id,visit_key,actor_id),
 CONSTRAINT customer_table_visit_identity_scope UNIQUE
  (table_id,session_id,visit_key,actor_id,customer_id)
);
CREATE INDEX customer_table_visit_customer_idx
 ON sabora.customer_table_visits(customer_id,expires_at DESC);
CREATE INDEX customer_table_visit_table_idx
 ON sabora.customer_table_visits(table_id,session_id,expires_at DESC);
ALTER TABLE sabora.customer_table_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.customer_table_visits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.customer_table_visits
 FROM PUBLIC,anon,authenticated,sabora_admin_writer;
COMMENT ON TABLE sabora.customer_table_visits IS
 'Candidate durable visit identity binding; no creation or renewal writer installed';
COMMIT;
