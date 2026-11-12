-- H6 table-change B2 prerequisite: serialize decisions with confirmation.
-- All customer paths acquire the customer advisory lock BEFORE account row locks.
-- This avoids a decision/confirmation deadlock when an approval races an order.
-- Candidate-only; no new runtime EXECUTE grants and no transfer cutover.
BEGIN;
CREATE OR REPLACE FUNCTION sabora.decide_customer_table_change_h6_candidate(
 p_staff_id uuid,p_request_id uuid,p_approve boolean
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $decision$
DECLARE v_account_id uuid;v_request sabora.customer_table_change_requests%ROWTYPE;
 v_customer uuid;v_now timestamptz;
BEGIN
 IF p_staff_id IS NULL OR p_request_id IS NULL OR p_approve IS NULL THEN
  RAISE EXCEPTION 'invalid_table_change_decision' USING errcode='22023'; END IF;
 -- Initial reads are deliberately lock-free. The account and request are
 -- revalidated under the same advisory lock used by customer confirmations.
 SELECT q.account_id INTO v_account_id FROM sabora.customer_table_change_requests q
 WHERE q.id=p_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_request_missing' USING errcode='42501'; END IF;
 SELECT a.customer_id INTO v_customer FROM sabora.customer_accounts a
 WHERE a.id=v_account_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_account_missing' USING errcode='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_customer::text,140630));
 -- Staff authority is verified at decision time, never trusted from a prior read.
 PERFORM 1 FROM sabora.staff_members m
 WHERE m.user_id=p_staff_id AND m.role IN ('waiter','admin') AND m.state='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_staff_forbidden' USING errcode='42501'; END IF;
 PERFORM 1 FROM sabora.customer_accounts a
 WHERE a.id=v_account_id AND a.customer_id=v_customer AND a.state='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_account_closed' USING errcode='42501'; END IF;
 SELECT * INTO v_request FROM sabora.customer_table_change_requests q
 WHERE q.id=p_request_id AND q.account_id=v_account_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_change_request_missing' USING errcode='42501'; END IF;
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
ALTER FUNCTION sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
 sabora_h6_operations_runtime,sabora_h6_provider_runtime;
COMMIT;
