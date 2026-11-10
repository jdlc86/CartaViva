-- B2 candidate: validate persisted order ownership using real schema fields.
-- orders has customer_identifier, not customer_id. Keep candidate sealed.
BEGIN;
DO $guard$
DECLARE v_body text;v_new text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND p.proname='consume_customer_table_change_h6_candidate';
 IF v_body IS NULL THEN RAISE EXCEPTION 'h6_consume_candidate_missing'; END IF;
 v_new:=replace(v_body,
  'WHERE o.id=p_confirmed_order_id AND o.customer_id=p_customer_id',
  'WHERE o.id=p_confirmed_order_id AND EXISTS ('||
  'SELECT 1 FROM sabora.customer_profiles cp WHERE cp.id=p_customer_id '||
  'AND cp.public_id=o.customer_identifier)');
 IF v_new=v_body THEN RAISE EXCEPTION 'h6_consume_order_ownership_drift'; END IF;
 EXECUTE v_new;
END;
$guard$;
ALTER FUNCTION sabora.consume_customer_table_change_h6_candidate(
 uuid,uuid,bytea,uuid,uuid,text,uuid) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.consume_customer_table_change_h6_candidate(
 uuid,uuid,bytea,uuid,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
COMMIT;
