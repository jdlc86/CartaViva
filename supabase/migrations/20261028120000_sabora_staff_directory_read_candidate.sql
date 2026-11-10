-- Sabora Issue #37: staff directory read boundaries and contextual identities.
-- Candidate only. No LOGIN, runtime secret, route activation or production grant
-- is provisioned by this migration.
BEGIN;

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                  WHERE rolname='sabora_staff_directory_fn_owner') THEN
    CREATE ROLE sabora_staff_directory_fn_owner
      NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname='sabora_staff_directory_fn_owner'
       AND (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls
         OR rolcreatedb OR rolcreaterole OR rolreplication)
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles role
      ON role.oid=membership.roleid OR role.oid=membership.member
    WHERE role.rolname='sabora_staff_directory_fn_owner'
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_staff_directory_fn_owner' USING errcode='0P000';
  END IF;
END;
$role$;

CREATE TABLE sabora.staff_directory_contacts (
  enrollment_id uuid PRIMARY KEY
    REFERENCES sabora.staff_enrollments(id) ON DELETE RESTRICT,
  email text NOT NULL UNIQUE CHECK (
    email=btrim(email) AND email=lower(email)
    AND length(email) BETWEEN 3 AND 254
    AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND email !~ '[[:cntrl:]]'
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (updated_at>=created_at)
);
ALTER TABLE sabora.staff_directory_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_directory_contacts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON sabora.staff_directory_contacts
  FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer,
  sabora_h6_customer_runtime,sabora_h6_provider_runtime,
  sabora_h6_operations_runtime;
REVOKE ALL ON SCHEMA sabora FROM sabora_staff_directory_fn_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA sabora FROM sabora_staff_directory_fn_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sabora FROM sabora_staff_directory_fn_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora FROM sabora_staff_directory_fn_owner;

GRANT USAGE ON SCHEMA sabora,extensions TO sabora_staff_directory_fn_owner;
GRANT SELECT(key_id,hmac_key,not_before,expires_at,disabled_at)
  ON sabora.staff_lifecycle_signing_keys TO sabora_staff_directory_fn_owner;
GRANT SELECT(user_id,role,state)
  ON sabora.staff_members TO sabora_staff_directory_fn_owner;
GRANT SELECT(id,requested_role,state,auth_user_id,given_name,family_name,
  employee_code,operational_display_id,created_at,updated_at)
  ON sabora.staff_enrollments TO sabora_staff_directory_fn_owner;
GRANT SELECT(enrollment_id,email,created_at,updated_at),
  INSERT(enrollment_id,email,created_at,updated_at)
  ON sabora.staff_directory_contacts TO sabora_staff_directory_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text)
  TO sabora_staff_directory_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_with_identity_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text
) TO sabora_staff_directory_fn_owner;

CREATE POLICY staff_directory_owner_key_select
  ON sabora.staff_lifecycle_signing_keys FOR SELECT
  TO sabora_staff_directory_fn_owner USING (true);
CREATE POLICY staff_directory_owner_staff_select
  ON sabora.staff_members FOR SELECT
  TO sabora_staff_directory_fn_owner USING (true);
CREATE POLICY staff_directory_owner_enrollment_select
  ON sabora.staff_enrollments FOR SELECT
  TO sabora_staff_directory_fn_owner USING (true);
CREATE POLICY staff_directory_owner_contact_select
  ON sabora.staff_directory_contacts FOR SELECT
  TO sabora_staff_directory_fn_owner USING (true);
CREATE POLICY staff_directory_owner_contact_insert
  ON sabora.staff_directory_contacts FOR INSERT
  TO sabora_staff_directory_fn_owner WITH CHECK (true);

