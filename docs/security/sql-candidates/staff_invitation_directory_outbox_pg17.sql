-- Disposable PG17 only; install after outbox, custody, restricted custody
-- and fenced envelope reader candidates. No operational LOGIN or runtime grant.
-- The legacy wrapper remains available for its existing regression tests.
BEGIN;
ALTER TABLE sabora.staff_invitation_outbox
 ADD COLUMN custody_required boolean NOT NULL DEFAULT false,
 ADD COLUMN provider_message_id uuid UNIQUE,
 ADD CONSTRAINT staff_invitation_provider_receipt_shape CHECK(
   (provider_message_id IS NULL OR (state='delivered' AND provider_outcome='accepted'))
   AND (NOT custody_required OR state<>'delivered' OR provider_message_id IS NOT NULL)
 );
GRANT INSERT(custody_required) ON sabora.staff_invitation_outbox
 TO sabora_staff_invitation_enqueue_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_with_directory_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text)
 TO sabora_staff_invitation_enqueue_fn_owner;

-- Deferred invariant: the same database transaction must persist a matching
-- encrypted envelope for every new job from the directory-aware wrapper.
-- No plaintext or encryption key is needed by this database check.
CREATE FUNCTION sabora.require_staff_invitation_custody_candidate()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $custody_required$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sabora.staff_invitation_custody_candidate c
    WHERE c.job_id=NEW.id AND c.enrollment_id=NEW.enrollment_id
      AND c.invite_version=NEW.invite_version AND c.token_hash=NEW.invite_token_hash
      AND c.envelope_version=1) THEN
   RAISE EXCEPTION 'staff_invitation_custody_required' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$custody_required$;
ALTER FUNCTION sabora.require_staff_invitation_custody_candidate()
 OWNER TO sabora_staff_custody_reader_fn_owner;
REVOKE ALL ON FUNCTION sabora.require_staff_invitation_custody_candidate()
 FROM PUBLIC,anon,authenticated;
CREATE CONSTRAINT TRIGGER staff_invitation_custody_required
 AFTER INSERT ON sabora.staff_invitation_outbox DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW WHEN (NEW.custody_required)
 EXECUTE FUNCTION sabora.require_staff_invitation_custody_candidate();

