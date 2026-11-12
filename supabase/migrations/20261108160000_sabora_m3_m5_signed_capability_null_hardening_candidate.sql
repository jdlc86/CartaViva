-- Fail-closed repair for M3/M5 shared HMAC verifier discovered in independent
-- ADMIN writer audit. Supersedes only the function body from 20261108121000.
-- Existing NOLOGIN owner/EXECUTE grants/RLS retained; no historical SQL rewrite,
-- no LOGIN, no production access or privilege broadening.
BEGIN;

-- CV-005 (PG17): grant the installer temporary access ONLY to the owners
-- of these pre-existing Sabora functions before CREATE OR REPLACE.
-- This is never a runtime grant. The exact DBA-created membership is removed
-- before COMMIT, leaving only the provider/bootstrap ADMIN SET FALSE membership.
DO $cv005_exact_fn_owner_scope$
DECLARE v_owner record;
DECLARE v_names name[] := ARRAY['verify_management_capability_m3']::name[];
BEGIN
 IF EXISTS (
   SELECT 1 FROM unnest(v_names) AS expected(proname)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='sabora' AND p.proname=expected.proname
    )
 ) THEN
  RAISE EXCEPTION 'cv005_expected_existing_function_missing' USING errcode='0P000';
 END IF;
 FOR v_owner IN
  SELECT DISTINCT r.* FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
  WHERE n.nspname='sabora' AND p.proname=ANY(v_names)
    AND r.rolname<>current_user::text
 LOOP
  IF left(v_owner.rolname,7)<>'sabora_'
     OR right(v_owner.rolname,9)<>'_fn_owner'
     OR v_owner.rolcanlogin OR v_owner.rolinherit
     OR v_owner.rolsuper OR v_owner.rolbypassrls
     OR v_owner.rolcreaterole OR v_owner.rolcreatedb
     OR v_owner.rolreplication THEN
   RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner' USING errcode='0P000';
  END IF;
  -- Existing CI laboratory migrations executed by fixture superuser remain
  -- compatible: that trusted fixture does not receive bootstrap membership
  -- and needs no temporary grant. Actual Supabase installer is NOSUPERUSER.
  IF (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user::text) THEN
   CONTINUE;
  END IF;
  IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_auth_members m
   JOIN pg_catalog.pg_roles grantor ON grantor.oid=m.grantor
    WHERE m.roleid=v_owner.oid
     AND m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
     AND grantor.rolsuper AND m.admin_option
     AND NOT m.set_option AND NOT m.inherit_option
  ) THEN
   RAISE EXCEPTION 'cv005_provider_bootstrap_membership_missing' USING errcode='0P000';
  END IF;
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',v_owner.rolname);
 END LOOP;
END;
$cv005_exact_fn_owner_scope$;


