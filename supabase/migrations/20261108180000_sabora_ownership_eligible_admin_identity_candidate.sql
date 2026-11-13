-- RV-02 forward-only governance identity projection; no contact/email disclosure.
-- The same signed RPC, security definer, owner and exact EXECUTE are retained.
BEGIN;

-- CV-005 (PG17): grant the installer temporary access ONLY to the owners
-- of these pre-existing Sabora functions before CREATE OR REPLACE.
-- This is never a runtime grant. The exact DBA-created membership is removed
-- before COMMIT, leaving only the provider/bootstrap ADMIN SET FALSE membership.
DO $cv005_exact_fn_owner_scope$
DECLARE v_owner record;
DECLARE v_names name[] := ARRAY['admin_ownership_action_candidate']::name[];
BEGIN
 IF EXISTS (
   SELECT 1 FROM unnest(v_names) AS expected(proname)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='sabora' AND p.proname=expected.proname
    )
 ) THEN
  RAISE EXCEPTION 'cv005_expected_existing_function_missing' USING errcode='0P000';
 END IF;
 FOR v_owner IN
  SELECT DISTINCT r.* FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
  WHERE n.nspname='sabora' AND p.proname=ANY(v_names)
    AND r.rolname<>current_user::text
 LOOP
  IF left(v_owner.rolname,7)<>'sabora_'
     OR right(v_owner.rolname,9)<>'_fn_owner'
     OR v_owner.rolcanlogin OR v_owner.rolinherit
     OR v_owner.rolsuper OR v_owner.rolbypassrls
     OR v_owner.rolcreaterole OR v_owner.rolcreatedb
     OR v_owner.rolreplication THEN
   RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner' USING errcode='0P000';
  END IF;
  -- Existing CI laboratory migrations executed by fixture superuser remain
  -- compatible: that trusted fixture does not receive bootstrap membership
  -- and needs no temporary grant. Actual Supabase installer is NOSUPERUSER.
  IF (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user::text) THEN
   CONTINUE;
  END IF;
  IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_auth_members m
   JOIN pg_catalog.pg_roles grantor ON grantor.oid=m.grantor
    WHERE m.roleid=v_owner.oid
     AND m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
     AND grantor.rolsuper AND m.admin_option
     AND NOT m.set_option AND NOT m.inherit_option
  ) THEN
   RAISE EXCEPTION 'cv005_provider_bootstrap_membership_missing' USING errcode='0P000';
  END IF;
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',v_owner.rolname);
 END LOOP;
END;
$cv005_exact_fn_owner_scope$;


GRANT SELECT(auth_user_id,requested_role,state,given_name,family_name,operational_display_id)
 ON sabora.staff_enrollments TO sabora_ownership_fn_owner;
CREATE POLICY ownership_rpc_eligible_admin_identity_read
 ON sabora.staff_enrollments FOR SELECT TO sabora_ownership_fn_owner
 USING(requested_role='admin' AND state='active');
