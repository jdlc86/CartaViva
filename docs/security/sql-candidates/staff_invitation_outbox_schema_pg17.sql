-- Design-only candidate for disposable PostgreSQL 17 verification.
-- NOT a production migration. No secret material, LOGIN or runtime grants.
-- This schema alone does not implement delivery, encryption, or concurrency
-- guarantees between a remote provider and a revocation transaction.
BEGIN;

CREATE TABLE sabora.staff_invitation_outbox (
  id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL
    REFERENCES sabora.staff_enrollments(id) ON DELETE RESTRICT,
  invite_version integer NOT NULL CHECK (invite_version > 0),
  invite_token_hash bytea NOT NULL CHECK (octet_length(invite_token_hash) = 32),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'claimed', 'dispatching', 'delivered', 'cancelled', 'failed')),
  fence uuid,
  claimed_at timestamptz,
  dispatch_authorized_at timestamptz,
  provider_outcome text CHECK (provider_outcome IN
    ('accepted', 'permanent_failure', 'unknown')),
  delivered_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT staff_invitation_outbox_claim_shape CHECK (
    (state = 'pending' AND fence IS NULL AND claimed_at IS NULL)
    OR (state IN ('claimed', 'dispatching', 'delivered', 'failed') AND fence IS NOT NULL
        AND claimed_at IS NOT NULL)
    OR (state = 'cancelled' AND (
      (fence IS NULL AND claimed_at IS NULL)
      OR (fence IS NOT NULL AND claimed_at IS NOT NULL)
    ))
  ),
  CONSTRAINT staff_invitation_outbox_dispatch_shape CHECK (
    (state IN ('dispatching', 'delivered', 'failed') AND dispatch_authorized_at IS NOT NULL)
    OR (state NOT IN ('dispatching', 'delivered', 'failed') AND dispatch_authorized_at IS NULL)
  ),
  CONSTRAINT staff_invitation_outbox_outcome_shape CHECK (
    (state = 'delivered' AND provider_outcome IS NOT NULL AND provider_outcome = 'accepted')
    OR (state = 'failed' AND provider_outcome IS NOT NULL AND provider_outcome IN ('permanent_failure', 'unknown'))
    OR (state NOT IN ('delivered', 'failed') AND provider_outcome IS NULL)
  ),
  CONSTRAINT staff_invitation_outbox_delivery_shape CHECK (
    (state = 'delivered' AND delivered_at IS NOT NULL)
    OR (state <> 'delivered' AND delivered_at IS NULL)
  ),
  CONSTRAINT staff_invitation_outbox_attempt_shape CHECK (
    (state IN ('pending', 'claimed', 'cancelled') AND attempts = 0)
    OR (state IN ('dispatching', 'delivered', 'failed') AND attempts >= 1)
  ),
  CONSTRAINT staff_invitation_outbox_timestamp_order CHECK (
    updated_at >= created_at
    AND (claimed_at IS NULL OR claimed_at >= created_at)
    AND (claimed_at IS NULL OR updated_at >= claimed_at)
    AND (dispatch_authorized_at IS NULL OR
      (claimed_at IS NOT NULL AND dispatch_authorized_at >= claimed_at))
    AND (dispatch_authorized_at IS NULL OR updated_at >= dispatch_authorized_at)
    AND (delivered_at IS NULL OR
      (dispatch_authorized_at IS NOT NULL AND delivered_at >= dispatch_authorized_at))
    AND (delivered_at IS NULL OR updated_at >= delivered_at)
  )
);

CREATE UNIQUE INDEX staff_invitation_outbox_enrollment_version_unique
  ON sabora.staff_invitation_outbox(enrollment_id, invite_version);
CREATE INDEX staff_invitation_outbox_pending_idx
  ON sabora.staff_invitation_outbox(created_at, id)
  WHERE state = 'pending';

ALTER TABLE sabora.staff_invitation_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_invitation_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.staff_invitation_outbox FROM PUBLIC;
-- Intentionally no policies and no grants: even the candidate worker cannot
-- use the table until a separately reviewed role and SQL policy exist.

COMMIT;
