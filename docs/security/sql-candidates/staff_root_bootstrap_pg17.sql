-- Disposable candidate only. Not part of the 103 governed migrations.
-- A separately authorized operator seeds one grant for a specific Auth UUID.
-- The restricted runtime can consume it, never create/rearm it.
BEGIN;
CREATE ROLE sabora_root_bootstrap_fn_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
 NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE TABLE sabora.root_bootstrap_grants (
 id uuid PRIMARY KEY,
 expected_user_id uuid NOT NULL,
 verifier bytea CHECK (verifier IS NULL OR octet_length(verifier)=32),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 CHECK (expires_at>issued_at AND expires_at<=issued_at+interval '15 minutes')
);
CREATE TABLE sabora.root_bootstrap_receipt (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 grant_id uuid NOT NULL UNIQUE REFERENCES sabora.root_bootstrap_grants(id) ON DELETE RESTRICT,
 root_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id) ON DELETE RESTRICT,
 session_id uuid NOT NULL,
 credential_hash text NOT NULL CHECK(credential_hash ~ '^[0-9a-f]{64}$'),
 consumed_at timestamptz NOT NULL
);
ALTER TABLE sabora.root_bootstrap_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_bootstrap_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_bootstrap_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_bootstrap_receipt FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.root_bootstrap_grants,sabora.root_bootstrap_receipt FROM PUBLIC,anon,authenticated;
CREATE TRIGGER root_bootstrap_receipt_immutable BEFORE UPDATE OR DELETE
 ON sabora.root_bootstrap_receipt FOR EACH ROW
 EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER root_bootstrap_receipt_no_truncate BEFORE TRUNCATE
 ON sabora.root_bootstrap_receipt FOR EACH STATEMENT
 EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
GRANT USAGE ON SCHEMA sabora,extensions TO sabora_root_bootstrap_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text) TO sabora_root_bootstrap_fn_owner;
GRANT SELECT(id,expected_user_id,verifier,issued_at,expires_at),UPDATE(verifier)
 ON sabora.root_bootstrap_grants TO sabora_root_bootstrap_fn_owner;
GRANT SELECT(singleton),INSERT(singleton,grant_id,root_user_id,session_id,credential_hash,consumed_at)
 ON sabora.root_bootstrap_receipt TO sabora_root_bootstrap_fn_owner;
GRANT SELECT(user_id,role,state),INSERT(user_id,role,state) ON sabora.staff_members TO sabora_root_bootstrap_fn_owner;
GRANT SELECT(singleton,owner_user_id),UPDATE(owner_user_id)
 ON sabora.admin_write_ownership TO sabora_root_bootstrap_fn_owner;
CREATE POLICY root_bootstrap_grant_read ON sabora.root_bootstrap_grants FOR SELECT
 TO sabora_root_bootstrap_fn_owner USING(true);
CREATE POLICY root_bootstrap_grant_consume ON sabora.root_bootstrap_grants FOR UPDATE
 TO sabora_root_bootstrap_fn_owner USING(verifier IS NOT NULL) WITH CHECK(verifier IS NULL);
CREATE POLICY root_bootstrap_receipt_read ON sabora.root_bootstrap_receipt FOR SELECT
 TO sabora_root_bootstrap_fn_owner USING(singleton);
CREATE POLICY root_bootstrap_receipt_insert ON sabora.root_bootstrap_receipt FOR INSERT
 TO sabora_root_bootstrap_fn_owner WITH CHECK(singleton);
CREATE POLICY root_bootstrap_staff_read ON sabora.staff_members FOR SELECT
 TO sabora_root_bootstrap_fn_owner USING(true);
CREATE POLICY root_bootstrap_staff_insert ON sabora.staff_members FOR INSERT
 TO sabora_root_bootstrap_fn_owner WITH CHECK(role='root' AND state='active');
CREATE POLICY root_bootstrap_ownership_read ON sabora.admin_write_ownership FOR SELECT
 TO sabora_root_bootstrap_fn_owner USING(singleton);
CREATE POLICY root_bootstrap_ownership_lock ON sabora.admin_write_ownership FOR UPDATE
 TO sabora_root_bootstrap_fn_owner USING(singleton) WITH CHECK(singleton AND owner_user_id IS NULL);

