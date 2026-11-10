-- F17: a valid QR/visit cannot authorize transfer into a blocked table.
-- Isolated candidate only; no runtime grants or cutover.
BEGIN;
DO $guard$
DECLARE v_body text;v_new text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND p.proname='consume_customer_table_change_h6_candidate';
 IF v_body IS NULL THEN RAISE EXCEPTION 'h6_consume_candidate_missing'; END IF;
 IF (SELECT count(*) FROM regexp_matches(v_body,
  'AND v[.]authorized_qr_version=t[.]qr_version','g'))<>1 THEN
  RAISE EXCEPTION 'h6_destination_qr_guard_drift';
 END IF;
 v_new:=replace(v_body,
  'AND v.authorized_qr_version=t.qr_version',
  'AND v.authorized_qr_version=t.qr_version AND t.ordering_state=''open''');
 IF v_new=v_body THEN RAISE EXCEPTION 'h6_destination_open_guard_drift'; END IF;
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
