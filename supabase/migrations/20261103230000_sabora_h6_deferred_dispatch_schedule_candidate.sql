-- Isolated B3 candidate: durable, event-driven grouping deadlines.
-- No cron, LOGIN, worker activation, production migration or external resources.
BEGIN;
-- CV-005 OPTION A: transaction-scoped owner membership for existing function ACL.
DO $cv005_existing_owner_access$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname,roles.rolcanlogin,roles.rolinherit,roles.rolsuper,roles.rolbypassrls,roles.rolcreaterole,roles.rolcreatedb,roles.rolreplication FROM pg_catalog.pg_roles roles
 WHERE roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner

CREATE INDEX h6_schedulable_round_deadline_candidate
 ON sabora.order_rounds(grouping_deadline,id)
 WHERE state IN ('grouping','free_grouping');

CREATE FUNCTION sabora.list_schedulable_h6_rounds_candidate(p_limit integer)
RETURNS TABLE(order_id uuid,grouping_deadline timestamptz,server_now timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $schedule$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_h6_dispatch_limit' USING errcode='22023';
 END IF;
 RETURN QUERY
 SELECT r.order_id,r.grouping_deadline,clock_timestamp()
 FROM sabora.order_rounds r
 JOIN sabora.kitchen_dispatches d ON d.round_id=r.id
 JOIN sabora.customer_accounts a ON a.id=r.account_id
 WHERE r.state IN ('grouping','free_grouping')
   AND d.state='blocked' AND a.state='open'
   -- An authorization requested, ambiguous or requiring action MUST NOT ship.
   AND (r.payment_mode IS DISTINCT FROM 'pay_now'
     OR EXISTS (SELECT 1 FROM sabora.payment_attempts p
       WHERE p.round_id=r.id AND p.state='authorized'))
 ORDER BY r.grouping_deadline,r.id LIMIT p_limit;
END;
$schedule$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.list_schedulable_h6_rounds_candidate(integer)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.list_schedulable_h6_rounds_candidate(integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.list_schedulable_h6_rounds_candidate(integer)
 TO sabora_h6_provider_runtime;

REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;
COMMIT;
 AND roles.rolname<>current_user::text
 AND (EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=roles.oid AND n.nspname='sabora')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=roles.oid AND n.nspname='sabora'))
 LOOP
  IF r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication THEN RAISE EXCEPTION 'cv005_unsafe_preexisting_fn_owner' USING errcode='0P000'; END IF;
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',r.rolname);
 END LOOP;
END;
$cv005_existing_owner_access$;


CREATE INDEX h6_schedulable_round_deadline_candidate
 ON sabora.order_rounds(grouping_deadline,id)
 WHERE state IN ('grouping','free_grouping');

CREATE FUNCTION sabora.list_schedulable_h6_rounds_candidate(p_limit integer)
RETURNS TABLE(order_id uuid,grouping_deadline timestamptz,server_now timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $schedule$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_h6_dispatch_limit' USING errcode='22023';
 END IF;
 RETURN QUERY
 SELECT r.order_id,r.grouping_deadline,clock_timestamp()
 FROM sabora.order_rounds r
 JOIN sabora.kitchen_dispatches d ON d.round_id=r.id
 JOIN sabora.customer_accounts a ON a.id=r.account_id
 WHERE r.state IN ('grouping','free_grouping')
   AND d.state='blocked' AND a.state='open'
   -- An authorization requested, ambiguous or requiring action MUST NOT ship.
   AND (r.payment_mode IS DISTINCT FROM 'pay_now'
     OR EXISTS (SELECT 1 FROM sabora.payment_attempts p
       WHERE p.round_id=r.id AND p.state='authorized'))
 ORDER BY r.grouping_deadline,r.id LIMIT p_limit;
END;
$schedule$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.list_schedulable_h6_rounds_candidate(integer)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.list_schedulable_h6_rounds_candidate(integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.list_schedulable_h6_rounds_candidate(integer)
 TO sabora_h6_provider_runtime;

REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;

-- CV-005: release every own-granted owner membership before COMMIT.
DO $cv005_existing_owner_release$
DECLARE r name;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles roles ON roles.oid=m.roleid
 WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',r); END LOOP;
END;
$cv005_existing_owner_release$;
COMMIT;
