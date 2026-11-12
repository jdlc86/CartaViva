-- Candidate actor-bound read boundary for kitchen and waiter operations.
-- Never applied to an operational Supabase project by this change. The
-- migration provisions no key material and grants EXECUTE to no runtime LOGIN.
BEGIN;

-- The sealed function owner receives only the columns needed to build the
-- approved operational projections. Runtime identities keep zero direct table,
-- column, sequence or keyring privileges.
GRANT SELECT (id, table_id, customer_alias, company, confirmed_at, grouping)
  ON sabora.orders TO sabora_order_operations_fn_owner;
GRANT SELECT (id, number)
  ON sabora.dining_tables TO sabora_order_operations_fn_owner;
GRANT SELECT (id, order_id, table_id, line_number, category, name, quantity, status)
  ON sabora.order_lines TO sabora_order_operations_fn_owner;
GRANT SELECT (id, order_id, order_line_id, created_at, acknowledged_at)
  ON sabora.pickup_notifications TO sabora_order_operations_fn_owner;
GRANT SELECT (
  id, order_id, order_line_id, actor_user_id,
  from_status, to_status, occurred_at
) ON sabora.order_line_events TO sabora_order_operations_fn_owner;

CREATE POLICY sabora_order_ops_owner_order_select
  ON sabora.orders FOR SELECT
  TO sabora_order_operations_fn_owner USING (true);
CREATE POLICY sabora_order_ops_owner_table_select
  ON sabora.dining_tables FOR SELECT
  TO sabora_order_operations_fn_owner USING (true);
CREATE POLICY sabora_order_ops_owner_event_select
  ON sabora.order_line_events FOR SELECT
  TO sabora_order_operations_fn_owner USING (true);

