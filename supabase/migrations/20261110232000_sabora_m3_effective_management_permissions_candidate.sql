-- H35-P1: signed SQL read publishes effective ADMIN ownership permissions.
-- No privilege expansion, mutable bearer identity, or new SQL login.
BEGIN;
CREATE OR REPLACE FUNCTION sabora.read_admin_tables_m3_candidate(
 p_capability jsonb,p_after_number integer,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read_tables$
DECLARE v_items jsonb;v_next integer;v_role text;v_admin_writer boolean:=false;
BEGIN
 IF p_after_number IS NULL OR p_after_number<0 OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_admin_projection_page' USING ERRCODE='22023';
 END IF;
 v_role:=sabora.verify_management_capability_m3(
  p_capability,p_after_number::text||':'||p_limit::text);
 IF p_capability->>'action'<>'tables.read' OR v_role NOT IN ('admin','root','waiter') THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 -- The owner identity stays inside SQL; lock against concurrent transfer.
 IF v_role='admin' THEN
  SELECT COALESCE(o.owner_user_id=(p_capability->>'actorId')::uuid,false)
   INTO v_admin_writer FROM sabora.admin_write_ownership o WHERE o.singleton FOR SHARE;
  v_admin_writer:=COALESCE(v_admin_writer,false);
 END IF;
 WITH page AS (
  SELECT t.* FROM sabora.dining_tables t WHERE t.number>p_after_number
   ORDER BY t.number,t.id LIMIT p_limit+1
 ), visible AS (
  SELECT * FROM page ORDER BY number,id LIMIT p_limit
 )
 SELECT COALESCE(jsonb_agg(sabora.table_state_json_m3(v) ORDER BY v.number,v.id),'[]'::jsonb),
  CASE WHEN (SELECT count(*) FROM page)>p_limit
    THEN (SELECT max(number) FROM visible) ELSE NULL END
 INTO v_items,v_next FROM visible v;
 RETURN jsonb_build_object('version',2,'items',v_items,'nextAfterNumber',v_next,
  'permissions',jsonb_build_object('configure',v_admin_writer,'qr',v_admin_writer,
   'readiness',v_admin_writer OR v_role='waiter',
   'occupancy',v_admin_writer OR v_role='waiter'));
END;
$read_tables$;
ALTER FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_catalog_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 TO sabora_m3_tables_runtime;
COMMIT;
