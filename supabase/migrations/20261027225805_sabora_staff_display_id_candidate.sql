-- Sabora Issue #35: durable staff display identity and global-only code recovery.
-- Candidate only. This migration creates no LOGIN, key material, endpoint or
-- operational grant and must not be applied to operational Supabase here.
BEGIN;

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                  WHERE rolname='sabora_staff_identity_fn_owner') THEN
    CREATE ROLE sabora_staff_identity_fn_owner
      NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname='sabora_staff_identity_fn_owner'
       AND (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls
         OR rolcreatedb OR rolcreaterole OR rolreplication)
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles role
      ON role.oid=membership.roleid OR role.oid=membership.member
    WHERE role.rolname='sabora_staff_identity_fn_owner'
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_staff_identity_fn_owner' USING errcode='0P000';
  END IF;
END;
$role$;

ALTER TABLE sabora.staff_enrollments
  ADD COLUMN given_name text,
  ADD COLUMN family_name text,
  ADD COLUMN employee_code text,
  ADD COLUMN operational_display_id text,
  ADD CONSTRAINT staff_enrollment_display_identity_shape CHECK (
    (given_name IS NULL AND family_name IS NULL AND employee_code IS NULL
      AND operational_display_id IS NULL)
    OR
    (given_name IS NOT NULL AND family_name IS NOT NULL
      AND length(given_name) BETWEEN 1 AND 80 AND given_name=btrim(given_name)
      AND given_name !~ '[[:cntrl:]]'
      AND length(family_name) BETWEEN 1 AND 160 AND family_name=btrim(family_name)
      AND family_name !~ '[[:cntrl:]]'
      AND ((employee_code IS NULL AND operational_display_id IS NULL)
        OR (employee_code ~ '^[0-9A-Z]{3}$' AND employee_code<>'000'
          AND operational_display_id ~ '^.{2,4}-[0-9A-Z]{3}$'
          AND operational_display_id=
            upper(left(given_name,1)||left(split_part(family_name,' ',1),1))
              ||'-'||employee_code)))
  );
CREATE UNIQUE INDEX staff_enrollments_reserved_employee_code_unique
  ON sabora.staff_enrollments(employee_code) WHERE employee_code IS NOT NULL;

CREATE TABLE sabora.staff_employee_code_pool (
  code text PRIMARY KEY CHECK (code ~ '^[0-9A-Z]{3}$' AND code<>'000'),
  allocation_order integer NOT NULL UNIQUE
    CHECK (allocation_order BETWEEN 1 AND 46655),
  enrollment_id uuid UNIQUE REFERENCES sabora.staff_enrollments(id) ON DELETE RESTRICT,
  reserved_at timestamptz,
  CHECK ((enrollment_id IS NULL AND reserved_at IS NULL)
    OR (enrollment_id IS NOT NULL AND reserved_at IS NOT NULL))
);

INSERT INTO sabora.staff_employee_code_pool(code,allocation_order)
SELECT lpad(value::text,3,'0'),value FROM generate_series(1,999) value;
WITH alphabet AS (
  SELECT position,substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',position,1) AS character
    FROM generate_series(1,36) position
), alphanumeric AS (
  -- Excluding every all-numeric value makes the first row 00A and preserves
  -- the approved base-36 lexical sequence through ZZZ.
  SELECT a.character||b.character||c.character AS code
    FROM alphabet a CROSS JOIN alphabet b CROSS JOIN alphabet c
   WHERE (a.character||b.character||c.character) !~ '^[0-9]{3}$'
   ORDER BY a.position,b.position,c.position
)
INSERT INTO sabora.staff_employee_code_pool(code,allocation_order)
SELECT code,999+row_number() OVER () FROM alphanumeric;

CREATE TABLE sabora.staff_employee_code_events (
  id uuid PRIMARY KEY,
  code text NOT NULL CHECK (code ~ '^[0-9A-Z]{3}$' AND code<>'000'),
  enrollment_id uuid NOT NULL REFERENCES sabora.staff_enrollments(id) ON DELETE RESTRICT,
  subject_user_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('assigned','released')),
  given_name text NOT NULL,
  family_name text NOT NULL,
  operational_display_id text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id) ON DELETE RESTRICT,
  maintenance_request_id uuid,
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 500),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((event_type='assigned' AND maintenance_request_id IS NULL AND reason IS NULL)
    OR (event_type='released' AND maintenance_request_id IS NOT NULL AND reason IS NOT NULL))
);
CREATE UNIQUE INDEX staff_employee_code_one_assignment_event
  ON sabora.staff_employee_code_events(enrollment_id) WHERE event_type='assigned';

CREATE TABLE sabora.staff_identity_requests (
  actor_user_id uuid NOT NULL,
  correlation_id text NOT NULL CHECK (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  request_fingerprint bytea NOT NULL CHECK (octet_length(request_fingerprint)=32),
  enrollment_id uuid NOT NULL REFERENCES sabora.staff_enrollments(id) ON DELETE RESTRICT,
  employee_code text NOT NULL CHECK (employee_code ~ '^[0-9A-Z]{3}$'),
  event_id uuid NOT NULL REFERENCES sabora.staff_employee_code_events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_user_id,correlation_id)
);

