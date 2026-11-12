-- Sabora Issue #33: exclusive waiter pickup coordination for H6 orders.
-- Candidate only. It creates no LOGIN, secret, worker, endpoint activation or
-- production migration. Historical picked_up rows remain untouched.
BEGIN;

ALTER TABLE sabora.pickup_notifications
  ADD COLUMN invalidated_at timestamptz,
  ADD COLUMN invalidated_by uuid REFERENCES sabora.staff_members(user_id),
  ADD COLUMN invalidation_reason text
    CHECK (invalidation_reason IS NULL OR invalidation_reason IN ('ready_corrected')),
  ADD CONSTRAINT pickup_notification_invalidation_complete CHECK (
    (invalidated_at IS NULL AND invalidated_by IS NULL AND invalidation_reason IS NULL)
    OR (invalidated_at IS NOT NULL AND invalidated_by IS NOT NULL AND invalidation_reason IS NOT NULL)
  );

ALTER TABLE sabora.pickup_notifications
  DROP CONSTRAINT pickup_notifications_order_line_id_key;

CREATE UNIQUE INDEX pickup_notifications_active_line_unique
  ON sabora.pickup_notifications(order_line_id)
  WHERE acknowledged_at IS NULL AND invalidated_at IS NULL;
CREATE INDEX pickup_notifications_active_created
  ON sabora.pickup_notifications(created_at,id)
  WHERE acknowledged_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE sabora.pickup_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  order_line_id uuid NOT NULL UNIQUE,
  notification_id uuid NOT NULL UNIQUE REFERENCES sabora.pickup_notifications(id),
  state text NOT NULL CHECK (state IN ('ready','claimed','corrected')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  claimed_by uuid REFERENCES sabora.staff_members(user_id),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (order_id,order_line_id) REFERENCES sabora.order_lines(order_id,id),
  CHECK (
    (state='claimed' AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL)
    OR (state IN ('ready','corrected') AND claimed_by IS NULL AND claimed_at IS NULL)
  ),
  CHECK (updated_at >= created_at)
);
CREATE INDEX pickup_tasks_active_state
  ON sabora.pickup_tasks(state,updated_at,id)
  WHERE state IN ('ready','claimed');

CREATE TABLE sabora.pickup_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_task_id uuid NOT NULL REFERENCES sabora.pickup_tasks(id),
  order_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id),
  actor_role text NOT NULL CHECK (actor_role IN ('admin','root','waiter','kitchen')),
  action text NOT NULL CHECK (action IN (
    'ready','ready_migrated','claimed','claim_cancelled','ready_corrected'
  )),
  from_state text CHECK (from_state IS NULL OR from_state IN ('ready','claimed','corrected')),
  to_state text NOT NULL CHECK (to_state IN ('ready','claimed','corrected')),
  task_version bigint NOT NULL CHECK (task_version > 0),
  correlation_id text CHECK (
    correlation_id IS NULL OR correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'
  ),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (order_id,order_line_id) REFERENCES sabora.order_lines(order_id,id),
  UNIQUE (pickup_task_id,task_version),
  CHECK (
    (action IN ('ready','ready_migrated') AND to_state='ready')
    OR (action='claimed' AND from_state='ready' AND to_state='claimed')
    OR (action='claim_cancelled' AND from_state='claimed' AND to_state='ready')
    OR (action='ready_corrected' AND from_state='ready' AND to_state='corrected')
  )
);
CREATE UNIQUE INDEX pickup_task_events_actor_correlation_unique
  ON sabora.pickup_task_events(actor_user_id,correlation_id)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX pickup_task_events_history
  ON sabora.pickup_task_events(pickup_task_id,task_version);

ALTER TABLE sabora.pickup_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.pickup_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.pickup_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.pickup_task_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.pickup_tasks,sabora.pickup_task_events
  FROM PUBLIC,anon,authenticated,sabora_admin_writer,
       sabora_h6_customer_runtime,sabora_h6_provider_runtime,
       sabora_h6_operations_runtime;