CREATE FUNCTION sabora.consume_root_bootstrap_candidate(
 p_grant_id uuid,p_user_id uuid,p_session_id uuid,p_database_role text,
 p_issued_ms bigint,p_expires_ms bigint,p_credential_hash text,p_proof text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $bootstrap$
DECLARE
 v_grant record;v_owner uuid;v_now timestamptz;v_ms bigint;
 v_expected bytea;v_provided bytea;v_diff integer:=0;v_i integer;
BEGIN
 IF p_grant_id IS NULL OR p_user_id IS NULL OR p_session_id IS NULL
  OR p_database_role IS DISTINCT FROM session_user::text
  OR p_issued_ms IS NULL OR p_expires_ms IS NULL
  OR p_expires_ms::numeric-p_issued_ms::numeric NOT BETWEEN 1 AND 30000
  OR p_credential_hash IS NULL OR p_credential_hash !~ '^[0-9a-f]{64}$'
  OR p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'root_bootstrap_forbidden' USING ERRCODE='42501';
 END IF;
 -- Same governance lock order as ordinary identity/ownership actions.
 SELECT owner_user_id INTO v_owner FROM sabora.admin_write_ownership WHERE singleton FOR UPDATE;
 IF NOT FOUND OR v_owner IS NOT NULL
  OR EXISTS(SELECT 1 FROM sabora.root_bootstrap_receipt WHERE singleton)
  OR EXISTS(SELECT 1 FROM sabora.staff_members) THEN
  RAISE EXCEPTION 'root_bootstrap_forbidden' USING ERRCODE='42501';
 END IF;
 SELECT id,expected_user_id,verifier,issued_at,expires_at INTO v_grant
 FROM sabora.root_bootstrap_grants WHERE id=p_grant_id FOR UPDATE;
 v_now:=clock_timestamp();
 v_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 IF NOT FOUND OR v_grant.verifier IS NULL
  OR v_grant.expected_user_id IS DISTINCT FROM p_user_id
  OR v_now<v_grant.issued_at OR v_now>=v_grant.expires_at
  OR p_issued_ms::numeric>v_ms::numeric+5000 OR p_expires_ms<=v_ms THEN
  RAISE EXCEPTION 'root_bootstrap_forbidden' USING ERRCODE='42501';
 END IF;
 v_expected:=extensions.hmac(convert_to('sabora.root-bootstrap.v2'||chr(10)||
  p_database_role||chr(10)||p_grant_id::text||chr(10)||p_user_id::text||chr(10)||
  p_session_id::text||chr(10)||p_issued_ms::text||chr(10)||p_expires_ms::text||chr(10)||p_credential_hash,'UTF8'),
  v_grant.verifier,'sha256');
 v_provided:=decode(p_proof,'hex');
 FOR v_i IN 0..31 LOOP
  v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_provided,v_i));
 END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN
  RAISE EXCEPTION 'root_bootstrap_forbidden' USING ERRCODE='42501';
 END IF;
 INSERT INTO sabora.staff_members(user_id,role,state) VALUES(p_user_id,'root','active');
 INSERT INTO sabora.root_bootstrap_receipt(singleton,grant_id,root_user_id,session_id,credential_hash,consumed_at)
 VALUES(true,p_grant_id,p_user_id,p_session_id,p_credential_hash,v_now);
 UPDATE sabora.root_bootstrap_grants SET verifier=NULL WHERE id=p_grant_id;
 RETURN true;
END;
$bootstrap$;
-- Candidate is installed only by disposable superuser. The production delta
-- must additionally implement and test CV005 DBA ownership transfer/cleanup.
ALTER FUNCTION sabora.consume_root_bootstrap_candidate(uuid,uuid,uuid,text,bigint,bigint,text,text)
 OWNER TO sabora_root_bootstrap_fn_owner;
REVOKE ALL ON FUNCTION sabora.consume_root_bootstrap_candidate(uuid,uuid,uuid,text,bigint,bigint,text,text)
 FROM PUBLIC,anon,authenticated;
COMMIT;