CREATE TABLE sabora.staff_code_maintenance_requests (
  id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id) ON DELETE RESTRICT,
  correlation_id text NOT NULL CHECK (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  action text NOT NULL CHECK (action IN ('preview','recover')),
  request_fingerprint bytea NOT NULL CHECK (octet_length(request_fingerprint)=32),
  reason text,
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(actor_user_id,correlation_id),
  CHECK ((action='preview' AND reason IS NULL)
    OR (action='recover' AND length(btrim(reason)) BETWEEN 1 AND 500))
);

ALTER TABLE sabora.staff_employee_code_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_employee_code_pool FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_employee_code_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_employee_code_events FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_identity_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_identity_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_code_maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_code_maintenance_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.staff_employee_code_pool,sabora.staff_employee_code_events,
  sabora.staff_identity_requests,sabora.staff_code_maintenance_requests
  FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer,
  sabora_h6_customer_runtime,sabora_h6_provider_runtime,sabora_h6_operations_runtime;

CREATE TRIGGER staff_employee_code_events_immutable
  BEFORE UPDATE OR DELETE ON sabora.staff_employee_code_events
  FOR EACH ROW EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER staff_employee_code_events_no_truncate
  BEFORE TRUNCATE ON sabora.staff_employee_code_events
  FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER staff_identity_requests_immutable
  BEFORE UPDATE OR DELETE ON sabora.staff_identity_requests
  FOR EACH ROW EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER staff_identity_requests_no_truncate
  BEFORE TRUNCATE ON sabora.staff_identity_requests
  FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER staff_code_maintenance_requests_immutable
  BEFORE UPDATE OR DELETE ON sabora.staff_code_maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER staff_code_maintenance_requests_no_truncate
  BEFORE TRUNCATE ON sabora.staff_code_maintenance_requests
  FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();

REVOKE ALL ON SCHEMA sabora FROM sabora_staff_identity_fn_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA sabora FROM sabora_staff_identity_fn_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sabora FROM sabora_staff_identity_fn_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora FROM sabora_staff_identity_fn_owner;
GRANT USAGE ON SCHEMA sabora,extensions TO sabora_staff_identity_fn_owner;
-- PostgreSQL requires UPDATE privilege for a SELECT ... FOR SHARE row lock.
-- The owner is a sealed NOLOGIN/NOINHERIT role and the candidate functions
-- never expose or mutate disabled_at; this mirrors the lifecycle owner fence.
GRANT SELECT(key_id,hmac_key,not_before,expires_at,disabled_at),UPDATE(disabled_at)
  ON sabora.staff_lifecycle_signing_keys TO sabora_staff_identity_fn_owner;
GRANT SELECT(singleton,owner_user_id),UPDATE(owner_user_id)
  ON sabora.admin_write_ownership TO sabora_staff_identity_fn_owner;
-- UPDATE(state) is required by PostgreSQL to take the membership FOR UPDATE
-- fence. The sealed role has no login/membership and no function mutates it.
GRANT SELECT(user_id,role,state),UPDATE(state)
  ON sabora.staff_members TO sabora_staff_identity_fn_owner;
GRANT SELECT(id,state,auth_user_id,given_name,family_name,employee_code,operational_display_id),
  UPDATE(given_name,family_name,employee_code,operational_display_id,updated_at)
  ON sabora.staff_enrollments TO sabora_staff_identity_fn_owner;
-- The existing lifecycle wrapper reads/returns enrollment.*. Adding columns to
-- the table therefore requires extending its sealed definer's SELECT surface,
-- while its mutation surface remains unchanged.
GRANT SELECT(given_name,family_name,employee_code,operational_display_id)
  ON sabora.staff_enrollments TO sabora_staff_lifecycle_fn_owner;
GRANT SELECT(code,allocation_order,enrollment_id,reserved_at),
  UPDATE(enrollment_id,reserved_at)
  ON sabora.staff_employee_code_pool TO sabora_staff_identity_fn_owner;
GRANT SELECT,INSERT ON sabora.staff_employee_code_events TO sabora_staff_identity_fn_owner;
GRANT SELECT,INSERT ON sabora.staff_identity_requests TO sabora_staff_identity_fn_owner;
GRANT SELECT,INSERT ON sabora.staff_code_maintenance_requests TO sabora_staff_identity_fn_owner;
GRANT SELECT(id,state,claimed_by) ON sabora.pickup_tasks TO sabora_staff_identity_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text) TO sabora_staff_identity_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_authorized_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text
) TO sabora_staff_identity_fn_owner;

CREATE POLICY staff_identity_owner_key_select ON sabora.staff_lifecycle_signing_keys
  FOR SELECT TO sabora_staff_identity_fn_owner USING (true);
CREATE POLICY staff_identity_owner_key_lock ON sabora.staff_lifecycle_signing_keys
  FOR UPDATE TO sabora_staff_identity_fn_owner USING (true) WITH CHECK(true);
