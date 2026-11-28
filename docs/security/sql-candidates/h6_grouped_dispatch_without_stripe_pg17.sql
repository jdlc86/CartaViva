-- Candidate delta, applied only after the 103 genesis migrations.
BEGIN;

DO $cv005$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sabora_h6_fn_owner'
   AND NOT (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole
    OR rolcreatedb OR rolreplication)
 ) THEN RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner'; END IF;
END;
$cv005$;
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;

CREATE FUNCTION sabora.list_h6_rounds_without_stripe_candidate(p_limit integer)
RETURNS TABLE(order_id uuid,grouping_deadline timestamptz,server_now timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $schedule$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_h6_dispatch_limit' USING errcode='22023';
 END IF;
 RETURN QUERY
 SELECT r.order_id,r.grouping_deadline,statement_timestamp()
 FROM sabora.order_rounds r
 JOIN sabora.kitchen_dispatches d ON d.round_id=r.id
  AND d.revision_number=r.revision_number AND d.state='blocked'
 JOIN sabora.order_revisions v ON v.round_id=r.id
  AND v.revision_number=r.revision_number AND v.state='current'
 JOIN sabora.customer_accounts a ON a.id=r.account_id AND a.state='open'
 WHERE r.state IN ('grouping','free_grouping')
   AND (r.amount_cents=0 OR r.payment_mode='pay_at_end')
 ORDER BY r.grouping_deadline,r.id LIMIT p_limit;
END;
$schedule$;

CREATE FUNCTION sabora.request_h6_dispatch_without_stripe_candidate(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $dispatch$
DECLARE
 v_round sabora.order_rounds%ROWTYPE;
 v_dispatch_state text;
 v_now timestamptz;
 v_result text;
BEGIN
 -- Recheck under the same round/dispatch locks as the economic path.
 -- Cancellation, catalogue invalidation and another worker may have won
 -- since the bounded schedule was read.
 SELECT * INTO v_round FROM sabora.order_rounds WHERE order_id=p_order_id FOR UPDATE;
 IF NOT FOUND OR v_round.state NOT IN ('grouping','free_grouping')
   OR NOT (v_round.amount_cents=0 OR v_round.payment_mode IS NOT DISTINCT FROM 'pay_at_end')
 THEN RETURN false; END IF;
 SELECT state INTO v_dispatch_state FROM sabora.kitchen_dispatches
  WHERE round_id=v_round.id AND revision_number=v_round.revision_number FOR UPDATE;
 v_now:=clock_timestamp();
 IF v_dispatch_state IS DISTINCT FROM 'blocked' OR v_round.grouping_deadline>v_now
   OR NOT EXISTS (SELECT 1 FROM sabora.order_revisions
    WHERE round_id=v_round.id AND revision_number=v_round.revision_number AND state='current')
   OR NOT EXISTS (SELECT 1 FROM sabora.customer_accounts
    WHERE id=v_round.account_id AND state='open')
 THEN RETURN false; END IF;

 SELECT outcome.action INTO STRICT v_result
 FROM sabora.request_h6_capture_dispatch_candidate(p_order_id,v_now) outcome;
 IF v_result IS DISTINCT FROM 'dispatch' THEN
  RAISE EXCEPTION 'h6_dispatch_without_stripe_denied' USING errcode='42501';
 END IF;
 RETURN true;
END;
$dispatch$;

ALTER FUNCTION sabora.list_h6_rounds_without_stripe_candidate(integer) OWNER TO sabora_h6_fn_owner;
ALTER FUNCTION sabora.request_h6_dispatch_without_stripe_candidate(uuid) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.list_h6_rounds_without_stripe_candidate(integer),
 sabora.request_h6_dispatch_without_stripe_candidate(uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
DO $managed_defaults$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
  REVOKE ALL ON FUNCTION sabora.list_h6_rounds_without_stripe_candidate(integer),
   sabora.request_h6_dispatch_without_stripe_candidate(uuid) FROM service_role;
 END IF;
END;
$managed_defaults$;
GRANT EXECUTE ON FUNCTION sabora.list_h6_rounds_without_stripe_candidate(integer),
 sabora.request_h6_dispatch_without_stripe_candidate(uuid) TO sabora_h6_provider_runtime;

REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;
DO $cv005_release$
BEGIN
 EXECUTE format('REVOKE sabora_h6_fn_owner FROM %I GRANTED BY %I',current_user,current_user);
END;
$cv005_release$;
COMMIT;
