-- H6 replay reader: keep the order as an immutable scope predicate without
-- requesting a row lock that would require an unnecessary orders UPDATE RLS
-- policy. Session, visit, table, account and round remain locked and checked.
BEGIN;
-- CV-005 OPTION A: permit only transaction-scoped access to existing sealed function owners.
DO $cv005_existing_owner_access$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname,roles.rolcanlogin,roles.rolinherit,roles.rolsuper,roles.rolbypassrls,roles.rolcreaterole,roles.rolcreatedb,roles.rolreplication
 FROM pg_catalog.pg_roles roles
 WHERE roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner

CREATE OR REPLACE FUNCTION sabora.read_customer_round_h6_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text,p_order_id uuid
)
RETURNS TABLE(
 account_id uuid,round_id uuid,amount_cents bigint,effective_payment_mode text,
 round_state text,payment_attempt_id uuid,authorization_key text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $customer_round$
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 OR p_table_id IS NULL
   OR p_order_id IS NULL OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$'
 THEN RAISE EXCEPTION 'invalid_customer_round_scope' USING errcode='22023'; END IF;
 RETURN QUERY SELECT a.id,r.id,r.amount_cents,r.payment_mode,r.state,p.id,p.authorization_key
  FROM sabora.customer_sessions s
  JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
  JOIN sabora.dining_tables t ON t.id=v.table_id AND t.session_id=v.session_id
  JOIN sabora.customer_accounts a ON a.customer_id=s.customer_id AND a.table_id=t.id
    AND a.session_id=t.session_id AND a.visit_key=v.visit_key
  JOIN sabora.orders o ON o.id=p_order_id AND o.table_id=t.id AND o.session_id=t.session_id
    AND o.customer_visit_key=v.visit_key
  JOIN sabora.order_rounds r ON r.order_id=o.id AND r.account_id=a.id
  LEFT JOIN sabora.payment_attempts p ON p.round_id=r.id
  WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
    AND v.table_id=p_table_id AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
    AND v.expires_at>clock_timestamp() AND v.authorized_qr_version=t.qr_version
  FOR SHARE OF s,v,t,a,r;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer_round_scope_forbidden' USING errcode='42501'; END IF;
END;
$customer_round$;

-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 TO sabora_h6_customer_runtime;

COMMENT ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid) IS
 'Read one H6 round by order id after locked customer/session/visit/account scope validation; the immutable order row is checked but not row-locked to avoid widening UPDATE RLS.';

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


CREATE OR REPLACE FUNCTION sabora.read_customer_round_h6_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text,p_order_id uuid
)
RETURNS TABLE(
 account_id uuid,round_id uuid,amount_cents bigint,effective_payment_mode text,
 round_state text,payment_attempt_id uuid,authorization_key text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $customer_round$
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 OR p_table_id IS NULL
   OR p_order_id IS NULL OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$'
 THEN RAISE EXCEPTION 'invalid_customer_round_scope' USING errcode='22023'; END IF;
 RETURN QUERY SELECT a.id,r.id,r.amount_cents,r.payment_mode,r.state,p.id,p.authorization_key
  FROM sabora.customer_sessions s
  JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
  JOIN sabora.dining_tables t ON t.id=v.table_id AND t.session_id=v.session_id
  JOIN sabora.customer_accounts a ON a.customer_id=s.customer_id AND a.table_id=t.id
    AND a.session_id=t.session_id AND a.visit_key=v.visit_key
  JOIN sabora.orders o ON o.id=p_order_id AND o.table_id=t.id AND o.session_id=t.session_id
    AND o.customer_visit_key=v.visit_key
  JOIN sabora.order_rounds r ON r.order_id=o.id AND r.account_id=a.id
  LEFT JOIN sabora.payment_attempts p ON p.round_id=r.id
  WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
    AND v.table_id=p_table_id AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
    AND v.expires_at>clock_timestamp() AND v.authorized_qr_version=t.qr_version
  FOR SHARE OF s,v,t,a,r;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer_round_scope_forbidden' USING errcode='42501'; END IF;
END;
$customer_round$;

-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 TO sabora_h6_customer_runtime;

COMMENT ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid) IS
 'Read one H6 round by order id after locked customer/session/visit/account scope validation; the immutable order row is checked but not row-locked to avoid widening UPDATE RLS.';

REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;

-- CV-005: clear every migrator-issued owner membership before COMMIT.
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
