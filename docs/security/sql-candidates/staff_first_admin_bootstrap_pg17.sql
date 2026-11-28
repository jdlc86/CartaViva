-- Disposable PG17 candidate overlay after staff_root_bootstrap_pg17.sql.
-- Derived from the governed 20261025081318 lifecycle function; original untouched.
-- Retains capability checks, transitions, locks, idempotency, existing
-- identity/code/directory wrappers and owner. No LOGIN or runtime EXECUTE.
-- Production promotion needs append-only CV005 DBA installation evidence.
BEGIN;
-- CV005 grants the installer only the ownership transfer within this transaction.
GRANT CREATE ON SCHEMA sabora TO sabora_staff_lifecycle_fn_owner;
GRANT sabora_staff_lifecycle_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER TABLE sabora.staff_lifecycle_audit
 DROP CONSTRAINT staff_lifecycle_audit_actor_kind_check,
 ADD CONSTRAINT staff_lifecycle_audit_actor_kind_check
 CHECK(actor_kind IN ('admin','invitee','root'));
GRANT SELECT(singleton,root_user_id) ON sabora.root_bootstrap_receipt
 TO sabora_staff_lifecycle_fn_owner;
CREATE POLICY first_admin_root_receipt_read ON sabora.root_bootstrap_receipt
 FOR SELECT TO sabora_staff_lifecycle_fn_owner USING(singleton);
GRANT SELECT(action,next_owner_id) ON sabora.admin_ownership_audit
 TO sabora_staff_lifecycle_fn_owner;
CREATE POLICY first_admin_ownership_history_read ON sabora.admin_ownership_audit
 FOR SELECT TO sabora_staff_lifecycle_fn_owner
 USING(action IN ('accept','force_transfer') AND next_owner_id IS NOT NULL);

