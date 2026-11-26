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
COMMIT;
