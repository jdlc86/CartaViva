-- H6/B2: sealed destination-aware board preserving the H4/H6 pickup contract.
-- This is an independent candidate: no runtime grants or endpoint activation.
BEGIN;
-- The H4 reader has column-scoped access; H6 requires only this extra fallback column.
GRANT SELECT(session_id) ON sabora.order_lines TO sabora_order_operations_fn_owner;
CREATE FUNCTION sabora.read_order_operations_delivery_pickup_board_h6_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_status text,p_after_confirmed_at_ms bigint,p_after_order_id uuid,
 p_after_line_number integer,p_limit integer,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text
)
RETURNS TABLE(
 order_id uuid,line_id uuid,table_number integer,customer_label text,
 confirmed_at timestamptz,"grouping" text,line_number integer,
 category text,name text,quantity integer,status text,
 notification_id uuid,notification_created_at timestamptz,
 notification_acknowledged_at timestamptz,
 pickup_task_id uuid,pickup_state text,pickup_version bigint,
 pickup_claimed_by uuid,pickup_claimed_display_id text,
 pickup_claimed_at timestamptz,pickup_updated_at timestamptz,
 delivery_table_id uuid,delivery_session_id uuid,delivery_visit_key text,
 delivery_version bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $board_delivery_pickup$
DECLARE v_scope text;v_after timestamptz;
BEGIN
 IF p_staff_role NOT IN ('admin','waiter','kitchen')
 OR (p_status IS NOT NULL AND p_status NOT IN ('confirmed','preparing','ready','picked_up'))
 OR (p_staff_role='kitchen' AND p_status='picked_up')
 OR (p_staff_role='waiter' AND p_status IN ('confirmed','preparing'))
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
 OR NOT ((p_after_confirmed_at_ms IS NULL AND p_after_order_id IS NULL
 AND p_after_line_number IS NULL) OR
 (p_after_confirmed_at_ms IS NOT NULL AND p_after_confirmed_at_ms>=0
 AND p_after_order_id IS NOT NULL AND p_after_line_number>0))
 THEN RAISE EXCEPTION 'invalid_order_operations_scope' USING errcode='42501';END IF;
 v_scope:='status='||coalesce(p_status,'*')||
 ';after_ms='||coalesce(p_after_confirmed_at_ms::text,'*')||
 ';after_order='||coalesce(lower(p_after_order_id::text),'*')||
 ';after_line='||coalesce(p_after_line_number::text,'*')||
 ';limit='||p_limit::text;
 PERFORM sabora.authorize_order_operation_read_candidate(
 p_key_id,p_database_role,p_actor_user_id,p_staff_role,'board',v_scope,
 p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF p_after_confirmed_at_ms IS NOT NULL THEN
  v_after:=to_timestamp(p_after_confirmed_at_ms::numeric/1000);
 END IF;
 RETURN QUERY
 SELECT o.id,l.id,dt.number,coalesce(o.customer_alias,o.company),
  o.confirmed_at,o.grouping,l.line_number,l.category,l.name,l.quantity,l.status,
  coalesce(tn.id,ln.id),coalesce(tn.created_at,ln.created_at),
  coalesce(tn.acknowledged_at,ln.acknowledged_at),
  pt.id,pt.state,pt.version,pt.claimed_by,pt.claimed_display_id,
  pt.claimed_at,pt.updated_at,
  coalesce(dest.table_id,l.table_id),coalesce(dest.session_id,l.session_id),
  dest.visit_key,coalesce(dest.destination_version,1::bigint)
 FROM sabora.order_lines l
 JOIN sabora.orders o ON o.id=l.order_id
 LEFT JOIN sabora.order_line_delivery_destinations dest ON dest.order_line_id=l.id
 JOIN sabora.dining_tables dt ON dt.id=coalesce(dest.table_id,l.table_id)
 LEFT JOIN sabora.pickup_tasks pt ON pt.order_line_id=l.id
 LEFT JOIN sabora.pickup_notifications tn ON tn.id=pt.notification_id
   AND pt.state IN ('ready','claimed')
 LEFT JOIN LATERAL(
  SELECT n.id,n.created_at,n.acknowledged_at
  FROM sabora.pickup_notifications n WHERE pt.id IS NULL
   AND n.order_line_id=l.id ORDER BY n.created_at DESC,n.id DESC LIMIT 1
 ) ln ON true
 WHERE (dest.order_line_id IS NOT NULL OR l.status='picked_up')
 AND (p_staff_role='admin' OR
  (p_staff_role='kitchen' AND l.status IN ('confirmed','preparing','ready')) OR
  (p_staff_role='waiter' AND l.status IN ('ready','picked_up')))
 AND (p_status IS NULL OR l.status=p_status)
 AND (v_after IS NULL OR (o.confirmed_at,o.id,l.line_number)>
  (v_after,p_after_order_id,p_after_line_number))
 ORDER BY o.confirmed_at,o.id,l.line_number LIMIT p_limit+1;
END;
$board_delivery_pickup$;
ALTER FUNCTION sabora.read_order_operations_delivery_pickup_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 OWNER TO sabora_order_operations_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_order_operations_delivery_pickup_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer,
 sabora_h6_operations_runtime;
COMMENT ON FUNCTION sabora.read_order_operations_delivery_pickup_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 IS 'Sealed H6/B2 pickup-compatible destination board. No runtime EXECUTE.';
COMMIT;