CREATE OR REPLACE FUNCTION sabora.admin_ownership_action_candidate(
 p_capability jsonb,p_action text,p_body text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $ownership$
DECLARE v_now bigint;v_key bytea;v_signature text;v_payload text;
 v_actor uuid;v_role text;v_owner uuid;v_target uuid;v_target_role text;v_target_state text;
 v_request uuid;v_body jsonb;v_proposal uuid;v_kind text;v_status text;
 v_from uuid;v_to uuid;v_creator uuid;v_reason text;v_new_owner uuid;v_next_status text;
 v_audit_action text;v_record jsonb;v_result jsonb;
 v_proposal_target uuid;
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
  -- Reject null/ill-typed signed fields before they reach an IF condition:
  -- SQL IF NULL silently skips its rejection branch.
  OR p_action IS NULL
  OR jsonb_typeof(p_capability->'keyId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'databaseRole') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'actorId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'staffRole') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'action') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'requestId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'bodyHashHex') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'issuedAtMs') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_capability->'expiresAtMs') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_capability->'signatureHex') IS DISTINCT FROM 'string'
  OR p_capability->>'keyId' !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_capability->>'databaseRole' IS DISTINCT FROM session_user
  OR p_capability->>'actorId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR p_capability->>'staffRole' NOT IN ('admin','root')
  OR p_action NOT IN ('read','request','offer','accept','reject','cancel','force')
  OR p_capability->>'action' IS DISTINCT FROM
   (CASE WHEN p_action='read' THEN 'ownership.read' ELSE 'ownership.manage' END)
  OR p_capability->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
  AND state='active';
 IF NOT FOUND OR v_role IS DISTINCT FROM p_capability->>'staffRole' THEN
  RAISE EXCEPTION 'invalid_ownership_capability' USING ERRCODE='42501'; END IF;
 v_payload:='sabora-ownership-v1'||chr(10)||(p_capability->>'databaseRole')||chr(10)
  ||(p_capability->>'actorId')||chr(10)||(p_capability->>'staffRole')||chr(10)
  ||(p_capability->>'action')||chr(10)||(p_capability->>'requestId')||chr(10)
  ||(p_capability->>'bodyHashHex')||chr(10)||(p_capability->>'issuedAtMs')||chr(10)
  ||(p_capability->>'expiresAtMs');
 v_signature:=encode(extensions.hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
 IF v_signature IS NULL OR p_capability->>'signatureHex' IS NULL
  OR length(v_signature) IS DISTINCT FROM length(p_capability->>'signatureHex')
  OR extensions.hmac(convert_to(v_signature,'UTF8'),
     convert_to('sabora-ownership-compare','UTF8'),'sha256')
    IS DISTINCT FROM extensions.hmac(convert_to(p_capability->>'signatureHex','UTF8'),
     convert_to('sabora-ownership-compare','UTF8'),'sha256') THEN
  RAISE EXCEPTION 'invalid_ownership_capability' USING ERRCODE='42501'; END IF;

 IF p_action='read' THEN
  IF p_body<>'ownership.read' THEN
   RAISE EXCEPTION 'invalid_ownership_request' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object(
   'actorUserId',v_actor,'ownerUserId',v_owner,'role',v_role,'isOwner',v_role='admin' AND v_actor=v_owner,
   'eligibleAdmins',(SELECT coalesce(jsonb_agg(jsonb_build_object(
       'userId',m.user_id,'givenName',e.given_name,'familyName',e.family_name,
       'operationalDisplayId',e.operational_display_id
     ) ORDER BY m.user_id),'[]'::jsonb)
     FROM sabora.staff_members m
     LEFT JOIN sabora.staff_enrollments e ON e.auth_user_id=m.user_id
       AND e.requested_role='admin' AND e.state='active'
     WHERE m.role='admin' AND m.state='active'),
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
   (v_body->>'proposalId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'invalid_ownership_request' USING ERRCODE='22023'; END IF;
 IF (v_body->>'targetUserId') IS NOT NULL AND
   (v_body->>'targetUserId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
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

 -- Contractual lock order: singleton, staff members sorted by UUID,
 -- then proposal. Read the recipient without a proposal lock only to build
 -- the bounded staff lock set; the proposal is rechecked FOR UPDATE below.
 -- The singleton already prevents supported concurrent ownership decisions.
 IF p_action IN ('accept','reject','cancel') THEN
  SELECT to_owner_id INTO v_proposal_target FROM sabora.admin_ownership_proposals
   WHERE id=v_proposal;
 END IF;
 PERFORM m.user_id FROM sabora.staff_members m
  WHERE m.user_id=ANY(ARRAY[v_actor,v_owner,v_target,v_proposal_target])
  ORDER BY m.user_id FOR UPDATE;
 -- Revalidate actor membership under the staff locks before any replay/write.
 SELECT role INTO v_role FROM sabora.staff_members WHERE user_id=v_actor
  AND state='active';
 IF NOT FOUND OR v_role IS DISTINCT FROM p_capability->>'staffRole' THEN
  RAISE EXCEPTION 'invalid_ownership_capability' USING ERRCODE='42501';
 END IF;
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
DO $assert$
BEGIN
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc
     WHERE oid='sabora.admin_ownership_action_candidate(jsonb,text,text)'::regprocedure)
   IS DISTINCT FROM 'sabora_ownership_fn_owner' THEN
  RAISE EXCEPTION 'ownership_function_owner_drift' USING ERRCODE='42501';
 END IF;
END;
$assert$;
-- CV-005: remove only the migration-DBA's temporary role grants.
DO $cv005_exact_fn_owner_release$
DECLARE v_role name;
DECLARE v_names name[] := ARRAY['admin_ownership_action_candidate']::name[];
BEGIN
 FOR v_role IN
  SELECT DISTINCT r.rolname
   FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
   JOIN pg_catalog.pg_auth_members m ON m.roleid=r.oid
  WHERE n.nspname='sabora' AND p.proname=ANY(v_names)
    AND m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
    AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 LOOP
  EXECUTE format('REVOKE %I FROM CURRENT_USER',v_role);
 END LOOP;
END;
$cv005_exact_fn_owner_release$;

COMMIT;
