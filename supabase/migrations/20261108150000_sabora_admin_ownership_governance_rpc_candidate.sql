-- Isolated governance candidate: ROOT recovery and serial ADMIN write ownership.
-- No LOGIN, Supabase operative migration or generic admin writer grants.
BEGIN;
CREATE ROLE sabora_ownership_fn_owner NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER;
CREATE ROLE sabora_ownership_runtime NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER;
GRANT USAGE ON SCHEMA sabora TO sabora_ownership_fn_owner,sabora_ownership_runtime;
GRANT USAGE ON SCHEMA extensions TO sabora_ownership_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.digest(bytea,text),
 extensions.hmac(bytea,bytea,text) TO sabora_ownership_fn_owner;

-- The SECURITY DEFINER owner alone can read/lock the governance tables.
-- No application LOGIN or browser role receives their table privileges.
GRANT SELECT(singleton,owner_user_id,assigned_at),
 UPDATE(owner_user_id,assigned_at) ON sabora.admin_write_ownership
 TO sabora_ownership_fn_owner;
GRANT SELECT(user_id,role,state),UPDATE(state) ON sabora.staff_members
 TO sabora_ownership_fn_owner;
GRANT SELECT ON sabora.order_operation_signing_keys TO sabora_ownership_fn_owner;
GRANT UPDATE(disabled_at) ON sabora.order_operation_signing_keys
 TO sabora_ownership_fn_owner;
GRANT SELECT ON sabora.admin_ownership_proposals TO sabora_ownership_fn_owner;
GRANT INSERT(kind,from_owner_id,to_owner_id,created_by,correlation_id)
 ON sabora.admin_ownership_proposals TO sabora_ownership_fn_owner;
GRANT UPDATE(status,resolved_at) ON sabora.admin_ownership_proposals
 TO sabora_ownership_fn_owner;
GRANT SELECT(correlation_id,request_payload,result_payload) ON sabora.admin_ownership_audit
 TO sabora_ownership_fn_owner;
GRANT INSERT(correlation_id,actor_user_id,action,proposal_id,previous_owner_id,
 next_owner_id,reason,request_payload,result,result_payload)
 ON sabora.admin_ownership_audit TO sabora_ownership_fn_owner;
GRANT USAGE ON SEQUENCE sabora.admin_ownership_audit_id_seq TO sabora_ownership_fn_owner;

CREATE POLICY ownership_rpc_owner_read ON sabora.admin_write_ownership FOR SELECT
 TO sabora_ownership_fn_owner USING(singleton);
CREATE POLICY ownership_rpc_owner_write ON sabora.admin_write_ownership FOR UPDATE
 TO sabora_ownership_fn_owner USING(singleton) WITH CHECK(singleton);
CREATE POLICY ownership_rpc_staff_read ON sabora.staff_members FOR SELECT
 TO sabora_ownership_fn_owner USING(true);
CREATE POLICY ownership_rpc_staff_lock ON sabora.staff_members FOR UPDATE
 TO sabora_ownership_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY ownership_rpc_keys_read ON sabora.order_operation_signing_keys FOR SELECT
 TO sabora_ownership_fn_owner USING(true);
CREATE POLICY ownership_rpc_keys_lock ON sabora.order_operation_signing_keys FOR UPDATE
 TO sabora_ownership_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY ownership_rpc_proposals_read ON sabora.admin_ownership_proposals FOR SELECT
 TO sabora_ownership_fn_owner USING(true);
CREATE POLICY ownership_rpc_proposals_create ON sabora.admin_ownership_proposals FOR INSERT
 TO sabora_ownership_fn_owner WITH CHECK(true);
CREATE POLICY ownership_rpc_proposals_decide ON sabora.admin_ownership_proposals FOR UPDATE
 TO sabora_ownership_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY ownership_rpc_audit_read ON sabora.admin_ownership_audit FOR SELECT
 TO sabora_ownership_fn_owner USING(true);
CREATE POLICY ownership_rpc_audit_insert ON sabora.admin_ownership_audit FOR INSERT
 TO sabora_ownership_fn_owner WITH CHECK(true);