CREATE OR REPLACE FUNCTION sabora.transition_staff_lifecycle_authorized_candidate(
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
  event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $staff_lifecycle$
DECLARE
  v_key_secret bytea;
  v_key_expires_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_now_ms bigint;
  v_reason text;
  v_reason_hash text;
  v_message text;
  v_expected_signature bytea;
  v_provided_signature bytea;
  v_signature_difference integer := 0;
  v_token_difference integer := 0;
  v_index integer;
  v_owner_user_id uuid;
  v_actor_role text;
  v_actor_state text;
  v_enrollment sabora.staff_enrollments%ROWTYPE;
  v_enrollment_found boolean := false;
  v_request record;
  v_fingerprint bytea;
  v_previous_state text;
  v_current_state text;
  v_actor_kind text;
  v_event_id uuid := gen_random_uuid();
  v_is_repeat boolean := false;
  v_target_membership_required boolean := false;
  v_target_membership_found boolean := true;
BEGIN
  v_reason := CASE WHEN p_reason IS NULL THEN NULL ELSE btrim(p_reason) END;
  v_reason_hash := CASE WHEN v_reason IS NULL THEN '-' ELSE
    encode(sha256(convert_to(v_reason, 'UTF8')), 'hex') END;

  IF p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
    OR p_database_role IS NULL OR p_database_role !~ '^[a-z][a-z0-9_]{0,62}$'
    OR p_database_role <> session_user::text
    OR p_actor_user_id IS NULL OR p_enrollment_id IS NULL
    OR p_action IS NULL OR p_action NOT IN
      ('invite','accept','register','activate','resend','suspend','revoke')
    OR p_correlation_id IS NULL
    OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
    OR p_issued_at_ms IS NULL OR p_expires_at_ms IS NULL
    OR p_expires_at_ms::numeric - p_issued_at_ms::numeric NOT BETWEEN 1 AND 30000
    OR p_signature_hex IS NULL OR p_signature_hex !~ '^[0-9a-f]{64}$'
    OR (p_invitee_email_hash_hex IS NOT NULL AND p_invitee_email_hash_hex !~ '^[0-9a-f]{64}$')
    OR (p_invite_token_hash_hex IS NOT NULL AND p_invite_token_hash_hex !~ '^[0-9a-f]{64}$')
    OR (p_credential_evidence_hash_hex IS NOT NULL AND
      p_credential_evidence_hash_hex !~ '^[0-9a-f]{64}$')
    OR (v_reason IS NOT NULL AND length(v_reason) NOT BETWEEN 1 AND 500)
  THEN
    RAISE EXCEPTION 'invalid_staff_lifecycle_capability' USING errcode = '42501';
  END IF;

  IF NOT (
    (p_action = 'invite' AND p_subject_user_id IS NULL
      AND p_requested_role IN ('admin','waiter','kitchen')
      AND p_invitee_email_hash_hex IS NOT NULL AND p_invite_token_hash_hex IS NOT NULL
      AND p_credential_evidence_hash_hex IS NULL AND v_reason IS NULL)
    OR
    (p_action = 'accept' AND p_subject_user_id = p_actor_user_id
      AND p_requested_role IS NULL AND p_invitee_email_hash_hex IS NULL
      AND p_invite_token_hash_hex IS NOT NULL
      AND p_credential_evidence_hash_hex IS NULL AND v_reason IS NULL)
    OR
    (p_action = 'register' AND p_subject_user_id = p_actor_user_id
      AND p_requested_role IS NULL AND p_invitee_email_hash_hex IS NULL
      AND p_invite_token_hash_hex IS NULL
      AND p_credential_evidence_hash_hex IS NOT NULL AND v_reason IS NULL)
    OR
    (p_action = 'activate' AND p_subject_user_id IS NOT NULL
      AND p_requested_role IS NULL AND p_invitee_email_hash_hex IS NULL
      AND p_invite_token_hash_hex IS NULL
      AND p_credential_evidence_hash_hex IS NULL AND v_reason IS NULL)
    OR
    (p_action = 'resend' AND p_subject_user_id IS NULL
      AND p_requested_role IS NULL AND p_invitee_email_hash_hex IS NULL
      AND p_invite_token_hash_hex IS NOT NULL
      AND p_credential_evidence_hash_hex IS NULL AND v_reason IS NULL)
    OR
    (p_action IN ('suspend','revoke') AND p_requested_role IS NULL
      AND p_invitee_email_hash_hex IS NULL AND p_invite_token_hash_hex IS NULL
      AND p_credential_evidence_hash_hex IS NULL AND v_reason IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'invalid_staff_lifecycle_capability' USING errcode = '42501';
  END IF;

  v_now_ms := floor(extract(epoch FROM v_now) * 1000)::bigint;
  IF p_issued_at_ms::numeric > v_now_ms::numeric + 5000
    OR p_expires_at_ms <= v_now_ms
  THEN
    RAISE EXCEPTION 'invalid_staff_lifecycle_capability' USING errcode = '42501';
  END IF;

  SELECT key.hmac_key, key.expires_at
    INTO v_key_secret, v_key_expires_at
    FROM sabora.staff_lifecycle_signing_keys key
    WHERE key.key_id = p_key_id
      AND key.disabled_at IS NULL
      AND key.not_before <= v_now
      AND key.expires_at > v_now
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_staff_lifecycle_capability' USING errcode = '42501';
  END IF;

  v_message := 'sabora.staff-lifecycle.v1' || chr(10)
    || p_key_id || chr(10)
    || p_database_role || chr(10)
    || lower(p_actor_user_id::text) || chr(10)
    || p_action || chr(10)
    || lower(p_enrollment_id::text) || chr(10)
    || coalesce(lower(p_subject_user_id::text), '-') || chr(10)
    || coalesce(p_requested_role, '-') || chr(10)
    || coalesce(p_invitee_email_hash_hex, '-') || chr(10)
    || coalesce(p_invite_token_hash_hex, '-') || chr(10)
    || coalesce(p_credential_evidence_hash_hex, '-') || chr(10)
    || v_reason_hash || chr(10)
    || p_correlation_id || chr(10)
    || p_issued_at_ms::text || chr(10)
    || p_expires_at_ms::text;
  v_expected_signature := extensions.hmac(
    convert_to(v_message, 'UTF8'), v_key_secret, 'sha256'
  );
  v_provided_signature := decode(p_signature_hex, 'hex');
  IF v_expected_signature IS NULL OR v_provided_signature IS NULL
    OR octet_length(v_expected_signature) <> 32
    OR octet_length(v_provided_signature) <> 32
  THEN
    RAISE EXCEPTION 'invalid_staff_lifecycle_capability' USING errcode = '42501';
  END IF;
  FOR v_index IN 0..31 LOOP
    v_signature_difference := v_signature_difference |
      (get_byte(v_expected_signature, v_index) # get_byte(v_provided_signature, v_index));
  END LOOP;
  IF v_signature_difference <> 0 THEN
    RAISE EXCEPTION 'invalid_staff_lifecycle_capability' USING errcode = '42501';
  END IF;

  v_fingerprint := sha256(convert_to(
    p_action || chr(10) || CASE WHEN p_action = 'invite' THEN '-' ELSE lower(p_enrollment_id::text) END || chr(10)
    || coalesce(lower(p_subject_user_id::text), '-') || chr(10)
    || coalesce(p_requested_role, '-') || chr(10)
    || coalesce(p_invitee_email_hash_hex, '-') || chr(10)
    || CASE WHEN p_action IN ('invite','resend') THEN '-' ELSE coalesce(p_invite_token_hash_hex, '-') END || chr(10)
    || coalesce(p_credential_evidence_hash_hex, '-') || chr(10)
    || v_reason_hash,
    'UTF8'
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended(
    lower(p_actor_user_id::text) || ':' || p_correlation_id, 0
  ));

  IF p_action IN ('invite','activate','resend','suspend','revoke') THEN
    SELECT ownership.owner_user_id INTO v_owner_user_id
      FROM sabora.admin_write_ownership ownership
      WHERE ownership.singleton = true
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'staff_lifecycle_ownership_unavailable' USING errcode = '42501';
    END IF;
    IF p_database_role='sabora_staff_first_admin_login' THEN
      -- The governance singleton already serializes staff UPDATE/DELETE,
      -- and ROOT is immutable. The ordinary lifecycle owner's UPDATE RLS
      -- deliberately excludes ROOT, including SELECT FOR UPDATE visibility.
      -- Read under the singleton lock instead of granting ROOT UPDATE.
      SELECT member.role,member.state INTO v_actor_role,v_actor_state
       FROM sabora.staff_members member WHERE member.user_id=p_actor_user_id;
    ELSE
      SELECT member.role, member.state INTO v_actor_role, v_actor_state
       FROM sabora.staff_members member
       WHERE member.user_id=p_actor_user_id FOR UPDATE;
    END IF;
    IF NOT FOUND OR v_actor_state IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'staff_lifecycle_admin_forbidden' USING errcode = '42501';
    END IF;
    IF p_database_role = 'sabora_staff_first_admin_login' THEN
      -- Dedicated genesis LOGIN; never grant ordinary writer authority to ROOT.
      IF v_actor_role IS DISTINCT FROM 'root' OR v_owner_user_id IS NOT NULL
        OR p_action NOT IN ('invite','activate','resend','revoke')
        OR NOT EXISTS(SELECT 1 FROM sabora.root_bootstrap_receipt receipt
          WHERE receipt.singleton AND receipt.root_user_id=p_actor_user_id)
        OR EXISTS(SELECT 1 FROM sabora.admin_ownership_audit history
          WHERE history.action IN ('accept','force_transfer')
            AND history.next_owner_id IS NOT NULL)
      THEN
        RAISE EXCEPTION 'first_admin_bootstrap_forbidden' USING errcode='42501';
      END IF;
      IF p_action = 'invite' THEN
        IF p_requested_role IS DISTINCT FROM 'admin'
          OR EXISTS(SELECT 1 FROM sabora.staff_members member
            WHERE member.user_id<>p_actor_user_id AND member.state<>'revoked')
          OR EXISTS(SELECT 1 FROM sabora.staff_enrollments enrollment
            WHERE enrollment.state<>'revoked' AND NOT EXISTS(
              SELECT 1 FROM sabora.staff_lifecycle_requests request
              WHERE request.actor_user_id=p_actor_user_id
                AND request.correlation_id=p_correlation_id
                AND request.action='invite'
                AND request.enrollment_id=enrollment.id
                AND enrollment.created_by=p_actor_user_id
                AND enrollment.requested_role='admin'))
        THEN
          RAISE EXCEPTION 'first_admin_bootstrap_forbidden' USING errcode='42501';
        END IF;
      ELSIF NOT EXISTS(SELECT 1 FROM sabora.staff_enrollments enrollment
          WHERE enrollment.id=p_enrollment_id
            AND enrollment.created_by=p_actor_user_id
            AND enrollment.requested_role='admin')
      THEN
        RAISE EXCEPTION 'first_admin_bootstrap_forbidden' USING errcode='42501';
      END IF;
      v_actor_kind := 'root';
    ELSE
      IF v_actor_role IS DISTINCT FROM 'admin'
        OR v_owner_user_id IS DISTINCT FROM p_actor_user_id THEN
        RAISE EXCEPTION 'staff_lifecycle_admin_forbidden' USING errcode = '42501';
      END IF;
      v_actor_kind := 'admin';
    END IF;
  ELSE
    IF p_database_role='sabora_staff_first_admin_login' THEN
      RAISE EXCEPTION 'first_admin_bootstrap_forbidden' USING errcode='42501';
    END IF;
    v_actor_kind := 'invitee';
  END IF;

  v_now := clock_timestamp();
  v_now_ms := floor(extract(epoch FROM v_now) * 1000)::bigint;
  IF p_issued_at_ms::numeric > v_now_ms::numeric + 5000
    OR p_expires_at_ms <= v_now_ms OR v_key_expires_at <= v_now
  THEN
    RAISE EXCEPTION 'invalid_staff_lifecycle_capability' USING errcode = '42501';
  END IF;

  -- Replays must be resolved before locking a newly generated enrollment ID:
  -- invite retries carry a fresh UUID/token but the same durable intent.
  -- The actor/ownership locks and capability expiry checks still precede replay.
  SELECT request.request_fingerprint, request.enrollment_id,
         request.subject_user_id, request.requested_role,
         request.previous_state, request.current_state,
         request.invite_version, request.event_id
    INTO v_request
    FROM sabora.staff_lifecycle_requests request
    WHERE request.actor_user_id = p_actor_user_id
      AND request.correlation_id = p_correlation_id;
  IF FOUND THEN
    -- Durable replay must not disclose or revive a revoked invitation.
    -- Lock the original enrollment, not a freshly generated retry UUID.
    SELECT enrollment.* INTO v_enrollment
      FROM sabora.staff_enrollments enrollment
      WHERE enrollment.id = v_request.enrollment_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'staff_enrollment_not_found' USING errcode = 'P0002';
    END IF;
    IF v_enrollment.state = 'revoked' AND p_action <> 'revoke' THEN
      RAISE EXCEPTION 'staff_enrollment_revoked' USING errcode = '42501';
    END IF;
    v_now := clock_timestamp();
    v_now_ms := floor(extract(epoch FROM v_now) * 1000)::bigint;
    IF p_expires_at_ms <= v_now_ms OR v_key_expires_at <= v_now THEN
      RAISE EXCEPTION 'invalid_staff_lifecycle_capability' USING errcode = '42501';
    END IF;
    IF v_request.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'staff_lifecycle_idempotency_conflict' USING errcode = '23505';
    END IF;
    RETURN QUERY SELECT
      v_request.enrollment_id, v_request.subject_user_id,
      v_request.requested_role, v_request.previous_state,
      v_request.current_state, true, v_request.invite_version,
      v_request.event_id;
    RETURN;
  END IF;

  SELECT enrollment.* INTO v_enrollment
    FROM sabora.staff_enrollments enrollment
    WHERE enrollment.id = p_enrollment_id
    FOR UPDATE;
  v_enrollment_found := FOUND;
  IF p_action <> 'invite' AND NOT v_enrollment_found THEN
    RAISE EXCEPTION 'staff_enrollment_not_found' USING errcode = 'P0002';
  END IF;
  IF v_enrollment_found AND v_enrollment.state = 'revoked' AND p_action <> 'revoke' THEN
    RAISE EXCEPTION 'staff_enrollment_revoked' USING errcode = '42501';
  END IF;

  -- Suspension and revocation can block on the target membership after the
  -- enrollment lock. Acquire that row explicitly so the final temporal check
  -- covers every lock wait before any mutation or durable replay is written.
  IF p_action = 'suspend'
    AND v_enrollment.state = 'active'
    AND v_enrollment.auth_user_id IS NOT NULL
    AND v_enrollment.auth_user_id IS NOT DISTINCT FROM p_subject_user_id
    AND v_enrollment.auth_user_id IS DISTINCT FROM v_owner_user_id
  THEN
    v_target_membership_required := true;
    PERFORM 1
      FROM sabora.staff_members member
      WHERE member.user_id = v_enrollment.auth_user_id
        AND member.role = v_enrollment.requested_role
        AND member.state = 'active'
      FOR UPDATE;
    v_target_membership_found := FOUND;
  ELSIF p_action = 'revoke'
    AND v_enrollment.state IN ('active','suspended')
    AND v_enrollment.auth_user_id IS NOT NULL
    AND v_enrollment.auth_user_id IS DISTINCT FROM v_owner_user_id
  THEN
    v_target_membership_required := true;
    PERFORM 1
      FROM sabora.staff_members member
      WHERE member.user_id = v_enrollment.auth_user_id
        AND member.role = v_enrollment.requested_role
        AND member.state IN ('active','suspended')
      FOR UPDATE;
    v_target_membership_found := FOUND;
  END IF;

  -- Revalidate after enrollment and target-membership row-lock waits.
  v_now := clock_timestamp();
  v_now_ms := floor(extract(epoch FROM v_now) * 1000)::bigint;
  IF p_issued_at_ms::numeric > v_now_ms::numeric + 5000
    OR p_expires_at_ms <= v_now_ms OR v_key_expires_at <= v_now
  THEN
    RAISE EXCEPTION 'invalid_staff_lifecycle_capability' USING errcode = '42501';
  END IF;
  IF v_target_membership_required AND NOT v_target_membership_found THEN
    RAISE EXCEPTION 'staff_membership_state_mismatch' USING errcode = '40001';
  END IF;

  IF p_action = 'invite' THEN
    IF v_enrollment_found THEN
      RAISE EXCEPTION 'staff_enrollment_id_conflict' USING errcode = '23505';
    END IF;
    INSERT INTO sabora.staff_enrollments(
      id,invitee_email_hash,requested_role,state,invite_token_hash,
      created_by,created_at,last_invited_at,updated_at
    ) VALUES (
      p_enrollment_id,decode(p_invitee_email_hash_hex,'hex'),p_requested_role,
      'invited',decode(p_invite_token_hash_hex,'hex'),p_actor_user_id,
      v_now,v_now,v_now
    ) RETURNING * INTO v_enrollment;
    v_previous_state := NULL;
    v_current_state := 'invited';
  ELSIF p_action = 'accept' THEN
    IF v_enrollment.state <> 'invited' OR v_enrollment.auth_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_staff_lifecycle_transition' USING errcode = '22023';
    END IF;
    FOR v_index IN 0..31 LOOP
      v_token_difference := v_token_difference |
        (get_byte(v_enrollment.invite_token_hash, v_index) #
         get_byte(decode(p_invite_token_hash_hex,'hex'), v_index));
    END LOOP;
    IF v_token_difference <> 0 THEN
      RAISE EXCEPTION 'invalid_staff_invitation_token' USING errcode = '42501';
    END IF;
    v_previous_state := v_enrollment.state;
    UPDATE sabora.staff_enrollments SET
      state = 'accepted', auth_user_id = p_subject_user_id,
      invite_token_hash = sha256(invite_token_hash),
      accepted_at = v_now, updated_at = v_now
      WHERE id = p_enrollment_id RETURNING * INTO v_enrollment;
    v_current_state := 'accepted';
  ELSIF p_action = 'register' THEN
    IF v_enrollment.state <> 'accepted'
      OR v_enrollment.auth_user_id IS DISTINCT FROM p_subject_user_id
    THEN
      RAISE EXCEPTION 'invalid_staff_lifecycle_transition' USING errcode = '22023';
    END IF;
    v_previous_state := v_enrollment.state;
    UPDATE sabora.staff_enrollments SET
      state = 'registered',
      credential_evidence_hash = decode(p_credential_evidence_hash_hex,'hex'),
      credential_registered_at = v_now, updated_at = v_now
      WHERE id = p_enrollment_id RETURNING * INTO v_enrollment;
    v_current_state := 'registered';
  ELSIF p_action = 'activate' THEN
    IF v_enrollment.state <> 'registered'
      OR v_enrollment.auth_user_id IS DISTINCT FROM p_subject_user_id
    THEN
      RAISE EXCEPTION 'invalid_staff_lifecycle_transition' USING errcode = '22023';
    END IF;
    v_previous_state := v_enrollment.state;
    INSERT INTO sabora.staff_members(user_id,role,state)
      VALUES (v_enrollment.auth_user_id,v_enrollment.requested_role,'active');
    UPDATE sabora.staff_enrollments SET
      state = 'active', activated_at = v_now, updated_at = v_now
      WHERE id = p_enrollment_id RETURNING * INTO v_enrollment;
    v_current_state := 'active';
  ELSIF p_action = 'resend' THEN
    IF v_enrollment.state <> 'invited' OR v_enrollment.auth_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_staff_lifecycle_transition' USING errcode = '22023';
    END IF;
    v_previous_state := v_enrollment.state;
    UPDATE sabora.staff_enrollments SET
      invite_token_hash = decode(p_invite_token_hash_hex,'hex'),
      invite_version = invite_version + 1,
      last_invited_at = v_now, updated_at = v_now
      WHERE id = p_enrollment_id RETURNING * INTO v_enrollment;
    v_current_state := 'invited';
  ELSIF p_action = 'suspend' THEN
    IF v_enrollment.state <> 'active' OR v_enrollment.auth_user_id IS NULL
      OR v_enrollment.auth_user_id IS DISTINCT FROM p_subject_user_id
      OR v_enrollment.auth_user_id = v_owner_user_id
    THEN
      RAISE EXCEPTION 'protected_or_invalid_staff_target' USING errcode = '42501';
    END IF;
    v_previous_state := v_enrollment.state;
    UPDATE sabora.staff_members SET state = 'suspended'
      WHERE user_id = v_enrollment.auth_user_id
        AND role = v_enrollment.requested_role AND state = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'staff_membership_state_mismatch' USING errcode = '40001';
    END IF;
    UPDATE sabora.staff_enrollments SET
      state = 'suspended', suspended_at = v_now, updated_at = v_now
      WHERE id = p_enrollment_id RETURNING * INTO v_enrollment;
    v_current_state := 'suspended';
  ELSIF p_action = 'revoke' THEN
    v_previous_state := v_enrollment.state;
    IF v_enrollment.state = 'revoked' THEN
      v_is_repeat := true;
      v_current_state := 'revoked';
    ELSE
      IF v_enrollment.auth_user_id = v_owner_user_id THEN
        RAISE EXCEPTION 'protected_admin_owner' USING errcode = '42501';
      END IF;
      IF v_enrollment.state IN ('active','suspended') THEN
        UPDATE sabora.staff_members SET state = 'revoked'
          WHERE user_id = v_enrollment.auth_user_id
            AND role = v_enrollment.requested_role
            AND state IN ('active','suspended');
        IF NOT FOUND THEN
          RAISE EXCEPTION 'staff_membership_state_mismatch' USING errcode = '40001';
        END IF;
      END IF;
      UPDATE sabora.staff_enrollments SET
        state = 'revoked', invite_token_hash = sha256(invite_token_hash),
        revoked_at = v_now, revocation_reason = v_reason,
        updated_at = v_now
        WHERE id = p_enrollment_id RETURNING * INTO v_enrollment;
      v_current_state := 'revoked';
    END IF;
  END IF;

  INSERT INTO sabora.staff_lifecycle_audit(
    id,actor_user_id,actor_kind,enrollment_id,affected_user_id,action,
    previous_state,next_state,reason,correlation_id,occurred_at
  ) VALUES (
    v_event_id,p_actor_user_id,v_actor_kind,p_enrollment_id,
    v_enrollment.auth_user_id,p_action,v_previous_state,v_current_state,
    v_reason,p_correlation_id,v_now
  );
  INSERT INTO sabora.staff_lifecycle_requests(
    actor_user_id,correlation_id,request_fingerprint,action,enrollment_id,
    subject_user_id,requested_role,previous_state,current_state,
    invite_version,event_id
  ) VALUES (
    p_actor_user_id,p_correlation_id,v_fingerprint,p_action,p_enrollment_id,
    v_enrollment.auth_user_id,v_enrollment.requested_role,v_previous_state,
    v_current_state,v_enrollment.invite_version,v_event_id
  );

  RETURN QUERY SELECT
    v_enrollment.id,v_enrollment.auth_user_id,v_enrollment.requested_role,
    v_previous_state,v_current_state,v_is_repeat,v_enrollment.invite_version,
    v_event_id;
END;
$staff_lifecycle$;

DO $owner_check$
BEGIN
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=
 'sabora.transition_staff_lifecycle_authorized_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text)'::regprocedure)
 IS DISTINCT FROM 'sabora_staff_lifecycle_fn_owner' THEN
  RAISE EXCEPTION 'first_admin_lifecycle_owner_drift' USING ERRCODE='42501';
 END IF;
END;
$owner_check$;
REVOKE CREATE ON SCHEMA sabora FROM sabora_staff_lifecycle_fn_owner;
REVOKE sabora_staff_lifecycle_fn_owner FROM CURRENT_USER GRANTED BY CURRENT_USER;
COMMIT;