CREATE FUNCTION sabora.transition_staff_lifecycle_with_directory_outbox_candidate(
  p_key_id text,
  p_database_role text,
  p_actor_user_id uuid,
  p_action text,
  p_enrollment_id uuid,
  p_subject_user_id uuid,
  p_requested_role text,
  p_invitee_email_hash_hex text,
  p_invite_token_hash_hex text,
  p_credential_evidence_hash_hex text,
  p_reason text,
  p_correlation_id text,
  p_issued_at_ms bigint,
  p_expires_at_ms bigint,
  p_given_name text,
  p_family_name text,
  p_invitee_email text,
  p_signature_hex text
)
RETURNS TABLE (
  result_enrollment_id uuid,
  result_subject_user_id uuid,
  result_requested_role text,
  previous_state text,
  current_state text,
  repeated boolean,
  result_invite_version integer,
  event_id uuid,
  result_given_name text,
  result_family_name text,
  result_employee_code text,
  result_operational_display_id text,
  outbox_job_id uuid,
  outbox_enqueued boolean,
  outbox_cancelled_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $staff_lifecycle_outbox$
DECLARE
  v_transition record;
BEGIN
  -- The directory-aware route cannot accept an invitation using a normal
  -- lifecycle writer. The dedicated enrollment LOGIN has no EXECUTE here;
  -- its only entry is the verified acceptance wrapper below.
  IF (p_action IN ('accept','register') AND session_user::text<>'sabora_staff_enrollment_login')
     OR (session_user::text='sabora_staff_enrollment_login' AND
         (p_action IS NULL OR p_action NOT IN ('accept','register'))) THEN
    RAISE EXCEPTION 'staff_enrollment_route_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT transition.* INTO STRICT v_transition
    FROM sabora.transition_staff_lifecycle_with_directory_candidate(
      p_key_id,p_database_role,p_actor_user_id,p_action,p_enrollment_id,
      p_subject_user_id,p_requested_role,p_invitee_email_hash_hex,
      p_invite_token_hash_hex,p_credential_evidence_hash_hex,p_reason,
      p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_given_name,p_family_name,
      p_invitee_email,p_signature_hex
    ) transition;

  result_enrollment_id := v_transition.result_enrollment_id;
  result_subject_user_id := v_transition.result_subject_user_id;
  result_requested_role := v_transition.result_requested_role;
  previous_state := v_transition.previous_state;
  current_state := v_transition.current_state;
  repeated := v_transition.repeated;
  result_invite_version := v_transition.result_invite_version;
  event_id := v_transition.event_id;
  result_given_name := v_transition.result_given_name;
  result_family_name := v_transition.result_family_name;
  result_employee_code := v_transition.result_employee_code;
  result_operational_display_id := v_transition.result_operational_display_id;
  outbox_job_id := NULL;
  outbox_enqueued := false;
  outbox_cancelled_count := 0;

  IF NOT repeated AND p_action = 'resend' THEN
    UPDATE sabora.staff_invitation_outbox delivery
       SET state = 'cancelled', updated_at = clock_timestamp()
     WHERE delivery.enrollment_id = result_enrollment_id
       AND delivery.state IN ('pending','claimed')
       AND (delivery.invite_version <> result_invite_version
         OR delivery.invite_token_hash <> decode(p_invite_token_hash_hex,'hex'));
    GET DIAGNOSTICS outbox_cancelled_count = ROW_COUNT;
  ELSIF NOT repeated AND current_state <> 'invited' THEN
    UPDATE sabora.staff_invitation_outbox delivery
       SET state = 'cancelled', updated_at = clock_timestamp()
     WHERE delivery.enrollment_id = result_enrollment_id
       AND delivery.state IN ('pending','claimed');
    GET DIAGNOSTICS outbox_cancelled_count = ROW_COUNT;
  END IF;

  IF p_action IN ('invite','resend') THEN
    IF repeated THEN
      SELECT delivery.id INTO outbox_job_id
        FROM sabora.staff_invitation_outbox delivery
       WHERE delivery.enrollment_id = result_enrollment_id
         AND delivery.invite_version = result_invite_version;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'staff_invitation_outbox_replay_missing'
          USING errcode = '40001';
      END IF;
    ELSE
      INSERT INTO sabora.staff_invitation_outbox(
        id,enrollment_id,invite_version,invite_token_hash,custody_required
      ) VALUES (
        gen_random_uuid(),result_enrollment_id,result_invite_version,
        decode(p_invite_token_hash_hex,'hex'),true
      ) RETURNING id INTO outbox_job_id;
      outbox_enqueued := true;
    END IF;
  END IF;

  RETURN NEXT;
END;
$staff_lifecycle_outbox$;
ALTER FUNCTION sabora.transition_staff_lifecycle_with_directory_outbox_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text)
 OWNER TO sabora_staff_invitation_enqueue_fn_owner;
REVOKE ALL ON FUNCTION sabora.transition_staff_lifecycle_with_directory_outbox_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text)
 FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer;

-- Recipient and encrypted material are resolved from the same fenced,
-- current enrollment, never from an untrusted worker request.
GRANT SELECT(enrollment_id,email) ON sabora.staff_directory_contacts
 TO sabora_staff_custody_reader_fn_owner;
CREATE POLICY staff_custody_reader_contact ON sabora.staff_directory_contacts
 FOR SELECT TO sabora_staff_custody_reader_fn_owner USING(true);
CREATE FUNCTION sabora.read_staff_invitation_directory_dispatch_candidate(p_job_id uuid,p_fence uuid)
 RETURNS TABLE(result_enrollment_id uuid,result_invite_version integer,
 result_token_hash_hex text,result_key_id text,result_nonce text,result_ciphertext text,
 result_tag text,result_recipient text)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $directory_dispatch$
 SELECT e.*,c.email FROM sabora.read_staff_invitation_dispatch_envelope_candidate(p_job_id,p_fence) e
 JOIN sabora.staff_directory_contacts c ON c.enrollment_id=e.result_enrollment_id
