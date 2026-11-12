-- B3 F14/F18 candidate: a refreshed, authorized QR visit on the SAME
-- operational table/session must not force a table-change grant or a second
-- economic account. Previously the old binding's visit_key was required to
-- match the new QR authorization; that incorrectly denied ordinary orders.
-- Keep the account binding itself immutable on same-table reauthorization:
-- an outstanding approved A->B grant still refers to the original binding.
-- Every new visit is checked by the sealed confirmation before this guard.
-- Candidate-only; no operational H6 function, grants or production cutover.
BEGIN;
DO $guard$
DECLARE v_body text;v_new text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora'
  AND p.oid=to_regprocedure('sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)');
 IF v_body IS NULL THEN RAISE EXCEPTION 'h6_transfer_candidate_signature_drift'; END IF;
 -- Only the operational binding check may lose its *old visit* comparison;
 -- never alter the validated current visit, table session or approval rules.
 IF (SELECT count(*) FROM regexp_matches(v_body,
  'AND[[:space:]]+b[.]visit_key[[:space:]]*=[[:space:]]*p_visit_key','g'))<>1 THEN
  RAISE EXCEPTION 'h6_same_table_binding_guard_drift';
 END IF;
 v_new:=regexp_replace(v_body,
  'AND[[:space:]]+b[.]visit_key[[:space:]]*=[[:space:]]*p_visit_key','');
 IF v_new=v_body THEN RAISE EXCEPTION 'h6_same_table_binding_rewrite_drift'; END IF;
 EXECUTE v_new;
END;
$guard$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_provider_runtime,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;
COMMIT;
