-- H6 candidate: authenticated operational board reads current line delivery, not historical order table.
-- No runtime EXECUTE grants; requires explicit audited activation and API wiring.
BEGIN;

-- CV-005: scoped role access for existing function owners before REPLACE/ACL.
DO $cv005_early_owner_scope$
DECLARE ri record;
BEGIN
 FOR ri IN SELECT DISTINCT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication
 FROM pg_catalog.pg_roles r WHERE left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner' AND r.rolname<>current_user::text
 AND (EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=r.oid AND n.nspname='sabora')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=r.oid AND n.nspname='sabora'))
 LOOP
 IF ri.rolcanlogin OR ri.rolinherit OR ri.rolsuper OR ri.rolbypassrls OR ri.rolcreaterole OR ri.rolcreatedb OR ri.rolreplication THEN
  RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner' USING errcode='0P000';
 END IF;
 EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',ri.rolname);
 END LOOP;
END;
$cv005_early_owner_scope$;


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
 n.id,n.created_at,n.acknowledged_at,coalesce(d.table_id,l.table_id),
 coalesce(d.session_id,l.session_id),d.visit_key,coalesce(d.destination_version,1::bigint)
 FROM sabora.order_lines l
 JOIN sabora.orders o ON o.id=l.order_id
 LEFT JOIN sabora.order_line_delivery_destinations d ON d.order_line_id=l.id
 JOIN sabora.dining_tables t ON t.id=coalesce(d.table_id,l.table_id)
 LEFT JOIN LATERAL (
 SELECT pn.id,pn.created_at,pn.acknowledged_at FROM sabora.pickup_notifications pn
 WHERE pn.order_line_id=l.id ORDER BY pn.created_at DESC,pn.id DESC LIMIT 1
 ) n ON true
 WHERE (d.order_line_id IS NOT NULL OR l.status='picked_up')
 AND (p_staff_role='admin' OR
 (p_staff_role='kitchen' AND l.status IN ('confirmed','preparing','ready')) OR
 (p_staff_role='waiter' AND l.status IN ('ready','picked_up')))
 AND (p_status IS NULL OR l.status=p_status)
 AND (v_after IS NULL OR (o.confirmed_at,o.id,l.line_number)>
 (v_after,p_after_order_id,p_after_line_number))
 ORDER BY o.confirmed_at,o.id,l.line_number LIMIT p_limit+1;
END;
$delivery_board$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_order_operations_fn_owner;
GRANT sabora_order_operations_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_order_operations_delivery_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 OWNER TO sabora_order_operations_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_order_operations_delivery_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer;
COMMENT ON FUNCTION sabora.read_order_operations_delivery_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 IS 'Sealed candidate. HMAC staff-bound delivery board reads mutable per-line destination; no runtime EXECUTE.';
REVOKE sabora_order_operations_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_order_operations_fn_owner;


-- CV-005: no DBA-issued function-owner membership may survive COMMIT.
DO $cv005_early_owner_release$
DECLARE role_name name;
BEGIN
 FOR role_name IN SELECT DISTINCT r.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
 WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner'
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',role_name); END LOOP;
END;
$cv005_early_owner_release$;

COMMIT;
