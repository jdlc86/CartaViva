-- Design-only, disposable PostgreSQL 17 candidate. Never apply to live DB.
-- Reveal ciphertext ONLY for a dispatch-authorized, fenced, current invitation.
BEGIN;
CREATE ROLE sabora_staff_custody_reader_fn_owner NOLOGIN NOINHERIT NOSUPERUSER
  NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE ALL ON SCHEMA sabora FROM sabora_staff_custody_reader_fn_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA sabora FROM sabora_staff_custody_reader_fn_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora FROM sabora_staff_custody_reader_fn_owner;
GRANT USAGE ON SCHEMA sabora TO sabora_staff_custody_reader_fn_owner;
GRANT SELECT (id,enrollment_id,invite_version,invite_token_hash,state,fence,
  dispatch_authorized_at) ON sabora.staff_invitation_outbox
  TO sabora_staff_custody_reader_fn_owner;
GRANT SELECT (id,invite_version,invite_token_hash,state)
  ON sabora.staff_enrollments TO sabora_staff_custody_reader_fn_owner;
GRANT SELECT (job_id,enrollment_id,invite_version,token_hash,envelope_version,
  key_id,nonce,ciphertext,tag)
  ON sabora.staff_invitation_custody_candidate
  TO sabora_staff_custody_reader_fn_owner;
CREATE POLICY staff_custody_reader_outbox
  ON sabora.staff_invitation_outbox FOR SELECT
  TO sabora_staff_custody_reader_fn_owner
  USING (state='dispatching' AND fence IS NOT NULL
    AND dispatch_authorized_at IS NOT NULL);
CREATE POLICY staff_custody_reader_enrollment
  ON sabora.staff_enrollments FOR SELECT
  TO sabora_staff_custody_reader_fn_owner USING (state='invited');
CREATE POLICY staff_custody_reader_envelope
  ON sabora.staff_invitation_custody_candidate FOR SELECT
  TO sabora_staff_custody_reader_fn_owner USING (envelope_version=1);
CREATE FUNCTION sabora.read_staff_invitation_dispatch_envelope_candidate(
  p_job_id uuid,p_fence uuid
) RETURNS TABLE(
  result_enrollment_id uuid,result_invite_version integer,
  result_token_hash_hex text,result_key_id text,
  result_nonce text,result_ciphertext text,result_tag text
)
LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $fn$
 -- pg_catalog.encode wraps base64 after 76 characters; strip those separators
 -- before producing the canonical, unpadded Base64URL envelope.
 SELECT e.id,e.invite_version,encode(o.invite_token_hash,'hex'),
   c.key_id,
   translate(rtrim(replace(replace(encode(c.nonce,'base64'),E'\n',''),E'\r',''),'='),'+/','-_'),
   translate(rtrim(replace(replace(encode(c.ciphertext,'base64'),E'\n',''),E'\r',''),'='),'+/','-_'),
   translate(rtrim(replace(replace(encode(c.tag,'base64'),E'\n',''),E'\r',''),'='),'+/','-_')
 FROM sabora.staff_invitation_outbox o
 JOIN sabora.staff_enrollments e ON e.id=o.enrollment_id
 JOIN sabora.staff_invitation_custody_candidate c ON c.job_id=o.id
 WHERE o.id=p_job_id AND o.fence=p_fence AND o.state='dispatching'
   AND o.dispatch_authorized_at IS NOT NULL
   AND e.state='invited' AND e.invite_version=o.invite_version
   AND e.invite_token_hash=o.invite_token_hash
   AND c.enrollment_id=o.enrollment_id AND c.invite_version=o.invite_version
   AND c.token_hash=o.invite_token_hash AND c.envelope_version=1
$fn$;
ALTER FUNCTION sabora.read_staff_invitation_dispatch_envelope_candidate(uuid,uuid)
  OWNER TO sabora_staff_custody_reader_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_staff_invitation_dispatch_envelope_candidate(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
COMMIT;
