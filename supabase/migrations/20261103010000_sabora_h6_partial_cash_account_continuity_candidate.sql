-- F20/R05 candidate: authorized partial cash receipts across a table transfer.
-- Preserve the original cash HMAC, owner, role grants, action idempotency and
-- FOR UPDATE account serialization. No runtime route, login or data backfill.
-- Cash amounts must be positive and <= the current debt. A receipt does not
-- close the economic account; only an explicit account-close operation may do so.
-- The append-only customer event follows the authorized operational binding.
BEGIN;
CREATE OR REPLACE FUNCTION sabora.settle_h6_account_cash_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_account_id uuid,p_amount_cents bigint,p_correlation_id text,
 p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $settle_cash$
DECLARE v_role text;v_account sabora.customer_accounts%ROWTYPE;v_fingerprint bytea;
 v_existing record;v_settlement sabora.cash_settlements%ROWTYPE;v_result jsonb;
 v_destination record;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'settle_cash',p_account_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('waiter','admin','root') OR p_amount_cents<=0 THEN
  RAISE EXCEPTION 'invalid_cash_settlement' USING errcode='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_actor_user_id::text||':'||p_correlation_id,0));
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to(p_account_id::text||':'||p_amount_cents::text||':payment','UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=p_account_id FOR UPDATE;
 IF NOT FOUND OR v_account.state<>'open' OR v_account.payment_mode<>'pay_at_end'
  OR v_account.outstanding_cents<p_amount_cents THEN
  RAISE EXCEPTION 'cash_settlement_conflict' USING errcode='23514'; END IF;
 IF EXISTS(SELECT 1 FROM sabora.payment_attempts p WHERE p.account_id=p_account_id
   AND p.state IN ('authorization_unknown','capture_unknown','authorization_requested','capture_requested'))
 THEN RAISE EXCEPTION 'payment_outcome_unknown' USING errcode='23514'; END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 INSERT INTO sabora.cash_settlements(account_id,actor_user_id,correlation_id,amount_cents,kind)
 VALUES(p_account_id,p_actor_user_id,p_correlation_id,p_amount_cents,'payment') RETURNING * INTO v_settlement;
 -- Payment is not account closure. The same account remains eligible for future
 -- orders and for a single approved table transfer after a full or partial receipt.
 UPDATE sabora.customer_accounts SET outstanding_cents=outstanding_cents-p_amount_cents,
  cash_settled_cents=cash_settled_cents+p_amount_cents,updated_at=clock_timestamp()
  WHERE id=p_account_id RETURNING * INTO v_account;
 -- An event must follow the live destination after A->B, never the historical A.
 SELECT b.table_id,b.session_id,b.visit_key INTO v_destination
  FROM sabora.customer_account_operational_bindings b
  WHERE b.account_id=v_account.id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'cash_settlement_binding_missing' USING errcode='42501'; END IF;
 PERFORM sabora.emit_h6_event_candidate(v_destination.table_id,v_destination.session_id,v_destination.visit_key,
  v_account.customer_id,v_account.id,NULL,'customer',
  CASE WHEN v_account.outstanding_cents=0 THEN 'sabora.account.cash_settled'
   ELSE 'sabora.account.cash_partially_paid' END,v_settlement.id,1,
  jsonb_build_object('accountId',v_account.id,'settlementId',v_settlement.id,
   'amountCents',p_amount_cents,'outstandingCents',v_account.outstanding_cents));
 v_result:=jsonb_build_object('accountId',v_account.id,'settlementId',v_settlement.id,
  'amountCents',p_amount_cents,'outstandingCents',v_account.outstanding_cents,
  'accountState',v_account.state,
  'state',CASE WHEN v_account.outstanding_cents=0 THEN 'settled' ELSE 'partial' END);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'settle_cash',v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$settle_cash$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.settle_h6_account_cash_authorized_candidate(text,text,uuid,text,uuid,bigint,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.settle_h6_account_cash_authorized_candidate(text,text,uuid,text,uuid,bigint,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.settle_h6_account_cash_authorized_candidate(text,text,uuid,text,uuid,bigint,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;
REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;
COMMIT;