ALTER TABLE sabora.h6_action_requests
  DROP CONSTRAINT h6_action_requests_action_check;
ALTER TABLE sabora.h6_action_requests
  ADD CONSTRAINT h6_action_requests_action_check CHECK (action IN (
    'report_incident','resolve_incident','settle_cash','refund_cash','ack_dispatch',
    'claim_pickup','cancel_pickup','correct_ready'
  ));

CREATE TRIGGER pickup_task_events_append_only
  BEFORE UPDATE OR DELETE ON sabora.pickup_task_events
  FOR EACH ROW EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER pickup_task_events_no_truncate
  BEFORE TRUNCATE ON sabora.pickup_task_events
  FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_h6_history_mutation();

GRANT USAGE ON SCHEMA sabora,extensions TO sabora_h6_fn_owner;
GRANT USAGE,SELECT ON SEQUENCE sabora.event_outbox_id_seq TO sabora_h6_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text) TO sabora_h6_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.emit_h6_event_candidate(
  uuid,uuid,text,uuid,uuid,text,text,text,uuid,bigint,jsonb
) TO sabora_h6_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.reject_h6_history_mutation() TO sabora_h6_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.notify_h6_outbox_after_commit() TO sabora_h6_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.enforce_active_transition_actor() TO sabora_h6_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.require_active_staff_role(uuid) TO sabora_h6_fn_owner;

GRANT SELECT(key_id,hmac_key,not_before,expires_at,disabled_at),UPDATE(disabled_at)
  ON sabora.order_operation_signing_keys TO sabora_h6_fn_owner;
GRANT SELECT(user_id,role,state),UPDATE(state)
  ON sabora.staff_members TO sabora_h6_fn_owner;
GRANT SELECT(id,table_id,session_id,customer_visit_key),UPDATE(id)
  ON sabora.orders TO sabora_h6_fn_owner;
GRANT SELECT(id,order_id,table_id,session_id,status),UPDATE(status)
  ON sabora.order_lines TO sabora_h6_fn_owner;
GRANT SELECT(id,session_id),UPDATE(id)
  ON sabora.dining_tables TO sabora_h6_fn_owner;
GRANT SELECT(id,order_id,account_id),UPDATE(id)
  ON sabora.order_rounds TO sabora_h6_fn_owner;
GRANT SELECT(id,table_id,session_id,visit_key,customer_id),UPDATE(id)
  ON sabora.customer_accounts TO sabora_h6_fn_owner;
GRANT SELECT(id,table_id,session_id,customer_id,visit_key,expires_at,revoked_at),UPDATE(id)
  ON sabora.customer_table_visits TO sabora_h6_fn_owner;
GRANT SELECT(id,order_id,order_line_id,created_at,acknowledged_at,invalidated_at),
      UPDATE(invalidated_at,invalidated_by,invalidation_reason)
  ON sabora.pickup_notifications TO sabora_h6_fn_owner;
GRANT INSERT(id,order_id,order_line_id,actor_user_id,from_status,to_status,correlation_id)
  ON sabora.order_line_events TO sabora_h6_fn_owner;
GRANT SELECT,INSERT ON sabora.event_outbox,sabora.h6_action_requests TO sabora_h6_fn_owner;
GRANT SELECT,INSERT,UPDATE ON sabora.pickup_tasks TO sabora_h6_fn_owner;
GRANT SELECT,INSERT ON sabora.pickup_task_events TO sabora_h6_fn_owner;

CREATE POLICY h6_owner_pickup_tasks_select ON sabora.pickup_tasks
  FOR SELECT TO sabora_h6_fn_owner USING (true);
CREATE POLICY h6_owner_pickup_tasks_insert ON sabora.pickup_tasks
  FOR INSERT TO sabora_h6_fn_owner WITH CHECK (true);