CREATE OR REPLACE FUNCTION sabora.verify_management_capability_m3(p_capability jsonb,p_body text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $verify_management$
DECLARE v_key bytea;v_role text;v_payload text;v_expected text;v_now bigint;
 v_owner uuid;v_writer_required boolean;
BEGIN
 v_now:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF jsonb_typeof(p_capability) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(p_capability))<>10
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_capability) k(key) WHERE k.key NOT IN
    ('keyId','databaseRole','actorId','staffRole','action','requestId','bodyHashHex',
     'issuedAtMs','expiresAtMs','signatureHex'))
  -- Signed fields must never be JSON null/missing: IF NULL would skip
  -- HMAC rejection and allow a live owner to write with an unsigned payload.
  OR jsonb_typeof(p_capability->'keyId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'databaseRole') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'actorId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'staffRole') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'action') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'requestId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'bodyHashHex') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'issuedAtMs') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_capability->'expiresAtMs') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_capability->'signatureHex') IS DISTINCT FROM 'string'
  OR (p_capability->>'keyId') !~ '^[A-Za-z0-9_-]{8,64}$'
  OR (p_capability->>'databaseRole') IS DISTINCT FROM session_user
  OR (p_capability->>'actorId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR p_capability->>'staffRole' NOT IN ('admin','root','waiter')
  OR p_capability->>'action' NOT IN
    ('tables.read','table.create','table.update','table.readiness','table.qr_rotate',
     'table.qr_revoke','table.occupancy','catalog.read','catalog.category_create',
     'catalog.category_reorder','catalog.category_visibility','catalog.item_save',
     'catalog.item_publish','catalog.item_withdraw','finance.read',
     'comms.read','comms.manage')
  OR (p_capability->>'requestId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR (p_capability->>'bodyHashHex') !~ '^[0-9a-f]{64}$'
  OR p_body IS NULL
  OR (p_capability->>'action'='comms.manage'
      AND octet_length(convert_to(p_body,'UTF8'))>200000)
  OR (p_capability->>'action' IS DISTINCT FROM 'comms.manage'
      AND octet_length(convert_to(p_body,'UTF8'))>65536)
  OR encode(extensions.digest(convert_to(p_body,'UTF8'),'sha256'),'hex')
      IS DISTINCT FROM p_capability->>'bodyHashHex'
  OR (p_capability->>'issuedAtMs') !~ '^(0|[1-9][0-9]*)$'
  OR (p_capability->>'expiresAtMs') !~ '^(0|[1-9][0-9]*)$'
  OR (p_capability->>'issuedAtMs')::bigint>v_now+5000
  OR (p_capability->>'issuedAtMs')::bigint<v_now-60000
  OR (p_capability->>'expiresAtMs')::bigint<=v_now
  OR (p_capability->>'expiresAtMs')::bigint>(p_capability->>'issuedAtMs')::bigint+60000
  OR (p_capability->>'signatureHex') !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501';
 END IF;
 -- The owner's row is locked BEFORE the keyring and staff row to avoid
 -- lock-order inversion with governance transfers (ownership -> staff).
 -- Waiters retain only the specifically approved table operational actions.
 v_writer_required:=p_capability->>'action' IN (
  'table.create','table.update','table.readiness','table.qr_rotate',
  'table.qr_revoke','table.occupancy',
  'catalog.category_create','catalog.category_reorder','catalog.category_visibility',
  'catalog.item_save','catalog.item_publish','catalog.item_withdraw','comms.manage'
 ) AND NOT (
  p_capability->>'staffRole'='waiter'
  AND p_capability->>'action' IN ('table.readiness','table.occupancy')
 );
 IF v_writer_required THEN
  SELECT o.owner_user_id INTO v_owner FROM sabora.admin_write_ownership o
   WHERE o.singleton FOR SHARE;
  -- NULL or missing ownership fails closed after signature validation.
 END IF;
 SELECT k.hmac_key INTO v_key FROM sabora.order_operation_signing_keys k
  WHERE k.key_id=p_capability->>'keyId' AND k.disabled_at IS NULL
   AND k.not_before<=clock_timestamp() AND k.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 SELECT m.role INTO v_role FROM sabora.staff_members m
  WHERE m.user_id=(p_capability->>'actorId')::uuid AND m.state='active' FOR UPDATE;
 IF NOT FOUND OR v_role IS DISTINCT FROM p_capability->>'staffRole' THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 v_payload:='m3-management-v1'||chr(10)||(p_capability->>'databaseRole')||chr(10)
  ||(p_capability->>'actorId')||chr(10)||(p_capability->>'staffRole')||chr(10)
  ||(p_capability->>'action')||chr(10)||(p_capability->>'requestId')||chr(10)
  ||(p_capability->>'bodyHashHex')||chr(10)||(p_capability->>'issuedAtMs')||chr(10)
  ||(p_capability->>'expiresAtMs');
 v_expected:=encode(extensions.hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
 IF v_expected IS NULL OR p_capability->>'signatureHex' IS NULL
  OR length(v_expected) IS DISTINCT FROM length(p_capability->>'signatureHex')
  OR extensions.hmac(convert_to(v_expected,'UTF8'),
       convert_to('sabora-m3-capability-compare','UTF8'),'sha256')
     IS DISTINCT FROM extensions.hmac(convert_to(p_capability->>'signatureHex','UTF8'),
       convert_to('sabora-m3-capability-compare','UTF8'),'sha256') THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501';
 END IF;
 -- Compare only after authenticating the signed principal and current role.
 -- A nonowner ADMIN and ROOT cannot write, even through direct RPC/replay.
 IF v_writer_required AND
    (v_role<>'admin' OR v_owner IS DISTINCT FROM (p_capability->>'actorId')::uuid)
 THEN
  RAISE EXCEPTION 'm3_management_forbidden' USING ERRCODE='42501';
 END IF;
 RETURN v_role;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501';
END;
$verify_management$;
COMMENT ON FUNCTION sabora.verify_management_capability_m3(jsonb,text) IS
 'Signed staff verifier: single ADMIN owner required for administrative writes; root cannot write; waiter limited to allowed operational table actions.';
-- CV-005: remove only the migration-DBA's temporary role grants.
DO $cv005_exact_fn_owner_release$
DECLARE v_role name;
DECLARE v_names name[] := ARRAY['verify_management_capability_m3']::name[];
BEGIN
 FOR v_role IN
  SELECT DISTINCT r.rolname
   FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
   JOIN pg_catalog.pg_auth_members m ON m.roleid=r.oid
  WHERE n.nspname='sabora' AND p.proname=ANY(v_names)
    AND m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
    AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 LOOP
  EXECUTE format('REVOKE %I FROM CURRENT_USER',v_role);
 END LOOP;
END;
$cv005_exact_fn_owner_release$;

COMMIT;
