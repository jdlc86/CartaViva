-- B2 isolated atomic transfer primitive. NOT a runtime cutover.
-- Caller must be the sealed H6 confirmation function in the same transaction.
-- No direct customer/staff EXECUTE is granted.
BEGIN;
CREATE FUNCTION sabora.consume_customer_table_change_h6_candidate(
 p_account_id uuid,p_customer_id uuid,p_session_hash bytea,
 p_destination_table_id uuid,p_destination_session_id uuid,
 p_destination_visit_key text,p_confirmed_order_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $consume$
DECLARE v_account sabora.customer_accounts%ROWTYPE;
 v_binding sabora.customer_account_operational_bindings%ROWTYPE;
 v_grant sabora.customer_table_change_requests%ROWTYPE;
 v_visit record;
BEGIN
 IF p_account_id IS NULL OR p_customer_id IS NULL OR p_session_hash IS NULL
  OR octet_length(p_session_hash)<>32 OR p_destination_table_id IS NULL
  OR p_destination_session_id IS NULL OR p_destination_visit_key IS NULL
  OR p_confirmed_order_id IS NULL THEN
  RAISE EXCEPTION 'invalid_table_change_consumption' USING errcode='22023';
 END IF;
 -- Same lock ordering as request/decision/confirmation:
 -- session (in caller), customer advisory lock, account, binding, grant.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_customer_id::text,140630));
 PERFORM 1 FROM sabora.customer_sessions s
 WHERE s.token_hash=p_session_hash AND s.customer_id=p_customer_id
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_session_forbidden' USING errcode='42501'; END IF;
 SELECT * INTO v_account FROM sabora.customer_accounts a
 WHERE a.id=p_account_id AND a.customer_id=p_customer_id AND a.state='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_account_forbidden' USING errcode='42501'; END IF;
 SELECT * INTO v_binding FROM sabora.customer_account_operational_bindings b
 WHERE b.account_id=p_account_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_binding_missing' USING errcode='55000'; END IF;
 IF v_binding.table_id=p_destination_table_id THEN
  RAISE EXCEPTION 'table_change_same_table' USING errcode='23514';
 END IF;
 SELECT v.id INTO v_visit FROM sabora.customer_table_visits v
 JOIN sabora.dining_tables t ON t.id=v.table_id AND t.session_id=v.session_id
 WHERE v.customer_id=p_customer_id AND v.table_id=p_destination_table_id
  AND v.session_id=p_destination_session_id AND v.visit_key=p_destination_visit_key
  AND v.revoked_at IS NULL AND v.expires_at>clock_timestamp()
  AND v.authorized_qr_version=t.qr_version
 FOR UPDATE OF v,t;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_destination_forbidden' USING errcode='42501'; END IF;
 SELECT * INTO v_grant FROM sabora.customer_table_change_requests q
 WHERE q.account_id=p_account_id AND q.customer_id=p_customer_id
  AND q.status='approved' AND q.source_table_id=v_binding.table_id
  AND q.visit_key=v_binding.visit_key
 ORDER BY q.created_at DESC,q.id DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_approval_required' USING errcode='23514'; END IF;
 -- A grant is bound to the original authenticated session. Revocation of
 -- that session invalidates its use even when a different session survives.
 IF v_grant.requesting_session_hash IS NULL
  OR v_grant.requesting_session_hash<>p_session_hash THEN
  RAISE EXCEPTION 'table_change_approval_session_mismatch' USING errcode='42501';
 END IF;
 PERFORM 1 FROM sabora.customer_sessions s
 WHERE s.token_hash=v_grant.requesting_session_hash
  AND s.customer_id=p_customer_id AND s.revoked_at IS NULL
  AND s.expires_at>clock_timestamp();
 IF NOT FOUND THEN
  RAISE EXCEPTION 'table_change_approval_session_revoked' USING errcode='42501';
 END IF;
 -- The order must have been persisted and tied to this customer and new table
 -- by the caller, before consuming the grant. A failed transaction rolls back all.
 PERFORM 1 FROM sabora.orders o
 WHERE o.id=p_confirmed_order_id AND o.customer_id=p_customer_id
  AND o.table_id=p_destination_table_id
  AND EXISTS (
   SELECT 1 FROM sabora.order_rounds r
   WHERE r.order_id=o.id AND r.account_id=p_account_id
  );
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_order_scope_forbidden' USING errcode='42501'; END IF;
 UPDATE sabora.customer_table_change_requests
 SET status='consumed',destination_table_id=p_destination_table_id,
  consumed_order_id=p_confirmed_order_id,consumed_at=clock_timestamp()
 WHERE id=v_grant.id AND status='approved';
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_already_consumed' USING errcode='23514'; END IF;
 UPDATE sabora.customer_account_operational_bindings
 SET table_id=p_destination_table_id,session_id=p_destination_session_id,
  visit_key=p_destination_visit_key,binding_version=binding_version+1,
  changed_at=clock_timestamp()
 WHERE account_id=p_account_id;
 -- Completed pickups are never reinterpreted. The immutable order/account,
 -- financial balance, payment attempts and kitchen dispatches are untouched.
 UPDATE sabora.order_line_delivery_destinations d
 SET table_id=p_destination_table_id,session_id=p_destination_session_id,
  visit_key=p_destination_visit_key,destination_version=d.destination_version+1,
  changed_at=clock_timestamp()
 FROM sabora.order_lines l
 WHERE d.order_line_id=l.id AND d.account_id=p_account_id
  AND l.status<>'picked_up' AND d.order_id<>p_confirmed_order_id;
 RETURN v_grant.id;
END;
$consume$;
ALTER FUNCTION sabora.consume_customer_table_change_h6_candidate(uuid,uuid,bytea,uuid,uuid,text,uuid)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.consume_customer_table_change_h6_candidate(uuid,uuid,bytea,uuid,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
 sabora_h6_operations_runtime,sabora_h6_provider_runtime;
-- The function is deliberately NOT granted to the customer runtime.
-- Integration into confirmation and operational readers remains a separate gate.
COMMIT;