CREATE POLICY h6_owner_pickup_tasks_update ON sabora.pickup_tasks
  FOR UPDATE TO sabora_h6_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY h6_owner_pickup_task_events_select ON sabora.pickup_task_events
  FOR SELECT TO sabora_h6_fn_owner USING (true);
CREATE POLICY h6_owner_pickup_task_events_insert ON sabora.pickup_task_events
  FOR INSERT TO sabora_h6_fn_owner WITH CHECK (true);
CREATE POLICY h6_owner_pickup_notifications_select ON sabora.pickup_notifications
  FOR SELECT TO sabora_h6_fn_owner USING (true);
CREATE POLICY h6_owner_pickup_notifications_update ON sabora.pickup_notifications
  FOR UPDATE TO sabora_h6_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY h6_owner_order_lines_update ON sabora.order_lines
  FOR UPDATE TO sabora_h6_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY h6_owner_order_line_events_insert ON sabora.order_line_events
  FOR INSERT TO sabora_h6_fn_owner WITH CHECK (true);

-- The H4 projection owner can only read the new task snapshot. It still has no
-- mutation access and runtime LOGINs continue to receive only typed wrappers.
GRANT SELECT(id,order_id,order_line_id,notification_id,state,version,
  claimed_by,claimed_at,created_at,updated_at)
  ON sabora.pickup_tasks TO sabora_order_operations_fn_owner;
CREATE POLICY sabora_order_ops_owner_pickup_task_select ON sabora.pickup_tasks
  FOR SELECT TO sabora_order_operations_fn_owner USING (true);

CREATE FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  p_order_id uuid,p_line_id uuid,p_task_id uuid,p_task_state text,
  p_task_version bigint,p_claimed_by uuid,p_actor_user_id uuid,
  p_actor_role text,p_event_type text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $pickup_events$
DECLARE v_order record;v_payload jsonb;
BEGIN
  IF p_order_id IS NULL OR p_line_id IS NULL OR p_task_id IS NULL
    OR p_task_state NOT IN ('ready','claimed','corrected') OR p_task_version<1
    OR p_actor_user_id IS NULL OR p_actor_role NOT IN ('admin','root','waiter','kitchen')
    OR p_event_type NOT IN ('sabora.pickup.ready','sabora.pickup.claimed',
      'sabora.pickup.claim_cancelled','sabora.pickup.ready_corrected')
  THEN RAISE EXCEPTION 'invalid_pickup_event' USING errcode='22023'; END IF;
  SELECT o.table_id,o.session_id INTO v_order FROM sabora.orders o WHERE o.id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING errcode='P0002'; END IF;
  v_payload:=jsonb_build_object('orderId',p_order_id,'lineId',p_line_id,
    'pickupTaskId',p_task_id,'state',p_task_state,'version',p_task_version,
    'claimedBy',p_claimed_by,'actorId',p_actor_user_id,'actorRole',p_actor_role);
  PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
    'waiter','waiter',p_event_type,p_task_id,p_task_version,v_payload);
  PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
    'kitchen','kitchen',p_event_type,p_task_id,p_task_version,v_payload);
END;
$pickup_events$;
ALTER FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  uuid,uuid,uuid,text,bigint,uuid,uuid,text,text
) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  uuid,uuid,uuid,text,bigint,uuid,uuid,text,text
) FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
  sabora_h6_provider_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.emit_pickup_task_staff_events_candidate(
  uuid,uuid,uuid,text,bigint,uuid,uuid,text,text
) TO sabora_h6_fn_owner;

CREATE FUNCTION sabora.create_or_rearm_pickup_task_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $ready_task$
DECLARE v_notification_id uuid;v_role text;v_task sabora.pickup_tasks%ROWTYPE;
 v_previous_state text;
