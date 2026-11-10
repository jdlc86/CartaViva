-- H6 table-change request and waiter decision, candidate only.
-- This grants no ability to transfer: confirmation guard remains fail-closed.
BEGIN;
ALTER TABLE sabora.customer_table_change_requests
 ADD COLUMN requesting_session_hash bytea,
 ADD CONSTRAINT table_change_session_hash_length CHECK
  (requesting_session_hash IS NULL OR octet_length(requesting_session_hash)=32);

-- A request is tied to the authenticated customer session, not just an alias.
GRANT SELECT,INSERT,UPDATE ON sabora.customer_table_change_requests TO sabora_h6_fn_owner;
GRANT SELECT(table_change_response_seconds) ON sabora.restaurant_settings TO sabora_h6_fn_owner;
CREATE POLICY h6_owner_table_change_select ON sabora.customer_table_change_requests
 FOR SELECT TO sabora_h6_fn_owner USING (true);
CREATE POLICY h6_owner_table_change_insert ON sabora.customer_table_change_requests
 FOR INSERT TO sabora_h6_fn_owner WITH CHECK (true);
CREATE POLICY h6_owner_table_change_update ON sabora.customer_table_change_requests
 FOR UPDATE TO sabora_h6_fn_owner USING (true) WITH CHECK (true);

CREATE FUNCTION sabora.request_customer_table_change_h6_candidate(
 p_session_hash bytea,p_account_id uuid
) RETURNS TABLE(request_id uuid,request_status text,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $request$
DECLARE v_customer uuid;v_account sabora.customer_accounts%ROWTYPE;
 v_binding sabora.customer_account_operational_bindings%ROWTYPE;
 v_seconds integer;v_latest sabora.customer_table_change_requests%ROWTYPE;
 v_now timestamptz;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 OR p_account_id IS NULL
 THEN RAISE EXCEPTION 'invalid_table_change_request' USING errcode='22023'; END IF;
 SELECT s.customer_id INTO v_customer FROM sabora.customer_sessions s
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
 AND s.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer_session_forbidden' USING errcode='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_customer::text,140630));
 SELECT * INTO v_account FROM sabora.customer_accounts a
 WHERE a.id=p_account_id AND a.customer_id=v_customer AND a.state='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_account_forbidden' USING errcode='42501'; END IF;
 SELECT * INTO v_binding FROM sabora.customer_account_operational_bindings b
 WHERE b.account_id=v_account.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_binding_missing' USING errcode='55000'; END IF;
 PERFORM 1 FROM sabora.customer_table_visits v JOIN sabora.dining_tables t
 ON t.id=v.table_id AND t.session_id=v.session_id
 WHERE v.customer_id=v_customer AND v.table_id=v_binding.table_id
 AND v.session_id=v_binding.session_id AND v.visit_key=v_binding.visit_key
 AND v.revoked_at IS NULL AND v.expires_at>clock_timestamp()
 AND v.authorized_qr_version=t.qr_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_visit_forbidden' USING errcode='42501'; END IF;
 SELECT rs.table_change_response_seconds INTO v_seconds FROM sabora.restaurant_settings rs
 WHERE rs.singleton=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_settings_missing' USING errcode='55000'; END IF;
 v_now:=clock_timestamp();
 UPDATE sabora.customer_table_change_requests q SET status='expired'
 WHERE q.account_id=v_account.id AND q.status='pending' AND q.expires_at<=v_now;
 SELECT * INTO v_latest FROM sabora.customer_table_change_requests q
 WHERE q.account_id=v_account.id ORDER BY q.created_at DESC,q.id DESC LIMIT 1 FOR UPDATE;
 IF FOUND AND v_latest.status='approved' THEN
  RAISE EXCEPTION 'table_change_approval_active' USING errcode='23514';
 END IF;
 IF FOUND AND v_now<v_latest.created_at+make_interval(secs=>v_seconds) THEN
  RAISE EXCEPTION 'table_change_cooldown' USING errcode='23514';
 END IF;
 INSERT INTO sabora.customer_table_change_requests
 (account_id,customer_id,visit_key,source_table_id,requesting_session_hash,expires_at)
 VALUES(v_account.id,v_customer,v_binding.visit_key,v_binding.table_id,p_session_hash,
  v_now+make_interval(secs=>v_seconds))
 RETURNING id,status,customer_table_change_requests.expires_at
 INTO request_id,request_status,expires_at;
 RETURN NEXT;
END;
$request$;

CREATE FUNCTION sabora.decide_customer_table_change_h6_candidate(
 p_staff_id uuid,p_request_id uuid,p_approve boolean
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $decision$
DECLARE v_account_id uuid;v_request sabora.customer_table_change_requests%ROWTYPE;
 v_customer uuid;v_now timestamptz;
BEGIN
 IF p_staff_id IS NULL OR p_request_id IS NULL OR p_approve IS NULL THEN
  RAISE EXCEPTION 'invalid_table_change_decision' USING errcode='22023'; END IF;
 -- Resolve the account first; lock order must match request/confirmation paths.
 SELECT q.account_id INTO v_account_id FROM sabora.customer_table_change_requests q
 WHERE q.id=p_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_request_missing' USING errcode='42501'; END IF;
 SELECT a.customer_id INTO v_customer FROM sabora.customer_accounts a
 WHERE a.id=v_account_id AND a.state='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_account_closed' USING errcode='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_customer::text,140630));
 PERFORM 1 FROM sabora.staff_members m
 WHERE m.user_id=p_staff_id AND m.role IN ('waiter','admin') AND m.state='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_staff_forbidden' USING errcode='42501'; END IF;
 SELECT * INTO v_request FROM sabora.customer_table_change_requests q
 WHERE q.id=p_request_id AND q.account_id=v_account_id FOR UPDATE;
 v_now:=clock_timestamp();
 IF v_request.status='pending' AND v_now>=v_request.expires_at THEN
  UPDATE sabora.customer_table_change_requests SET status='expired'
   WHERE id=p_request_id;
  RETURN 'expired';
 END IF;
 IF v_request.status<>'pending' THEN
  RAISE EXCEPTION 'table_change_already_decided' USING errcode='23514'; END IF;
 UPDATE sabora.customer_table_change_requests
 SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
 decided_at=v_now,decided_by=p_staff_id WHERE id=p_request_id;
 RETURN CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
END;
$decision$;

ALTER FUNCTION sabora.request_customer_table_change_h6_candidate(bytea,uuid) OWNER TO sabora_h6_fn_owner;
ALTER FUNCTION sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.request_customer_table_change_h6_candidate(bytea,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
-- Deliberately no runtime EXECUTE on the staff decision function until the
-- authenticated staff principal is derived by a trusted API boundary.
-- The customer request function is likewise not exposed until its API is wired.
COMMIT;
