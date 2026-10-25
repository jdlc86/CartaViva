-- Design-only candidate for disposable PostgreSQL 17 verification.
-- NOT a production migration. No secret material, LOGIN or runtime grants.
-- This schema alone does not implement delivery, encryption, or concurrency
-- guarantees between a remote provider and a revocation transaction.
BEGIN;

DO $role$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname = 'sabora_staff_invitation_enqueue_fn_owner'
  ) THEN
    CREATE ROLE sabora_staff_invitation_enqueue_fn_owner
      NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles role
     WHERE role.rolname = 'sabora_staff_invitation_enqueue_fn_owner'
       AND (role.rolcanlogin OR role.rolinherit OR role.rolsuper
         OR role.rolbypassrls OR role.rolcreatedb OR role.rolcreaterole
         OR role.rolreplication)
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_staff_invitation_enqueue_fn_owner'
      USING errcode = '0P000';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
      JOIN pg_catalog.pg_roles member ON member.oid = membership.member
     WHERE granted.rolname = 'sabora_staff_invitation_enqueue_fn_owner'
        OR member.rolname = 'sabora_staff_invitation_enqueue_fn_owner'
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_staff_invitation_enqueue_fn_owner_membership'
      USING errcode = '0P000';
  END IF;
END;
$role$;

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

REVOKE ALL ON SCHEMA sabora FROM sabora_staff_invitation_enqueue_fn_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA sabora
  FROM sabora_staff_invitation_enqueue_fn_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sabora
  FROM sabora_staff_invitation_enqueue_fn_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora
  FROM sabora_staff_invitation_enqueue_fn_owner;
GRANT USAGE ON SCHEMA sabora TO sabora_staff_invitation_enqueue_fn_owner;
GRANT SELECT (id,enrollment_id,invite_version,invite_token_hash,state),
      INSERT (id,enrollment_id,invite_version,invite_token_hash),
      UPDATE (state,updated_at)
  ON sabora.staff_invitation_outbox
  TO sabora_staff_invitation_enqueue_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_authorized_candidate(
  text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text
) TO sabora_staff_invitation_enqueue_fn_owner;

CREATE POLICY staff_invitation_enqueue_owner_select
  ON sabora.staff_invitation_outbox FOR SELECT
  TO sabora_staff_invitation_enqueue_fn_owner USING (true);
CREATE POLICY staff_invitation_enqueue_owner_insert
  ON sabora.staff_invitation_outbox FOR INSERT
  TO sabora_staff_invitation_enqueue_fn_owner
  WITH CHECK (
    state = 'pending' AND fence IS NULL AND claimed_at IS NULL
    AND dispatch_authorized_at IS NULL AND provider_outcome IS NULL
    AND delivered_at IS NULL AND attempts = 0
  );
CREATE POLICY staff_invitation_enqueue_owner_cancel
  ON sabora.staff_invitation_outbox FOR UPDATE
  TO sabora_staff_invitation_enqueue_fn_owner
  USING (state IN ('pending','claimed'))
  WITH CHECK (
    state = 'cancelled' AND dispatch_authorized_at IS NULL
    AND provider_outcome IS NULL AND delivered_at IS NULL AND attempts = 0
  );