BEGIN
  IF NEW.to_status<>'ready' OR NOT EXISTS(
    SELECT 1 FROM sabora.order_rounds r WHERE r.order_id=NEW.order_id
  ) THEN RETURN NEW; END IF;
  SELECT n.id INTO v_notification_id FROM sabora.pickup_notifications n
   WHERE n.order_line_id=NEW.order_line_id AND n.acknowledged_at IS NULL
     AND n.invalidated_at IS NULL ORDER BY n.created_at DESC,n.id DESC LIMIT 1;
  IF v_notification_id IS NULL THEN
    RAISE EXCEPTION 'pickup_notification_missing' USING errcode='P0002';
  END IF;
  SELECT role INTO v_role FROM sabora.staff_members WHERE user_id=NEW.actor_user_id;
  IF v_role IS NULL THEN RAISE EXCEPTION 'actor_not_authorized' USING errcode='42501'; END IF;
  SELECT state INTO v_previous_state FROM sabora.pickup_tasks
   WHERE order_line_id=NEW.order_line_id;
  INSERT INTO sabora.pickup_tasks(order_id,order_line_id,notification_id,state)
   VALUES(NEW.order_id,NEW.order_line_id,v_notification_id,'ready')
  ON CONFLICT(order_line_id) DO UPDATE SET
   notification_id=excluded.notification_id,state='ready',claimed_by=NULL,claimed_at=NULL,
   version=sabora.pickup_tasks.version+1,updated_at=clock_timestamp()
   WHERE sabora.pickup_tasks.state='corrected'
  RETURNING * INTO v_task;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'pickup_task_rearm_conflict' USING errcode='23514';
  END IF;
  INSERT INTO sabora.pickup_task_events(pickup_task_id,order_id,order_line_id,
   actor_user_id,actor_role,action,from_state,to_state,task_version,correlation_id)
  VALUES(v_task.id,NEW.order_id,NEW.order_line_id,NEW.actor_user_id,v_role,'ready',
   v_previous_state,'ready',v_task.version,NEW.correlation_id);
  PERFORM sabora.emit_pickup_task_staff_events_candidate(NEW.order_id,NEW.order_line_id,
   v_task.id,'ready',v_task.version,NULL,NEW.actor_user_id,v_role,'sabora.pickup.ready');
  RETURN NEW;
END;
$ready_task$;
ALTER FUNCTION sabora.create_or_rearm_pickup_task_candidate() OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.create_or_rearm_pickup_task_candidate()
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
  sabora_h6_provider_runtime,sabora_h6_operations_runtime;
CREATE TRIGGER sabora_h6_pickup_task_ready
 AFTER INSERT ON sabora.order_line_events FOR EACH ROW
 WHEN (NEW.to_status='ready')
 EXECUTE FUNCTION sabora.create_or_rearm_pickup_task_candidate();

CREATE FUNCTION sabora.reject_legacy_h6_pickup_ack_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $legacy_pickup$
BEGIN
  IF OLD.acknowledged_at IS NULL AND NEW.acknowledged_at IS NOT NULL
    AND EXISTS(SELECT 1 FROM sabora.pickup_tasks t WHERE t.notification_id=OLD.id)
  THEN RAISE EXCEPTION 'legacy_pickup_transition_retired' USING errcode='23514'; END IF;
  RETURN NEW;
END;
$legacy_pickup$;
ALTER FUNCTION sabora.reject_legacy_h6_pickup_ack_candidate() OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.reject_legacy_h6_pickup_ack_candidate()
 FROM PUBLIC,anon,authenticated,sabora_h6_customer_runtime,
  sabora_h6_provider_runtime,sabora_h6_operations_runtime;
CREATE TRIGGER sabora_reject_legacy_h6_pickup_ack
 BEFORE UPDATE OF acknowledged_at ON sabora.pickup_notifications
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_legacy_h6_pickup_ack_candidate();

