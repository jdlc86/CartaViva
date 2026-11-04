-- B3 opt-in: durable, per-authenticated-customer table-change read projection.
-- No runtime grants are created; only the independently verified CI role
-- may receive EXECUTE on this function. No direct relation access by API.
BEGIN;
CREATE FUNCTION sabora.read_customer_table_change_h6_candidate(
 p_session_hash bytea
) RETURNS TABLE(
 bound_table_id uuid,change_state text,change_expires_at timestamptz,server_time timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $read_state$
DECLARE v_customer uuid;v_account_id uuid;v_open_count bigint;v_table uuid;
 v_latest_status text;v_latest_expires timestamptz;v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 THEN
  RAISE EXCEPTION 'invalid_table_change_state' USING errcode='22023';
 END IF;
 SELECT s.customer_id INTO v_customer FROM sabora.customer_sessions s
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>v_now;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'customer_session_forbidden' USING errcode='42501';
 END IF;
 SELECT count(*),min(a.id::text)::uuid INTO v_open_count,v_account_id
 FROM sabora.customer_accounts a WHERE a.customer_id=v_customer AND a.state='open';
 IF v_open_count>1 THEN
  RAISE EXCEPTION 'table_change_account_forbidden' USING errcode='42501';
 END IF;
 IF v_open_count=0 THEN
  RETURN QUERY SELECT NULL::uuid,'unbound'::text,NULL::timestamptz,v_now;
  RETURN;
 END IF;
 SELECT b.table_id INTO v_table FROM sabora.customer_account_operational_bindings b
 WHERE b.account_id=v_account_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'table_change_binding_missing' USING errcode='55000';
 END IF;
 SELECT q.status,q.expires_at INTO v_latest_status,v_latest_expires
 FROM sabora.customer_table_change_requests q WHERE q.account_id=v_account_id
 ORDER BY q.created_at DESC,q.id DESC LIMIT 1;
 IF v_latest_status='approved' THEN
  RETURN QUERY SELECT v_table,'approved'::text,NULL::timestamptz,v_now;
 ELSIF v_latest_status='pending' AND v_latest_expires>v_now THEN
  RETURN QUERY SELECT v_table,'pending'::text,v_latest_expires,v_now;
 ELSIF v_latest_status='rejected' AND v_latest_expires>v_now THEN
  RETURN QUERY SELECT v_table,'rejected'::text,v_latest_expires,v_now;
 ELSE
  RETURN QUERY SELECT v_table,'bound'::text,NULL::timestamptz,v_now;
 END IF;
END;
$read_state$;
ALTER FUNCTION sabora.read_customer_table_change_h6_candidate(bytea)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_table_change_h6_candidate(bytea)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
COMMIT;
