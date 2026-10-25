-- Disposable PostgreSQL 17 candidate: durable, atomic one-use nonce registry.
-- No operational deployment or secret provisioning.
BEGIN;
CREATE TABLE sabora.staff_custody_approval_nonce_candidate(
  nonce uuid PRIMARY KEY,
  actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 8 AND 96),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON sabora.staff_custody_approval_nonce_candidate FROM PUBLIC,anon,authenticated;
ALTER TABLE sabora.staff_custody_approval_nonce_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_custody_approval_nonce_candidate FORCE ROW LEVEL SECURITY;
CREATE ROLE sabora_staff_approval_nonce_owner NOLOGIN NOINHERIT NOSUPERUSER
  NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE ALL ON SCHEMA sabora FROM sabora_staff_approval_nonce_owner;
GRANT USAGE ON SCHEMA sabora TO sabora_staff_approval_nonce_owner;
GRANT INSERT (nonce,actor_id,expires_at)
  ON sabora.staff_custody_approval_nonce_candidate TO sabora_staff_approval_nonce_owner;
CREATE POLICY staff_custody_approval_nonce_insert
  ON sabora.staff_custody_approval_nonce_candidate FOR INSERT
  TO sabora_staff_approval_nonce_owner
  WITH CHECK (expires_at > clock_timestamp());
CREATE FUNCTION sabora.consume_staff_custody_approval_nonce_candidate(
  p_nonce uuid,p_expires_at timestamptz,p_actor_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $fn$
BEGIN
  IF p_nonce IS NULL OR p_expires_at IS NULL OR p_expires_at<=clock_timestamp()
    OR p_expires_at>clock_timestamp()+interval '5 minutes'
    OR p_actor_id IS NULL OR p_actor_id !~ '^[A-Za-z0-9_-]{8,96}$'
  THEN RETURN false; END IF;
  INSERT INTO sabora.staff_custody_approval_nonce_candidate(
    nonce,actor_id,expires_at) VALUES (p_nonce,p_actor_id,p_expires_at)
  ON CONFLICT (nonce) DO NOTHING;
  RETURN FOUND;
END
$fn$;
ALTER FUNCTION sabora.consume_staff_custody_approval_nonce_candidate(
  uuid,timestamptz,text) OWNER TO sabora_staff_approval_nonce_owner;
REVOKE ALL ON FUNCTION sabora.consume_staff_custody_approval_nonce_candidate(
  uuid,timestamptz,text) FROM PUBLIC,anon,authenticated;
COMMIT;