CREATE POLICY staff_identity_owner_ownership_select ON sabora.admin_write_ownership
  FOR SELECT TO sabora_staff_identity_fn_owner USING (singleton=true);
CREATE POLICY staff_identity_owner_ownership_lock ON sabora.admin_write_ownership
  FOR UPDATE TO sabora_staff_identity_fn_owner USING (singleton=true) WITH CHECK(singleton=true);
CREATE POLICY staff_identity_owner_staff_select ON sabora.staff_members
  FOR SELECT TO sabora_staff_identity_fn_owner USING (true);
CREATE POLICY staff_identity_owner_staff_lock ON sabora.staff_members
  FOR UPDATE TO sabora_staff_identity_fn_owner USING (true) WITH CHECK(true);
CREATE POLICY staff_identity_owner_enrollment_select ON sabora.staff_enrollments
  FOR SELECT TO sabora_staff_identity_fn_owner USING (true);
CREATE POLICY staff_identity_owner_enrollment_update ON sabora.staff_enrollments
  FOR UPDATE TO sabora_staff_identity_fn_owner USING (true) WITH CHECK(true);
CREATE POLICY staff_identity_owner_pool_select ON sabora.staff_employee_code_pool
  FOR SELECT TO sabora_staff_identity_fn_owner USING (true);
CREATE POLICY staff_identity_owner_pool_update ON sabora.staff_employee_code_pool
  FOR UPDATE TO sabora_staff_identity_fn_owner USING (true) WITH CHECK(true);
CREATE POLICY staff_identity_owner_event_select ON sabora.staff_employee_code_events
  FOR SELECT TO sabora_staff_identity_fn_owner USING (true);
CREATE POLICY staff_identity_owner_event_insert ON sabora.staff_employee_code_events
  FOR INSERT TO sabora_staff_identity_fn_owner WITH CHECK(true);
CREATE POLICY staff_identity_owner_request_select ON sabora.staff_identity_requests
  FOR SELECT TO sabora_staff_identity_fn_owner USING (true);
CREATE POLICY staff_identity_owner_request_insert ON sabora.staff_identity_requests
  FOR INSERT TO sabora_staff_identity_fn_owner WITH CHECK(true);
CREATE POLICY staff_identity_owner_maintenance_select ON sabora.staff_code_maintenance_requests
  FOR SELECT TO sabora_staff_identity_fn_owner USING (true);
CREATE POLICY staff_identity_owner_maintenance_insert ON sabora.staff_code_maintenance_requests
  FOR INSERT TO sabora_staff_identity_fn_owner WITH CHECK(true);
CREATE POLICY staff_identity_owner_pickup_select ON sabora.pickup_tasks
  FOR SELECT TO sabora_staff_identity_fn_owner USING (true);

