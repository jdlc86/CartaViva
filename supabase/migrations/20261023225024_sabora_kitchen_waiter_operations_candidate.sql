-- Candidate operational boundary for kitchen preparation and waiter pickup.
-- Never applied to an operational Supabase project by this change.
-- Delivery and cancellation remain deliberately unavailable until their
-- incident, arbitration and economic contracts are approved.
BEGIN;

ALTER TABLE sabora.order_line_events
  ADD COLUMN correlation_id text,
  ADD CONSTRAINT order_line_event_correlation_valid CHECK (
    correlation_id IS NULL OR correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'
  );

CREATE UNIQUE INDEX order_line_events_actor_correlation_unique
  ON sabora.order_line_events(actor_user_id, correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE TABLE sabora.order_line_transition_requests (
  actor_user_id uuid NOT NULL,
  correlation_id text NOT NULL
    CHECK (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  request_fingerprint bytea NOT NULL
    CHECK (octet_length(request_fingerprint) = 32),
  order_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  requested_status text NOT NULL
    CHECK (requested_status IN ('preparing','ready','picked_up')),
  previous_status text NOT NULL
    CHECK (previous_status IN ('confirmed','preparing','ready')),
  current_status text NOT NULL
    CHECK (current_status IN ('preparing','ready','picked_up')),
  event_id uuid NOT NULL UNIQUE,
  notification_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (actor_user_id, correlation_id),
  FOREIGN KEY (order_id, order_line_id)
    REFERENCES sabora.order_lines(order_id, id),
  FOREIGN KEY (event_id)
    REFERENCES sabora.order_line_events(id),
  FOREIGN KEY (notification_id)
    REFERENCES sabora.pickup_notifications(id),
  CHECK (
    (previous_status = 'confirmed' AND current_status = 'preparing') OR
    (previous_status = 'preparing' AND current_status = 'ready') OR
    (previous_status = 'ready' AND current_status = 'picked_up')
  ),
  CHECK (requested_status = current_status)
);

CREATE INDEX order_line_transition_requests_line_history
  ON sabora.order_line_transition_requests(order_line_id, created_at, correlation_id);

ALTER TABLE sabora.order_line_transition_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.order_line_transition_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.order_line_transition_requests
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION sabora.reject_order_operation_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, sabora
AS $guard$
BEGIN
  RAISE EXCEPTION 'order_operation_history_append_only' USING errcode = '23514';
END;
$guard$;

CREATE TRIGGER sabora_order_line_events_append_only
  BEFORE UPDATE OR DELETE ON sabora.order_line_events
  FOR EACH ROW EXECUTE FUNCTION sabora.reject_order_operation_history_mutation();
CREATE TRIGGER sabora_order_line_events_no_truncate
  BEFORE TRUNCATE ON sabora.order_line_events
  FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_order_operation_history_mutation();
CREATE TRIGGER sabora_order_line_transition_requests_append_only
  BEFORE UPDATE OR DELETE ON sabora.order_line_transition_requests
  FOR EACH ROW EXECUTE FUNCTION sabora.reject_order_operation_history_mutation();
CREATE TRIGGER sabora_order_line_transition_requests_no_truncate
  BEFORE TRUNCATE ON sabora.order_line_transition_requests
  FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_order_operation_history_mutation();

REVOKE ALL ON FUNCTION sabora.reject_order_operation_history_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION sabora.transition_order_line_idempotent_candidate(
  p_actor_user_id uuid,
  p_order_line_id uuid,
  p_next_status text,
  p_correlation_id text
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
SECURITY INVOKER
SET search_path = pg_catalog, sabora
AS $operation$
DECLARE
  v_line sabora.order_lines%ROWTYPE;
  v_role text;
  v_request sabora.order_line_transition_requests%ROWTYPE;
  v_fingerprint bytea;
  v_event_id uuid := gen_random_uuid();
  v_notification_id uuid;
BEGIN
  IF p_actor_user_id IS NULL OR p_order_line_id IS NULL
    OR p_next_status NOT IN ('preparing','ready','picked_up')
    OR p_correlation_id IS NULL
    OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
  THEN
    RAISE EXCEPTION 'invalid_line_transition_input' USING errcode = '22023';
  END IF;

  v_fingerprint := sha256(convert_to(
    p_order_line_id::text || ':' || p_next_status,
    'UTF8'
  ));

  -- Serialize retries before reading their durable outcome. This allows an
  -- identical concurrent request to replay instead of racing the line state.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_actor_user_id::text || ':' || p_correlation_id,
    0
  ));

  -- A replay is still an authorized operation. Revalidate the current durable
  -- membership before disclosing its outcome, and keep it stable until commit.
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
    (v_role = 'admin')
  ) THEN
    RAISE EXCEPTION 'role_not_allowed_for_line_transition' USING errcode = '42501';
  END IF;

  SELECT * INTO v_request
    FROM sabora.order_line_transition_requests request
    WHERE request.actor_user_id = p_actor_user_id
      AND request.correlation_id = p_correlation_id
    FOR UPDATE;
  IF FOUND THEN
    IF v_request.request_fingerprint <> v_fingerprint THEN
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

  SELECT * INTO v_line
    FROM sabora.order_lines line
    WHERE line.id = p_order_line_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'line_not_found' USING errcode = 'P0002';
  END IF;

  IF NOT (
    (v_line.status = 'confirmed' AND p_next_status = 'preparing') OR
    (v_line.status = 'preparing' AND p_next_status = 'ready') OR
    (v_line.status = 'ready' AND p_next_status = 'picked_up')
  ) THEN
    RAISE EXCEPTION 'invalid_line_transition' USING errcode = '22023';
  END IF;

  UPDATE sabora.order_lines
    SET status = p_next_status
    WHERE id = v_line.id;

  IF p_next_status = 'ready' THEN
    INSERT INTO sabora.pickup_notifications(order_id, order_line_id)
      VALUES (v_line.order_id, v_line.id)
      RETURNING id INTO v_notification_id;
  ELSIF p_next_status = 'picked_up' THEN
    UPDATE sabora.pickup_notifications
      SET acknowledged_at = clock_timestamp(),
          acknowledged_by = p_actor_user_id
      WHERE order_line_id = v_line.id
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
    v_event_id, v_line.order_id, v_line.id, p_actor_user_id,
    v_line.status, p_next_status, p_correlation_id
  );

  INSERT INTO sabora.order_line_transition_requests(
    actor_user_id, correlation_id, request_fingerprint,
    order_id, order_line_id, requested_status,
    previous_status, current_status, event_id, notification_id
  ) VALUES (
    p_actor_user_id, p_correlation_id, v_fingerprint,
    v_line.order_id, v_line.id, p_next_status,
    v_line.status, p_next_status, v_event_id, v_notification_id
  );

  RETURN QUERY SELECT
    v_line.order_id,
    v_line.id,
    v_line.status,
    p_next_status,
    false,
    v_event_id,
    v_notification_id;
END;
$operation$;

REVOKE ALL ON FUNCTION sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;

COMMIT;
