-- Candidate delta after genesis. Existing requests retain their own expires_at.
BEGIN;

DO $cv005$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sabora_m3_management_fn_owner'
   AND NOT (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole
    OR rolcreatedb OR rolreplication)
 ) THEN RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner'; END IF;
END;
$cv005$;
GRANT CREATE ON SCHEMA sabora TO sabora_m3_management_fn_owner;
GRANT sabora_m3_management_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;

GRANT SELECT(singleton,table_change_response_seconds),UPDATE(table_change_response_seconds)
 ON sabora.restaurant_settings TO sabora_m3_management_fn_owner;
CREATE POLICY m3_table_change_window_read ON sabora.restaurant_settings
 FOR SELECT TO sabora_m3_management_fn_owner USING(singleton);
CREATE POLICY m3_table_change_window_write ON sabora.restaurant_settings
 FOR UPDATE TO sabora_m3_management_fn_owner USING(singleton) WITH CHECK(singleton);

CREATE FUNCTION sabora.table_change_window_m3_candidate(
 p_capability jsonb,p_expected_seconds integer,p_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $window$
DECLARE
 v_read boolean:=p_expected_seconds IS NULL AND p_seconds IS NULL;
 v_role text;
 v_actor uuid;
 v_request uuid;
 v_body text;
 v_fingerprint bytea;
 v_seconds integer;
 v_receipt sabora.management_mutation_receipts_m3%ROWTYPE;
 v_result jsonb;
BEGIN
 IF (NOT v_read AND (p_expected_seconds IS NULL OR p_expected_seconds NOT BETWEEN 1 AND 600
   OR p_seconds IS NULL OR p_seconds NOT BETWEEN 1 AND 600))
 THEN RAISE EXCEPTION 'invalid_table_change_window' USING errcode='22023'; END IF;
 IF p_capability->>'action' IS DISTINCT FROM
    (CASE WHEN v_read THEN 'tables.read' ELSE 'table.update' END)
 THEN RAISE EXCEPTION 'm3_management_forbidden' USING errcode='42501'; END IF;
 v_body:='table-change-window:v1:'||coalesce(p_expected_seconds::text,'-')||':'||coalesce(p_seconds::text,'-');
 v_role:=sabora.verify_management_capability_m3(p_capability,v_body);
 v_actor:=(p_capability->>'actorId')::uuid;
 IF v_read THEN
  IF v_role NOT IN ('admin','root') THEN
   RAISE EXCEPTION 'm3_management_forbidden' USING errcode='42501';
  END IF;
  SELECT table_change_response_seconds INTO STRICT v_seconds FROM sabora.restaurant_settings WHERE singleton;
  RETURN jsonb_build_object('seconds',v_seconds,'canWrite',v_role='admin' AND EXISTS (
   SELECT 1 FROM sabora.admin_write_ownership WHERE singleton AND owner_user_id=v_actor));
 END IF;

 SELECT table_change_response_seconds INTO STRICT v_seconds
 FROM sabora.restaurant_settings WHERE singleton FOR UPDATE;
 -- The owning ADMIN and the staff/key rows remain locked by the verifier.
 -- Recheck absolute expiry after waiting for the settings row.
 IF (p_capability->>'expiresAtMs')::bigint<=extract(epoch FROM clock_timestamp())*1000 THEN
  RAISE EXCEPTION 'm3_management_forbidden' USING errcode='42501';
 END IF;
 v_request:=(p_capability->>'requestId')::uuid;
 v_fingerprint:=decode(p_capability->>'bodyHashHex','hex');
 SELECT * INTO v_receipt FROM sabora.management_mutation_receipts_m3 WHERE request_id=v_request;
 IF FOUND THEN
  IF v_receipt.actor_user_id IS DISTINCT FROM v_actor OR
   v_receipt.operation IS DISTINCT FROM 'table.change_window' OR
   v_receipt.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
   RAISE EXCEPTION 'table_change_window_conflict' USING errcode='23505';
  END IF;
  RETURN v_receipt.result||jsonb_build_object('replayed',true);
 END IF;
 IF v_seconds<>p_expected_seconds THEN
  RAISE EXCEPTION 'table_change_window_conflict' USING errcode='40001';
 END IF;
 UPDATE sabora.restaurant_settings SET table_change_response_seconds=p_seconds WHERE singleton;
 v_result:=jsonb_build_object('previousSeconds',v_seconds,'seconds',p_seconds,'replayed',false);
 -- This existing receipt records actor, timestamp and old/new values in the
 -- same transaction. Its owner can insert and read, with no update/delete.
 INSERT INTO sabora.management_mutation_receipts_m3(request_id,actor_user_id,operation,request_fingerprint,result)
 VALUES(v_request,v_actor,'table.change_window',v_fingerprint,v_result);
 RETURN v_result;
END;
$window$;

ALTER FUNCTION sabora.table_change_window_m3_candidate(jsonb,integer,integer) OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.table_change_window_m3_candidate(jsonb,integer,integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_m3_catalog_runtime;
DO $managed_defaults$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
  REVOKE ALL ON FUNCTION sabora.table_change_window_m3_candidate(jsonb,integer,integer) FROM service_role;
 END IF;
END;
$managed_defaults$;
GRANT EXECUTE ON FUNCTION sabora.table_change_window_m3_candidate(jsonb,integer,integer) TO sabora_m3_tables_runtime;
REVOKE CREATE ON SCHEMA sabora FROM sabora_m3_management_fn_owner;
DO $cv005_release$
BEGIN
 EXECUTE format('REVOKE sabora_m3_management_fn_owner FROM %I GRANTED BY %I',current_user,current_user);
END;
$cv005_release$;
COMMIT;