CREATE FUNCTION sabora.transition_staff_lifecycle_with_identity_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_action text,
 p_enrollment_id uuid,p_subject_user_id uuid,p_requested_role text,
 p_invitee_email_hash_hex text,p_invite_token_hash_hex text,
 p_credential_evidence_hash_hex text,p_reason text,p_correlation_id text,
 p_issued_at_ms bigint,p_expires_at_ms bigint,p_given_name text,p_family_name text,
 p_signature_hex text
)
RETURNS TABLE(
 result_enrollment_id uuid,result_subject_user_id uuid,result_requested_role text,
 previous_state text,current_state text,repeated boolean,
 result_invite_version integer,event_id uuid,result_given_name text,
 result_family_name text,result_employee_code text,result_operational_display_id text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $identity$
DECLARE
 v_key bytea;v_key_expires timestamptz;v_now timestamptz:=clock_timestamp();
 v_reason_hash text;v_given_hash text;v_family_hash text;v_message text;
 v_expected bytea;v_provided bytea;v_difference integer:=0;v_index integer;
 v_legacy_message text;v_legacy_signature text;v_transition record;v_existing record;
 v_fingerprint bytea;v_code text;v_display text;v_event uuid:=gen_random_uuid();
BEGIN
 IF p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_database_role IS DISTINCT FROM session_user::text OR p_actor_user_id IS NULL
  OR p_enrollment_id IS NULL OR p_action NOT IN
   ('invite','accept','register','activate','resend','suspend','revoke')
  OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
  OR p_issued_at_ms IS NULL OR p_expires_at_ms IS NULL
  OR p_expires_at_ms::numeric-p_issued_at_ms::numeric NOT BETWEEN 1 AND 30000
  OR p_signature_hex !~ '^[0-9a-f]{64}$'
  OR NOT ((p_action='invite' AND p_given_name IS NOT NULL AND p_family_name IS NOT NULL
      AND p_given_name=btrim(p_given_name) AND length(p_given_name) BETWEEN 1 AND 80
      AND p_given_name !~ '[[:cntrl:]]' AND p_family_name=btrim(p_family_name)
      AND length(p_family_name) BETWEEN 1 AND 160 AND p_family_name !~ '[[:cntrl:]]')
    OR (p_action<>'invite' AND p_given_name IS NULL AND p_family_name IS NULL))
 THEN RAISE EXCEPTION 'invalid_staff_identity_capability' USING errcode='42501'; END IF;

 SELECT key.hmac_key,key.expires_at INTO v_key,v_key_expires
 FROM sabora.staff_lifecycle_signing_keys key
 WHERE key.key_id=p_key_id AND key.disabled_at IS NULL
  AND key.not_before<=v_now AND key.expires_at>v_now FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_staff_identity_capability' USING errcode='42501'; END IF;
 v_reason_hash:=CASE WHEN p_reason IS NULL THEN '-' ELSE
  encode(sha256(convert_to(btrim(p_reason),'UTF8')),'hex') END;
 v_given_hash:=CASE WHEN p_given_name IS NULL THEN '-' ELSE
  encode(sha256(convert_to(p_given_name,'UTF8')),'hex') END;
 v_family_hash:=CASE WHEN p_family_name IS NULL THEN '-' ELSE
  encode(sha256(convert_to(p_family_name,'UTF8')),'hex') END;
 v_message:='sabora.staff-identity.v1'||chr(10)||p_key_id||chr(10)||p_database_role||chr(10)
  ||lower(p_actor_user_id::text)||chr(10)||p_action||chr(10)||lower(p_enrollment_id::text)||chr(10)
  ||coalesce(lower(p_subject_user_id::text),'-')||chr(10)||coalesce(p_requested_role,'-')||chr(10)
  ||coalesce(p_invitee_email_hash_hex,'-')||chr(10)||coalesce(p_invite_token_hash_hex,'-')||chr(10)
  ||coalesce(p_credential_evidence_hash_hex,'-')||chr(10)||v_reason_hash||chr(10)
  ||v_given_hash||chr(10)||v_family_hash||chr(10)||p_correlation_id||chr(10)
  ||p_issued_at_ms::text||chr(10)||p_expires_at_ms::text;
 v_expected:=extensions.hmac(convert_to(v_message,'UTF8'),v_key,'sha256');
 v_provided:=decode(p_signature_hex,'hex');
 IF octet_length(v_expected)<>32 OR octet_length(v_provided)<>32 THEN
  RAISE EXCEPTION 'invalid_staff_identity_capability' USING errcode='42501'; END IF;
 FOR v_index IN 0..31 LOOP
  v_difference:=v_difference | (get_byte(v_expected,v_index)#get_byte(v_provided,v_index));
 END LOOP;
 IF v_difference<>0 THEN RAISE EXCEPTION 'invalid_staff_identity_capability' USING errcode='42501'; END IF;

 v_fingerprint:=sha256(convert_to(p_action||chr(10)
  ||coalesce(p_requested_role,'-')||chr(10)||coalesce(p_invitee_email_hash_hex,'-')||chr(10)
  ||v_given_hash||chr(10)||v_family_hash,'UTF8'));
 IF p_action='invite' THEN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
   'sabora.staff-employee-code-pool.v1',0));
 END IF;

 v_legacy_message:='sabora.staff-lifecycle.v1'||chr(10)||p_key_id||chr(10)
  ||p_database_role||chr(10)||lower(p_actor_user_id::text)||chr(10)||p_action||chr(10)
  ||lower(p_enrollment_id::text)||chr(10)||coalesce(lower(p_subject_user_id::text),'-')||chr(10)
  ||coalesce(p_requested_role,'-')||chr(10)||coalesce(p_invitee_email_hash_hex,'-')||chr(10)
  ||coalesce(p_invite_token_hash_hex,'-')||chr(10)
  ||coalesce(p_credential_evidence_hash_hex,'-')||chr(10)||v_reason_hash||chr(10)
  ||p_correlation_id||chr(10)||p_issued_at_ms::text||chr(10)||p_expires_at_ms::text;
 v_legacy_signature:=encode(extensions.hmac(convert_to(v_legacy_message,'UTF8'),v_key,'sha256'),'hex');
 SELECT transition.* INTO STRICT v_transition
 FROM sabora.transition_staff_lifecycle_authorized_candidate(
  p_key_id,p_database_role,p_actor_user_id,p_action,p_enrollment_id,p_subject_user_id,
  p_requested_role,p_invitee_email_hash_hex,p_invite_token_hash_hex,
  p_credential_evidence_hash_hex,p_reason,p_correlation_id,p_issued_at_ms,
  p_expires_at_ms,v_legacy_signature) transition;

 IF p_action='invite' THEN
  IF v_transition.repeated THEN
   SELECT request.request_fingerprint,request.employee_code INTO v_existing
   FROM sabora.staff_identity_requests request
   WHERE request.actor_user_id=p_actor_user_id AND request.correlation_id=p_correlation_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'staff_identity_replay_missing' USING errcode='40001'; END IF;
   IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
    RAISE EXCEPTION 'staff_identity_idempotency_conflict' USING errcode='23505'; END IF;
  ELSE
   SELECT pool.code INTO v_code FROM sabora.staff_employee_code_pool pool
    WHERE pool.enrollment_id IS NULL ORDER BY pool.allocation_order
    FOR UPDATE SKIP LOCKED LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'staff_employee_codes_exhausted' USING errcode='P0001'; END IF;
   v_display:=upper(left(p_given_name,1)||left(split_part(p_family_name,' ',1),1))||'-'||v_code;
   UPDATE sabora.staff_employee_code_pool SET enrollment_id=v_transition.result_enrollment_id,
    reserved_at=clock_timestamp() WHERE code=v_code;
   UPDATE sabora.staff_enrollments SET given_name=p_given_name,family_name=p_family_name,
    employee_code=v_code,operational_display_id=v_display,updated_at=clock_timestamp()
    WHERE id=v_transition.result_enrollment_id;
   INSERT INTO sabora.staff_employee_code_events(id,code,enrollment_id,subject_user_id,
    event_type,given_name,family_name,operational_display_id,actor_user_id)
   VALUES(v_event,v_code,v_transition.result_enrollment_id,NULL,'assigned',p_given_name,
    p_family_name,v_display,p_actor_user_id);
   INSERT INTO sabora.staff_identity_requests(actor_user_id,correlation_id,request_fingerprint,
    enrollment_id,employee_code,event_id)
   VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,v_transition.result_enrollment_id,v_code,v_event);
  END IF;
 END IF;

 SELECT enrollment.given_name,enrollment.family_name,enrollment.employee_code,
  enrollment.operational_display_id
 INTO result_given_name,result_family_name,result_employee_code,result_operational_display_id
 FROM sabora.staff_enrollments enrollment WHERE enrollment.id=v_transition.result_enrollment_id;
 result_enrollment_id:=v_transition.result_enrollment_id;
 result_subject_user_id:=v_transition.result_subject_user_id;
 result_requested_role:=v_transition.result_requested_role;
 previous_state:=v_transition.previous_state;current_state:=v_transition.current_state;
 repeated:=v_transition.repeated;result_invite_version:=v_transition.result_invite_version;
 event_id:=v_transition.event_id;
 RETURN NEXT;
