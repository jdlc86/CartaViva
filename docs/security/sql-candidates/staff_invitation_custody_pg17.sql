-- Design-only encrypted custody. Never installed on operational Supabase.
-- No token plaintext or encryption key is stored in PostgreSQL.
BEGIN;
CREATE TABLE sabora.staff_invitation_custody_candidate (
  job_id uuid PRIMARY KEY REFERENCES sabora.staff_invitation_outbox(id) ON DELETE RESTRICT,
  enrollment_id uuid NOT NULL REFERENCES sabora.staff_enrollments(id) ON DELETE RESTRICT,
  invite_version integer NOT NULL CHECK (invite_version > 0),
  token_hash bytea NOT NULL CHECK (octet_length(token_hash)=32),
  envelope_version integer NOT NULL CHECK (envelope_version=1),
  key_id text NOT NULL CHECK (key_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  nonce bytea NOT NULL CHECK (octet_length(nonce)=12),
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) BETWEEN 32 AND 512),
  tag bytea NOT NULL CHECK (octet_length(tag)=16),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT staff_invitation_custody_version_unique UNIQUE(enrollment_id,invite_version),
  CONSTRAINT staff_invitation_custody_outbox_fk
    FOREIGN KEY(enrollment_id,invite_version)
    REFERENCES sabora.staff_invitation_outbox(enrollment_id,invite_version)
);
ALTER TABLE sabora.staff_invitation_custody_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_invitation_custody_candidate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.staff_invitation_custody_candidate FROM PUBLIC,anon,authenticated;
CREATE FUNCTION sabora.store_staff_invitation_custody_candidate(
  p_job_id uuid,p_enrollment_id uuid,p_invite_version integer,
  p_token_hash_hex text,p_key_id text,p_nonce text,p_ciphertext text,p_tag text
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp
AS $body$
DECLARE v_match boolean;
BEGIN
  IF p_token_hash_hex !~ '^[0-9a-f]{64}$'
    OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
    OR p_nonce !~ '^[A-Za-z0-9_-]+$'
    OR p_ciphertext !~ '^[A-Za-z0-9_-]+$'
    OR p_tag !~ '^[A-Za-z0-9_-]+$'
  THEN
    RAISE EXCEPTION 'invalid_staff_invitation_custody_input' USING errcode='22023';
  END IF;
  SELECT o.id=p_job_id AND o.state='pending'
    AND o.invite_token_hash=decode(p_token_hash_hex,'hex')
    INTO v_match
    FROM sabora.staff_invitation_outbox o
    WHERE o.id=p_job_id AND o.enrollment_id=p_enrollment_id
      AND o.invite_version=p_invite_version
    FOR SHARE;
  IF NOT coalesce(v_match,false) THEN
    RAISE EXCEPTION 'staff_invitation_custody_outbox_mismatch' USING errcode='23514';
  END IF;
  INSERT INTO sabora.staff_invitation_custody_candidate(
    job_id,enrollment_id,invite_version,token_hash,envelope_version,
    key_id,nonce,ciphertext,tag
  ) VALUES (
    p_job_id,p_enrollment_id,p_invite_version,decode(p_token_hash_hex,'hex'),1,
    p_key_id,decode(rpad(translate(p_nonce,'-_','+/'),((length(p_nonce)+3)/4)*4,'='),'base64'),
    decode(rpad(translate(p_ciphertext,'-_','+/'),((length(p_ciphertext)+3)/4)*4,'='),'base64'),
    decode(rpad(translate(p_tag,'-_','+/'),((length(p_tag)+3)/4)*4,'='),'base64')
  );
END
$body$;
REVOKE ALL ON FUNCTION sabora.store_staff_invitation_custody_candidate(
  uuid,uuid,integer,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
COMMIT;
