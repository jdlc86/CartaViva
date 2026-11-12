-- Sabora F20 candidate: server-authoritative payment mode in a live visit.
-- Durable selection occurs ONLY in the first positive round and remains immutable
-- across QR refresh, later rounds and authorized H6 table transfers.
-- This file is for disposable PG17 verification, NOT operational Supabase.
BEGIN;
-- CV-005 OPTION A: transaction-scoped owner membership for existing function ACL.
DO $cv005_existing_owner_access$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname,roles.rolcanlogin,roles.rolinherit,roles.rolsuper,roles.rolbypassrls,roles.rolcreaterole,roles.rolcreatedb,roles.rolreplication FROM pg_catalog.pg_roles roles
 WHERE roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner

CREATE FUNCTION sabora.read_customer_account_payment_mode_h6_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text
)
RETURNS TABLE(selected_payment_mode text,require_pay_as_ordered boolean,payment_policy_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fixed_payment_mode$
DECLARE v_customer_id uuid;v_required boolean;v_version bigint;
 v_account_id uuid;v_mode text;v_state text;
 v_bound_table uuid;v_bound_visit_key text;v_duplicate boolean;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32
   OR p_table_id IS NULL OR p_visit_key IS NULL
   OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$'
 THEN RAISE EXCEPTION 'invalid_customer_payment_scope' USING errcode='22023'; END IF;

 -- The customer's signed session and live visit are both required. A QR or
 -- public customer identifier alone cannot inspect a financial choice.
 SELECT s.customer_id,t.require_pay_as_ordered,t.payment_policy_version
  INTO v_customer_id,v_required,v_version
 FROM sabora.customer_sessions s
 JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
 JOIN sabora.dining_tables t ON t.id=v.table_id AND t.session_id=v.session_id
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() AND v.table_id=p_table_id
   AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
   AND v.expires_at>clock_timestamp() AND v.authorized_qr_version=t.qr_version
 FOR SHARE OF s,v,t;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'customer_payment_scope_forbidden' USING errcode='42501'; END IF;

 SELECT count(*)>1 INTO v_duplicate FROM (
  SELECT a.id FROM sabora.customer_accounts a
  WHERE a.customer_id=v_customer_id AND a.state IN ('open','blocked')
  LIMIT 2
 ) candidate;
 IF v_duplicate THEN
  RAISE EXCEPTION 'h6_multiple_open_accounts_ambiguous' USING errcode='23514'; END IF;

 SELECT a.id,a.payment_mode,a.state,b.table_id,b.visit_key
  INTO v_account_id,v_mode,v_state,v_bound_table,v_bound_visit_key
 FROM sabora.customer_accounts a
 JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
 WHERE a.customer_id=v_customer_id AND a.state IN ('open','blocked')
 LIMIT 1;
 IF v_account_id IS NOT NULL THEN
  IF v_state<>'open' THEN
   RAISE EXCEPTION 'customer_payment_scope_forbidden' USING errcode='42501'; END IF;
  IF v_bound_table<>p_table_id AND NOT EXISTS(
   SELECT 1 FROM sabora.customer_table_change_requests q
   WHERE q.account_id=v_account_id AND q.customer_id=v_customer_id
     AND q.status='approved' AND q.source_table_id=v_bound_table
     AND q.visit_key=v_bound_visit_key
  ) THEN
   RAISE EXCEPTION 'table_change_approval_required' USING errcode='23514'; END IF;
 END IF;
 -- Never return account ID, outstanding debt, identities or provider data.
 RETURN QUERY SELECT v_mode,v_required,v_version;
END;
$fixed_payment_mode$;

-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_customer_account_payment_mode_h6_candidate(bytea,uuid,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_account_payment_mode_h6_candidate(bytea,uuid,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_provider_runtime,sabora_h6_operations_runtime,
      sabora_f12_customer_runtime,sabora_f12_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_account_payment_mode_h6_candidate(bytea,uuid,text)
 TO sabora_b3_h6_reader_runtime;
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


CREATE FUNCTION sabora.read_customer_account_payment_mode_h6_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text
)
RETURNS TABLE(selected_payment_mode text,require_pay_as_ordered boolean,payment_policy_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fixed_payment_mode$
DECLARE v_customer_id uuid;v_required boolean;v_version bigint;
 v_account_id uuid;v_mode text;v_state text;
 v_bound_table uuid;v_bound_visit_key text;v_duplicate boolean;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32
   OR p_table_id IS NULL OR p_visit_key IS NULL
   OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$'
 THEN RAISE EXCEPTION 'invalid_customer_payment_scope' USING errcode='22023'; END IF;

 -- The customer's signed session and live visit are both required. A QR or
 -- public customer identifier alone cannot inspect a financial choice.
 SELECT s.customer_id,t.require_pay_as_ordered,t.payment_policy_version
  INTO v_customer_id,v_required,v_version
 FROM sabora.customer_sessions s
 JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
 JOIN sabora.dining_tables t ON t.id=v.table_id AND t.session_id=v.session_id
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() AND v.table_id=p_table_id
   AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
   AND v.expires_at>clock_timestamp() AND v.authorized_qr_version=t.qr_version
 FOR SHARE OF s,v,t;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'customer_payment_scope_forbidden' USING errcode='42501'; END IF;

 SELECT count(*)>1 INTO v_duplicate FROM (
  SELECT a.id FROM sabora.customer_accounts a
  WHERE a.customer_id=v_customer_id AND a.state IN ('open','blocked')
  LIMIT 2
 ) candidate;
 IF v_duplicate THEN
  RAISE EXCEPTION 'h6_multiple_open_accounts_ambiguous' USING errcode='23514'; END IF;

 SELECT a.id,a.payment_mode,a.state,b.table_id,b.visit_key
  INTO v_account_id,v_mode,v_state,v_bound_table,v_bound_visit_key
 FROM sabora.customer_accounts a
 JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
 WHERE a.customer_id=v_customer_id AND a.state IN ('open','blocked')
 LIMIT 1;
 IF v_account_id IS NOT NULL THEN
  IF v_state<>'open' THEN
   RAISE EXCEPTION 'customer_payment_scope_forbidden' USING errcode='42501'; END IF;
  IF v_bound_table<>p_table_id AND NOT EXISTS(
   SELECT 1 FROM sabora.customer_table_change_requests q
   WHERE q.account_id=v_account_id AND q.customer_id=v_customer_id
     AND q.status='approved' AND q.source_table_id=v_bound_table
     AND q.visit_key=v_bound_visit_key
  ) THEN
   RAISE EXCEPTION 'table_change_approval_required' USING errcode='23514'; END IF;
 END IF;
 -- Never return account ID, outstanding debt, identities or provider data.
 RETURN QUERY SELECT v_mode,v_required,v_version;
END;
$fixed_payment_mode$;

-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_customer_account_payment_mode_h6_candidate(bytea,uuid,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_account_payment_mode_h6_candidate(bytea,uuid,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_provider_runtime,sabora_h6_operations_runtime,
      sabora_f12_customer_runtime,sabora_f12_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_account_payment_mode_h6_candidate(bytea,uuid,text)
 TO sabora_b3_h6_reader_runtime;
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
