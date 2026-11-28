-- Disposable PG17 candidate, installed after the directory-aware outbox.
BEGIN;
CREATE ROLE sabora_staff_invitation_dispatch_fn_owner NOLOGIN NOINHERIT NOSUPERUSER
 NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE,CREATE ON SCHEMA sabora TO sabora_staff_invitation_dispatch_fn_owner;
GRANT sabora_staff_invitation_dispatch_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
GRANT SELECT(id,enrollment_id,invite_version,invite_token_hash,state,fence,custody_required,created_at),
 UPDATE(state,fence,claimed_at,dispatch_authorized_at,attempts,updated_at,provider_outcome,provider_message_id,delivered_at)
 ON sabora.staff_invitation_outbox TO sabora_staff_invitation_dispatch_fn_owner;
GRANT SELECT(id,invite_version,invite_token_hash,state) ON sabora.staff_enrollments
 TO sabora_staff_invitation_dispatch_fn_owner;
CREATE POLICY staff_invitation_dispatch_owner_outbox ON sabora.staff_invitation_outbox FOR SELECT
 TO sabora_staff_invitation_dispatch_fn_owner USING(custody_required AND state IN('pending','dispatching','delivered','failed'));
CREATE POLICY staff_invitation_dispatch_owner_transition ON sabora.staff_invitation_outbox FOR UPDATE
 TO sabora_staff_invitation_dispatch_fn_owner USING(custody_required AND state IN('pending','dispatching'))
 WITH CHECK(custody_required AND state IN('dispatching','delivered','failed'));
CREATE POLICY staff_invitation_dispatch_owner_current ON sabora.staff_enrollments FOR SELECT
 TO sabora_staff_invitation_dispatch_fn_owner USING(state='invited');

CREATE FUNCTION sabora.reserve_staff_invitation_dispatch_candidate()
 RETURNS TABLE(job_id uuid,fence uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $claim$
 WITH pending AS (
  SELECT o.id FROM sabora.staff_invitation_outbox o
  JOIN sabora.staff_enrollments e ON e.id=o.enrollment_id AND e.invite_version=o.invite_version
   AND e.invite_token_hash=o.invite_token_hash AND e.state='invited'
  WHERE o.custody_required AND o.state='pending' ORDER BY o.created_at,o.id
  FOR UPDATE OF o SKIP LOCKED LIMIT 1
 )
 UPDATE sabora.staff_invitation_outbox o SET state='dispatching',fence=gen_random_uuid(),
  claimed_at=statement_timestamp(),dispatch_authorized_at=statement_timestamp(),
  attempts=1,updated_at=statement_timestamp()
 FROM pending WHERE o.id=pending.id RETURNING o.id,o.fence
$claim$;

CREATE FUNCTION sabora.finish_staff_invitation_dispatch_candidate(p_job uuid,p_fence uuid,p_outcome text,p_receipt uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $finish$
BEGIN
 IF p_job IS NULL OR p_fence IS NULL OR p_outcome IS NULL OR
    p_outcome NOT IN('accepted','permanent_failure','unknown') OR
    (p_outcome='accepted') IS DISTINCT FROM (p_receipt IS NOT NULL) THEN
  RAISE EXCEPTION 'invalid_staff_dispatch_result' USING ERRCODE='22023';
 END IF;
 UPDATE sabora.staff_invitation_outbox SET state=CASE WHEN p_outcome='accepted' THEN 'delivered' ELSE 'failed' END,
  provider_outcome=p_outcome,provider_message_id=p_receipt,updated_at=statement_timestamp(),
  delivered_at=CASE WHEN p_outcome='accepted' THEN statement_timestamp() ELSE NULL END
 WHERE id=p_job AND fence=p_fence AND state='dispatching' AND custody_required;
 RETURN FOUND;
END;
$finish$;
ALTER FUNCTION sabora.reserve_staff_invitation_dispatch_candidate() OWNER TO sabora_staff_invitation_dispatch_fn_owner;
ALTER FUNCTION sabora.finish_staff_invitation_dispatch_candidate(uuid,uuid,text,uuid) OWNER TO sabora_staff_invitation_dispatch_fn_owner;
REVOKE ALL ON FUNCTION sabora.reserve_staff_invitation_dispatch_candidate(),
 sabora.finish_staff_invitation_dispatch_candidate(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE CREATE ON SCHEMA sabora FROM sabora_staff_invitation_dispatch_fn_owner;
REVOKE sabora_staff_invitation_dispatch_fn_owner FROM CURRENT_USER GRANTED BY CURRENT_USER;
COMMIT;