$directory_dispatch$;
ALTER FUNCTION sabora.read_staff_invitation_directory_dispatch_candidate(uuid,uuid)
 OWNER TO sabora_staff_custody_reader_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_staff_invitation_directory_dispatch_candidate(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
-- Verified-recipient acceptance: distinct from operational session issuance.
-- Only a dedicated, sealed owner can invoke the directory+outbox wrapper
-- from the enrollment LOGIN. The LOGIN itself has no table access or
-- execution of any general transition routine.
CREATE ROLE sabora_staff_enrollment_fn_owner NOLOGIN NOINHERIT NOSUPERUSER
 NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA sabora,extensions TO sabora_staff_enrollment_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text) TO sabora_staff_enrollment_fn_owner;
GRANT SELECT(key_id,hmac_key,not_before,expires_at,disabled_at)
 ON sabora.staff_lifecycle_signing_keys TO sabora_staff_enrollment_fn_owner;
GRANT SELECT(id,invitee_email_hash) ON sabora.staff_enrollments TO sabora_staff_enrollment_fn_owner;
CREATE POLICY staff_enrollment_owner_key ON sabora.staff_lifecycle_signing_keys FOR SELECT
 TO sabora_staff_enrollment_fn_owner USING(true);
CREATE POLICY staff_enrollment_owner_hash ON sabora.staff_enrollments FOR SELECT
 TO sabora_staff_enrollment_fn_owner USING(true);
GRANT EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_with_directory_outbox_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text)
 TO sabora_staff_enrollment_fn_owner;

CREATE FUNCTION sabora.accept_staff_invitation_verified_candidate(
 p_key_id text,p_actor_user_id uuid,p_enrollment_id uuid,p_invite_token_hash_hex text,
 p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text,
 p_confirmed_email_hash_hex text,p_session_id uuid,p_proof_hex text)
 RETURNS TABLE(result_enrollment_id uuid,result_subject_user_id uuid,result_requested_role text,
 previous_state text,current_state text,repeated boolean,result_invite_version integer,
 event_id uuid,result_given_name text,result_family_name text,result_employee_code text,
 result_operational_display_id text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $verified_accept$
DECLARE
 v_key bytea;v_key_expires timestamptz;v_now timestamptz;v_ms bigint;
 v_expected bytea;v_provided bytea;v_diff integer:=0;v_i integer;
 v_transition record;v_email_hash bytea;
BEGIN
 IF session_user::text<>'sabora_staff_enrollment_login'
  OR p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_actor_user_id IS NULL OR p_enrollment_id IS NULL OR p_session_id IS NULL
  OR p_issued_at_ms IS NULL OR p_expires_at_ms IS NULL
  OR p_expires_at_ms::numeric-p_issued_at_ms::numeric NOT BETWEEN 1 AND 30000
  OR p_signature_hex IS NULL OR p_signature_hex !~ '^[0-9a-f]{64}$'
  OR p_confirmed_email_hash_hex IS NULL OR p_confirmed_email_hash_hex !~ '^[0-9a-f]{64}$'
  OR p_proof_hex IS NULL OR p_proof_hex !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'staff_enrollment_identity_forbidden' USING ERRCODE='42501';
 END IF;
 v_now:=clock_timestamp();v_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 SELECT hmac_key,expires_at INTO v_key,v_key_expires FROM sabora.staff_lifecycle_signing_keys
  WHERE key_id=p_key_id AND disabled_at IS NULL AND not_before<=v_now AND expires_at>v_now;
 IF NOT FOUND OR p_issued_at_ms::numeric>v_ms::numeric+5000 OR p_expires_at_ms<=v_ms THEN
  RAISE EXCEPTION 'staff_enrollment_identity_forbidden' USING ERRCODE='42501';
 END IF;
 v_expected:=extensions.hmac(convert_to('sabora.staff-enrollment-accept.v1'||chr(10)||
  p_key_id||chr(10)||session_user::text||chr(10)||p_actor_user_id::text||chr(10)||
  p_enrollment_id::text||chr(10)||p_session_id::text||chr(10)||
  p_confirmed_email_hash_hex||chr(10)||p_signature_hex,'UTF8'),v_key,'sha256');
 v_provided:=decode(p_proof_hex,'hex');
 FOR v_i IN 0..31 LOOP
  v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_provided,v_i));
 END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN
  RAISE EXCEPTION 'staff_enrollment_identity_forbidden' USING ERRCODE='42501';
 END IF;
 -- Precheck without reversing the lifecycle lock order. The existing
 -- wrapper then locks and revalidates the token/state. Check the exact
 -- enrollment hash again under its retained lock before returning.
 SELECT invitee_email_hash INTO v_email_hash FROM sabora.staff_enrollments WHERE id=p_enrollment_id;
 IF v_email_hash IS DISTINCT FROM decode(p_confirmed_email_hash_hex,'hex') THEN
  RAISE EXCEPTION 'staff_enrollment_identity_forbidden' USING ERRCODE='42501';
 END IF;
 SELECT t.* INTO STRICT v_transition FROM sabora.transition_staff_lifecycle_with_directory_outbox_candidate(
  p_key_id,session_user::text,p_actor_user_id,'accept',p_enrollment_id,p_actor_user_id,
  NULL,NULL,p_invite_token_hash_hex,NULL,NULL,p_correlation_id,p_issued_at_ms,p_expires_at_ms,
  NULL,NULL,NULL,p_signature_hex) t;
 SELECT invitee_email_hash INTO v_email_hash FROM sabora.staff_enrollments WHERE id=v_transition.result_enrollment_id;
 v_now:=clock_timestamp();v_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 IF v_email_hash IS DISTINCT FROM decode(p_confirmed_email_hash_hex,'hex')
  OR v_transition.result_enrollment_id IS DISTINCT FROM p_enrollment_id
  OR v_transition.result_subject_user_id IS DISTINCT FROM p_actor_user_id
  OR p_expires_at_ms<=v_ms OR v_key_expires<=v_now THEN
  RAISE EXCEPTION 'staff_enrollment_identity_forbidden' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT v_transition.result_enrollment_id,v_transition.result_subject_user_id,
  v_transition.result_requested_role,v_transition.previous_state,v_transition.current_state,
  v_transition.repeated,v_transition.result_invite_version,v_transition.event_id,
  v_transition.result_given_name,v_transition.result_family_name,v_transition.result_employee_code,
  v_transition.result_operational_display_id;
