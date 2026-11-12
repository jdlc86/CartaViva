-- H6/B2: pickup staff notifications follow the effective line delivery destination.
-- Candidate-only migration. No runtime activation, credentials, or production access.
BEGIN;
-- CV-005 OPTION A: transaction-scoped owner membership for existing function ACL.
DO $cv005_existing_owner_access$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname,roles.rolcanlogin,roles.rolinherit,roles.rolsuper,roles.rolbypassrls,roles.rolcreaterole,roles.rolcreatedb,roles.rolreplication FROM pg_catalog.pg_roles roles
 WHERE roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner
CREATE OR REPLACE FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  p_order_id uuid,p_line_id uuid,p_task_id uuid,p_task_state text,
  p_task_version bigint,p_claimed_by uuid,p_actor_user_id uuid,
  p_actor_role text,p_event_type text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $pickup_events$
DECLARE v_destination record;v_payload jsonb;v_claimed_display text;v_actor_display text;
BEGIN
  IF p_order_id IS NULL OR p_line_id IS NULL OR p_task_id IS NULL
    OR p_task_state NOT IN ('ready','claimed','corrected') OR p_task_version<1
    OR p_actor_user_id IS NULL OR p_actor_role NOT IN ('admin','root','waiter','kitchen')
    OR p_event_type NOT IN ('sabora.pickup.ready','sabora.pickup.claimed',
      'sabora.pickup.claim_cancelled','sabora.pickup.ready_corrected')
  THEN RAISE EXCEPTION 'invalid_pickup_event' USING errcode='22023'; END IF;
  SELECT coalesce(d.table_id,o.table_id) AS table_id,
    coalesce(d.session_id,o.session_id) AS session_id,
    coalesce(d.destination_version,1::bigint) AS destination_version
    INTO v_destination
  FROM sabora.orders o
  JOIN sabora.order_lines l ON l.order_id=o.id AND l.id=p_line_id
  LEFT JOIN sabora.order_line_delivery_destinations d ON d.order_line_id=l.id
  WHERE o.id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING errcode='P0002'; END IF;
  SELECT task.claimed_display_id INTO v_claimed_display FROM sabora.pickup_tasks task
   WHERE task.id=p_task_id;
  SELECT enrollment.operational_display_id INTO v_actor_display
   FROM sabora.staff_enrollments enrollment WHERE enrollment.auth_user_id=p_actor_user_id;
  v_payload:=jsonb_build_object('orderId',p_order_id,'lineId',p_line_id,
    'pickupTaskId',p_task_id,'state',p_task_state,'version',p_task_version,
    'claimedBy',p_claimed_by,'claimedDisplayId',v_claimed_display,
    'actorId',p_actor_user_id,'actorDisplayId',v_actor_display,'actorRole',p_actor_role,
    'deliveryTableId',v_destination.table_id,
    'deliveryVersion',v_destination.destination_version);
  PERFORM sabora.emit_h6_event_candidate(v_destination.table_id,v_destination.session_id,
    NULL,NULL,NULL,'waiter','waiter',p_event_type,p_task_id,p_task_version,v_payload);
  PERFORM sabora.emit_h6_event_candidate(v_destination.table_id,v_destination.session_id,
    NULL,NULL,NULL,'kitchen','kitchen',p_event_type,p_task_id,p_task_version,v_payload);
END;
$pickup_events$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  uuid,uuid,uuid,text,bigint,uuid,uuid,text,text) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  uuid,uuid,uuid,text,bigint,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
  sabora_h6_provider_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  uuid,uuid,uuid,text,bigint,uuid,uuid,text,text) TO sabora_h6_fn_owner;
REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;
COMMIT;
 AND roles.rolname<>current_user::text
 AND (EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=roles.oid AND n.nspname='sabora')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=roles.oid AND n.nspname='sabora'))
 LOOP
  IF r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication THEN RAISE EXCEPTION 'cv005_unsafe_preexisting_fn_owner' USING errcode='0P000'; END IF;
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',r.rolname);
 END LOOP;
END;
$cv005_existing_owner_access$;

CREATE OR REPLACE FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  p_order_id uuid,p_line_id uuid,p_task_id uuid,p_task_state text,
  p_task_version bigint,p_claimed_by uuid,p_actor_user_id uuid,
  p_actor_role text,p_event_type text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $pickup_events$
DECLARE v_destination record;v_payload jsonb;v_claimed_display text;v_actor_display text;
BEGIN
  IF p_order_id IS NULL OR p_line_id IS NULL OR p_task_id IS NULL
    OR p_task_state NOT IN ('ready','claimed','corrected') OR p_task_version<1
    OR p_actor_user_id IS NULL OR p_actor_role NOT IN ('admin','root','waiter','kitchen')
    OR p_event_type NOT IN ('sabora.pickup.ready','sabora.pickup.claimed',
      'sabora.pickup.claim_cancelled','sabora.pickup.ready_corrected')
  THEN RAISE EXCEPTION 'invalid_pickup_event' USING errcode='22023'; END IF;
  SELECT coalesce(d.table_id,o.table_id) AS table_id,
    coalesce(d.session_id,o.session_id) AS session_id,
    coalesce(d.destination_version,1::bigint) AS destination_version
    INTO v_destination
  FROM sabora.orders o
  JOIN sabora.order_lines l ON l.order_id=o.id AND l.id=p_line_id
  LEFT JOIN sabora.order_line_delivery_destinations d ON d.order_line_id=l.id
  WHERE o.id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING errcode='P0002'; END IF;
  SELECT task.claimed_display_id INTO v_claimed_display FROM sabora.pickup_tasks task
   WHERE task.id=p_task_id;
  SELECT enrollment.operational_display_id INTO v_actor_display
   FROM sabora.staff_enrollments enrollment WHERE enrollment.auth_user_id=p_actor_user_id;
  v_payload:=jsonb_build_object('orderId',p_order_id,'lineId',p_line_id,
    'pickupTaskId',p_task_id,'state',p_task_state,'version',p_task_version,
    'claimedBy',p_claimed_by,'claimedDisplayId',v_claimed_display,
    'actorId',p_actor_user_id,'actorDisplayId',v_actor_display,'actorRole',p_actor_role,
    'deliveryTableId',v_destination.table_id,
    'deliveryVersion',v_destination.destination_version);
  PERFORM sabora.emit_h6_event_candidate(v_destination.table_id,v_destination.session_id,
    NULL,NULL,NULL,'waiter','waiter',p_event_type,p_task_id,p_task_version,v_payload);
  PERFORM sabora.emit_h6_event_candidate(v_destination.table_id,v_destination.session_id,
    NULL,NULL,NULL,'kitchen','kitchen',p_event_type,p_task_id,p_task_version,v_payload);
END;
$pickup_events$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  uuid,uuid,uuid,text,bigint,uuid,uuid,text,text) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  uuid,uuid,uuid,text,bigint,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
  sabora_h6_provider_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  uuid,uuid,uuid,text,bigint,uuid,uuid,text,text) TO sabora_h6_fn_owner;
REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;

-- CV-005: release every own-granted owner membership before COMMIT.
DO $cv005_existing_owner_release$
DECLARE r name;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles roles ON roles.oid=m.roleid
 WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',r); END LOOP;
END;
$cv005_existing_owner_release$;
COMMIT;