-- Internal verifier. It is intentionally not executable by runtime identities;
-- the two typed projection wrappers below construct and bind the scope string.
CREATE FUNCTION sabora.authorize_order_operation_read_candidate(
  p_key_id text,
  p_database_role text,
  p_actor_user_id uuid,
  p_staff_role text,
  p_operation text,
  p_scope text,
  p_issued_at_ms bigint,
  p_expires_at_ms bigint,
  p_signature_hex text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $authorized_read$
DECLARE
  v_key_secret bytea;
  v_key_expires_at timestamptz;
  v_message text;
  v_expected_signature bytea;
  v_provided_signature bytea;
  v_signature_difference integer := 0;
  v_now timestamptz := clock_timestamp();
  v_now_ms bigint;
  v_durable_role text;
  v_index integer;
BEGIN
  IF p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
    OR p_database_role IS NULL OR p_database_role !~ '^[a-z][a-z0-9_]{0,62}$'
    OR p_database_role <> session_user::text
    OR p_actor_user_id IS NULL
    OR p_staff_role NOT IN ('admin','waiter','kitchen')
    OR p_operation NOT IN ('board','history')
    OR p_scope IS NULL OR length(p_scope) NOT BETWEEN 1 AND 512
    OR p_scope !~ '^[ -~]+$'
    OR p_issued_at_ms IS NULL OR p_expires_at_ms IS NULL
    OR p_expires_at_ms::numeric - p_issued_at_ms::numeric NOT BETWEEN 1 AND 30000
    OR p_signature_hex IS NULL OR p_signature_hex !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid_order_operation_read_capability' USING errcode = '42501';
  END IF;

  v_now_ms := floor(extract(epoch FROM v_now) * 1000)::bigint;
  IF p_issued_at_ms::numeric > v_now_ms::numeric + 5000
    OR p_expires_at_ms <= v_now_ms
  THEN
    RAISE EXCEPTION 'invalid_order_operation_read_capability' USING errcode = '42501';
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
    RAISE EXCEPTION 'invalid_order_operation_read_capability' USING errcode = '42501';
  END IF;

  v_message := 'sabora.order-operations-read.v1' || chr(10)
    || p_key_id || chr(10)
    || p_database_role || chr(10)
    || lower(p_actor_user_id::text) || chr(10)
    || p_staff_role || chr(10)
    || p_operation || chr(10)
    || p_scope || chr(10)
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
    RAISE EXCEPTION 'invalid_order_operation_read_capability' USING errcode = '42501';
  END IF;
  FOR v_index IN 0..31 LOOP
    v_signature_difference := v_signature_difference |
      (get_byte(v_expected_signature, v_index) # get_byte(v_provided_signature, v_index));
  END LOOP;
  IF v_signature_difference <> 0 THEN
    RAISE EXCEPTION 'invalid_order_operation_read_capability' USING errcode = '42501';
  END IF;

  -- Revalidate and lock the durable membership. Suspension or role changes
  -- that acquire the row lock first win; otherwise they wait until this read
  -- transaction commits and cannot invalidate its authorization mid-query.
  SELECT member.role INTO v_durable_role
    FROM sabora.staff_members member
    WHERE member.user_id = p_actor_user_id
      AND member.state = 'active'
    FOR SHARE;
  IF NOT FOUND OR v_durable_role <> p_staff_role THEN
    RAISE EXCEPTION 'actor_not_authorized' USING errcode = '42501';
  END IF;

  -- The key and membership locks can block. A capability that expires while
  -- waiting must not disclose any projection after the wait completes.
  v_now := clock_timestamp();
  v_now_ms := floor(extract(epoch FROM v_now) * 1000)::bigint;
  IF p_issued_at_ms::numeric > v_now_ms::numeric + 5000
    OR p_expires_at_ms <= v_now_ms
    OR v_key_expires_at <= v_now
  THEN
    RAISE EXCEPTION 'invalid_order_operation_read_capability' USING errcode = '42501';
  END IF;
END;
$authorized_read$;

ALTER FUNCTION sabora.authorize_order_operation_read_candidate(
  text,text,uuid,text,text,text,bigint,bigint,text
) OWNER TO sabora_order_operations_fn_owner;
REVOKE ALL ON FUNCTION sabora.authorize_order_operation_read_candidate(
  text,text,uuid,text,text,text,bigint,bigint,text
) FROM PUBLIC, anon, authenticated, sabora_staff_reader, sabora_admin_writer;

CREATE FUNCTION sabora.read_order_operations_board_authorized_candidate(
  p_key_id text,
  p_database_role text,
  p_actor_user_id uuid,
  p_staff_role text,
  p_status text,
  p_after_confirmed_at_ms bigint,
  p_after_order_id uuid,
  p_after_line_number integer,
  p_limit integer,
  p_issued_at_ms bigint,
  p_expires_at_ms bigint,
  p_signature_hex text
)
RETURNS TABLE (
  order_id uuid,
  line_id uuid,
  table_number integer,
  customer_label text,
  confirmed_at timestamptz,
  "grouping" text,
  line_number integer,
  category text,
  name text,
  quantity integer,
  status text,
  notification_id uuid,
  notification_created_at timestamptz,
  notification_acknowledged_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $board$
DECLARE
  v_scope text;
  v_after_confirmed_at timestamptz;
BEGIN
  IF p_staff_role NOT IN ('admin','waiter','kitchen')
    OR (p_status IS NOT NULL AND p_status NOT IN ('confirmed','preparing','ready','picked_up'))
    OR (p_staff_role = 'kitchen' AND p_status = 'picked_up')
    OR (p_staff_role = 'waiter' AND p_status IN ('confirmed','preparing'))
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR NOT (
      (p_after_confirmed_at_ms IS NULL AND p_after_order_id IS NULL AND p_after_line_number IS NULL)
      OR (p_after_confirmed_at_ms IS NOT NULL AND p_after_confirmed_at_ms >= 0
        AND p_after_order_id IS NOT NULL
        AND p_after_line_number IS NOT NULL AND p_after_line_number > 0)
    )
  THEN
    RAISE EXCEPTION 'invalid_order_operations_scope' USING errcode = '42501';
  END IF;

  v_scope := 'status=' || COALESCE(p_status, '*')
    || ';after_ms=' || COALESCE(p_after_confirmed_at_ms::text, '*')
    || ';after_order=' || COALESCE(lower(p_after_order_id::text), '*')
    || ';after_line=' || COALESCE(p_after_line_number::text, '*')
    || ';limit=' || p_limit::text;
  PERFORM sabora.authorize_order_operation_read_candidate(
    p_key_id, p_database_role, p_actor_user_id, p_staff_role,
    'board', v_scope, p_issued_at_ms, p_expires_at_ms, p_signature_hex
  );

  IF p_after_confirmed_at_ms IS NOT NULL THEN
    v_after_confirmed_at := to_timestamp(p_after_confirmed_at_ms::numeric / 1000);
  END IF;

  RETURN QUERY
  SELECT orders.id,
         lines.id,
         tables.number,
         COALESCE(orders.customer_alias, orders.company),
         orders.confirmed_at,
         orders.grouping,
         lines.line_number,
         lines.category,
         lines.name,
         lines.quantity,
         lines.status,
         notifications.id,
         notifications.created_at,
         notifications.acknowledged_at
    FROM sabora.order_lines lines
    JOIN sabora.orders orders ON orders.id = lines.order_id
    JOIN sabora.dining_tables tables ON tables.id = lines.table_id
    LEFT JOIN sabora.pickup_notifications notifications
      ON notifications.order_line_id = lines.id
   WHERE (
     p_staff_role = 'admin'
     OR (p_staff_role = 'kitchen' AND lines.status IN ('confirmed','preparing','ready'))
     OR (p_staff_role = 'waiter' AND lines.status IN ('ready','picked_up'))
   )
     AND (p_status IS NULL OR lines.status = p_status)
     AND (
       v_after_confirmed_at IS NULL
       OR (orders.confirmed_at, orders.id, lines.line_number) >
          (v_after_confirmed_at, p_after_order_id, p_after_line_number)
     )
   ORDER BY orders.confirmed_at, orders.id, lines.line_number
   LIMIT p_limit + 1;
END;
$board$;

ALTER FUNCTION sabora.read_order_operations_board_authorized_candidate(
  text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text
) OWNER TO sabora_order_operations_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_order_operations_board_authorized_candidate(
  text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text
) FROM PUBLIC, anon, authenticated, sabora_staff_reader, sabora_admin_writer;

CREATE FUNCTION sabora.read_order_operations_history_authorized_candidate(
  p_key_id text,
  p_database_role text,
  p_actor_user_id uuid,
  p_staff_role text,
  p_order_id uuid,
  p_limit integer,
  p_issued_at_ms bigint,
  p_expires_at_ms bigint,
  p_signature_hex text
)
RETURNS TABLE (
  event_id uuid,
  line_id uuid,
  line_number integer,
  name text,
  from_status text,
  to_status text,
  occurred_at timestamptz,
  actor_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $history$
DECLARE
  v_scope text;
BEGIN
  IF p_staff_role NOT IN ('admin','waiter','kitchen')
    OR p_order_id IS NULL
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200
  THEN
    RAISE EXCEPTION 'invalid_order_operations_scope' USING errcode = '42501';
  END IF;

  v_scope := 'order=' || lower(p_order_id::text) || ';limit=' || p_limit::text;
  PERFORM sabora.authorize_order_operation_read_candidate(
    p_key_id, p_database_role, p_actor_user_id, p_staff_role,
    'history', v_scope, p_issued_at_ms, p_expires_at_ms, p_signature_hex
  );

  -- Do not turn history into an order UUID oracle. Non-admin roles may inspect
  -- only an order that is currently present in their approved operational view.
  IF p_staff_role <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM sabora.order_lines visible
     WHERE visible.order_id = p_order_id
       AND (
         (p_staff_role = 'kitchen' AND visible.status IN ('confirmed','preparing','ready'))
         OR (p_staff_role = 'waiter' AND visible.status IN ('ready','picked_up'))
       )
  ) THEN
    RAISE EXCEPTION 'order_not_found' USING errcode = 'P0002';
  END IF;

  RETURN QUERY
  SELECT events.id,
         events.order_line_id,
         lines.line_number,
         lines.name,
         events.from_status,
         events.to_status,
         events.occurred_at,
         members.role
    FROM sabora.order_line_events events
    JOIN sabora.order_lines lines ON lines.id = events.order_line_id
    JOIN sabora.staff_members members ON members.user_id = events.actor_user_id
   WHERE events.order_id = p_order_id
   ORDER BY events.occurred_at, events.id
   LIMIT p_limit;
END;
$history$;

ALTER FUNCTION sabora.read_order_operations_history_authorized_candidate(
  text,text,uuid,text,uuid,integer,bigint,bigint,text
) OWNER TO sabora_order_operations_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_order_operations_history_authorized_candidate(
  text,text,uuid,text,uuid,integer,bigint,bigint,text
) FROM PUBLIC, anon, authenticated, sabora_staff_reader, sabora_admin_writer;

COMMENT ON FUNCTION sabora.read_order_operations_board_authorized_candidate(
  text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text
) IS 'Candidate HMAC-bound operational board projection. No runtime EXECUTE grant is provisioned by migrations.';
COMMENT ON FUNCTION sabora.read_order_operations_history_authorized_candidate(
  text,text,uuid,text,uuid,integer,bigint,bigint,text
) IS 'Candidate HMAC-bound operational history projection. No runtime EXECUTE grant is provisioned by migrations.';

COMMIT;
