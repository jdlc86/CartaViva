-- Candidate-only explicit terminal custody purge. Disposable PostgreSQL 17 only.
-- No schedule, retention duration or operational migration is authorized here.
BEGIN;
CREATE ROLE sabora_staff_custody_purge_owner NOLOGIN NOINHERIT NOSUPERUSER
  NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE ALL ON SCHEMA sabora FROM sabora_staff_custody_purge_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA sabora FROM sabora_staff_custody_purge_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora FROM sabora_staff_custody_purge_owner;
GRANT USAGE ON SCHEMA sabora TO sabora_staff_custody_purge_owner;
GRANT SELECT (id,state,updated_at) ON sabora.staff_invitation_outbox
  TO sabora_staff_custody_purge_owner;
GRANT SELECT (job_id,created_at),DELETE ON sabora.staff_invitation_custody_candidate
  TO sabora_staff_custody_purge_owner;
CREATE POLICY staff_custody_purge_outbox_select
  ON sabora.staff_invitation_outbox FOR SELECT
  TO sabora_staff_custody_purge_owner
  USING (state IN ('cancelled','delivered','failed'));
CREATE POLICY staff_custody_purge_custody_select
  ON sabora.staff_invitation_custody_candidate FOR SELECT
  TO sabora_staff_custody_purge_owner USING (true);
CREATE POLICY staff_custody_purge_custody_delete
  ON sabora.staff_invitation_custody_candidate FOR DELETE
  TO sabora_staff_custody_purge_owner USING (true);
CREATE FUNCTION sabora.purge_terminal_staff_invitation_custody_candidate(
  p_cutoff timestamptz,p_max_rows integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $fn$
DECLARE v_count integer;
BEGIN
  IF p_cutoff IS NULL OR p_cutoff > clock_timestamp()
    OR p_max_rows IS NULL OR p_max_rows < 1 OR p_max_rows > 500
  THEN
    RAISE EXCEPTION 'invalid_staff_custody_purge_parameters'
      USING errcode='22023';
  END IF;
  WITH eligible AS MATERIALIZED (
    SELECT c.job_id
    FROM sabora.staff_invitation_custody_candidate c
    JOIN sabora.staff_invitation_outbox o ON o.id=c.job_id
    WHERE o.state IN ('cancelled','delivered','failed')
      AND o.updated_at < p_cutoff
      AND c.created_at < p_cutoff
    ORDER BY c.created_at,c.job_id
    LIMIT p_max_rows
  ), deleted AS (
    DELETE FROM sabora.staff_invitation_custody_candidate c
    USING eligible e,sabora.staff_invitation_outbox o
    WHERE c.job_id=e.job_id AND o.id=c.job_id
      AND o.state IN ('cancelled','delivered','failed')
      AND o.updated_at < p_cutoff
      AND c.created_at < p_cutoff
    RETURNING c.job_id
  )
  SELECT count(*)::integer INTO v_count FROM deleted;
  RETURN v_count;
END
$fn$;
ALTER FUNCTION sabora.purge_terminal_staff_invitation_custody_candidate(
  timestamptz,integer) OWNER TO sabora_staff_custody_purge_owner;
REVOKE ALL ON FUNCTION sabora.purge_terminal_staff_invitation_custody_candidate(
  timestamptz,integer) FROM PUBLIC,anon,authenticated;
COMMIT;