CREATE FUNCTION sabora.transition_staff_lifecycle_with_directory_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_action text,
 p_enrollment_id uuid,p_subject_user_id uuid,p_requested_role text,
 p_invitee_email_hash_hex text,p_invite_token_hash_hex text,
 p_credential_evidence_hash_hex text,p_reason text,p_correlation_id text,
 p_issued_at_ms bigint,p_expires_at_ms bigint,p_given_name text,p_family_name text,
 p_invitee_email text,p_signature_hex text
)
RETURNS TABLE(
 result_enrollment_id uuid,result_subject_user_id uuid,result_requested_role text,
 previous_state text,current_state text,repeated boolean,
 result_invite_version integer,event_id uuid,result_given_name text,
 result_family_name text,result_employee_code text,result_operational_display_id text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $directory_write$
DECLARE
 v_key bytea;v_key_expiry timestamptz;v_now timestamptz:=clock_timestamp();
 v_reason_hash text;v_given_hash text;v_family_hash text;v_email_hash text;
 v_message text;v_expected bytea;v_provided bytea;v_difference integer:=0;v_index integer;
 v_legacy_message text;v_legacy_signature text;v_transition record;v_existing_email text;
BEGIN
 IF p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_database_role IS DISTINCT FROM session_user::text OR p_actor_user_id IS NULL
  OR p_enrollment_id IS NULL OR p_action NOT IN
   ('invite','accept','register','activate','resend','suspend','revoke')
  OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
  OR p_issued_at_ms IS NULL OR p_expires_at_ms IS NULL
  OR p_expires_at_ms::numeric-p_issued_at_ms::numeric NOT BETWEEN 1 AND 30000
  OR p_signature_hex !~ '^[0-9a-f]{64}$'
  OR NOT ((p_action='invite' AND p_invitee_email IS NOT NULL
      AND p_invitee_email=btrim(p_invitee_email) AND p_invitee_email=lower(p_invitee_email)
      AND length(p_invitee_email) BETWEEN 3 AND 254
      AND p_invitee_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND p_invitee_email !~ '[[:cntrl:]]')
    OR (p_action<>'invite' AND p_invitee_email IS NULL))
 THEN RAISE EXCEPTION 'invalid_staff_directory_write_capability' USING errcode='42501'; END IF;

 SELECT key.hmac_key,key.expires_at INTO v_key,v_key_expiry
 FROM sabora.staff_lifecycle_signing_keys key
 WHERE key.key_id=p_key_id AND key.disabled_at IS NULL
  AND key.not_before<=v_now AND key.expires_at>v_now;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'invalid_staff_directory_write_capability' USING errcode='42501'; END IF;

 v_reason_hash:=CASE WHEN p_reason IS NULL THEN '-' ELSE
  encode(sha256(convert_to(btrim(p_reason),'UTF8')),'hex') END;
 v_given_hash:=CASE WHEN p_given_name IS NULL THEN '-' ELSE
  encode(sha256(convert_to(p_given_name,'UTF8')),'hex') END;
 v_family_hash:=CASE WHEN p_family_name IS NULL THEN '-' ELSE
  encode(sha256(convert_to(p_family_name,'UTF8')),'hex') END;
 v_email_hash:=CASE WHEN p_invitee_email IS NULL THEN '-' ELSE
  encode(sha256(convert_to(p_invitee_email,'UTF8')),'hex') END;
 v_message:='sabora.staff-identity-directory.v1'||chr(10)||p_key_id||chr(10)
  ||p_database_role||chr(10)||lower(p_actor_user_id::text)||chr(10)||p_action||chr(10)
  ||lower(p_enrollment_id::text)||chr(10)||coalesce(lower(p_subject_user_id::text),'-')||chr(10)
  ||coalesce(p_requested_role,'-')||chr(10)||coalesce(p_invitee_email_hash_hex,'-')||chr(10)
  ||coalesce(p_invite_token_hash_hex,'-')||chr(10)
  ||coalesce(p_credential_evidence_hash_hex,'-')||chr(10)||v_reason_hash||chr(10)
  ||v_given_hash||chr(10)||v_family_hash||chr(10)||v_email_hash||chr(10)
  ||p_correlation_id||chr(10)||p_issued_at_ms::text||chr(10)||p_expires_at_ms::text;
 v_expected:=extensions.hmac(convert_to(v_message,'UTF8'),v_key,'sha256');
 v_provided:=decode(p_signature_hex,'hex');
 IF octet_length(v_expected)<>32 OR octet_length(v_provided)<>32 THEN
  RAISE EXCEPTION 'invalid_staff_directory_write_capability' USING errcode='42501'; END IF;
 FOR v_index IN 0..31 LOOP
  v_difference:=v_difference | (get_byte(v_expected,v_index)#get_byte(v_provided,v_index));
 END LOOP;
 IF v_difference<>0 THEN
  RAISE EXCEPTION 'invalid_staff_directory_write_capability' USING errcode='42501'; END IF;

 v_legacy_message:='sabora.staff-identity.v1'||chr(10)||p_key_id||chr(10)
  ||p_database_role||chr(10)||lower(p_actor_user_id::text)||chr(10)||p_action||chr(10)
  ||lower(p_enrollment_id::text)||chr(10)||coalesce(lower(p_subject_user_id::text),'-')||chr(10)
  ||coalesce(p_requested_role,'-')||chr(10)||coalesce(p_invitee_email_hash_hex,'-')||chr(10)
  ||coalesce(p_invite_token_hash_hex,'-')||chr(10)
  ||coalesce(p_credential_evidence_hash_hex,'-')||chr(10)||v_reason_hash||chr(10)
  ||v_given_hash||chr(10)||v_family_hash||chr(10)||p_correlation_id||chr(10)
  ||p_issued_at_ms::text||chr(10)||p_expires_at_ms::text;
 v_legacy_signature:=encode(extensions.hmac(convert_to(v_legacy_message,'UTF8'),v_key,'sha256'),'hex');
 SELECT transition.* INTO STRICT v_transition
 FROM sabora.transition_staff_lifecycle_with_identity_candidate(
  p_key_id,p_database_role,p_actor_user_id,p_action,p_enrollment_id,p_subject_user_id,
  p_requested_role,p_invitee_email_hash_hex,p_invite_token_hash_hex,
  p_credential_evidence_hash_hex,p_reason,p_correlation_id,p_issued_at_ms,
  p_expires_at_ms,p_given_name,p_family_name,v_legacy_signature) transition;

 IF p_action='invite' THEN
  INSERT INTO sabora.staff_directory_contacts(enrollment_id,email)
   VALUES(v_transition.result_enrollment_id,p_invitee_email)
   ON CONFLICT(enrollment_id) DO NOTHING;
  SELECT contact.email INTO v_existing_email FROM sabora.staff_directory_contacts contact
   WHERE contact.enrollment_id=v_transition.result_enrollment_id;
  IF v_existing_email IS DISTINCT FROM p_invitee_email THEN
   RAISE EXCEPTION 'staff_directory_contact_idempotency_conflict' USING errcode='23505'; END IF;
 END IF;

 RETURN QUERY SELECT v_transition.result_enrollment_id,v_transition.result_subject_user_id,
  v_transition.result_requested_role,v_transition.previous_state,v_transition.current_state,
  v_transition.repeated,v_transition.result_invite_version,v_transition.event_id,
  v_transition.result_given_name,v_transition.result_family_name,
  v_transition.result_employee_code,v_transition.result_operational_display_id;
END;
$directory_write$;
ALTER FUNCTION sabora.transition_staff_lifecycle_with_directory_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text
) OWNER TO sabora_staff_directory_fn_owner;
REVOKE ALL ON FUNCTION sabora.transition_staff_lifecycle_with_directory_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text
) FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_provider_runtime,sabora_h6_operations_runtime;