END;
$verified_accept$;
ALTER FUNCTION sabora.accept_staff_invitation_verified_candidate(
 text,uuid,uuid,text,text,bigint,bigint,text,text,uuid,text)
 OWNER TO sabora_staff_enrollment_fn_owner;
REVOKE ALL ON FUNCTION sabora.accept_staff_invitation_verified_candidate(
 text,uuid,uuid,text,text,bigint,bigint,text,text,uuid,text)
 FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer;
-- No LOGIN is created or granted by this overlay.

-- Registration preflight and completion use the same dedicated LOGIN as
-- verified acceptance, never an operational writer or a public Auth role.
GRANT SELECT(auth_user_id,state) ON sabora.staff_enrollments TO sabora_staff_enrollment_fn_owner;
CREATE TABLE sabora.staff_registration_receipts_candidate(
 enrollment_id uuid PRIMARY KEY REFERENCES sabora.staff_enrollments(id) ON DELETE RESTRICT,
 auth_user_id uuid NOT NULL UNIQUE,
 auth_session_id uuid NOT NULL,
 challenge_id uuid NOT NULL UNIQUE,
 provider_credential_id uuid NOT NULL UNIQUE,
 credential_evidence_hash bytea NOT NULL CHECK(octet_length(credential_evidence_hash)=32),
 registered_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE sabora.staff_registration_receipts_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_registration_receipts_candidate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.staff_registration_receipts_candidate FROM PUBLIC,anon,authenticated;
GRANT SELECT(enrollment_id,auth_user_id,auth_session_id,challenge_id,provider_credential_id,credential_evidence_hash),
 INSERT(enrollment_id,auth_user_id,auth_session_id,challenge_id,provider_credential_id,credential_evidence_hash)
 ON sabora.staff_registration_receipts_candidate TO sabora_staff_enrollment_fn_owner;
CREATE POLICY staff_registration_receipt_read ON sabora.staff_registration_receipts_candidate
 FOR SELECT TO sabora_staff_enrollment_fn_owner USING(true);
CREATE POLICY staff_registration_receipt_insert ON sabora.staff_registration_receipts_candidate
 FOR INSERT TO sabora_staff_enrollment_fn_owner WITH CHECK(true);
CREATE TRIGGER staff_registration_receipt_immutable BEFORE UPDATE OR DELETE ON sabora.staff_registration_receipts_candidate
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER staff_registration_receipt_no_truncate BEFORE TRUNCATE ON sabora.staff_registration_receipts_candidate
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();

CREATE FUNCTION sabora.check_staff_registration_candidate(p_key_id text,p_actor uuid,p_enrollment uuid,
 p_session uuid,p_email_hash text,p_expires_ms bigint,p_proof text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $registration_check$
DECLARE v_key bytea;v_expected bytea;v_given bytea;v_diff integer:=0;v_i integer;v_now timestamptz:=clock_timestamp();v_ms bigint;
BEGIN
 v_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 IF session_user::text<>'sabora_staff_enrollment_login' OR p_actor IS NULL OR p_enrollment IS NULL
  OR p_session IS NULL OR p_key_id IS NULL OR p_email_hash IS NULL OR p_email_hash !~ '^[0-9a-f]{64}$'
  OR p_proof IS NULL OR p_proof !~ '^[0-9a-f]{64}$' OR p_expires_ms IS NULL
  OR p_expires_ms<=v_ms OR p_expires_ms::numeric-v_ms::numeric>30000 THEN
  RAISE EXCEPTION 'staff_registration_forbidden' USING ERRCODE='42501';
 END IF;
 SELECT hmac_key INTO v_key FROM sabora.staff_lifecycle_signing_keys WHERE key_id=p_key_id
  AND disabled_at IS NULL AND not_before<=v_now AND expires_at>v_now;
 IF NOT FOUND THEN RAISE EXCEPTION 'staff_registration_forbidden' USING ERRCODE='42501'; END IF;
 v_expected:=extensions.hmac(convert_to('sabora.staff-registration-check.v1'||chr(10)||p_key_id||chr(10)||
  session_user::text||chr(10)||p_actor::text||chr(10)||p_enrollment::text||chr(10)||p_session::text||chr(10)||
  p_email_hash||chr(10)||p_expires_ms::text,'UTF8'),v_key,'sha256');
 v_given:=decode(p_proof,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_given,v_i)); END LOOP;
 IF v_diff IS DISTINCT FROM 0 OR NOT EXISTS(SELECT 1 FROM sabora.staff_enrollments
  WHERE id=p_enrollment AND auth_user_id=p_actor AND state='accepted'
    AND invitee_email_hash=decode(p_email_hash,'hex')) THEN
  RAISE EXCEPTION 'staff_registration_forbidden' USING ERRCODE='42501';
 END IF;
 RETURN true;
END;
$registration_check$;
ALTER FUNCTION sabora.check_staff_registration_candidate(text,uuid,uuid,uuid,text,bigint,text)
 OWNER TO sabora_staff_enrollment_fn_owner;
REVOKE ALL ON FUNCTION sabora.check_staff_registration_candidate(text,uuid,uuid,uuid,text,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer;

CREATE FUNCTION sabora.register_staff_passkey_verified_candidate(
 p_key_id text,p_actor_user_id uuid,p_enrollment_id uuid,p_evidence_hash_hex text,
 p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text,
 p_confirmed_email_hash_hex text,p_session_id uuid,p_challenge_id uuid,p_provider_id uuid,p_proof_hex text)
 RETURNS TABLE(result_enrollment_id uuid,result_subject_user_id uuid,result_requested_role text,
 previous_state text,current_state text,repeated boolean,result_invite_version integer,
 event_id uuid,result_given_name text,result_family_name text,result_employee_code text,
 result_operational_display_id text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $verified_register$
DECLARE
 v_key bytea;v_key_expires timestamptz;v_now timestamptz;v_ms bigint;
 v_expected bytea;v_provided bytea;v_diff integer:=0;v_i integer;v_transition record;v_enrollment record;
BEGIN
 IF session_user::text<>'sabora_staff_enrollment_login' OR p_key_id IS NULL
  OR p_actor_user_id IS NULL OR p_enrollment_id IS NULL OR p_session_id IS NULL
  OR p_challenge_id IS NULL OR p_provider_id IS NULL
  OR p_issued_at_ms IS NULL OR p_expires_at_ms IS NULL
  OR p_expires_at_ms::numeric-p_issued_at_ms::numeric NOT BETWEEN 1 AND 30000
  OR p_signature_hex IS NULL OR p_signature_hex !~ '^[0-9a-f]{64}$'
  OR p_confirmed_email_hash_hex IS NULL OR p_confirmed_email_hash_hex !~ '^[0-9a-f]{64}$'
  OR p_evidence_hash_hex IS NULL OR p_evidence_hash_hex !~ '^[0-9a-f]{64}$'
  OR p_proof_hex IS NULL OR p_proof_hex !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'staff_registration_forbidden' USING ERRCODE='42501';
 END IF;
 v_now:=clock_timestamp();v_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 SELECT hmac_key,expires_at INTO v_key,v_key_expires FROM sabora.staff_lifecycle_signing_keys
  WHERE key_id=p_key_id AND disabled_at IS NULL AND not_before<=v_now AND expires_at>v_now;
 IF NOT FOUND OR p_issued_at_ms::numeric>v_ms::numeric+5000 OR p_expires_at_ms<=v_ms THEN
  RAISE EXCEPTION 'staff_registration_forbidden' USING ERRCODE='42501';
 END IF;
 v_expected:=extensions.hmac(convert_to('sabora.staff-registration-complete.v1'||chr(10)||p_key_id||chr(10)||
  session_user::text||chr(10)||p_actor_user_id::text||chr(10)||p_enrollment_id::text||chr(10)||
  p_session_id::text||chr(10)||p_confirmed_email_hash_hex||chr(10)||p_challenge_id::text||chr(10)||
  p_provider_id::text||chr(10)||p_signature_hex,'UTF8'),v_key,'sha256');
 v_provided:=decode(p_proof_hex,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_provided,v_i)); END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'staff_registration_forbidden' USING ERRCODE='42501'; END IF;
 SELECT t.* INTO STRICT v_transition FROM sabora.transition_staff_lifecycle_with_directory_outbox_candidate(
  p_key_id,session_user::text,p_actor_user_id,'register',p_enrollment_id,p_actor_user_id,
  NULL,NULL,NULL,p_evidence_hash_hex,NULL,p_correlation_id,p_issued_at_ms,p_expires_at_ms,
  NULL,NULL,NULL,p_signature_hex) t;
 SELECT auth_user_id,state,invitee_email_hash INTO v_enrollment FROM sabora.staff_enrollments WHERE id=p_enrollment_id;
 v_now:=clock_timestamp();v_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 IF v_enrollment.auth_user_id IS DISTINCT FROM p_actor_user_id
  OR v_enrollment.state IS DISTINCT FROM 'registered'
  OR v_enrollment.invitee_email_hash IS DISTINCT FROM decode(p_confirmed_email_hash_hex,'hex')
  OR v_transition.result_enrollment_id IS DISTINCT FROM p_enrollment_id
  OR v_transition.result_subject_user_id IS DISTINCT FROM p_actor_user_id
  OR p_expires_at_ms<=v_ms OR v_key_expires<=v_now THEN
  RAISE EXCEPTION 'staff_registration_forbidden' USING ERRCODE='42501';
 END IF;
 IF NOT v_transition.repeated THEN
  INSERT INTO sabora.staff_registration_receipts_candidate(enrollment_id,auth_user_id,auth_session_id,
   challenge_id,provider_credential_id,credential_evidence_hash) VALUES(p_enrollment_id,p_actor_user_id,
   p_session_id,p_challenge_id,p_provider_id,decode(p_evidence_hash_hex,'hex'));
 ELSIF NOT EXISTS(SELECT 1 FROM sabora.staff_registration_receipts_candidate
  WHERE enrollment_id=p_enrollment_id AND auth_user_id=p_actor_user_id AND auth_session_id=p_session_id
   AND challenge_id=p_challenge_id AND provider_credential_id=p_provider_id
   AND credential_evidence_hash=decode(p_evidence_hash_hex,'hex')) THEN
  RAISE EXCEPTION 'staff_registration_forbidden' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT v_transition.result_enrollment_id,v_transition.result_subject_user_id,
  v_transition.result_requested_role,v_transition.previous_state,v_transition.current_state,
  v_transition.repeated,v_transition.result_invite_version,v_transition.event_id,
  v_transition.result_given_name,v_transition.result_family_name,v_transition.result_employee_code,
  v_transition.result_operational_display_id;
END;
$verified_register$;
ALTER FUNCTION sabora.register_staff_passkey_verified_candidate(text,uuid,uuid,text,text,bigint,bigint,text,text,uuid,uuid,uuid,text)
 OWNER TO sabora_staff_enrollment_fn_owner;
REVOKE ALL ON FUNCTION sabora.register_staff_passkey_verified_candidate(text,uuid,uuid,text,text,bigint,bigint,text,text,uuid,uuid,uuid,text)
 FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer;

-- Resolve an authenticated lifecycle writer's target from the durable
-- enrollment, without projecting Auth UUIDs to a browser. This read grants
-- no transition: the signed transition checks owner and subject again.
CREATE FUNCTION sabora.resolve_staff_admin_subject_candidate(
 p_key_id text,p_actor uuid,p_enrollment uuid,p_action text,p_correlation text,
 p_issued bigint,p_expires bigint,p_signature text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $resolve_staff_subject$
DECLARE v_key bytea;v_expiry timestamptz;v_now timestamptz:=clock_timestamp();
 v_expected bytea;v_provided bytea;v_diff integer:=0;v_i integer;v_subject uuid;
BEGIN
 IF p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_actor IS NULL OR p_enrollment IS NULL OR p_action IS NULL
  OR p_action NOT IN ('activate','suspend')
  OR p_correlation IS NULL OR p_correlation !~ '^[A-Za-z0-9_-]{8,128}$'
  OR p_issued IS NULL OR p_expires IS NULL
  OR p_expires::numeric-p_issued::numeric NOT BETWEEN 1 AND 30000
  OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$'
  OR p_issued::numeric>floor(extract(epoch FROM v_now)*1000)::numeric+5000
  OR p_expires<=floor(extract(epoch FROM v_now)*1000)
 THEN RAISE EXCEPTION 'staff_admin_subject_forbidden' USING ERRCODE='42501'; END IF;
 SELECT hmac_key,expires_at INTO v_key,v_expiry FROM sabora.staff_lifecycle_signing_keys
  WHERE key_id=p_key_id AND disabled_at IS NULL AND not_before<=v_now AND expires_at>v_now;
 IF NOT FOUND THEN RAISE EXCEPTION 'staff_admin_subject_forbidden' USING ERRCODE='42501'; END IF;
 v_expected:=extensions.hmac(convert_to('sabora.staff-admin-subject.v1'||chr(10)||p_key_id||chr(10)
  ||session_user::text||chr(10)||p_actor::text||chr(10)||p_enrollment::text||chr(10)
  ||p_action||chr(10)||p_correlation||chr(10)||p_issued::text||chr(10)||p_expires::text,'UTF8'),v_key,'sha256');
 v_provided:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP
  v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_provided,v_i));
 END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'staff_admin_subject_forbidden' USING ERRCODE='42501'; END IF;
 SELECT e.auth_user_id INTO v_subject
 FROM sabora.staff_enrollments e
 JOIN sabora.admin_write_ownership o ON o.singleton AND o.owner_user_id=p_actor
 JOIN sabora.staff_members m ON m.user_id=p_actor AND m.role='admin' AND m.state='active'
 WHERE e.id=p_enrollment;
 IF v_subject IS NULL OR v_expiry<=clock_timestamp()
  OR p_expires<=floor(extract(epoch FROM clock_timestamp())*1000)
 THEN RAISE EXCEPTION 'staff_admin_subject_forbidden' USING ERRCODE='42501'; END IF;
 RETURN v_subject;
END;
$resolve_staff_subject$;
ALTER FUNCTION sabora.resolve_staff_admin_subject_candidate(text,uuid,uuid,text,text,bigint,bigint,text)
 OWNER TO sabora_staff_lifecycle_fn_owner;
REVOKE ALL ON FUNCTION sabora.resolve_staff_admin_subject_candidate(text,uuid,uuid,text,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated;
COMMIT;
