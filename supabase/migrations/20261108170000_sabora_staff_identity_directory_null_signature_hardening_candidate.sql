-- Forward-only security repair, independent audit of Sabora ADMIN ownership.
-- Keep existing NOLOGIN definer owners, RLS, exact EXECUTE grants, body semantics,
-- signed user and role checks. No new SQL logins or operational data changes.
-- PostgreSQL IF NULL must never permit unsigned identity or directory access.
BEGIN;

-- Internal staff-identity wrapper: independently reject a missing HMAC.
CREATE OR REPLACE FUNCTION sabora.transition_staff_lifecycle_with_identity_candidate(
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
  OR p_signature_hex IS NULL OR p_signature_hex !~ '^[0-9a-f]{64}$'
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
 IF v_expected IS NULL OR v_provided IS NULL
  OR octet_length(v_expected) IS DISTINCT FROM 32
  OR octet_length(v_provided) IS DISTINCT FROM 32 THEN
  RAISE EXCEPTION 'invalid_staff_identity_capability' USING errcode='42501'; END IF;
 FOR v_index IN 0..31 LOOP
  v_difference:=v_difference | (get_byte(v_expected,v_index)#get_byte(v_provided,v_index));
 END LOOP;
 IF v_difference IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'invalid_staff_identity_capability' USING errcode='42501'; END IF;

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

-- Only browser-authorized staff enrollment path: validate before signing a
-- nested legacy identity capability (which must not elevate an unsigned call).
CREATE OR REPLACE FUNCTION sabora.transition_staff_lifecycle_with_directory_candidate(
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
  OR p_signature_hex IS NULL OR p_signature_hex !~ '^[0-9a-f]{64}$'
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
 IF v_expected IS NULL OR v_provided IS NULL
  OR octet_length(v_expected) IS DISTINCT FROM 32
  OR octet_length(v_provided) IS DISTINCT FROM 32 THEN
  RAISE EXCEPTION 'invalid_staff_directory_write_capability' USING errcode='42501'; END IF;
 FOR v_index IN 0..31 LOOP
  v_difference:=v_difference | (get_byte(v_expected,v_index)#get_byte(v_provided,v_index));
 END LOOP;
 IF v_difference IS DISTINCT FROM 0 THEN
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

-- Administrative staff directory and self profile: fail closed on NULL HMAC.
CREATE OR REPLACE FUNCTION sabora.read_staff_directory_authorized_candidate(
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
  OR p_signature_hex IS NULL OR p_signature_hex !~ '^[0-9a-f]{64}$'
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
 IF v_expected IS NULL OR v_provided IS NULL
  OR octet_length(v_expected) IS DISTINCT FROM 32
  OR octet_length(v_provided) IS DISTINCT FROM 32 THEN
  RAISE EXCEPTION 'invalid_staff_directory_read_capability' USING errcode='42501'; END IF;
 FOR v_index IN 0..31 LOOP
  v_difference:=v_difference | (get_byte(v_expected,v_index)#get_byte(v_provided,v_index));
 END LOOP;
 IF v_difference IS DISTINCT FROM 0 THEN
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

COMMIT;