CREATE FUNCTION sabora.transition_staff_lifecycle_with_outbox_candidate(
  p_key_id text,
  p_database_role text,
  p_actor_user_id uuid,
  p_action text,
  p_enrollment_id uuid,
  p_subject_user_id uuid,
  p_requested_role text,
  p_invitee_email_hash_hex text,
  p_invite_token_hash_hex text,
  p_credential_evidence_hash_hex text,
  p_reason text,
  p_correlation_id text,
  p_issued_at_ms bigint,
  p_expires_at_ms bigint,
  p_signature_hex text
)
RETURNS TABLE (
  result_enrollment_id uuid,
  result_subject_user_id uuid,
  result_requested_role text,
  previous_state text,
  current_state text,
  repeated boolean,
  result_invite_version integer,
  event_id uuid,
  outbox_job_id uuid,
  outbox_enqueued boolean,
  outbox_cancelled_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $staff_lifecycle_outbox$
DECLARE
  v_transition record;
BEGIN
  SELECT transition.* INTO STRICT v_transition
    FROM sabora.transition_staff_lifecycle_authorized_candidate(
      p_key_id,p_database_role,p_actor_user_id,p_action,p_enrollment_id,
      p_subject_user_id,p_requested_role,p_invitee_email_hash_hex,
      p_invite_token_hash_hex,p_credential_evidence_hash_hex,p_reason,
      p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex
    ) transition;

  result_enrollment_id := v_transition.result_enrollment_id;
  result_subject_user_id := v_transition.result_subject_user_id;
  result_requested_role := v_transition.result_requested_role;
  previous_state := v_transition.previous_state;
  current_state := v_transition.current_state;
  repeated := v_transition.repeated;
  result_invite_version := v_transition.result_invite_version;
  event_id := v_transition.event_id;
  outbox_job_id := NULL;
  outbox_enqueued := false;
  outbox_cancelled_count := 0;

  IF NOT repeated AND p_action = 'resend' THEN
    UPDATE sabora.staff_invitation_outbox delivery
       SET state = 'cancelled', updated_at = clock_timestamp()
     WHERE delivery.enrollment_id = result_enrollment_id
       AND delivery.state IN ('pending','claimed')
       AND (delivery.invite_version <> result_invite_version
         OR delivery.invite_token_hash <> decode(p_invite_token_hash_hex,'hex'));
    GET DIAGNOSTICS outbox_cancelled_count = ROW_COUNT;
  ELSIF NOT repeated AND current_state <> 'invited' THEN
    UPDATE sabora.staff_invitation_outbox delivery
       SET state = 'cancelled', updated_at = clock_timestamp()
     WHERE delivery.enrollment_id = result_enrollment_id
       AND delivery.state IN ('pending','claimed');
    GET DIAGNOSTICS outbox_cancelled_count = ROW_COUNT;
  END IF;

  IF p_action IN ('invite','resend') THEN
    IF repeated THEN
      SELECT delivery.id INTO outbox_job_id
        FROM sabora.staff_invitation_outbox delivery
       WHERE delivery.enrollment_id = result_enrollment_id
         AND delivery.invite_version = result_invite_version
         AND delivery.invite_token_hash = decode(p_invite_token_hash_hex,'hex');
      IF NOT FOUND THEN
        RAISE EXCEPTION 'staff_invitation_outbox_replay_missing'
          USING errcode = '40001';
      END IF;
    ELSE
      INSERT INTO sabora.staff_invitation_outbox(
        id,enrollment_id,invite_version,invite_token_hash
      ) VALUES (
        gen_random_uuid(),result_enrollment_id,result_invite_version,
        decode(p_invite_token_hash_hex,'hex')
      ) RETURNING id INTO outbox_job_id;
      outbox_enqueued := true;
    END IF;
  END IF;

  RETURN NEXT;
END;
$staff_lifecycle_outbox$;

ALTER FUNCTION sabora.transition_staff_lifecycle_with_outbox_candidate(
  text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text
) OWNER TO sabora_staff_invitation_enqueue_fn_owner;
REVOKE ALL ON FUNCTION sabora.transition_staff_lifecycle_with_outbox_candidate(
  text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text
) FROM PUBLIC, anon, authenticated, sabora_staff_reader, sabora_admin_writer,
  sabora_staff_lifecycle_fn_owner;

COMMENT ON FUNCTION sabora.transition_staff_lifecycle_with_outbox_candidate(
  text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text
) IS 'Candidate atomic HMAC lifecycle transition and invitation outbox boundary; no runtime EXECUTE grant is provisioned.';

COMMIT;
