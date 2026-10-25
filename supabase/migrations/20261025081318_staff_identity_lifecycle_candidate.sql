-- Candidate staff identity lifecycle for disposable PostgreSQL 17 validation.
-- This migration provisions no LOGIN, key material, runtime EXECUTE grant or
-- operational route. Never apply it to operational Supabase without a
-- separate security review and explicit authorization.
BEGIN;

DO $prerequisite$
BEGIN
  IF to_regprocedure('extensions.hmac(bytea,bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'staff_lifecycle_requires_pgcrypto_hmac'
      USING errcode = '0A000';
  END IF;
END;
$prerequisite$;

DO $role$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname = 'sabora_staff_lifecycle_fn_owner'
  ) THEN
    CREATE ROLE sabora_staff_lifecycle_fn_owner
      NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles role
     WHERE role.rolname = 'sabora_staff_lifecycle_fn_owner'
       AND (role.rolcanlogin OR role.rolinherit OR role.rolsuper
         OR role.rolbypassrls OR role.rolcreatedb OR role.rolcreaterole
         OR role.rolreplication)
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_staff_lifecycle_fn_owner'
      USING errcode = '0P000';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
      JOIN pg_catalog.pg_roles member ON member.oid = membership.member
     WHERE granted.rolname = 'sabora_staff_lifecycle_fn_owner'
        OR member.rolname = 'sabora_staff_lifecycle_fn_owner'
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_staff_lifecycle_fn_owner_membership'
      USING errcode = '0P000';
  END IF;
END;
$role$;

