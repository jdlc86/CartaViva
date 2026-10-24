-- Candidate boundary for non-forgeable order-operation actor capabilities.
-- Never apply to operational Supabase without separate key provisioning,
-- credential review and explicit authorization. The table starts empty and
-- no LOGIN receives EXECUTE in this migration.
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $role$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname = 'sabora_order_operations_fn_owner'
  ) THEN
    CREATE ROLE sabora_order_operations_fn_owner
      NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;

  -- Fail before granting or transferring ownership if a pre-existing role is
  -- not the sealed capability principal expected by this migration. Merely
  -- detecting this later in the application preflight would be too late: a
  -- LOGIN or a role membership could already use the privileges below.
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_roles role
     WHERE role.rolname = 'sabora_order_operations_fn_owner'
       AND (role.rolcanlogin OR role.rolinherit OR role.rolsuper
         OR role.rolbypassrls OR role.rolcreatedb OR role.rolcreaterole
         OR role.rolreplication)
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_order_operations_fn_owner'
      USING errcode = '0P000';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles granted
        ON granted.oid = membership.roleid
      JOIN pg_catalog.pg_roles member
        ON member.oid = membership.member
     WHERE granted.rolname = 'sabora_order_operations_fn_owner'
        OR member.rolname = 'sabora_order_operations_fn_owner'
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_order_operations_fn_owner_membership'
      USING errcode = '0P000';
  END IF;
END;
$role$;

CREATE TABLE sabora.order_operation_signing_keys (
  key_id text PRIMARY KEY
    CHECK (key_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  hmac_key bytea NOT NULL
    CHECK (octet_length(hmac_key) BETWEEN 32 AND 64),
  not_before timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  disabled_at timestamptz,
  CHECK (expires_at > not_before),
  CHECK (disabled_at IS NULL OR disabled_at >= not_before)
);

ALTER TABLE sabora.order_operation_signing_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.order_operation_signing_keys FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.order_operation_signing_keys
  FROM PUBLIC, anon, authenticated, sabora_staff_reader, sabora_admin_writer;

-- The function owner is a sealed NOLOGIN capability. It receives only the
-- exact columns used by the single wrapper below. Runtime logins receive no
-- table, sequence, role membership or key-reading privilege.
REVOKE ALL ON SCHEMA sabora FROM sabora_order_operations_fn_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA sabora FROM sabora_order_operations_fn_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sabora FROM sabora_order_operations_fn_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora FROM sabora_order_operations_fn_owner;
GRANT USAGE ON SCHEMA sabora, extensions TO sabora_order_operations_fn_owner;

GRANT SELECT (key_id, hmac_key, not_before, expires_at, disabled_at)
      , UPDATE (disabled_at)
  ON sabora.order_operation_signing_keys
  TO sabora_order_operations_fn_owner;
GRANT SELECT (user_id, role, state)
      , UPDATE (state)
  ON sabora.staff_members
  TO sabora_order_operations_fn_owner;
GRANT SELECT (id, order_id, status), UPDATE (status)
  ON sabora.order_lines
  TO sabora_order_operations_fn_owner;
GRANT SELECT (id, order_line_id, acknowledged_at),
      INSERT (order_id, order_line_id),
      UPDATE (acknowledged_at, acknowledged_by)
  ON sabora.pickup_notifications
  TO sabora_order_operations_fn_owner;
GRANT INSERT (
  id, order_id, order_line_id, actor_user_id,
  from_status, to_status, correlation_id
) ON sabora.order_line_events
  TO sabora_order_operations_fn_owner;
GRANT SELECT (
  actor_user_id, correlation_id, request_fingerprint,
  order_id, order_line_id, previous_status, current_status,
  event_id, notification_id
), INSERT (
  actor_user_id, correlation_id, request_fingerprint,
  order_id, order_line_id, requested_status,
  previous_status, current_status, event_id, notification_id
) ON sabora.order_line_transition_requests
  TO sabora_order_operations_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.enforce_active_transition_actor()
  TO sabora_order_operations_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.require_active_staff_role(uuid)
  TO sabora_order_operations_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea, bytea, text)
  TO sabora_order_operations_fn_owner;

CREATE POLICY sabora_order_ops_owner_key_select
  ON sabora.order_operation_signing_keys FOR SELECT
  TO sabora_order_operations_fn_owner USING (true);
CREATE POLICY sabora_order_ops_owner_key_lock
  ON sabora.order_operation_signing_keys FOR UPDATE
  TO sabora_order_operations_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY sabora_order_ops_owner_staff_select
  ON sabora.staff_members FOR SELECT
  TO sabora_order_operations_fn_owner USING (true);
CREATE POLICY sabora_order_ops_owner_staff_lock
  ON sabora.staff_members FOR UPDATE
  TO sabora_order_operations_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY sabora_order_ops_owner_line_select
  ON sabora.order_lines FOR SELECT
  TO sabora_order_operations_fn_owner USING (true);
