-- H6/B2 candidate: authorize pickup by effective pending-line destination and
-- current account binding, not by the immutable historical order visit.
-- Never permits a new occupation of B to inherit an earlier visit.
-- This does NOT enable the isolated F12 transfer confirmation runtime.
BEGIN;
GRANT SELECT ON sabora.customer_account_operational_bindings,
  sabora.order_line_delivery_destinations TO sabora_h6_fn_owner;
CREATE POLICY h6_pickup_owner_binding_read ON sabora.customer_account_operational_bindings
 FOR SELECT TO sabora_h6_fn_owner USING (true);
-- The destination table already has a SELECT policy for sabora_h6_fn_owner.
GRANT SELECT(authorized_qr_version) ON sabora.customer_table_visits TO sabora_h6_fn_owner;
GRANT SELECT(qr_version,ordering_state) ON sabora.dining_tables TO sabora_h6_fn_owner;
CREATE OR REPLACE FUNCTION sabora.manage_pickup_task_h6_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_action text,p_order_line_id uuid,p_expected_version bigint,p_correlation_id text,
 p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $manage_pickup$
DECLARE v_key bytea;v_key_expiry timestamptz;v_role text;v_payload text;v_expected text;
 v_now_ms bigint;v_fingerprint bytea;v_existing record;v_scope record;
 v_line_status text;v_task sabora.pickup_tasks%ROWTYPE;v_result jsonb;
 v_event_type text;v_audit_action text;v_next_state text;v_claimed_by uuid;
