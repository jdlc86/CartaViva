-- Candidate staff transition boundary; never exposed to HTTP or runtime.
-- Caller identity must be supplied by a trusted authenticated backend,
-- never accepted directly from a browser request.
BEGIN;
CREATE FUNCTION sabora.transition_table_ordering_candidate(
 p_actor uuid,p_table uuid,p_target text,p_pause_until timestamptz DEFAULT NULL)
RETURNS TABLE(table_id uuid,ordering_state text,session_id uuid,changed_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,sabora
AS $body$
DECLARE v_role text; v_state text; v_deadline timestamptz;
BEGIN
 IF p_actor IS NULL OR p_table IS NULL OR p_target IS NULL
    OR p_target NOT IN ('open','paused','closed') THEN
  RAISE EXCEPTION 'invalid_table_transition' USING ERRCODE='22023';
 END IF;
 -- Explicit staff row lock serializes with membership revocation.
 SELECT m.role INTO v_role FROM sabora.staff_members m
 WHERE m.user_id=p_actor AND m.state='active' FOR SHARE;
 IF NOT FOUND OR v_role NOT IN ('waiter','admin','root') THEN
  RAISE EXCEPTION 'staff_not_authorized' USING ERRCODE='42501';
 END IF;
 SELECT t.ordering_state INTO v_state FROM sabora.dining_tables t
 WHERE t.id=p_table FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'table_not_found' USING ERRCODE='P0002';
 END IF;
 IF (p_target='paused' AND v_state='closed')
    OR (p_target='open' AND v_state='open')
    OR (p_target='closed' AND v_state='closed')
    OR (p_target='paused' AND v_state='paused')
    OR (p_target='open' AND p_pause_until IS NOT NULL)
    OR (p_target='closed' AND p_pause_until IS NOT NULL)
    OR (p_target='paused' AND p_pause_until IS NOT NULL
        AND p_pause_until<=clock_timestamp()) THEN
  RAISE EXCEPTION 'invalid_table_transition' USING ERRCODE='22023';
 END IF;
 UPDATE sabora.dining_tables t
 SET ordering_state=p_target,pause_until=p_pause_until
 WHERE t.id=p_table
 RETURNING t.id,t.ordering_state,t.session_id,t.ordering_state_changed_at
 INTO table_id,ordering_state,session_id,changed_at;
 RETURN NEXT;
END
$body$;
REVOKE ALL ON FUNCTION sabora.transition_table_ordering_candidate(uuid,uuid,text,timestamptz)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader;
COMMIT;
