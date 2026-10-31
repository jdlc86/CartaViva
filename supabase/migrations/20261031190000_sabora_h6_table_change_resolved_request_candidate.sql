-- F12/B3 isolated candidate: resolve the single open economic account inside
-- the SECURITY DEFINER boundary, never in an API login with table privileges.
-- The existing two-argument RPC remains sealed; no runtime EXECUTE is granted.
BEGIN;
CREATE FUNCTION sabora.request_customer_table_change_h6_resolved_candidate(
 p_session_hash bytea
) RETURNS TABLE(request_id uuid,request_status text,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $resolved$
DECLARE v_customer uuid;v_account_id uuid;v_open_count bigint;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 THEN
  RAISE EXCEPTION 'invalid_table_change_request' USING errcode='22023';
 END IF;
 SELECT s.customer_id INTO v_customer FROM sabora.customer_sessions s
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp();
 IF NOT FOUND THEN
  RAISE EXCEPTION 'customer_session_forbidden' USING errcode='42501';
 END IF;
 -- Lock order is delegated to the existing request RPC, which revalidates
 -- session, account and visit under its own transaction/advisory lock.
 SELECT count(*),min(a.id) INTO v_open_count,v_account_id
 FROM sabora.customer_accounts a
 WHERE a.customer_id=v_customer AND a.state='open';
 IF v_open_count<>1 THEN
  RAISE EXCEPTION 'table_change_account_forbidden' USING errcode='42501';
 END IF;
 RETURN QUERY SELECT r.request_id,r.request_status,r.expires_at
 FROM sabora.request_customer_table_change_h6_candidate(
  p_session_hash,v_account_id) r;
END;
$resolved$;
ALTER FUNCTION sabora.request_customer_table_change_h6_resolved_candidate(bytea)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.request_customer_table_change_h6_resolved_candidate(bytea)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
COMMIT;