CREATE FUNCTION sabora.manage_pickup_task_h6_candidate(
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

 -- Lock stable scope in one order: current table session, customer visit,
 -- line, then pickup task. Every action repeats the same order.
 SELECT o.id AS order_id,o.table_id,o.session_id,o.customer_visit_key,
   a.customer_id,a.id AS account_id
  INTO v_scope
  FROM sabora.order_lines l
  JOIN sabora.orders o ON o.id=l.order_id
  JOIN sabora.order_rounds r ON r.order_id=o.id
  JOIN sabora.customer_accounts a ON a.id=r.account_id
  WHERE l.id=p_order_line_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'pickup_task_not_found' USING errcode='P0002'; END IF;
 PERFORM 1 FROM sabora.dining_tables d WHERE d.id=v_scope.table_id
  AND d.session_id=v_scope.session_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'pickup_scope_forbidden' USING errcode='42501'; END IF;
 PERFORM 1 FROM sabora.customer_table_visits v
  WHERE v.table_id=v_scope.table_id AND v.session_id=v_scope.session_id
   AND v.visit_key=v_scope.customer_visit_key AND v.customer_id=v_scope.customer_id
   AND v.revoked_at IS NULL AND v.expires_at>clock_timestamp() FOR SHARE;
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
GRANT USAGE ON SCHEMA sabora TO sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.manage_pickup_task_h6_candidate(
 text,text,uuid,text,text,uuid,bigint,text,bigint,bigint,text
) TO sabora_h6_operations_runtime;

-- Explicit cutover for active H6 ready lines only. Acknowledged historical
-- picked_up notifications are intentionally excluded and never reinterpreted.
INSERT INTO sabora.pickup_tasks(order_id,order_line_id,notification_id,state)
SELECT l.order_id,l.id,n.id,'ready'
 FROM sabora.order_lines l
 JOIN sabora.order_rounds r ON r.order_id=l.order_id
 JOIN sabora.pickup_notifications n ON n.order_line_id=l.id
  AND n.acknowledged_at IS NULL AND n.invalidated_at IS NULL
 WHERE l.status='ready'
ON CONFLICT(order_line_id) DO NOTHING;

INSERT INTO sabora.pickup_task_events(pickup_task_id,order_id,order_line_id,
 actor_user_id,actor_role,action,from_state,to_state,task_version,correlation_id)
SELECT t.id,t.order_id,t.order_line_id,e.actor_user_id,m.role,'ready_migrated',
 NULL,'ready',t.version,NULL
 FROM sabora.pickup_tasks t
 JOIN LATERAL (
  SELECT ev.actor_user_id FROM sabora.order_line_events ev
   WHERE ev.order_line_id=t.order_line_id AND ev.to_status='ready'
   ORDER BY ev.occurred_at DESC,ev.id DESC LIMIT 1
 ) e ON true
 JOIN sabora.staff_members m ON m.user_id=e.actor_user_id
 WHERE t.state='ready' AND NOT EXISTS(
 SELECT 1 FROM sabora.pickup_task_events pe WHERE pe.pickup_task_id=t.id
 );

DROP FUNCTION sabora.read_order_operations_board_authorized_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text
);
CREATE FUNCTION sabora.read_order_operations_board_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_status text,p_after_confirmed_at_ms bigint,p_after_order_id uuid,
 p_after_line_number integer,p_limit integer,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text
)
RETURNS TABLE (
 order_id uuid,line_id uuid,table_number integer,customer_label text,
 confirmed_at timestamptz,"grouping" text,line_number integer,category text,
 name text,quantity integer,status text,notification_id uuid,
 notification_created_at timestamptz,notification_acknowledged_at timestamptz,
 pickup_task_id uuid,pickup_state text,pickup_version bigint,
 pickup_claimed_by uuid,pickup_claimed_at timestamptz,pickup_updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $board_v2$
DECLARE v_scope text;v_after_confirmed_at timestamptz;
BEGIN
 IF p_staff_role NOT IN ('admin','waiter','kitchen')
  OR (p_status IS NOT NULL AND p_status NOT IN ('confirmed','preparing','ready','picked_up'))
  OR (p_staff_role='kitchen' AND p_status='picked_up')
  OR (p_staff_role='waiter' AND p_status IN ('confirmed','preparing'))
  OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
  OR NOT ((p_after_confirmed_at_ms IS NULL AND p_after_order_id IS NULL
      AND p_after_line_number IS NULL)
   OR (p_after_confirmed_at_ms IS NOT NULL AND p_after_confirmed_at_ms>=0
      AND p_after_order_id IS NOT NULL AND p_after_line_number>0))
 THEN RAISE EXCEPTION 'invalid_order_operations_scope' USING errcode='42501'; END IF;
 v_scope:='status='||COALESCE(p_status,'*')
  ||';after_ms='||COALESCE(p_after_confirmed_at_ms::text,'*')
  ||';after_order='||COALESCE(lower(p_after_order_id::text),'*')
  ||';after_line='||COALESCE(p_after_line_number::text,'*')
  ||';limit='||p_limit::text;
 PERFORM sabora.authorize_order_operation_read_candidate(p_key_id,p_database_role,
  p_actor_user_id,p_staff_role,'board',v_scope,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF p_after_confirmed_at_ms IS NOT NULL THEN
  v_after_confirmed_at:=to_timestamp(p_after_confirmed_at_ms::numeric/1000);
 END IF;
 RETURN QUERY
 SELECT o.id,l.id,d.number,COALESCE(o.customer_alias,o.company),o.confirmed_at,
  o.grouping,l.line_number,l.category,l.name,l.quantity,l.status,
  COALESCE(tn.id,ln.id),COALESCE(tn.created_at,ln.created_at),
  COALESCE(tn.acknowledged_at,ln.acknowledged_at),t.id,t.state,t.version,
  t.claimed_by,t.claimed_at,t.updated_at
 FROM sabora.order_lines l
 JOIN sabora.orders o ON o.id=l.order_id
 JOIN sabora.dining_tables d ON d.id=l.table_id
 LEFT JOIN sabora.pickup_tasks t ON t.order_line_id=l.id
 LEFT JOIN sabora.pickup_notifications tn ON tn.id=t.notification_id
   AND t.state IN ('ready','claimed')
 LEFT JOIN LATERAL (
  SELECT n.id,n.created_at,n.acknowledged_at
   FROM sabora.pickup_notifications n
   WHERE t.id IS NULL AND n.order_line_id=l.id
   ORDER BY n.created_at DESC,n.id DESC LIMIT 1
 ) ln ON true
 WHERE (p_staff_role='admin'
  OR (p_staff_role='kitchen' AND l.status IN ('confirmed','preparing','ready'))
  OR (p_staff_role='waiter' AND l.status IN ('ready','picked_up')))
  AND (p_status IS NULL OR l.status=p_status)
  AND (v_after_confirmed_at IS NULL OR (o.confirmed_at,o.id,l.line_number)>
   (v_after_confirmed_at,p_after_order_id,p_after_line_number))
 ORDER BY o.confirmed_at,o.id,l.line_number LIMIT p_limit+1;
END;
$board_v2$;
ALTER FUNCTION sabora.read_order_operations_board_authorized_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text
) OWNER TO sabora_order_operations_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_order_operations_board_authorized_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text
) FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer;
COMMENT ON FUNCTION sabora.read_order_operations_board_authorized_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text
) IS 'Version 2 pickup-aware HMAC-bound board projection; no runtime LOGIN grant is provisioned.';

COMMENT ON TABLE sabora.pickup_tasks IS
 'Issue #33 exclusive pickup coordination. claimed means an operational task assignment, never physical pickup or delivery.';
COMMENT ON TABLE sabora.pickup_task_events IS
 'Append-only pickup assignment audit; cancellation releases only the assignment.';

COMMIT;
