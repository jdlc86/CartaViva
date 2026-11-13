-- Single ADMIN write owner across M3/M5 administrative mutations.
-- CI candidate only; no operational Supabase application or runtime LOGIN.
-- Root retains read/governance permissions, never ordinary config mutation.
-- Existing staff waiter table readiness/occupancy actions remain independent.
BEGIN;
-- CV-005: existing M3/M5 owner needed for CREATE OR REPLACE; transactional only.
DO $cv005_early_owner_scope$
DECLARE ri record;
BEGIN
 FOR ri IN SELECT DISTINCT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication
 FROM pg_catalog.pg_roles r WHERE left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner' AND r.rolname<>current_user::text
 AND (EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=r.oid AND n.nspname='sabora')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=r.oid AND n.nspname='sabora'))
 LOOP
 IF ri.rolcanlogin OR ri.rolinherit OR ri.rolsuper OR ri.rolbypassrls OR ri.rolcreaterole OR ri.rolcreatedb OR ri.rolreplication THEN
  RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner' USING errcode='0P000';
 END IF;
 EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',ri.rolname);
 END LOOP;
END;
$cv005_early_owner_scope$;


-- The SECURITY DEFINER verifier alone can observe the administrative owner.
-- FOR SHARE is required to serialize a concurrent ownership transfer.
-- PostgreSQL 17 requires UPDATE privilege for row-locking reads; only the
-- immutable boolean singleton column is updatable by this sealed NOLOGIN
-- owner, never owner_user_id. The table CHECK prevents changing singleton.
GRANT SELECT(singleton,owner_user_id),UPDATE(singleton)
 ON sabora.admin_write_ownership TO sabora_m3_management_fn_owner;
CREATE POLICY m3_owner_lookup_singleton_read ON sabora.admin_write_ownership
 FOR SELECT TO sabora_m3_management_fn_owner USING(singleton);
CREATE POLICY m3_owner_lookup_singleton_lock ON sabora.admin_write_ownership
 FOR UPDATE TO sabora_m3_management_fn_owner
 USING(singleton) WITH CHECK(singleton);

-- Replace the shared signed verifier (also used by CV-014 communications).
-- The original function owner, HMAC keyring privileges and exact EXECUTE
-- grants are retained by CREATE OR REPLACE; no new runtime entrypoint.
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
 IF length(v_expected)<>length(p_capability->>'signatureHex')
  OR extensions.hmac(convert_to(v_expected,'UTF8'),
       convert_to('sabora-m3-capability-compare','UTF8'),'sha256')
     <>extensions.hmac(convert_to(p_capability->>'signatureHex','UTF8'),
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

DO $cv005_early_owner_release$
DECLARE role_name name;
BEGIN
 FOR role_name IN SELECT DISTINCT r.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
 WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner'
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',role_name); END LOOP;
END;
$cv005_early_owner_release$;
COMMIT;
