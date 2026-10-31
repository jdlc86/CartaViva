-- H6 candidate: authenticated operational board reads current line delivery, not historical order table.
-- No runtime EXECUTE grants; requires explicit audited activation and API wiring.
BEGIN;
GRANT SELECT (order_line_id,table_id,session_id,visit_key,destination_version)
 ON sabora.order_line_delivery_destinations TO sabora_order_operations_fn_owner;
CREATE POLICY sabora_order_ops_owner_delivery_select
 ON sabora.order_line_delivery_destinations FOR SELECT
 TO sabora_order_operations_fn_owner USING (true);

CREATE FUNCTION sabora.read_order_operations_delivery_board_h6_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_status text,p_after_confirmed_at_ms bigint,p_after_order_id uuid,
 p_after_line_number integer,p_limit integer,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text
)
RETURNS TABLE (
 order_id uuid,line_id uuid,table_number integer,customer_label text,
 confirmed_at timestamptz,"grouping" text,line_number integer,
 category text,name text,quantity integer,status text,
 notification_id uuid,notification_created_at timestamptz,
 notification_acknowledged_at timestamptz,
 delivery_table_id uuid,delivery_session_id uuid,delivery_visit_key text,
 delivery_version bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $delivery_board$
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
 RETURN QUERY SELECT o.id,l.id,t.number,coalesce(o.customer_alias,o.company),
 o.confirmed_at,o.grouping,l.line_number,l.category,l.name,l.quantity,l.status,
 n.id,n.created_at,n.acknowledged_at,d.table_id,d.session_id,d.visit_key,d.destination_version
 FROM sabora.order_lines l
 JOIN sabora.orders o ON o.id=l.order_id
 JOIN sabora.order_line_delivery_destinations d ON d.order_line_id=l.id
 JOIN sabora.dining_tables t ON t.id=d.table_id
 LEFT JOIN LATERAL (
 SELECT pn.id,pn.created_at,pn.acknowledged_at FROM sabora.pickup_notifications pn
 WHERE pn.order_line_id=l.id ORDER BY pn.created_at DESC,pn.id DESC LIMIT 1
 ) n ON true
 WHERE (p_staff_role='admin' OR
 (p_staff_role='kitchen' AND l.status IN ('confirmed','preparing','ready')) OR
 (p_staff_role='waiter' AND l.status IN ('ready','picked_up')))
 AND (p_status IS NULL OR l.status=p_status)
 AND (v_after IS NULL OR (o.confirmed_at,o.id,l.line_number)>
 (v_after,p_after_order_id,p_after_line_number))
 ORDER BY o.confirmed_at,o.id,l.line_number LIMIT p_limit+1;
END;
$delivery_board$;
ALTER FUNCTION sabora.read_order_operations_delivery_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 OWNER TO sabora_order_operations_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_order_operations_delivery_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer;
COMMENT ON FUNCTION sabora.read_order_operations_delivery_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 IS 'Sealed candidate. HMAC staff-bound delivery board reads mutable per-line destination; no runtime EXECUTE.';
COMMIT;
