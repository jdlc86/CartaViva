-- Read-only candidate delta applied after genesis. Keep the signed board
-- as the source of authorization, pagination and delivery projection.
BEGIN;
DO $owner$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sabora_order_operations_fn_owner'
   AND NOT (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole
    OR rolcreatedb OR rolreplication))
 THEN RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner'; END IF;
END;
$owner$;
GRANT CREATE ON SCHEMA sabora TO sabora_order_operations_fn_owner;
GRANT sabora_order_operations_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
GRANT SELECT(id) ON sabora.kitchen_dispatches TO sabora_order_operations_fn_owner;

CREATE FUNCTION sabora.read_order_operations_dispatch_board_h6_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_status text,p_after_confirmed_at_ms bigint,p_after_order_id uuid,p_after_line_number integer,
 p_limit integer,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
) RETURNS TABLE(
 order_id uuid,line_id uuid,table_number integer,customer_label text,
 confirmed_at timestamptz,"grouping" text,line_number integer,
 category text,name text,quantity integer,status text,
 notification_id uuid,notification_created_at timestamptz,notification_acknowledged_at timestamptz,
 pickup_task_id uuid,pickup_state text,pickup_version bigint,pickup_claimed_by uuid,
 pickup_claimed_display_id text,pickup_claimed_at timestamptz,pickup_updated_at timestamptz,
 delivery_table_id uuid,delivery_session_id uuid,delivery_visit_key text,delivery_version bigint,
 pending_dispatch_id uuid
) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $board$
 WITH authorized AS MATERIALIZED (
  SELECT b.* FROM sabora.read_order_operations_delivery_pickup_board_h6_candidate(
   p_key_id,p_database_role,p_actor_user_id,p_staff_role,p_status,p_after_confirmed_at_ms,
   p_after_order_id,p_after_line_number,p_limit,p_issued_at_ms,p_expires_at_ms,p_signature_hex) b
 )
 SELECT b.*,d.id
 FROM authorized b
 LEFT JOIN sabora.order_rounds r ON r.order_id=b.order_id
  AND b.status='confirmed' AND p_staff_role IN ('admin','kitchen')
 LEFT JOIN sabora.kitchen_dispatches d ON d.round_id=r.id AND d.order_id=b.order_id
  AND d.revision_number=r.revision_number AND d.state='requested'
 ORDER BY b.confirmed_at,b.order_id,b.line_number;
$board$;

ALTER FUNCTION sabora.read_order_operations_dispatch_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 OWNER TO sabora_order_operations_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_order_operations_dispatch_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_operations_runtime;
DO $managed_defaults$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
  REVOKE ALL ON FUNCTION sabora.read_order_operations_dispatch_board_h6_candidate(
   text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text) FROM service_role;
 END IF;
END;
$managed_defaults$;
GRANT EXECUTE ON FUNCTION sabora.read_order_operations_dispatch_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 TO sabora_b3_h4_transition_runtime;
REVOKE CREATE ON SCHEMA sabora FROM sabora_order_operations_fn_owner;
DO $release$
BEGIN
 EXECUTE format('REVOKE sabora_order_operations_fn_owner FROM %I GRANTED BY %I',current_user,current_user);
END;
$release$;
COMMIT;
