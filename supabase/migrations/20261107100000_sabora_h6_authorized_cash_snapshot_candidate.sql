-- F20 candidate-only cash account projection. This migration is NOT applied to operational Supabase.
-- Read bound by HMAC staff identity and server-only role; no direct table access.
BEGIN;
CREATE OR REPLACE FUNCTION sabora.verify_h6_staff_capability_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_action text,p_target_id uuid,p_correlation_id text,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $verify_staff$
DECLARE v_key bytea;v_key_expiry timestamptz;v_role text;v_payload text;v_expected text;v_now bigint;
BEGIN
 v_now:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF p_key_id !~ '^[A-Za-z0-9_-]{8,64}$' OR p_database_role IS DISTINCT FROM session_user
   OR p_actor_user_id IS NULL OR p_staff_role NOT IN ('admin','waiter','kitchen','root')
   OR p_action NOT IN ('report_incident','resolve_incident','settle_cash','refund_cash',
                      'ack_dispatch','read_events','close_account','set_catalog_sold_out','read_cash_accounts')
   OR p_target_id IS NULL OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
   OR p_issued_at_ms>v_now+5000 OR p_issued_at_ms<v_now-60000
   OR p_expires_at_ms<=v_now OR p_expires_at_ms>p_issued_at_ms+60000
   OR p_signature_hex !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501';END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_key_expiry
  FROM sabora.order_operation_signing_keys k WHERE k.key_id=p_key_id
   AND k.disabled_at IS NULL AND k.not_before<=clock_timestamp()
   AND k.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501';END IF;
 SELECT m.role INTO v_role FROM sabora.staff_members m
  WHERE m.user_id=p_actor_user_id AND m.state='active' FOR UPDATE;
 IF NOT FOUND OR v_role IS DISTINCT FROM p_staff_role THEN
  RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501';END IF;
 v_payload:='h6-v1'||chr(10)||p_database_role||chr(10)||p_actor_user_id::text||chr(10)
  ||p_staff_role||chr(10)||p_action||chr(10)||p_target_id::text||chr(10)
  ||p_correlation_id||chr(10)||p_issued_at_ms::text||chr(10)||p_expires_at_ms::text;
 v_expected:=encode(extensions.hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
 IF length(v_expected)<>length(p_signature_hex)
  OR extensions.hmac(convert_to(v_expected,'UTF8'),convert_to('sabora-h6-capability-compare','UTF8'),'sha256')
   <>extensions.hmac(convert_to(p_signature_hex,'UTF8'),convert_to('sabora-h6-capability-compare','UTF8'),'sha256')
 THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501';END IF;
 RETURN v_role;
END;
$verify_staff$;
ALTER FUNCTION sabora.verify_h6_staff_capability_candidate(text,text,uuid,text,text,uuid,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.verify_h6_staff_capability_candidate(text,text,uuid,text,text,uuid,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.verify_h6_staff_capability_candidate(text,text,uuid,text,text,uuid,text,bigint,bigint,text)
 TO sabora_h6_fn_owner;

GRANT SELECT(account_id,table_id,session_id,visit_key)
 ON sabora.customer_account_operational_bindings TO sabora_h6_fn_owner;
DO $policy$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='sabora'
  AND tablename='customer_account_operational_bindings'
  AND policyname='h6_cash_snapshot_owner_select') THEN
  CREATE POLICY h6_cash_snapshot_owner_select ON sabora.customer_account_operational_bindings
  FOR SELECT TO sabora_h6_fn_owner USING (true);
 END IF;
END; $policy$;
GRANT SELECT(id,number) ON sabora.dining_tables TO sabora_h6_fn_owner;
GRANT SELECT(id,public_id) ON sabora.customer_profiles TO sabora_h6_fn_owner;

CREATE FUNCTION sabora.read_h6_cash_accounts_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text,
 p_after_id uuid DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $cash$
DECLARE v_role text;v_items jsonb;v_more boolean;v_last uuid;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(
  p_key_id,p_database_role,p_actor_user_id,p_staff_role,'read_cash_accounts',
  p_actor_user_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('waiter','admin','root') THEN
  RAISE EXCEPTION 'h6_operations_forbidden' USING errcode='42501'; END IF;
 IF p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'invalid_h6_cash_snapshot' USING errcode='22023'; END IF;
 WITH page AS (
  SELECT a.id,a.state,a.payment_mode,a.outstanding_cents,a.cash_settled_cents,
    b.table_id,t.number AS table_number,p.public_id,
    EXISTS(SELECT 1 FROM sabora.payment_attempts e WHERE e.account_id=a.id
      AND e.state IN ('authorization_requested','authorization_unknown',
        'capture_requested','capture_unknown')) AS payment_uncertain,
    EXISTS(SELECT 1 FROM sabora.refund_attempts r JOIN sabora.payment_attempts e
      ON e.id=r.payment_attempt_id WHERE e.account_id=a.id
        AND r.state IN ('requested','unknown')) AS refund_pending
  FROM sabora.customer_accounts a
  JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
  JOIN sabora.dining_tables t ON t.id=b.table_id
  JOIN sabora.customer_profiles p ON p.id=a.customer_id
  WHERE a.state IN ('open','blocked') AND (p_after_id IS NULL OR a.id>p_after_id)
  ORDER BY a.id LIMIT p_limit+1
 ), numbered AS (SELECT *,row_number() OVER(ORDER BY id) AS ordinal FROM page)
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'accountId',id,'tableId',table_id,'tableNumber',table_number,
  'customerCode',public_id,'state',state,'paymentMode',payment_mode,
  'outstandingCents',outstanding_cents,'cashSettledCents',cash_settled_cents,
  'paymentUncertain',payment_uncertain,'refundPending',refund_pending,
  'canSettle',state='open' AND payment_mode='pay_at_end'
    AND outstanding_cents>0 AND NOT payment_uncertain
 ) ORDER BY id) FILTER(WHERE ordinal<=p_limit),'[]'::jsonb),
 COALESCE(bool_or(ordinal>p_limit),false),max(id) FILTER(WHERE ordinal<=p_limit)
 INTO v_items,v_more,v_last FROM numbered;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 RETURN jsonb_build_object('version',1,'items',v_items,
  'nextAfter',CASE WHEN v_more THEN v_last ELSE NULL END);
END; $cash$;
ALTER FUNCTION sabora.read_h6_cash_accounts_candidate(
 text,text,uuid,text,text,bigint,bigint,text,uuid,integer) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_h6_cash_accounts_candidate(
 text,text,uuid,text,text,bigint,bigint,text,uuid,integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,sabora_h6_customer_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_h6_cash_accounts_candidate(
 text,text,uuid,text,text,bigint,bigint,text,uuid,integer) TO sabora_h6_operations_runtime;
COMMIT;