BEGIN
 v_now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF p_key_id !~ '^[A-Za-z0-9_-]{8,64}$' OR p_database_role IS DISTINCT FROM session_user
  OR p_actor_user_id IS NULL OR p_staff_role NOT IN ('admin','root','waiter','kitchen')
  OR p_action NOT IN ('claim_pickup','cancel_pickup','correct_ready')
  OR p_order_line_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
  OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
  OR p_issued_at_ms>v_now_ms+5000 OR p_issued_at_ms<v_now_ms-60000
  OR p_expires_at_ms<=v_now_ms OR p_expires_at_ms>p_issued_at_ms+60000
  OR p_signature_hex !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'invalid_pickup_capability' USING errcode='42501'; END IF;

 SELECT k.hmac_key,k.expires_at INTO v_key,v_key_expiry
  FROM sabora.order_operation_signing_keys k WHERE k.key_id=p_key_id
   AND k.disabled_at IS NULL AND k.not_before<=clock_timestamp()
   AND k.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_pickup_capability' USING errcode='42501'; END IF;
 SELECT m.role INTO v_role FROM sabora.staff_members m
  WHERE m.user_id=p_actor_user_id AND m.state='active' FOR UPDATE;
 IF NOT FOUND OR v_role IS DISTINCT FROM p_staff_role THEN
  RAISE EXCEPTION 'invalid_pickup_capability' USING errcode='42501'; END IF;
 IF (p_action IN ('claim_pickup','cancel_pickup') AND v_role NOT IN ('waiter','admin','root'))
  OR (p_action='correct_ready' AND v_role NOT IN ('kitchen','admin','root'))
 THEN RAISE EXCEPTION 'pickup_action_forbidden' USING errcode='42501'; END IF;

 v_payload:='h6-pickup-v1'||chr(10)||p_database_role||chr(10)
  ||p_actor_user_id::text||chr(10)||p_staff_role||chr(10)||p_action||chr(10)
  ||p_order_line_id::text||chr(10)||p_expected_version::text||chr(10)
  ||p_correlation_id||chr(10)||p_issued_at_ms::text||chr(10)||p_expires_at_ms::text;
 v_expected:=encode(extensions.hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
 IF length(v_expected)<>length(p_signature_hex)
  OR extensions.hmac(convert_to(v_expected,'UTF8'),
      convert_to('sabora-h6-pickup-capability-compare','UTF8'),'sha256')
   <>extensions.hmac(convert_to(p_signature_hex,'UTF8'),
      convert_to('sabora-h6-pickup-capability-compare','UTF8'),'sha256')
 THEN RAISE EXCEPTION 'invalid_pickup_capability' USING errcode='42501'; END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_actor_user_id::text||':'||p_correlation_id,0));
 v_now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF v_now_ms>=p_expires_at_ms OR v_key_expiry<=clock_timestamp() THEN
  RAISE EXCEPTION 'expired_pickup_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to(p_action||':'||p_order_line_id::text||':'
  ||p_expected_version::text,'UTF8'));
 SELECT r.fingerprint,r.result INTO v_existing FROM sabora.h6_action_requests r
  WHERE r.actor_user_id=p_actor_user_id AND r.correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;

 -- Lock current account binding before checking effective delivery. A pending
 -- line may be picked up only for the account's current table occupation.
 -- Historical order scope remains immutable and is not an authorization.
 SELECT o.id AS order_id,
   COALESCE(dest.table_id,o.table_id) AS table_id,
   COALESCE(dest.session_id,o.session_id) AS session_id,
   COALESCE(dest.visit_key,o.customer_visit_key) AS customer_visit_key,
   a.customer_id,a.id AS account_id
 INTO v_scope
 FROM sabora.order_lines l
 JOIN sabora.orders o ON o.id=l.order_id
 JOIN sabora.order_rounds r ON r.order_id=o.id
 JOIN sabora.customer_accounts a ON a.id=r.account_id
 LEFT JOIN sabora.order_line_delivery_destinations dest
   ON dest.order_line_id=l.id AND dest.order_id=o.id
     AND dest.account_id=a.id AND dest.round_id=r.id
 WHERE l.id=p_order_line_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'pickup_task_not_found' USING errcode='P0002'; END IF;
 PERFORM 1 FROM sabora.customer_account_operational_bindings binding
 WHERE binding.account_id=v_scope.account_id
   AND binding.table_id=v_scope.table_id
   AND binding.session_id=v_scope.session_id
   AND binding.visit_key=v_scope.customer_visit_key FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'pickup_scope_forbidden' USING errcode='42501'; END IF;
 PERFORM 1 FROM sabora.dining_tables d
 WHERE d.id=v_scope.table_id AND d.session_id=v_scope.session_id
   AND d.ordering_state='open' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'pickup_scope_forbidden' USING errcode='42501'; END IF;
 PERFORM 1 FROM sabora.customer_table_visits v
 JOIN sabora.dining_tables d ON d.id=v.table_id AND d.session_id=v.session_id
 WHERE v.table_id=v_scope.table_id AND v.session_id=v_scope.session_id
   AND v.visit_key=v_scope.customer_visit_key
   AND v.customer_id=v_scope.customer_id
   AND v.authorized_qr_version=d.qr_version
   AND v.revoked_at IS NULL AND v.expires_at>clock_timestamp() FOR SHARE OF v;
 IF NOT FOUND THEN RAISE EXCEPTION 'pickup_scope_forbidden' USING errcode='42501'; END IF;
 SELECT l.status INTO v_line_status FROM sabora.order_lines l
  WHERE l.id=p_order_line_id AND l.order_id=v_scope.order_id FOR UPDATE;
 SELECT * INTO v_task FROM sabora.pickup_tasks t
  WHERE t.order_line_id=p_order_line_id AND t.order_id=v_scope.order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'pickup_task_not_found' USING errcode='P0002'; END IF;
 v_now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF v_now_ms>=p_expires_at_ms OR v_key_expiry<=clock_timestamp() THEN
  RAISE EXCEPTION 'expired_pickup_capability' USING errcode='42501'; END IF;

 IF v_task.version<>p_expected_version THEN
  RETURN jsonb_build_object('version',1,'outcome','conflict','reason','version_changed',
   'orderId',v_scope.order_id,'lineId',p_order_line_id,'pickupTaskId',v_task.id,
   'state',v_task.state,'taskVersion',v_task.version,'claimedBy',v_task.claimed_by,
   'claimedAt',v_task.claimed_at,'updatedAt',v_task.updated_at,'repeated',false);
 END IF;
 IF p_action='claim_pickup' AND (v_line_status<>'ready' OR v_task.state<>'ready') THEN
  RETURN jsonb_build_object('version',1,'outcome','conflict','reason','already_claimed',
   'orderId',v_scope.order_id,'lineId',p_order_line_id,'pickupTaskId',v_task.id,
   'state',v_task.state,'taskVersion',v_task.version,'claimedBy',v_task.claimed_by,
   'claimedAt',v_task.claimed_at,'updatedAt',v_task.updated_at,'repeated',false);
 ELSIF p_action='cancel_pickup' AND (v_line_status<>'ready' OR v_task.state<>'claimed') THEN
  RETURN jsonb_build_object('version',1,'outcome','conflict','reason','not_claimed',
   'orderId',v_scope.order_id,'lineId',p_order_line_id,'pickupTaskId',v_task.id,
   'state',v_task.state,'taskVersion',v_task.version,'claimedBy',v_task.claimed_by,
   'claimedAt',v_task.claimed_at,'updatedAt',v_task.updated_at,'repeated',false);
 ELSIF p_action='correct_ready' AND (v_line_status<>'ready' OR v_task.state<>'ready') THEN
  RETURN jsonb_build_object('version',1,'outcome','conflict',
   'reason',CASE WHEN v_task.state='claimed' THEN 'claimed_cannot_correct' ELSE 'not_ready' END,
   'orderId',v_scope.order_id,'lineId',p_order_line_id,'pickupTaskId',v_task.id,
   'state',v_task.state,'taskVersion',v_task.version,'claimedBy',v_task.claimed_by,
   'claimedAt',v_task.claimed_at,'updatedAt',v_task.updated_at,'repeated',false);
 END IF;

 IF p_action='claim_pickup' THEN
  UPDATE sabora.pickup_tasks SET state='claimed',claimed_by=p_actor_user_id,
   claimed_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
   WHERE id=v_task.id RETURNING * INTO v_task;
  v_event_type:='sabora.pickup.claimed';v_audit_action:='claimed';
  v_next_state:='claimed';v_claimed_by:=p_actor_user_id;
 ELSIF p_action='cancel_pickup' THEN
  UPDATE sabora.pickup_tasks SET state='ready',claimed_by=NULL,claimed_at=NULL,
   version=version+1,updated_at=clock_timestamp()
   WHERE id=v_task.id RETURNING * INTO v_task;
  v_event_type:='sabora.pickup.claim_cancelled';v_audit_action:='claim_cancelled';
  v_next_state:='ready';v_claimed_by:=NULL;
 ELSE
  UPDATE sabora.order_lines SET status='preparing' WHERE id=p_order_line_id;
  UPDATE sabora.pickup_notifications SET invalidated_at=clock_timestamp(),
   invalidated_by=p_actor_user_id,invalidation_reason='ready_corrected'
   WHERE id=v_task.notification_id AND acknowledged_at IS NULL AND invalidated_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'pickup_notification_missing' USING errcode='P0002'; END IF;
  UPDATE sabora.pickup_tasks SET state='corrected',claimed_by=NULL,claimed_at=NULL,
   version=version+1,updated_at=clock_timestamp()
   WHERE id=v_task.id RETURNING * INTO v_task;
  INSERT INTO sabora.order_line_events(id,order_id,order_line_id,actor_user_id,
   from_status,to_status,correlation_id)
  VALUES(gen_random_uuid(),v_scope.order_id,p_order_line_id,p_actor_user_id,
   'ready','preparing',p_correlation_id);
  v_event_type:='sabora.pickup.ready_corrected';v_audit_action:='ready_corrected';
  v_next_state:='corrected';v_claimed_by:=NULL;
 END IF;

 INSERT INTO sabora.pickup_task_events(pickup_task_id,order_id,order_line_id,
  actor_user_id,actor_role,action,from_state,to_state,task_version,correlation_id)
 VALUES(v_task.id,v_scope.order_id,p_order_line_id,p_actor_user_id,v_role,
  v_audit_action,CASE p_action WHEN 'cancel_pickup' THEN 'claimed' ELSE 'ready' END,
  v_next_state,v_task.version,p_correlation_id);
 PERFORM sabora.emit_pickup_task_staff_events_candidate(v_scope.order_id,p_order_line_id,
  v_task.id,v_task.state,v_task.version,v_claimed_by,p_actor_user_id,v_role,v_event_type);
 v_result:=jsonb_build_object('version',1,'outcome',v_audit_action,
  'orderId',v_scope.order_id,'lineId',p_order_line_id,'pickupTaskId',v_task.id,
  'state',v_task.state,'taskVersion',v_task.version,'claimedBy',v_task.claimed_by,
  'claimedAt',v_task.claimed_at,'updatedAt',v_task.updated_at);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
  VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,p_action,v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$manage_pickup$;
ALTER FUNCTION sabora.manage_pickup_task_h6_candidate(
 text,text,uuid,text,text,uuid,bigint,text,bigint,bigint,text
) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.manage_pickup_task_h6_candidate(
 text,text,uuid,text,text,uuid,bigint,text,bigint,bigint,text
) FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.manage_pickup_task_h6_candidate(
 text,text,uuid,text,text,uuid,bigint,text,bigint,bigint,text
) TO sabora_h6_operations_runtime;
COMMIT;
