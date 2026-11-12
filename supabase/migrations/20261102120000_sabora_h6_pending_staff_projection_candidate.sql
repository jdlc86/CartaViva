-- Candidate-only staff pending-request projection. No runtime EXECUTE grant.
-- Do not activate until an isolated read capability/login and PG17 preflight
-- are approved; existing F12 operations identity remains decision-only.
BEGIN;
CREATE FUNCTION sabora.list_pending_table_changes_h6_candidate(
 p_staff_id uuid
) RETURNS TABLE(request_id uuid,source_table_number integer,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $pending$
BEGIN
 IF p_staff_id IS NULL THEN
  RAISE EXCEPTION 'table_change_staff_forbidden' USING errcode='42501';
 END IF;
 PERFORM 1 FROM sabora.staff_members m
 WHERE m.user_id=p_staff_id AND m.state='active'
 AND m.role IN ('waiter','admin');
 IF NOT FOUND THEN
  RAISE EXCEPTION 'table_change_staff_forbidden' USING errcode='42501';
 END IF;
 RETURN QUERY
 SELECT q.id,t.number,q.expires_at
 FROM sabora.customer_table_change_requests q
 JOIN sabora.dining_tables t ON t.id=q.source_table_id
 JOIN sabora.customer_accounts a ON a.id=q.account_id
 WHERE q.status='pending' AND q.expires_at>clock_timestamp()
 AND a.state='open'
 ORDER BY q.created_at ASC,q.id ASC
 LIMIT 100;
END;
$pending$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.list_pending_table_changes_h6_candidate(uuid)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.list_pending_table_changes_h6_candidate(uuid)
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
 sabora_h6_operations_runtime,sabora_h6_provider_runtime;
-- No GRANT EXECUTE to a runtime identity. The operations identity's
-- single-function F12 capability contract must not be silently expanded.
REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;
COMMIT;
