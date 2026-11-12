-- H6 replay reader: keep the order as an immutable scope predicate without
-- requesting a row lock that would require an unnecessary orders UPDATE RLS
-- policy. Session, visit, table, account and round remain locked and checked.
BEGIN;

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

ALTER FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 TO sabora_h6_customer_runtime;

COMMENT ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid) IS
 'Read one H6 round by order id after locked customer/session/visit/account scope validation; the immutable order row is checked but not row-locked to avoid widening UPDATE RLS.';

COMMIT;
