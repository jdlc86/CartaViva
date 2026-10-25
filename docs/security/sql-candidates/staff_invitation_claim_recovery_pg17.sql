-- Design-only PG17 recovery boundary, installed solely by disposable CI.
-- Never deploy: no operational login, worker or runtime grant.
BEGIN;
CREATE ROLE sabora_staff_claim_recovery_fn_owner
  NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE ALL ON SCHEMA sabora FROM sabora_staff_claim_recovery_fn_owner;
GRANT USAGE ON SCHEMA sabora TO sabora_staff_claim_recovery_fn_owner;
GRANT SELECT (id,fence,state,claimed_at),
      UPDATE (fence,claimed_at,updated_at)
  ON sabora.staff_invitation_outbox TO sabora_staff_claim_recovery_fn_owner;

CREATE POLICY staff_claim_recovery_owner_select
  ON sabora.staff_invitation_outbox FOR SELECT
  TO sabora_staff_claim_recovery_fn_owner
  USING (state='claimed');
CREATE POLICY staff_claim_recovery_owner_update
  ON sabora.staff_invitation_outbox FOR UPDATE
  TO sabora_staff_claim_recovery_fn_owner
  USING (state='claimed')
  WITH CHECK (state='claimed');

CREATE FUNCTION sabora.reclaim_staff_invitation_claim_candidate(
  p_job_id uuid,p_stale_fence uuid,p_lease_seconds integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $body$
DECLARE v_fence uuid;
BEGIN
  IF p_job_id IS NULL OR p_stale_fence IS NULL OR
     p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 3600 THEN
    RAISE EXCEPTION 'invalid_staff_claim_recovery_input' USING errcode='22023';
  END IF;
  UPDATE sabora.staff_invitation_outbox
     SET fence=gen_random_uuid(),
         claimed_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE id=p_job_id AND fence=p_stale_fence AND state='claimed'
     AND claimed_at < clock_timestamp()-(p_lease_seconds*interval '1 second')
  RETURNING fence INTO v_fence;
  RETURN v_fence;
END
$body$;
ALTER FUNCTION sabora.reclaim_staff_invitation_claim_candidate(uuid,uuid,integer)
  OWNER TO sabora_staff_claim_recovery_fn_owner;
REVOKE ALL ON FUNCTION sabora.reclaim_staff_invitation_claim_candidate(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer,
  sabora_staff_invitation_enqueue_fn_owner,sabora_staff_lifecycle_fn_owner;
COMMIT;