CREATE POLICY sabora_order_ops_owner_line_update
  ON sabora.order_lines FOR UPDATE
  TO sabora_order_operations_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY sabora_order_ops_owner_notification_select
  ON sabora.pickup_notifications FOR SELECT
  TO sabora_order_operations_fn_owner USING (true);
CREATE POLICY sabora_order_ops_owner_notification_insert
  ON sabora.pickup_notifications FOR INSERT
  TO sabora_order_operations_fn_owner WITH CHECK (true);
CREATE POLICY sabora_order_ops_owner_notification_update
  ON sabora.pickup_notifications FOR UPDATE
  TO sabora_order_operations_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY sabora_order_ops_owner_event_insert
  ON sabora.order_line_events FOR INSERT
  TO sabora_order_operations_fn_owner WITH CHECK (true);
CREATE POLICY sabora_order_ops_owner_request_select
  ON sabora.order_line_transition_requests FOR SELECT
  TO sabora_order_operations_fn_owner USING (true);
CREATE POLICY sabora_order_ops_owner_request_insert
  ON sabora.order_line_transition_requests FOR INSERT
  TO sabora_order_operations_fn_owner WITH CHECK (true);

CREATE FUNCTION sabora.transition_order_line_authorized_candidate(
  p_key_id text,
  p_database_role text,
  p_actor_user_id uuid,
  p_order_line_id uuid,
  p_next_status text,
  p_correlation_id text,
  p_issued_at_ms bigint,
  p_expires_at_ms bigint,
  p_signature_hex text
)
RETURNS TABLE (
  updated_order_id uuid,
  updated_line_id uuid,
  previous_status text,
  current_status text,
  repeated boolean,
  event_id uuid,
  notification_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $authorized_operation$
DECLARE
  v_key_secret bytea;
  v_key_expires_at timestamptz;
  v_message text;
  v_expected_signature bytea;
  v_provided_signature bytea;
  v_signature_difference integer := 0;
  v_now timestamptz := clock_timestamp();
  v_now_ms bigint;
  v_role text;
  v_request record;
  v_order_id uuid;
  v_line_id uuid;
  v_previous_status text;
  v_fingerprint bytea;
  v_event_id uuid := gen_random_uuid();
  v_notification_id uuid;
  v_index integer;
BEGIN
  IF p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
    OR p_database_role IS NULL OR p_database_role !~ '^[a-z][a-z0-9_]{0,62}$'
    OR p_database_role <> session_user::text
    OR p_actor_user_id IS NULL OR p_order_line_id IS NULL
    OR p_next_status IS NULL
    OR p_next_status NOT IN ('preparing','ready','picked_up')
    OR p_correlation_id IS NULL
    OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
    OR p_issued_at_ms IS NULL OR p_expires_at_ms IS NULL
    OR p_expires_at_ms::numeric - p_issued_at_ms::numeric NOT BETWEEN 1 AND 30000
    OR p_signature_hex IS NULL OR p_signature_hex !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid_order_operation_capability' USING errcode = '42501';
  END IF;

  v_now_ms := floor(extract(epoch FROM v_now) * 1000)::bigint;
  IF p_issued_at_ms::numeric > v_now_ms::numeric + 5000
    OR p_expires_at_ms <= v_now_ms
  THEN
    RAISE EXCEPTION 'invalid_order_operation_capability' USING errcode = '42501';
  END IF;

  SELECT key.hmac_key, key.expires_at
    INTO v_key_secret, v_key_expires_at
    FROM sabora.order_operation_signing_keys key
    WHERE key.key_id = p_key_id
      AND key.disabled_at IS NULL
      AND key.not_before <= v_now
      AND key.expires_at > v_now
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_order_operation_capability' USING errcode = '42501';
  END IF;

  v_message := 'sabora.order-line-transition.v1' || chr(10)
    || p_key_id || chr(10)
    || p_database_role || chr(10)
    || lower(p_actor_user_id::text) || chr(10)
    || lower(p_order_line_id::text) || chr(10)
    || p_next_status || chr(10)
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
    RAISE EXCEPTION 'invalid_order_operation_capability' USING errcode = '42501';
  END IF;
  FOR v_index IN 0..31 LOOP
    v_signature_difference := v_signature_difference |
      (get_byte(v_expected_signature, v_index) # get_byte(v_provided_signature, v_index));
  END LOOP;
  IF v_signature_difference <> 0 THEN
    RAISE EXCEPTION 'invalid_order_operation_capability' USING errcode = '42501';
  END IF;

  v_fingerprint := sha256(convert_to(
    p_order_line_id::text || ':' || p_next_status,
    'UTF8'
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_actor_user_id::text || ':' || p_correlation_id,
    0
  ));

  SELECT member.role INTO v_role
    FROM sabora.staff_members member
    WHERE member.user_id = p_actor_user_id
      AND member.state = 'active'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor_not_authorized' USING errcode = '42501';
  END IF;
  IF NOT (
    (v_role = 'kitchen' AND p_next_status IN ('preparing','ready')) OR
    (v_role = 'waiter' AND p_next_status = 'picked_up') OR
    v_role = 'admin'
  ) THEN
    RAISE EXCEPTION 'role_not_allowed_for_line_transition' USING errcode = '42501';
  END IF;

  -- The capability and key were checked before potentially waiting for the
  -- actor/correlation and membership locks. Re-check time after those waits
  -- and before revealing a replay or performing any mutation. The key row's
  -- SHARE lock prevents a concurrent disable/rotation from changing the
  -- decision until this transaction ends.
  v_now := clock_timestamp();
  v_now_ms := floor(extract(epoch FROM v_now) * 1000)::bigint;
  IF p_issued_at_ms::numeric > v_now_ms::numeric + 5000
    OR p_expires_at_ms <= v_now_ms
    OR v_key_expires_at <= v_now
  THEN
    RAISE EXCEPTION 'invalid_order_operation_capability' USING errcode = '42501';
  END IF;

  SELECT request.request_fingerprint, request.order_id,
         request.order_line_id, request.previous_status,
         request.current_status, request.event_id, request.notification_id
    INTO v_request
    FROM sabora.order_line_transition_requests request
    WHERE request.actor_user_id = p_actor_user_id
      AND request.correlation_id = p_correlation_id;
  IF FOUND THEN
    IF v_request.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'line_transition_idempotency_conflict' USING errcode = '23505';
    END IF;
    RETURN QUERY SELECT
      v_request.order_id,
      v_request.order_line_id,
      v_request.previous_status,
      v_request.current_status,
      true,
      v_request.event_id,
      v_request.notification_id;
    RETURN;
  END IF;

  SELECT line.order_id, line.id, line.status
    INTO v_order_id, v_line_id, v_previous_status
    FROM sabora.order_lines line
    WHERE line.id = p_order_line_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'line_not_found' USING errcode = 'P0002';
  END IF;

  IF NOT (
    (v_previous_status = 'confirmed' AND p_next_status = 'preparing') OR
    (v_previous_status = 'preparing' AND p_next_status = 'ready') OR
    (v_previous_status = 'ready' AND p_next_status = 'picked_up')
  ) THEN
    RAISE EXCEPTION 'invalid_line_transition' USING errcode = '22023';
  END IF;

  UPDATE sabora.order_lines
    SET status = p_next_status
    WHERE id = v_line_id;

  IF p_next_status = 'ready' THEN
    INSERT INTO sabora.pickup_notifications(order_id, order_line_id)
      VALUES (v_order_id, v_line_id)
      RETURNING id INTO v_notification_id;
  ELSIF p_next_status = 'picked_up' THEN
    UPDATE sabora.pickup_notifications
      SET acknowledged_at = clock_timestamp(),
          acknowledged_by = p_actor_user_id
      WHERE order_line_id = v_line_id
        AND acknowledged_at IS NULL
      RETURNING id INTO v_notification_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'pickup_notification_missing' USING errcode = 'P0002';
    END IF;
  END IF;

  INSERT INTO sabora.order_line_events(
    id, order_id, order_line_id, actor_user_id,
    from_status, to_status, correlation_id
  ) VALUES (
    v_event_id, v_order_id, v_line_id, p_actor_user_id,
    v_previous_status, p_next_status, p_correlation_id
  );

  INSERT INTO sabora.order_line_transition_requests(
    actor_user_id, correlation_id, request_fingerprint,
    order_id, order_line_id, requested_status,
    previous_status, current_status, event_id, notification_id
  ) VALUES (
    p_actor_user_id, p_correlation_id, v_fingerprint,
    v_order_id, v_line_id, p_next_status,
    v_previous_status, p_next_status, v_event_id, v_notification_id
  );

  RETURN QUERY SELECT
    v_order_id,
    v_line_id,
    v_previous_status,
    p_next_status,
    false,
    v_event_id,
    v_notification_id;
END;
$authorized_operation$;

ALTER FUNCTION sabora.transition_order_line_authorized_candidate(
  text,text,uuid,uuid,text,text,bigint,bigint,text
) OWNER TO sabora_order_operations_fn_owner;
REVOKE ALL ON FUNCTION sabora.transition_order_line_authorized_candidate(
  text,text,uuid,uuid,text,text,bigint,bigint,text
) FROM PUBLIC, anon, authenticated, sabora_staff_reader, sabora_admin_writer;

COMMENT ON FUNCTION sabora.transition_order_line_authorized_candidate(
  text,text,uuid,uuid,text,text,bigint,bigint,text
) IS 'Candidate HMAC-bound transition. No runtime EXECUTE grant is provisioned by migrations.';
COMMENT ON TABLE sabora.order_operation_signing_keys IS
  'Empty candidate keyring. Key material requires separate privileged provisioning and never belongs to a runtime SQL login.';

COMMIT;