CREATE TABLE sabora.staff_enrollments (
  id uuid PRIMARY KEY,
  invitee_email_hash bytea NOT NULL UNIQUE
    CHECK (octet_length(invitee_email_hash) = 32),
  requested_role text NOT NULL
    CHECK (requested_role IN ('admin','waiter','kitchen')),
  state text NOT NULL DEFAULT 'invited'
    CHECK (state IN ('invited','accepted','registered','active','suspended','revoked')),
  auth_user_id uuid UNIQUE,
  invite_token_hash bytea NOT NULL
    CHECK (octet_length(invite_token_hash) = 32),
  invite_version integer NOT NULL DEFAULT 1 CHECK (invite_version > 0),
  credential_evidence_hash bytea
    CHECK (credential_evidence_hash IS NULL OR octet_length(credential_evidence_hash) = 32),
  created_by uuid NOT NULL REFERENCES sabora.staff_members(user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_invited_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_at timestamptz,
  credential_registered_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT staff_enrollment_progression CHECK (
    (state = 'invited' AND auth_user_id IS NULL AND accepted_at IS NULL
      AND credential_registered_at IS NULL AND activated_at IS NULL
      AND suspended_at IS NULL AND revoked_at IS NULL AND revocation_reason IS NULL)
    OR
    (state = 'accepted' AND auth_user_id IS NOT NULL AND accepted_at IS NOT NULL
      AND credential_registered_at IS NULL AND activated_at IS NULL
      AND suspended_at IS NULL AND revoked_at IS NULL AND revocation_reason IS NULL)
    OR
    (state = 'registered' AND auth_user_id IS NOT NULL AND accepted_at IS NOT NULL
      AND credential_registered_at IS NOT NULL AND credential_evidence_hash IS NOT NULL
      AND activated_at IS NULL AND suspended_at IS NULL
      AND revoked_at IS NULL AND revocation_reason IS NULL)
    OR
    (state = 'active' AND auth_user_id IS NOT NULL AND accepted_at IS NOT NULL
      AND credential_registered_at IS NOT NULL AND credential_evidence_hash IS NOT NULL
      AND activated_at IS NOT NULL AND suspended_at IS NULL
      AND revoked_at IS NULL AND revocation_reason IS NULL)
    OR
    (state = 'suspended' AND auth_user_id IS NOT NULL AND accepted_at IS NOT NULL
      AND credential_registered_at IS NOT NULL AND credential_evidence_hash IS NOT NULL
      AND activated_at IS NOT NULL AND suspended_at IS NOT NULL
      AND revoked_at IS NULL AND revocation_reason IS NULL)
    OR
    (state = 'revoked' AND revoked_at IS NOT NULL
      AND revocation_reason IS NOT NULL
      AND length(btrim(revocation_reason)) BETWEEN 1 AND 500)
  ),
  CONSTRAINT staff_enrollment_timestamp_order CHECK (
    last_invited_at >= created_at
    AND (accepted_at IS NULL OR accepted_at >= created_at)
    AND (credential_registered_at IS NULL OR
      (accepted_at IS NOT NULL AND credential_registered_at >= accepted_at))
    AND (activated_at IS NULL OR
      (credential_registered_at IS NOT NULL AND activated_at >= credential_registered_at))
    AND (suspended_at IS NULL OR
      (activated_at IS NOT NULL AND suspended_at >= activated_at))
    AND (revoked_at IS NULL OR revoked_at >= created_at)
    AND updated_at >= created_at
  )
);

CREATE TABLE sabora.staff_lifecycle_requests (
  actor_user_id uuid NOT NULL,
  correlation_id text NOT NULL
    CHECK (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  request_fingerprint bytea NOT NULL
    CHECK (octet_length(request_fingerprint) = 32),
  action text NOT NULL
    CHECK (action IN ('invite','accept','register','activate','resend','suspend','revoke')),
  enrollment_id uuid NOT NULL REFERENCES sabora.staff_enrollments(id) ON DELETE RESTRICT,
  subject_user_id uuid,
  requested_role text NOT NULL
    CHECK (requested_role IN ('admin','waiter','kitchen')),
  previous_state text,
  current_state text NOT NULL
    CHECK (current_state IN ('invited','accepted','registered','active','suspended','revoked')),
  invite_version integer NOT NULL CHECK (invite_version > 0),
  event_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (actor_user_id, correlation_id)
);

CREATE TABLE sabora.staff_lifecycle_audit (
  id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('admin','invitee')),
  enrollment_id uuid NOT NULL REFERENCES sabora.staff_enrollments(id) ON DELETE RESTRICT,
  affected_user_id uuid,
  action text NOT NULL
    CHECK (action IN ('invite','accept','register','activate','resend','suspend','revoke')),
  previous_state text,
  next_state text NOT NULL
    CHECK (next_state IN ('invited','accepted','registered','active','suspended','revoked')),
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 500),
  correlation_id text NOT NULL
    CHECK (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (actor_user_id, correlation_id)
);

CREATE TABLE sabora.staff_lifecycle_signing_keys (
  key_id text PRIMARY KEY CHECK (key_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  hmac_key bytea NOT NULL CHECK (octet_length(hmac_key) BETWEEN 32 AND 64),
  not_before timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  disabled_at timestamptz,
  CHECK (expires_at > not_before),
  CHECK (disabled_at IS NULL OR disabled_at >= not_before)
);

ALTER TABLE sabora.staff_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_lifecycle_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_lifecycle_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_lifecycle_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_lifecycle_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_lifecycle_signing_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_lifecycle_signing_keys FORCE ROW LEVEL SECURITY;

REVOKE ALL ON sabora.staff_enrollments, sabora.staff_lifecycle_requests,
  sabora.staff_lifecycle_audit, sabora.staff_lifecycle_signing_keys
  FROM PUBLIC, anon, authenticated, sabora_staff_reader, sabora_admin_writer;

CREATE FUNCTION sabora.reject_staff_lifecycle_history_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $immutable$
BEGIN
  RAISE EXCEPTION 'staff_lifecycle_history_is_append_only' USING errcode = '42501';
END;
$immutable$;

CREATE TRIGGER staff_lifecycle_requests_immutable
  BEFORE UPDATE OR DELETE ON sabora.staff_lifecycle_requests
  FOR EACH ROW EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER staff_lifecycle_requests_no_truncate
  BEFORE TRUNCATE ON sabora.staff_lifecycle_requests
  FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER staff_lifecycle_audit_immutable
  BEFORE UPDATE OR DELETE ON sabora.staff_lifecycle_audit
  FOR EACH ROW EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER staff_lifecycle_audit_no_truncate
  BEFORE TRUNCATE ON sabora.staff_lifecycle_audit
  FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
REVOKE ALL ON FUNCTION sabora.reject_staff_lifecycle_history_mutation()
  FROM PUBLIC, anon, authenticated, sabora_staff_reader, sabora_admin_writer;

REVOKE ALL ON SCHEMA sabora FROM sabora_staff_lifecycle_fn_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA sabora FROM sabora_staff_lifecycle_fn_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sabora FROM sabora_staff_lifecycle_fn_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora FROM sabora_staff_lifecycle_fn_owner;
GRANT USAGE ON SCHEMA sabora, extensions TO sabora_staff_lifecycle_fn_owner;

GRANT SELECT (key_id,hmac_key,not_before,expires_at,disabled_at),
      UPDATE (disabled_at)
  ON sabora.staff_lifecycle_signing_keys TO sabora_staff_lifecycle_fn_owner;
GRANT SELECT (singleton,owner_user_id), UPDATE (owner_user_id)
  ON sabora.admin_write_ownership TO sabora_staff_lifecycle_fn_owner;
GRANT SELECT (user_id,role,state), INSERT (user_id,role,state), UPDATE (state)
  ON sabora.staff_members TO sabora_staff_lifecycle_fn_owner;
GRANT SELECT (
    id,invitee_email_hash,requested_role,state,auth_user_id,invite_token_hash,
    invite_version,credential_evidence_hash,created_by,created_at,last_invited_at,
    accepted_at,credential_registered_at,activated_at,suspended_at,revoked_at,
    revocation_reason,updated_at
  ), INSERT (
    id,invitee_email_hash,requested_role,state,auth_user_id,invite_token_hash,
    invite_version,credential_evidence_hash,created_by,created_at,last_invited_at,
    accepted_at,credential_registered_at,activated_at,suspended_at,revoked_at,
    revocation_reason,updated_at
  ), UPDATE (
    state,auth_user_id,invite_token_hash,invite_version,credential_evidence_hash,
    last_invited_at,accepted_at,credential_registered_at,activated_at,suspended_at,
    revoked_at,revocation_reason,updated_at
  ) ON sabora.staff_enrollments TO sabora_staff_lifecycle_fn_owner;
GRANT SELECT (
    actor_user_id,correlation_id,request_fingerprint,action,enrollment_id,
    subject_user_id,requested_role,previous_state,current_state,invite_version,event_id
  ), INSERT (
    actor_user_id,correlation_id,request_fingerprint,action,enrollment_id,
    subject_user_id,requested_role,previous_state,current_state,invite_version,event_id
  ) ON sabora.staff_lifecycle_requests TO sabora_staff_lifecycle_fn_owner;
GRANT INSERT (
    id,actor_user_id,actor_kind,enrollment_id,affected_user_id,action,
    previous_state,next_state,reason,correlation_id,occurred_at
  ) ON sabora.staff_lifecycle_audit TO sabora_staff_lifecycle_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text)
  TO sabora_staff_lifecycle_fn_owner;

CREATE POLICY staff_lifecycle_owner_key_select
  ON sabora.staff_lifecycle_signing_keys FOR SELECT
  TO sabora_staff_lifecycle_fn_owner USING (true);
CREATE POLICY staff_lifecycle_owner_key_lock
  ON sabora.staff_lifecycle_signing_keys FOR UPDATE
  TO sabora_staff_lifecycle_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY staff_lifecycle_owner_ownership_select
  ON sabora.admin_write_ownership FOR SELECT
  TO sabora_staff_lifecycle_fn_owner USING (singleton = true);
CREATE POLICY staff_lifecycle_owner_ownership_lock
  ON sabora.admin_write_ownership FOR UPDATE
  TO sabora_staff_lifecycle_fn_owner USING (singleton = true) WITH CHECK (singleton = true);
CREATE POLICY staff_lifecycle_owner_staff_select
  ON sabora.staff_members FOR SELECT
  TO sabora_staff_lifecycle_fn_owner USING (true);
CREATE POLICY staff_lifecycle_owner_staff_insert
  ON sabora.staff_members FOR INSERT
  TO sabora_staff_lifecycle_fn_owner
  WITH CHECK (role IN ('admin','waiter','kitchen') AND state = 'active');
CREATE POLICY staff_lifecycle_owner_staff_update
  ON sabora.staff_members FOR UPDATE
  TO sabora_staff_lifecycle_fn_owner
  USING (role IN ('admin','waiter','kitchen'))
  WITH CHECK (role IN ('admin','waiter','kitchen') AND state IN ('active','suspended','revoked'));
CREATE POLICY staff_lifecycle_owner_enrollment_select
  ON sabora.staff_enrollments FOR SELECT
  TO sabora_staff_lifecycle_fn_owner USING (true);
CREATE POLICY staff_lifecycle_owner_enrollment_insert
  ON sabora.staff_enrollments FOR INSERT
  TO sabora_staff_lifecycle_fn_owner WITH CHECK (requested_role IN ('admin','waiter','kitchen'));
CREATE POLICY staff_lifecycle_owner_enrollment_update
  ON sabora.staff_enrollments FOR UPDATE
  TO sabora_staff_lifecycle_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY staff_lifecycle_owner_request_select
  ON sabora.staff_lifecycle_requests FOR SELECT
  TO sabora_staff_lifecycle_fn_owner USING (true);
CREATE POLICY staff_lifecycle_owner_request_insert
  ON sabora.staff_lifecycle_requests FOR INSERT
  TO sabora_staff_lifecycle_fn_owner WITH CHECK (true);
CREATE POLICY staff_lifecycle_owner_audit_insert
  ON sabora.staff_lifecycle_audit FOR INSERT
  TO sabora_staff_lifecycle_fn_owner WITH CHECK (true);

CREATE FUNCTION sabora.transition_staff_lifecycle_authorized_candidate(
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
    || CASE WHEN p_action IN ('invite','resend') THEN '-' ELSE coalesce(p_invite_token_hash_hex, '-') END || chr(10)
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
    || coalesce(p_invite_token_hash_hex, '-') || chr(10)
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
    SELECT member.role, member.state INTO v_actor_role, v_actor_state
      FROM sabora.staff_members member
      WHERE member.user_id = p_actor_user_id
      FOR UPDATE;
    IF NOT FOUND OR v_actor_role <> 'admin' OR v_actor_state <> 'active'
      OR v_owner_user_id IS DISTINCT FROM p_actor_user_id
    THEN
      RAISE EXCEPTION 'staff_lifecycle_admin_forbidden' USING errcode = '42501';
    END IF;
    v_actor_kind := 'admin';
  ELSE
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

ALTER FUNCTION sabora.transition_staff_lifecycle_authorized_candidate(
  text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text
) OWNER TO sabora_staff_lifecycle_fn_owner;
REVOKE ALL ON FUNCTION sabora.transition_staff_lifecycle_authorized_candidate(
  text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text
) FROM PUBLIC, anon, authenticated, sabora_staff_reader, sabora_admin_writer;

COMMENT ON TABLE sabora.staff_enrollments IS
  'Candidate first durable staff onboarding record; revocable in every state.';
COMMENT ON TABLE sabora.staff_lifecycle_signing_keys IS
  'Empty candidate keyring; privileged provisioning is deliberately out of band.';
COMMENT ON FUNCTION sabora.transition_staff_lifecycle_authorized_candidate(
  text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text
) IS 'Candidate HMAC-bound lifecycle transition; no runtime EXECUTE grant is provisioned.';

COMMIT;
