-- Candidate-only overlay for disposable PostgreSQL 17. Not a migration.
BEGIN;
CREATE ROLE sabora_staff_custody_fn_owner NOLOGIN NOINHERIT NOSUPERUSER
  NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE ALL ON SCHEMA sabora FROM sabora_staff_custody_fn_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA sabora FROM sabora_staff_custody_fn_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sabora FROM sabora_staff_custody_fn_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora FROM sabora_staff_custody_fn_owner;
GRANT USAGE ON SCHEMA sabora TO sabora_staff_custody_fn_owner;
GRANT SELECT (id,enrollment_id,invite_version,invite_token_hash,state)
  ON sabora.staff_invitation_outbox TO sabora_staff_custody_fn_owner;
GRANT INSERT (job_id,enrollment_id,invite_version,token_hash,envelope_version,
  key_id,nonce,ciphertext,tag)
  ON sabora.staff_invitation_custody_candidate TO sabora_staff_custody_fn_owner;
CREATE POLICY staff_custody_owner_outbox_select
  ON sabora.staff_invitation_outbox FOR SELECT
  TO sabora_staff_custody_fn_owner USING (state='pending');
CREATE POLICY staff_custody_owner_insert
  ON sabora.staff_invitation_custody_candidate FOR INSERT
  TO sabora_staff_custody_fn_owner WITH CHECK (
    envelope_version=1 AND octet_length(token_hash)=32
    AND octet_length(nonce)=12 AND octet_length(tag)=16
    AND octet_length(ciphertext) BETWEEN 32 AND 512
  );
CREATE FUNCTION sabora.store_staff_invitation_custody_restricted_candidate(
  p_job_id uuid,p_enrollment_id uuid,p_invite_version integer,
  p_token_hash_hex text,p_key_id text,p_nonce text,p_ciphertext text,p_tag text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $fn$
BEGIN
  PERFORM sabora.store_staff_invitation_custody_candidate(
    p_job_id,p_enrollment_id,p_invite_version,p_token_hash_hex,
    p_key_id,p_nonce,p_ciphertext,p_tag);
END
$fn$;
ALTER FUNCTION sabora.store_staff_invitation_custody_restricted_candidate(
  uuid,uuid,integer,text,text,text,text,text)
  OWNER TO sabora_staff_custody_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.store_staff_invitation_custody_candidate(
  uuid,uuid,integer,text,text,text,text,text)
  TO sabora_staff_custody_fn_owner;
REVOKE ALL ON FUNCTION sabora.store_staff_invitation_custody_restricted_candidate(
  uuid,uuid,integer,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
COMMIT;
