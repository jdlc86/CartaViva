-- F17: a valid QR/visit cannot authorize transfer into a blocked table.
-- Isolated candidate only; no runtime grants or cutover.
BEGIN;
-- CV-005 OPTION A: transaction-scoped owner membership for existing function ACL.
DO $cv005_existing_owner_access$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname,roles.rolcanlogin,roles.rolinherit,roles.rolsuper,roles.rolbypassrls,roles.rolcreaterole,roles.rolcreatedb,roles.rolreplication FROM pg_catalog.pg_roles roles
 WHERE roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner
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
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.consume_customer_table_change_h6_candidate(
 uuid,uuid,bytea,uuid,uuid,text,uuid) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.consume_customer_table_change_h6_candidate(
 uuid,uuid,bytea,uuid,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
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
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.consume_customer_table_change_h6_candidate(
 uuid,uuid,bytea,uuid,uuid,text,uuid) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.consume_customer_table_change_h6_candidate(
 uuid,uuid,bytea,uuid,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
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