END;
$identity$;
ALTER FUNCTION sabora.transition_staff_lifecycle_with_identity_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text
) OWNER TO sabora_staff_identity_fn_owner;
REVOKE ALL ON FUNCTION sabora.transition_staff_lifecycle_with_identity_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text
) FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_provider_runtime,sabora_h6_operations_runtime;

CREATE FUNCTION sabora.maintain_staff_employee_codes_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_action text,
 p_confirmed boolean,p_reason text,p_correlation_id text,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $maintenance$
DECLARE
 v_key bytea;v_key_expires timestamptz;v_now timestamptz:=clock_timestamp();
 v_now_ms bigint;v_owner uuid;v_role text;v_state text;v_reason text;
 v_reason_hash text;v_message text;v_expected bytea;v_provided bytea;
 v_difference integer:=0;v_index integer;v_fingerprint bytea;v_existing record;
 v_result jsonb;v_request_id uuid:=gen_random_uuid();v_candidate record;
 v_released integer:=0;v_eligible integer;v_blocked integer;v_available integer;
BEGIN
 v_reason:=CASE WHEN p_reason IS NULL THEN NULL ELSE btrim(p_reason) END;
 IF p_key_id IS NULL OR p_database_role IS NULL OR p_actor_user_id IS NULL
  OR p_action IS NULL OR p_confirmed IS NULL OR p_correlation_id IS NULL
  OR p_issued_at_ms IS NULL OR p_expires_at_ms IS NULL OR p_signature_hex IS NULL
  OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_database_role IS DISTINCT FROM session_user::text
  OR p_action NOT IN ('preview','recover')
  OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
  OR p_expires_at_ms::numeric-p_issued_at_ms::numeric NOT BETWEEN 1 AND 30000
  OR p_signature_hex !~ '^[0-9a-f]{64}$'
  OR NOT ((p_action='preview' AND p_confirmed IS FALSE AND v_reason IS NULL)
    OR (p_action='recover' AND p_confirmed IS TRUE AND v_reason IS NOT NULL
      AND length(v_reason) BETWEEN 1 AND 500))
 THEN RAISE EXCEPTION 'invalid_staff_code_maintenance_capability' USING errcode='42501'; END IF;
 v_now_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 IF p_issued_at_ms>v_now_ms+5000 OR p_expires_at_ms<=v_now_ms THEN
  RAISE EXCEPTION 'invalid_staff_code_maintenance_capability' USING errcode='42501'; END IF;
 SELECT key.hmac_key,key.expires_at INTO v_key,v_key_expires
 FROM sabora.staff_lifecycle_signing_keys key WHERE key.key_id=p_key_id
  AND key.disabled_at IS NULL AND key.not_before<=v_now AND key.expires_at>v_now FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_staff_code_maintenance_capability' USING errcode='42501'; END IF;
 v_reason_hash:=CASE WHEN v_reason IS NULL THEN '-' ELSE
  encode(sha256(convert_to(v_reason,'UTF8')),'hex') END;
 v_message:='sabora.staff-code-maintenance.v1'||chr(10)||p_key_id||chr(10)||p_database_role||chr(10)
  ||lower(p_actor_user_id::text)||chr(10)||p_action||chr(10)||p_confirmed::text||chr(10)
 ||v_reason_hash||chr(10)||p_correlation_id||chr(10)||p_issued_at_ms::text||chr(10)||p_expires_at_ms::text;
 v_expected:=extensions.hmac(convert_to(v_message,'UTF8'),v_key,'sha256');v_provided:=decode(p_signature_hex,'hex');
 IF octet_length(v_expected)<>32 OR octet_length(v_provided)<>32 THEN
  RAISE EXCEPTION 'invalid_staff_code_maintenance_capability' USING errcode='42501'; END IF;
 FOR v_index IN 0..31 LOOP v_difference:=v_difference |
  (get_byte(v_expected,v_index)#get_byte(v_provided,v_index)); END LOOP;
 IF v_difference<>0 THEN RAISE EXCEPTION 'invalid_staff_code_maintenance_capability' USING errcode='42501'; END IF;
 SELECT owner_user_id INTO v_owner FROM sabora.admin_write_ownership
  WHERE singleton=true FOR UPDATE;
 SELECT role,state INTO v_role,v_state FROM sabora.staff_members
  WHERE user_id=p_actor_user_id FOR UPDATE;
 IF v_owner IS DISTINCT FROM p_actor_user_id OR v_role<>'admin' OR v_state<>'active' THEN
  RAISE EXCEPTION 'staff_code_maintenance_admin_forbidden' USING errcode='42501'; END IF;
 v_now:=clock_timestamp();v_now_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 IF p_expires_at_ms<=v_now_ms OR v_key_expires<=v_now THEN
  RAISE EXCEPTION 'invalid_staff_code_maintenance_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to(p_action||chr(10)||p_confirmed::text||chr(10)||v_reason_hash,'UTF8'));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  lower(p_actor_user_id::text)||':'||p_correlation_id,0));
 SELECT request.request_fingerprint,request.result INTO v_existing
 FROM sabora.staff_code_maintenance_requests request
 WHERE request.actor_user_id=p_actor_user_id AND request.correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
   RAISE EXCEPTION 'staff_code_maintenance_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'sabora.staff-employee-code-pool.v1',0));
 SELECT count(*)::integer INTO v_eligible
 FROM sabora.staff_employee_code_pool pool JOIN sabora.staff_enrollments enrollment
  ON enrollment.id=pool.enrollment_id
 WHERE enrollment.state='revoked' AND NOT EXISTS(
  SELECT 1 FROM sabora.pickup_tasks task WHERE task.claimed_by=enrollment.auth_user_id
   AND task.state='claimed');
 SELECT count(*)::integer INTO v_blocked FROM sabora.staff_employee_code_pool pool
 JOIN sabora.staff_enrollments enrollment ON enrollment.id=pool.enrollment_id
 WHERE enrollment.state<>'revoked' OR EXISTS(
  SELECT 1 FROM sabora.pickup_tasks task WHERE task.claimed_by=enrollment.auth_user_id
   AND task.state='claimed');
 IF p_action='recover' THEN
  FOR v_candidate IN
   SELECT pool.code,enrollment.id AS enrollment_id,enrollment.auth_user_id,
    enrollment.given_name,enrollment.family_name,enrollment.operational_display_id
   FROM sabora.staff_employee_code_pool pool JOIN sabora.staff_enrollments enrollment
    ON enrollment.id=pool.enrollment_id
   WHERE enrollment.state='revoked' AND NOT EXISTS(
    SELECT 1 FROM sabora.pickup_tasks task WHERE task.claimed_by=enrollment.auth_user_id
     AND task.state='claimed') ORDER BY pool.allocation_order FOR UPDATE OF pool,enrollment
  LOOP
   UPDATE sabora.staff_employee_code_pool SET enrollment_id=NULL,reserved_at=NULL
    WHERE code=v_candidate.code;
   UPDATE sabora.staff_enrollments SET employee_code=NULL,operational_display_id=NULL,
    updated_at=clock_timestamp() WHERE id=v_candidate.enrollment_id;
   INSERT INTO sabora.staff_employee_code_events(id,code,enrollment_id,subject_user_id,
    event_type,given_name,family_name,operational_display_id,actor_user_id,
    maintenance_request_id,reason)
   VALUES(gen_random_uuid(),v_candidate.code,v_candidate.enrollment_id,v_candidate.auth_user_id,
    'released',v_candidate.given_name,v_candidate.family_name,
    v_candidate.operational_display_id,p_actor_user_id,v_request_id,v_reason);
   v_released:=v_released+1;
  END LOOP;
 END IF;
 SELECT count(*)::integer INTO v_available FROM sabora.staff_employee_code_pool
  WHERE enrollment_id IS NULL;
 v_result:=jsonb_build_object('version',1,'action',p_action,'eligibleCount',v_eligible,
  'blockedCount',v_blocked,'releasedCount',v_released,'availableCount',v_available,
  'repeated',false);
 INSERT INTO sabora.staff_code_maintenance_requests(id,actor_user_id,correlation_id,
  action,request_fingerprint,reason,result)
 VALUES(v_request_id,p_actor_user_id,p_correlation_id,p_action,v_fingerprint,v_reason,v_result);
 RETURN v_result;
END;
$maintenance$;
ALTER FUNCTION sabora.maintain_staff_employee_codes_authorized_candidate(
 text,text,uuid,text,boolean,text,text,bigint,bigint,text
) OWNER TO sabora_staff_identity_fn_owner;
REVOKE ALL ON FUNCTION sabora.maintain_staff_employee_codes_authorized_candidate(
 text,text,uuid,text,boolean,text,text,bigint,bigint,text
) FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_provider_runtime,sabora_h6_operations_runtime;

-- Pickup identity is a snapshot: returning a code to the pool cannot rewrite
-- an already-audited assignment or make an old task appear owned by a new user.
ALTER TABLE sabora.pickup_tasks ADD COLUMN claimed_display_id text;
ALTER TABLE sabora.pickup_task_events ADD COLUMN actor_display_id text;
ALTER TABLE sabora.pickup_tasks ADD CONSTRAINT pickup_claimed_display_identity CHECK(
 (state='claimed' AND claimed_display_id ~ '^.{2,4}-[0-9A-Z]{3}$')
 OR (state<>'claimed' AND claimed_display_id IS NULL));

CREATE FUNCTION sabora.bind_pickup_claimed_display_id_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $pickup_identity$
BEGIN
 IF NEW.state='claimed' THEN
  SELECT enrollment.operational_display_id INTO NEW.claimed_display_id
  FROM sabora.staff_enrollments enrollment
  WHERE enrollment.auth_user_id=NEW.claimed_by AND enrollment.employee_code IS NOT NULL;
  IF NEW.claimed_display_id IS NULL THEN
   RAISE EXCEPTION 'staff_operational_identity_required' USING errcode='42501';
  END IF;
 ELSE NEW.claimed_display_id:=NULL; END IF;
 RETURN NEW;
END;
$pickup_identity$;
ALTER FUNCTION sabora.bind_pickup_claimed_display_id_candidate() OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.bind_pickup_claimed_display_id_candidate()
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
GRANT SELECT(auth_user_id,employee_code,operational_display_id)
 ON sabora.staff_enrollments TO sabora_h6_fn_owner;
CREATE POLICY h6_owner_staff_enrollment_identity_select ON sabora.staff_enrollments
 FOR SELECT TO sabora_h6_fn_owner USING(true);
CREATE TRIGGER pickup_task_bind_claimed_display
 BEFORE INSERT OR UPDATE OF state,claimed_by ON sabora.pickup_tasks
 FOR EACH ROW EXECUTE FUNCTION sabora.bind_pickup_claimed_display_id_candidate();

GRANT SELECT(claimed_display_id) ON sabora.pickup_tasks TO sabora_h6_fn_owner;
GRANT SELECT(claimed_display_id) ON sabora.pickup_tasks TO sabora_order_operations_fn_owner;

CREATE OR REPLACE FUNCTION sabora.emit_pickup_task_staff_events_candidate(
 p_order_id uuid,p_line_id uuid,p_task_id uuid,p_task_state text,
 p_task_version bigint,p_claimed_by uuid,p_actor_user_id uuid,
 p_actor_role text,p_event_type text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $pickup_events$
DECLARE v_order record;v_payload jsonb;v_claimed_display text;v_actor_display text;
BEGIN
 IF p_order_id IS NULL OR p_line_id IS NULL OR p_task_id IS NULL
  OR p_task_state NOT IN ('ready','claimed','corrected') OR p_task_version<1
  OR p_actor_user_id IS NULL OR p_actor_role NOT IN ('admin','root','waiter','kitchen')
  OR p_event_type NOT IN ('sabora.pickup.ready','sabora.pickup.claimed',
   'sabora.pickup.claim_cancelled','sabora.pickup.ready_corrected')
 THEN RAISE EXCEPTION 'invalid_pickup_event' USING errcode='22023'; END IF;
 SELECT o.table_id,o.session_id INTO v_order FROM sabora.orders o WHERE o.id=p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING errcode='P0002'; END IF;
 SELECT task.claimed_display_id INTO v_claimed_display FROM sabora.pickup_tasks task
  WHERE task.id=p_task_id;
 SELECT enrollment.operational_display_id INTO v_actor_display
  FROM sabora.staff_enrollments enrollment WHERE enrollment.auth_user_id=p_actor_user_id;
 v_payload:=jsonb_build_object('orderId',p_order_id,'lineId',p_line_id,
  'pickupTaskId',p_task_id,'state',p_task_state,'version',p_task_version,
  'claimedBy',p_claimed_by,'claimedDisplayId',v_claimed_display,
  'actorId',p_actor_user_id,'actorDisplayId',v_actor_display,'actorRole',p_actor_role);
 PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
  'waiter','waiter',p_event_type,p_task_id,p_task_version,v_payload);
 PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
  'kitchen','kitchen',p_event_type,p_task_id,p_task_version,v_payload);