-- Durable recipient-scoped notices. These are not browser SQL objects.
CREATE TABLE sabora.admin_ownership_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id),
 -- Notices are written after the audited transition in the SAME transaction.
 -- Deliberately avoid an FK to the append-only audit table: it would change
 -- the audit TRUNCATE integrity-gate behavior used by existing PG17 checks.
 correlation_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN
  ('request','offer','accept','reject','cancel','force_transfer')),
 previous_owner_id uuid,
 next_owner_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(recipient_user_id,correlation_id)
);
CREATE INDEX admin_ownership_notifications_recipient
 ON sabora.admin_ownership_notifications(recipient_user_id,created_at DESC);
ALTER TABLE sabora.admin_ownership_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.admin_ownership_notifications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.admin_ownership_notifications FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sabora_ownership_notifications_immutable
 BEFORE UPDATE OR DELETE ON sabora.admin_ownership_notifications
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_ownership_audit_mutation();
CREATE TRIGGER sabora_ownership_notifications_no_truncate
 BEFORE TRUNCATE ON sabora.admin_ownership_notifications
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_ownership_audit_mutation();
GRANT SELECT(id,recipient_user_id,action,previous_owner_id,next_owner_id,created_at)
 ON sabora.admin_ownership_notifications TO sabora_ownership_fn_owner;
GRANT INSERT(recipient_user_id,correlation_id,action,previous_owner_id,next_owner_id)
 ON sabora.admin_ownership_notifications TO sabora_ownership_fn_owner;
CREATE POLICY ownership_rpc_notices_read ON sabora.admin_ownership_notifications FOR SELECT
 TO sabora_ownership_fn_owner USING(true);
CREATE POLICY ownership_rpc_notices_insert ON sabora.admin_ownership_notifications FOR INSERT
 TO sabora_ownership_fn_owner WITH CHECK(true);