CREATE FUNCTION sabora.read_staff_directory_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_operation text,p_target_enrollment_id uuid,p_search text,p_cursor integer,p_limit integer,
 p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
)
RETURNS TABLE(
 record_kind text,enrollment_id uuid,given_name text,family_name text,email text,
 operational_display_id text,requested_role text,enrollment_state text,
 created_at timestamptz,updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $directory_read$
DECLARE
 v_key bytea;v_key_expiry timestamptz;v_now timestamptz:=clock_timestamp();
 v_search_hash text;v_message text;v_expected bytea;v_provided bytea;
 v_difference integer:=0;v_index integer;v_effective_role text;v_effective_state text;
BEGIN
 IF p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_database_role IS DISTINCT FROM session_user::text OR p_actor_user_id IS NULL
  OR p_staff_role NOT IN ('admin','waiter','kitchen')
  OR p_operation NOT IN ('admin_list','admin_detail','self_profile')
  OR p_cursor IS NULL OR p_cursor NOT BETWEEN 0 AND 1000000
  OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
  OR p_issued_at_ms IS NULL OR p_expires_at_ms IS NULL
  OR p_expires_at_ms::numeric-p_issued_at_ms::numeric NOT BETWEEN 1 AND 30000
  OR p_signature_hex !~ '^[0-9a-f]{64}$'
  OR (p_search IS NOT NULL AND (p_search<>btrim(p_search)
    OR length(p_search) NOT BETWEEN 1 AND 80 OR p_search ~ '[[:cntrl:]]'))
  OR NOT (
    (p_operation='admin_list' AND p_staff_role='admin'
      AND p_target_enrollment_id IS NULL)
    OR (p_operation='admin_detail' AND p_staff_role='admin'
      AND p_target_enrollment_id IS NOT NULL AND p_search IS NULL
      AND p_cursor=0 AND p_limit=1)
    OR (p_operation='self_profile' AND p_target_enrollment_id IS NULL
      AND p_search IS NULL AND p_cursor=0 AND p_limit=1)
  )
 THEN RAISE EXCEPTION 'invalid_staff_directory_read_capability' USING errcode='42501'; END IF;

 SELECT key.hmac_key,key.expires_at INTO v_key,v_key_expiry
 FROM sabora.staff_lifecycle_signing_keys key
 WHERE key.key_id=p_key_id AND key.disabled_at IS NULL
  AND key.not_before<=v_now AND key.expires_at>v_now;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'invalid_staff_directory_read_capability' USING errcode='42501'; END IF;
 v_search_hash:=CASE WHEN p_search IS NULL THEN '-' ELSE
  encode(sha256(convert_to(p_search,'UTF8')),'hex') END;
 v_message:='sabora.staff-directory-read.v1'||chr(10)||p_key_id||chr(10)
  ||p_database_role||chr(10)||lower(p_actor_user_id::text)||chr(10)||p_staff_role||chr(10)
  ||p_operation||chr(10)||coalesce(lower(p_target_enrollment_id::text),'-')||chr(10)
  ||v_search_hash||chr(10)||p_cursor::text||chr(10)||p_limit::text||chr(10)
  ||p_issued_at_ms::text||chr(10)||p_expires_at_ms::text;
 v_expected:=extensions.hmac(convert_to(v_message,'UTF8'),v_key,'sha256');
 v_provided:=decode(p_signature_hex,'hex');
 IF octet_length(v_expected)<>32 OR octet_length(v_provided)<>32 THEN
  RAISE EXCEPTION 'invalid_staff_directory_read_capability' USING errcode='42501'; END IF;
 FOR v_index IN 0..31 LOOP
  v_difference:=v_difference | (get_byte(v_expected,v_index)#get_byte(v_provided,v_index));
 END LOOP;
 IF v_difference<>0 THEN
  RAISE EXCEPTION 'invalid_staff_directory_read_capability' USING errcode='42501'; END IF;

 SELECT member.role,member.state INTO v_effective_role,v_effective_state
 FROM sabora.staff_members member WHERE member.user_id=p_actor_user_id;
 IF NOT FOUND OR v_effective_state<>'active' OR v_effective_role<>p_staff_role THEN
  RAISE EXCEPTION 'staff_directory_forbidden' USING errcode='42501'; END IF;

 IF p_operation='admin_list' THEN
  RETURN QUERY SELECT 'admin'::text,enrollment.id,enrollment.given_name,
   enrollment.family_name,contact.email,enrollment.operational_display_id,
   enrollment.requested_role,enrollment.state,enrollment.created_at,enrollment.updated_at
  FROM sabora.staff_enrollments enrollment
  JOIN sabora.staff_directory_contacts contact ON contact.enrollment_id=enrollment.id
  WHERE p_search IS NULL OR pg_catalog.strpos(lower(
   enrollment.given_name||' '||enrollment.family_name||' '||contact.email||' '
   ||coalesce(enrollment.operational_display_id,'')),lower(p_search))>0
  ORDER BY lower(enrollment.family_name),lower(enrollment.given_name),enrollment.id
  OFFSET p_cursor LIMIT p_limit+1;
 ELSIF p_operation='admin_detail' THEN
  RETURN QUERY SELECT 'admin'::text,enrollment.id,enrollment.given_name,
   enrollment.family_name,contact.email,enrollment.operational_display_id,
   enrollment.requested_role,enrollment.state,enrollment.created_at,enrollment.updated_at
  FROM sabora.staff_enrollments enrollment
  JOIN sabora.staff_directory_contacts contact ON contact.enrollment_id=enrollment.id
  WHERE enrollment.id=p_target_enrollment_id;
 ELSE
  RETURN QUERY SELECT 'self'::text,enrollment.id,enrollment.given_name,
   enrollment.family_name,contact.email,enrollment.operational_display_id,
   enrollment.requested_role,enrollment.state,enrollment.created_at,enrollment.updated_at
  FROM sabora.staff_enrollments enrollment
  JOIN sabora.staff_directory_contacts contact ON contact.enrollment_id=enrollment.id
  WHERE enrollment.auth_user_id=p_actor_user_id AND enrollment.state='active'
   AND enrollment.requested_role=p_staff_role;
 END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms
    OR v_key_expiry<=clock_timestamp() THEN
  RAISE EXCEPTION 'expired_staff_directory_read_capability' USING errcode='42501'; END IF;
END;
$directory_read$;
ALTER FUNCTION sabora.read_staff_directory_authorized_candidate(
 text,text,uuid,text,text,uuid,text,integer,integer,bigint,bigint,text
) OWNER TO sabora_staff_directory_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_staff_directory_authorized_candidate(
 text,text,uuid,text,text,uuid,text,integer,integer,bigint,bigint,text
) FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_provider_runtime,sabora_h6_operations_runtime;

-- Pickup events are public operational projections. UUIDs stay in private
-- audit tables, while SSE receives only the durable compact snapshots.
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
  'claimedDisplayId',v_claimed_display,'actorDisplayId',v_actor_display);
 PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
  'waiter','waiter',p_event_type,p_task_id,p_task_version,v_payload);
 PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
  'kitchen','kitchen',p_event_type,p_task_id,p_task_version,v_payload);
END;
$pickup_events$;
ALTER FUNCTION sabora.emit_pickup_task_staff_events_candidate(
 uuid,uuid,uuid,text,bigint,uuid,uuid,text,text
) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.emit_pickup_task_staff_events_candidate(
 uuid,uuid,uuid,text,bigint,uuid,uuid,text,text
) FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_provider_runtime,sabora_h6_operations_runtime;

COMMENT ON TABLE sabora.staff_directory_contacts IS
 'Restricted retrievable contact for the three staff-directory read scopes; never an operational projection.';
COMMENT ON FUNCTION sabora.read_staff_directory_authorized_candidate(
 text,text,uuid,text,text,uuid,text,integer,integer,bigint,bigint,text
) IS 'HMAC-bound staff directory projection with active membership revalidation; no runtime grant provisioned.';

COMMIT;