END;
$pickup_events$;
ALTER FUNCTION sabora.emit_pickup_task_staff_events_candidate(
 uuid,uuid,uuid,text,bigint,uuid,uuid,text,text
) OWNER TO sabora_h6_fn_owner;

DROP FUNCTION sabora.read_order_operations_board_authorized_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text
);
CREATE FUNCTION sabora.read_order_operations_board_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_status text,p_after_confirmed_at_ms bigint,p_after_order_id uuid,
 p_after_line_number integer,p_limit integer,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text
)
RETURNS TABLE(
 order_id uuid,line_id uuid,table_number integer,customer_label text,
 confirmed_at timestamptz,"grouping" text,line_number integer,category text,
 name text,quantity integer,status text,notification_id uuid,
 notification_created_at timestamptz,notification_acknowledged_at timestamptz,
 pickup_task_id uuid,pickup_state text,pickup_version bigint,
 pickup_claimed_by uuid,pickup_claimed_display_id text,
 pickup_claimed_at timestamptz,pickup_updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $board_v3$
DECLARE v_scope text;v_after_confirmed_at timestamptz;
BEGIN
 IF p_staff_role NOT IN ('admin','waiter','kitchen')
  OR (p_status IS NOT NULL AND p_status NOT IN ('confirmed','preparing','ready','picked_up'))
  OR (p_staff_role='kitchen' AND p_status='picked_up')
  OR (p_staff_role='waiter' AND p_status IN ('confirmed','preparing'))
  OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
  OR NOT ((p_after_confirmed_at_ms IS NULL AND p_after_order_id IS NULL
      AND p_after_line_number IS NULL)
   OR (p_after_confirmed_at_ms IS NOT NULL AND p_after_confirmed_at_ms>=0
      AND p_after_order_id IS NOT NULL AND p_after_line_number>0))
 THEN RAISE EXCEPTION 'invalid_order_operations_scope' USING errcode='42501'; END IF;
 v_scope:='status='||coalesce(p_status,'*')||';after_ms='||coalesce(p_after_confirmed_at_ms::text,'*')
  ||';after_order='||coalesce(lower(p_after_order_id::text),'*')
  ||';after_line='||coalesce(p_after_line_number::text,'*')||';limit='||p_limit::text;
 PERFORM sabora.authorize_order_operation_read_candidate(p_key_id,p_database_role,
  p_actor_user_id,p_staff_role,'board',v_scope,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF p_after_confirmed_at_ms IS NOT NULL THEN
  v_after_confirmed_at:=to_timestamp(p_after_confirmed_at_ms::numeric/1000); END IF;
 RETURN QUERY SELECT o.id,l.id,d.number,coalesce(o.customer_alias,o.company),o.confirmed_at,
  o.grouping,l.line_number,l.category,l.name,l.quantity,l.status,
  coalesce(tn.id,ln.id),coalesce(tn.created_at,ln.created_at),
  coalesce(tn.acknowledged_at,ln.acknowledged_at),t.id,t.state,t.version,
  t.claimed_by,t.claimed_display_id,t.claimed_at,t.updated_at
 FROM sabora.order_lines l JOIN sabora.orders o ON o.id=l.order_id
 JOIN sabora.dining_tables d ON d.id=l.table_id
 LEFT JOIN sabora.pickup_tasks t ON t.order_line_id=l.id
 LEFT JOIN sabora.pickup_notifications tn ON tn.id=t.notification_id AND t.state IN ('ready','claimed')
 LEFT JOIN LATERAL(SELECT n.id,n.created_at,n.acknowledged_at FROM sabora.pickup_notifications n
  WHERE t.id IS NULL AND n.order_line_id=l.id ORDER BY n.created_at DESC,n.id DESC LIMIT 1) ln ON true
 WHERE (p_staff_role='admin' OR (p_staff_role='kitchen' AND l.status IN ('confirmed','preparing','ready'))
  OR (p_staff_role='waiter' AND l.status IN ('ready','picked_up')))
  AND (p_status IS NULL OR l.status=p_status)
  AND (v_after_confirmed_at IS NULL OR (o.confirmed_at,o.id,l.line_number)>
   (v_after_confirmed_at,p_after_order_id,p_after_line_number))
 ORDER BY o.confirmed_at,o.id,l.line_number LIMIT p_limit+1;
END;
$board_v3$;
ALTER FUNCTION sabora.read_order_operations_board_authorized_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text
) OWNER TO sabora_order_operations_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_order_operations_board_authorized_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text
) FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer;

COMMENT ON FUNCTION sabora.transition_staff_lifecycle_with_identity_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text
) IS 'Atomic HMAC-bound lifecycle and staff display identity allocation; no runtime grant provisioned.';
COMMENT ON FUNCTION sabora.maintain_staff_employee_codes_authorized_candidate(
 text,text,uuid,text,boolean,text,text,bigint,bigint,text
) IS 'Global-only preview/recovery of eligible employee codes; no individual release surface.';
COMMENT ON TABLE sabora.staff_employee_code_events IS
 'Append-only assignment/release evidence retained when a code returns to the pool.';

COMMIT;