-- One exact signed RPC. It serializes with M3/M5 admin writes on the same singleton.
CREATE FUNCTION sabora.admin_ownership_action_candidate(
 p_capability jsonb,p_action text,p_body text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $ownership$
DECLARE v_now bigint;v_key bytea;v_signature text;v_payload text;
 v_actor uuid;v_role text;v_owner uuid;v_target uuid;v_target_role text;v_target_state text;
 v_request uuid;v_body jsonb;v_proposal uuid;v_kind text;v_status text;
 v_from uuid;v_to uuid;v_creator uuid;v_reason text;v_new_owner uuid;v_next_status text;
 v_audit_action text;v_record jsonb;v_result jsonb;
BEGIN
 -- Singleton first: a concurrent transfer cannot invalidate a write between
 -- authorization and COMMIT, nor authorize two concurrent ADMIN owners.
 SELECT owner_user_id INTO v_owner FROM sabora.admin_write_ownership
 WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ownership_unavailable' USING ERRCODE='42501'; END IF;
 v_now:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF jsonb_typeof(p_capability) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(p_capability))<>10
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_capability) k(key) WHERE k.key NOT IN
   ('keyId','databaseRole','actorId','staffRole','action','requestId',
    'bodyHashHex','issuedAtMs','expiresAtMs','signatureHex'))
  OR p_capability->>'keyId' !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_capability->>'databaseRole' IS DISTINCT FROM session_user
  OR p_capability->>'actorId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR p_capability->>'staffRole' NOT IN ('admin','root')
  OR p_action NOT IN ('read','request','offer','accept','reject','cancel','force')
  OR p_capability->>'action' IS DISTINCT FROM
   (CASE WHEN p_action='read' THEN 'ownership.read' ELSE 'ownership.manage' END)
  OR p_capability->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR p_body IS NULL OR octet_length(convert_to(p_body,'UTF8'))>4096
  OR p_capability->>'bodyHashHex' IS DISTINCT FROM
   encode(extensions.digest(convert_to(p_body,'UTF8'),'sha256'),'hex')
  OR p_capability->>'issuedAtMs' !~ '^(0|[1-9][0-9]*)$'
  OR p_capability->>'expiresAtMs' !~ '^(0|[1-9][0-9]*)$'
  OR (p_capability->>'issuedAtMs')::bigint>v_now+5000
  OR (p_capability->>'issuedAtMs')::bigint<v_now-60000
  OR (p_capability->>'expiresAtMs')::bigint<=v_now
  OR (p_capability->>'expiresAtMs')::bigint>(p_capability->>'issuedAtMs')::bigint+60000
  OR p_capability->>'signatureHex' !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'invalid_ownership_capability' USING ERRCODE='42501';
 END IF;
 -- A signing key cannot expire, be disabled or rotate during the mutation.
 SELECT hmac_key INTO v_key FROM sabora.order_operation_signing_keys
 WHERE key_id=p_capability->>'keyId' AND disabled_at IS NULL
  AND not_before<=clock_timestamp() AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_ownership_capability' USING ERRCODE='42501'; END IF;
 v_actor:=(p_capability->>'actorId')::uuid;
 SELECT role INTO v_role FROM sabora.staff_members WHERE user_id=v_actor
  AND state='active' FOR UPDATE;
 IF NOT FOUND OR v_role IS DISTINCT FROM p_capability->>'staffRole' THEN
  RAISE EXCEPTION 'invalid_ownership_capability' USING ERRCODE='42501'; END IF;
 v_payload:='sabora-ownership-v1'||chr(10)||(p_capability->>'databaseRole')||chr(10)
  ||(p_capability->>'actorId')||chr(10)||(p_capability->>'staffRole')||chr(10)
  ||(p_capability->>'action')||chr(10)||(p_capability->>'requestId')||chr(10)
  ||(p_capability->>'bodyHashHex')||chr(10)||(p_capability->>'issuedAtMs')||chr(10)
  ||(p_capability->>'expiresAtMs');
 v_signature:=encode(extensions.hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
 IF length(v_signature)<>length(p_capability->>'signatureHex')
  OR extensions.hmac(convert_to(v_signature,'UTF8'),
     convert_to('sabora-ownership-compare','UTF8'),'sha256')
    <>extensions.hmac(convert_to(p_capability->>'signatureHex','UTF8'),
     convert_to('sabora-ownership-compare','UTF8'),'sha256') THEN
  RAISE EXCEPTION 'invalid_ownership_capability' USING ERRCODE='42501'; END IF;

 IF p_action='read' THEN
  IF p_body<>'ownership.read' THEN
   RAISE EXCEPTION 'invalid_ownership_request' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object(
   'actorUserId',v_actor,'ownerUserId',v_owner,'role',v_role,'isOwner',v_role='admin' AND v_actor=v_owner,
   'eligibleAdmins',(SELECT coalesce(jsonb_agg(m.user_id ORDER BY m.user_id),'[]'::jsonb)
     FROM sabora.staff_members m WHERE m.role='admin' AND m.state='active'),
   'proposals',(SELECT coalesce(jsonb_agg(
      jsonb_build_object('id',p.id,'kind',p.kind,'fromOwnerId',p.from_owner_id,
        'toOwnerId',p.to_owner_id,'status',p.status,'createdAt',p.created_at)
        ORDER BY p.created_at DESC),'[]'::jsonb)
     FROM sabora.admin_ownership_proposals p
     WHERE p.status='pending' AND p.from_owner_id=v_owner AND
      (v_role='root' OR p.from_owner_id=v_actor OR p.to_owner_id=v_actor)),
   'notifications',(SELECT coalesce(jsonb_agg(
      jsonb_build_object('id',n.id,'action',n.action,
        'previousOwnerId',n.previous_owner_id,'nextOwnerId',n.next_owner_id,
        'createdAt',n.created_at) ORDER BY n.created_at DESC),'[]'::jsonb)
     FROM (SELECT id,recipient_user_id,action,previous_owner_id,next_owner_id,created_at FROM sabora.admin_ownership_notifications
      WHERE recipient_user_id=v_actor ORDER BY created_at DESC LIMIT 20) n)
  );
 END IF;

 BEGIN v_body:=p_body::jsonb; EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'invalid_ownership_request' USING ERRCODE='22023'; END;
 IF jsonb_typeof(v_body) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(v_body))<>4
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_body) k(key) WHERE k.key NOT IN
   ('action','proposalId','targetUserId','reason'))
  OR v_body->>'action' IS DISTINCT FROM p_action THEN
  RAISE EXCEPTION 'invalid_ownership_request' USING ERRCODE='22023'; END IF;
 IF (v_body->>'proposalId') IS NOT NULL AND
   (v_body->>'proposalId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'invalid_ownership_request' USING ERRCODE='22023'; END IF;
 IF (v_body->>'targetUserId') IS NOT NULL AND
   (v_body->>'targetUserId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'invalid_ownership_request' USING ERRCODE='22023'; END IF;
 v_proposal:=(v_body->>'proposalId')::uuid;
 v_target:=(v_body->>'targetUserId')::uuid;
 v_reason:=nullif(btrim(v_body->>'reason'),'');
 IF (p_action IN ('request','offer','force') AND v_proposal IS NOT NULL)
  OR (p_action IN ('accept','reject','cancel') AND
      (v_proposal IS NULL OR v_target IS NOT NULL))
  OR (p_action NOT IN ('force') AND v_reason IS NOT NULL)
  OR (p_action IN ('request','accept','reject','cancel') AND v_target IS NOT NULL)
  OR (p_action IN ('offer','force') AND v_target IS NULL)
  OR (p_action='force' AND (v_reason IS NULL OR length(v_reason)>1000))
  OR (p_action IN ('request','offer') AND v_body->>'reason' IS NOT NULL)
  THEN RAISE EXCEPTION 'invalid_ownership_request' USING ERRCODE='22023'; END IF;

 v_request:=(p_capability->>'requestId')::uuid;
 v_record:=jsonb_build_object('actorUserId',v_actor,'action',p_action,'body',v_body);
 SELECT request_payload,result_payload INTO v_payload,v_result
 FROM sabora.admin_ownership_audit WHERE correlation_id=v_request;
 IF FOUND THEN
  IF v_payload::jsonb IS DISTINCT FROM v_record OR v_result IS NULL THEN
   RAISE EXCEPTION 'ownership_correlation_conflict' USING ERRCODE='23505'; END IF;
  RETURN v_result||jsonb_build_object('replayed',true);
 END IF;

 IF p_action='request' THEN
  IF v_role<>'admin' OR v_owner IS NULL OR v_owner=v_actor THEN
   RAISE EXCEPTION 'ownership_forbidden' USING ERRCODE='42501'; END IF;
  v_target:=v_actor; v_from:=v_owner; v_to:=v_actor; v_kind:='request';
 ELSIF p_action='offer' THEN
  IF v_role<>'admin' OR v_owner IS DISTINCT FROM v_actor THEN
   RAISE EXCEPTION 'ownership_forbidden' USING ERRCODE='42501'; END IF;
  v_from:=v_owner; v_to:=v_target; v_kind:='offer';
 ELSIF p_action='force' THEN
  IF v_role<>'root' THEN RAISE EXCEPTION 'ownership_forbidden' USING ERRCODE='42501'; END IF;
  IF v_owner IS NOT DISTINCT FROM v_target THEN
   RAISE EXCEPTION 'ownership_unchanged' USING ERRCODE='40900'; END IF;
 ELSE
  SELECT kind,status,from_owner_id,to_owner_id,created_by
   INTO v_kind,v_status,v_from,v_to,v_creator
  FROM sabora.admin_ownership_proposals WHERE id=v_proposal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ownership_proposal_not_found' USING ERRCODE='22023'; END IF;
  IF v_status<>'pending' OR v_from IS DISTINCT FROM v_owner THEN
   RAISE EXCEPTION 'ownership_stale_proposal' USING ERRCODE='40900'; END IF;
  IF p_action='cancel' THEN
   IF v_actor IS DISTINCT FROM v_creator THEN
    RAISE EXCEPTION 'ownership_forbidden' USING ERRCODE='42501'; END IF;
  ELSIF v_actor IS DISTINCT FROM
    (CASE WHEN v_kind='request' THEN v_owner ELSE v_to END) THEN
    RAISE EXCEPTION 'ownership_forbidden' USING ERRCODE='42501';
  END IF;
 END IF;
 IF p_action IN ('offer','force','accept') THEN
  IF p_action='accept' THEN v_target:=v_to; END IF;
  SELECT role,state INTO v_target_role,v_target_state FROM sabora.staff_members
   WHERE user_id=v_target FOR UPDATE;
  IF NOT FOUND OR v_target_role<>'admin' OR v_target_state<>'active' OR
    v_target IS NOT DISTINCT FROM v_owner THEN
   RAISE EXCEPTION 'ownership_target_ineligible' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action IN ('request','offer') THEN
  INSERT INTO sabora.admin_ownership_proposals(
   kind,from_owner_id,to_owner_id,created_by,correlation_id)
  VALUES(v_kind,v_from,v_to,v_actor,v_request) RETURNING id INTO v_proposal;
 ELSIF p_action IN ('accept','reject','cancel') THEN
  v_next_status:=CASE p_action WHEN 'accept' THEN 'accepted'
    WHEN 'reject' THEN 'rejected' ELSE 'cancelled' END;
  UPDATE sabora.admin_ownership_proposals
   SET status=v_next_status,resolved_at=clock_timestamp() WHERE id=v_proposal;
 END IF;
 IF p_action IN ('accept','force') THEN
  v_new_owner:=v_target;
  UPDATE sabora.admin_write_ownership SET owner_user_id=v_target,
   assigned_at=clock_timestamp() WHERE singleton;
 ELSE v_new_owner:=v_owner; END IF;
 v_audit_action:=CASE WHEN p_action='force' THEN 'force_transfer' ELSE p_action END;
 v_result:=jsonb_build_object('ownerUserId',v_new_owner,'proposalId',v_proposal,
  'status',coalesce(v_next_status,CASE WHEN p_action='force' THEN 'transferred'
   ELSE 'pending' END),'replayed',false);
 INSERT INTO sabora.admin_ownership_audit(
  correlation_id,actor_user_id,action,proposal_id,previous_owner_id,
  next_owner_id,reason,request_payload,result,result_payload)
 VALUES(v_request,v_actor,v_audit_action,v_proposal,v_owner,v_new_owner,
  v_reason,v_record,'succeeded',v_result);
 -- Durable notifications are inserted with the transition, never before it.
 INSERT INTO sabora.admin_ownership_notifications(
  recipient_user_id,correlation_id,action,previous_owner_id,next_owner_id)
 SELECT recipient,v_request,v_audit_action,v_owner,v_new_owner
 FROM (SELECT DISTINCT unnest(CASE
  WHEN p_action='request' THEN ARRAY[v_owner]
  WHEN p_action='offer' THEN ARRAY[v_to]
  WHEN p_action='force' THEN ARRAY[v_owner,v_target]
  WHEN p_action IN ('accept','reject','cancel') THEN ARRAY[v_from,v_to]
  ELSE ARRAY[]::uuid[] END) recipient) recipients
 WHERE recipient IS NOT NULL;
 RETURN v_result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'invalid_ownership_request' USING ERRCODE='22023';
END;
$ownership$;
ALTER FUNCTION sabora.admin_ownership_action_candidate(jsonb,text,text)
 OWNER TO sabora_ownership_fn_owner;
REVOKE ALL ON FUNCTION sabora.admin_ownership_action_candidate(jsonb,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sabora.admin_ownership_action_candidate(jsonb,text,text)
 TO sabora_ownership_runtime;
COMMENT ON FUNCTION sabora.admin_ownership_action_candidate(jsonb,text,text)
 IS 'Isolated signed ADMIN ownership governance: request/offer/accept/reject/cancel/ROOT force/read, single transaction and durable notifications.';
COMMIT;
