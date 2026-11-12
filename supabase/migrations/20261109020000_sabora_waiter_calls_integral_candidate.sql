-- CV-014 / llamadas de sala: propuesta técnica aislada, sin desplegar.
-- Una llamada pendiente por mesa y ocupación. Identidad de cliente por hash
-- HttpOnly; personal por JWT verificado en API más capacidad HMAC vinculada
-- al LOGIN SQL. Nunca conceder tablas al navegador ni operar en Supabase real.
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sabora_waiter_call_fn_owner') THEN
  CREATE ROLE sabora_waiter_call_fn_owner NOLOGIN NOINHERIT NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sabora_waiter_call_customer_runtime') THEN
  CREATE ROLE sabora_waiter_call_customer_runtime NOLOGIN NOINHERIT NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sabora_waiter_call_staff_runtime') THEN
  CREATE ROLE sabora_waiter_call_staff_runtime NOLOGIN NOINHERIT NOBYPASSRLS;
 END IF;
END;
$roles$;

CREATE TABLE sabora.waiter_calls (
 id uuid PRIMARY KEY,
 table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
 session_id uuid NOT NULL,
 customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','attended')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 attended_at timestamptz,
 attended_by uuid REFERENCES sabora.staff_members(user_id),
 CHECK ((status='pending' AND attended_at IS NULL AND attended_by IS NULL)
     OR (status='attended' AND attended_at IS NOT NULL AND attended_by IS NOT NULL))
);
CREATE UNIQUE INDEX waiter_calls_one_pending_per_occupancy
 ON sabora.waiter_calls(table_id,session_id) WHERE status='pending';
CREATE INDEX waiter_calls_table_history ON sabora.waiter_calls(table_id,session_id,created_at DESC);
CREATE TABLE sabora.waiter_call_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 call_id uuid NOT NULL REFERENCES sabora.waiter_calls(id),
 event text NOT NULL CHECK (event IN ('requested','attended')),
 actor_kind text NOT NULL CHECK (actor_kind IN ('customer','staff')),
 actor_id uuid NOT NULL,
 correlation_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((event='requested' AND actor_kind='customer') OR (event='attended' AND actor_kind='staff'))
);
CREATE INDEX waiter_call_events_call ON sabora.waiter_call_events(call_id,created_at);
ALTER TABLE sabora.waiter_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.waiter_calls FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.waiter_call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.waiter_call_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.waiter_calls,sabora.waiter_call_events
 FROM PUBLIC,anon,authenticated,sabora_admin_writer;
CREATE FUNCTION sabora.guard_waiter_call_events_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $guard$
BEGIN
 RAISE EXCEPTION 'waiter_call_audit_immutable' USING ERRCODE='42501';
END;
$guard$;
CREATE TRIGGER waiter_call_events_immutable BEFORE UPDATE OR DELETE
 ON sabora.waiter_call_events FOR EACH ROW EXECUTE FUNCTION sabora.guard_waiter_call_events_immutable();
CREATE TRIGGER waiter_call_events_no_truncate BEFORE TRUNCATE
 ON sabora.waiter_call_events FOR EACH STATEMENT EXECUTE FUNCTION sabora.guard_waiter_call_events_immutable();

-- CV-005 CANDIDATE: the DBA can administer roles it created but must not
-- retain SET/INHERIT at COMMIT. Grant ownership of existing Sabora objects
-- only while the legacy global REVOKE executes; no runtime LOGIN involved.
DO $cv005_scope$
DECLARE candidate_role name;
BEGIN
 FOR candidate_role IN
  SELECT DISTINCT roles.rolname FROM pg_catalog.pg_roles roles
  WHERE roles.oid IN (
   SELECT p.proowner FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='sabora'
   UNION
   SELECT c.relowner FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='sabora'
  )
  AND roles.rolname<>current_user::text
  AND left(roles.rolname,7)='sabora_'
 LOOP
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',candidate_role);
 END LOOP;
END;
$cv005_scope$;
REVOKE ALL ON SCHEMA sabora FROM sabora_waiter_call_fn_owner,
 sabora_waiter_call_customer_runtime,sabora_waiter_call_staff_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA sabora FROM sabora_waiter_call_fn_owner,
 sabora_waiter_call_customer_runtime,sabora_waiter_call_staff_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sabora FROM sabora_waiter_call_fn_owner,
 sabora_waiter_call_customer_runtime,sabora_waiter_call_staff_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora FROM sabora_waiter_call_fn_owner,
 sabora_waiter_call_customer_runtime,sabora_waiter_call_staff_runtime;
-- Release only the grants issued by this transaction's current DBA.
-- PostgreSQL's superuser-issued ADMIN/SET FALSE/INHERIT FALSE row persists.
DO $cv005_release$
DECLARE candidate_role name;
BEGIN
 FOR candidate_role IN
  SELECT DISTINCT roles.rolname FROM pg_catalog.pg_auth_members membership
   JOIN pg_catalog.pg_roles roles ON roles.oid=membership.roleid
  WHERE membership.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
    AND membership.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
    AND left(roles.rolname,7)='sabora_'
 LOOP
  EXECUTE format('REVOKE %I FROM CURRENT_USER',candidate_role);
 END LOOP;
END;
$cv005_release$;
GRANT USAGE ON SCHEMA sabora TO sabora_waiter_call_fn_owner,
 sabora_waiter_call_customer_runtime,sabora_waiter_call_staff_runtime;
GRANT USAGE ON SCHEMA extensions TO sabora_waiter_call_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text) TO sabora_waiter_call_fn_owner;
GRANT SELECT (id,customer_id,token_hash,expires_at,revoked_at)
 ON sabora.customer_sessions TO sabora_waiter_call_fn_owner;
GRANT SELECT (id,table_id,session_id,customer_id,revoked_at,expires_at)
 ON sabora.customer_table_visits TO sabora_waiter_call_fn_owner;
GRANT SELECT (id,number,session_id,ordering_state),UPDATE(id)
 ON sabora.dining_tables TO sabora_waiter_call_fn_owner;
GRANT SELECT (user_id,role,state) ON sabora.staff_members TO sabora_waiter_call_fn_owner;
GRANT SELECT(key_id,hmac_key,not_before,expires_at,disabled_at),
 UPDATE(disabled_at)
 ON sabora.order_operation_signing_keys TO sabora_waiter_call_fn_owner;
GRANT SELECT,INSERT,UPDATE(status,attended_at,attended_by)
 ON sabora.waiter_calls TO sabora_waiter_call_fn_owner;
GRANT SELECT,INSERT ON sabora.waiter_call_events TO sabora_waiter_call_fn_owner;
GRANT INSERT(table_id,session_id,staff_role,audience,event_type,aggregate_id,aggregate_version,payload)
 ON sabora.event_outbox TO sabora_waiter_call_fn_owner;
GRANT USAGE ON SEQUENCE sabora.event_outbox_id_seq TO sabora_waiter_call_fn_owner;

CREATE POLICY waiter_call_session_reader ON sabora.customer_sessions
 FOR SELECT TO sabora_waiter_call_fn_owner USING (true);
CREATE POLICY waiter_call_visit_reader ON sabora.customer_table_visits
 FOR SELECT TO sabora_waiter_call_fn_owner USING (true);
CREATE POLICY waiter_call_table_reader ON sabora.dining_tables
 FOR SELECT TO sabora_waiter_call_fn_owner USING (true);
CREATE POLICY waiter_call_table_lock ON sabora.dining_tables
 FOR UPDATE TO sabora_waiter_call_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY waiter_call_staff_reader ON sabora.staff_members
 FOR SELECT TO sabora_waiter_call_fn_owner USING (true);
CREATE POLICY waiter_call_key_reader ON sabora.order_operation_signing_keys
 FOR SELECT TO sabora_waiter_call_fn_owner USING (true);
CREATE POLICY waiter_call_key_lock ON sabora.order_operation_signing_keys
 FOR UPDATE TO sabora_waiter_call_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY waiter_call_data_reader ON sabora.waiter_calls
 FOR SELECT TO sabora_waiter_call_fn_owner USING (true);
CREATE POLICY waiter_call_data_writer ON sabora.waiter_calls
 FOR INSERT TO sabora_waiter_call_fn_owner WITH CHECK (true);
CREATE POLICY waiter_call_data_attend ON sabora.waiter_calls
 FOR UPDATE TO sabora_waiter_call_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY waiter_call_audit_reader ON sabora.waiter_call_events
 FOR SELECT TO sabora_waiter_call_fn_owner USING (true);
CREATE POLICY waiter_call_audit_writer ON sabora.waiter_call_events
 FOR INSERT TO sabora_waiter_call_fn_owner WITH CHECK (true);
CREATE POLICY waiter_call_outbox_writer ON sabora.event_outbox
 FOR INSERT TO sabora_waiter_call_fn_owner
 WITH CHECK (audience='waiter' AND staff_role='waiter'
  AND event_type IN ('sabora.waiter_call.requested','sabora.waiter_call.attended'));

-- READ may not create a call; REQUEST accepts only client-generated UUID and
-- the HttpOnly session digest. Permission is tied to an extant QR visit in
-- the CURRENT table occupancy, even if the ORDERING permission has expired.
CREATE FUNCTION sabora.waiter_call_customer_candidate(
 p_session_hash bytea,p_table_id uuid,p_action text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $customer$
DECLARE v_customer uuid;v_session uuid;v_number integer;
 v_call sabora.waiter_calls%ROWTYPE;v_current timestamptz:=clock_timestamp();
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32
    OR p_table_id IS NULL OR p_action IS NULL OR p_action NOT IN ('read','request')
    OR (p_action='request' AND p_request_id IS NULL)
    OR (p_action='read' AND p_request_id IS NOT NULL) THEN
  RAISE EXCEPTION 'invalid_waiter_call_request' USING ERRCODE='22023';
 END IF;
 SELECT customer_id INTO v_customer FROM sabora.customer_sessions
  WHERE token_hash=p_session_hash AND revoked_at IS NULL AND expires_at>v_current;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'waiter_call_unauthorized' USING ERRCODE='42501';
 END IF;
 IF p_action='request' THEN
  SELECT session_id,number INTO v_session,v_number
   FROM sabora.dining_tables WHERE id=p_table_id FOR UPDATE;
 ELSE
  SELECT session_id,number INTO v_session,v_number
   FROM sabora.dining_tables WHERE id=p_table_id;
 END IF;
 IF NOT FOUND OR NOT EXISTS(
   SELECT 1 FROM sabora.customer_table_visits v
   WHERE v.table_id=p_table_id AND v.session_id=v_session
     AND v.customer_id=v_customer AND v.revoked_at IS NULL
 ) THEN
  RAISE EXCEPTION 'waiter_call_context_forbidden' USING ERRCODE='42501';
 END IF;
 -- Recheck session and QR-visit membership after waiting for the
 -- table lock; expiry of ORDERING permission intentionally does not revoke
 -- the ability to call sala while the occupancy remains unchanged.
 IF NOT EXISTS(SELECT 1 FROM sabora.customer_sessions
   WHERE token_hash=p_session_hash AND customer_id=v_customer
     AND revoked_at IS NULL AND expires_at>clock_timestamp())
    OR NOT EXISTS(SELECT 1 FROM sabora.customer_table_visits
   WHERE table_id=p_table_id AND session_id=v_session AND customer_id=v_customer
     AND revoked_at IS NULL) THEN
  RAISE EXCEPTION 'waiter_call_context_forbidden' USING ERRCODE='42501';
 END IF;
 -- Replay first, but only for the same customer and current table session.
 IF p_request_id IS NOT NULL THEN
  SELECT * INTO v_call FROM sabora.waiter_calls WHERE id=p_request_id;
  IF FOUND THEN
   IF v_call.table_id<>p_table_id OR v_call.session_id<>v_session
      OR v_call.customer_id<>v_customer THEN
    RAISE EXCEPTION 'waiter_call_conflict' USING ERRCODE='23505';
   END IF;
   RETURN jsonb_build_object('version',1,'id',v_call.id,'state',v_call.status,
    'tableNumber',v_number,'createdAt',v_call.created_at,
    'repeated',true);
  END IF;
 END IF;
 SELECT * INTO v_call FROM sabora.waiter_calls
  WHERE table_id=p_table_id AND session_id=v_session AND status='pending';
 IF FOUND THEN
  RETURN jsonb_build_object('version',1,'id',v_call.id,'state','pending',
   'tableNumber',v_number,'createdAt',v_call.created_at,'repeated',true);
 END IF;
 IF p_action='read' THEN
  RETURN jsonb_build_object('version',1,'id',NULL,'state','none',
   'tableNumber',v_number,'createdAt',NULL,'repeated',false);
 END IF;
 INSERT INTO sabora.waiter_calls(id,table_id,session_id,customer_id)
  VALUES(p_request_id,p_table_id,v_session,v_customer) RETURNING * INTO v_call;
 INSERT INTO sabora.waiter_call_events(call_id,event,actor_kind,actor_id,correlation_id)
  VALUES(v_call.id,'requested','customer',v_customer,p_request_id);
 INSERT INTO sabora.event_outbox(table_id,session_id,staff_role,audience,
   event_type,aggregate_id,aggregate_version,payload)
  VALUES(p_table_id,v_session,'waiter','waiter',
   'sabora.waiter_call.requested',v_call.id,1,
   jsonb_build_object('callId',v_call.id,'tableNumber',v_number,'state','pending'));
 RETURN jsonb_build_object('version',1,'id',v_call.id,'state','pending',
  'tableNumber',v_number,'createdAt',v_call.created_at,'repeated',false);
END;
$customer$;
ALTER FUNCTION sabora.waiter_call_customer_candidate(bytea,uuid,text,uuid)
 OWNER TO sabora_waiter_call_fn_owner;
REVOKE ALL ON FUNCTION sabora.waiter_call_customer_candidate(bytea,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer;
GRANT EXECUTE ON FUNCTION sabora.waiter_call_customer_candidate(bytea,uuid,text,uuid)
 TO sabora_waiter_call_customer_runtime;

-- HMAC key, login, actor, role, action and call identity are bound in SQL.
-- A stolen read capability cannot be reused to mark service attended.
CREATE FUNCTION sabora.waiter_call_staff_candidate(
 p_capability jsonb,p_action text,p_call_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $staff$
DECLARE v_now bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 v_key bytea;v_key_expires timestamptz;v_hmac text;v_payload text;
 v_actor uuid;v_role text;v_request uuid;v_table uuid;v_session uuid;v_number integer;
 v_call sabora.waiter_calls%ROWTYPE;v_items jsonb;
BEGIN
 IF jsonb_typeof(p_capability) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(p_capability))<>10
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_capability) k(key) WHERE k.key NOT IN
    ('keyId','databaseRole','actorId','staffRole','action','requestId',
     'callId','issuedAtMs','expiresAtMs','signatureHex'))
  OR jsonb_typeof(p_capability->'keyId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'databaseRole') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'actorId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'staffRole') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'action') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'requestId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'callId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_capability->'issuedAtMs') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_capability->'expiresAtMs') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_capability->'signatureHex') IS DISTINCT FROM 'string'
  OR p_capability->>'databaseRole' IS DISTINCT FROM session_user
  OR p_capability->>'keyId' !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_capability->>'actorId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR p_capability->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR p_action IS NULL OR p_action NOT IN ('list','attend')
  OR p_capability->>'action' IS DISTINCT FROM p_action
  OR (p_action='list' AND (p_call_id IS NOT NULL OR p_capability->>'callId'<>'-'))
  OR (p_action='attend' AND (p_call_id IS NULL
    OR p_capability->>'callId' IS DISTINCT FROM p_call_id::text))
  OR p_capability->>'issuedAtMs' !~ '^[0-9]{1,16}$'
  OR p_capability->>'expiresAtMs' !~ '^[0-9]{1,16}$'
  OR (p_capability->>'issuedAtMs')::bigint>v_now+5000
  OR (p_capability->>'issuedAtMs')::bigint<v_now-60000
  OR (p_capability->>'expiresAtMs')::bigint<=v_now
  OR (p_capability->>'expiresAtMs')::bigint>(p_capability->>'issuedAtMs')::bigint+60000
  OR p_capability->>'signatureHex' !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'invalid_waiter_call_capability' USING ERRCODE='42501';
 END IF;
 SELECT hmac_key,expires_at INTO v_key,v_key_expires
  FROM sabora.order_operation_signing_keys
  WHERE key_id=p_capability->>'keyId' AND disabled_at IS NULL
   AND not_before<=clock_timestamp() AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_waiter_call_capability' USING ERRCODE='42501'; END IF;
 v_actor:=(p_capability->>'actorId')::uuid;
 SELECT role INTO v_role FROM sabora.staff_members WHERE user_id=v_actor AND state='active';
 IF NOT FOUND OR v_role IS DISTINCT FROM p_capability->>'staffRole'
   OR v_role IS DISTINCT FROM 'waiter' THEN
  RAISE EXCEPTION 'waiter_call_forbidden' USING ERRCODE='42501';
 END IF;
 v_payload:='sabora-waiter-call-v1'||chr(10)||(p_capability->>'databaseRole')||chr(10)
  ||(p_capability->>'actorId')||chr(10)||(p_capability->>'staffRole')||chr(10)
  ||(p_capability->>'action')||chr(10)||(p_capability->>'requestId')||chr(10)
  ||(p_capability->>'callId')||chr(10)||(p_capability->>'issuedAtMs')||chr(10)
  ||(p_capability->>'expiresAtMs');
 v_hmac:=encode(extensions.hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
 IF v_hmac IS NULL OR p_capability->>'signatureHex' IS NULL
  OR length(v_hmac) IS DISTINCT FROM length(p_capability->>'signatureHex')
  OR extensions.hmac(convert_to(v_hmac,'UTF8'),
      convert_to('sabora-waiter-call-compare','UTF8'),'sha256')
    IS DISTINCT FROM extensions.hmac(convert_to(p_capability->>'signatureHex','UTF8'),
      convert_to('sabora-waiter-call-compare','UTF8'),'sha256') THEN
  RAISE EXCEPTION 'invalid_waiter_call_capability' USING ERRCODE='42501';
 END IF;
 v_request:=(p_capability->>'requestId')::uuid;
 IF p_action='list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',calls.id,'tableNumber',t.number,'createdAt',calls.created_at)
   ORDER BY calls.created_at,calls.id),'[]'::jsonb) INTO v_items
   FROM (SELECT c.id,c.table_id,c.session_id,c.created_at
         FROM sabora.waiter_calls c WHERE c.status='pending'
         ORDER BY c.created_at,c.id LIMIT 100) calls
   JOIN sabora.dining_tables t ON t.id=calls.table_id AND t.session_id=calls.session_id;
  IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint
      >=(p_capability->>'expiresAtMs')::bigint OR v_key_expires<=clock_timestamp()
  THEN RAISE EXCEPTION 'invalid_waiter_call_capability' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('version',1,'items',v_items);
 END IF;
 SELECT table_id INTO v_table FROM sabora.waiter_calls WHERE id=p_call_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'waiter_call_not_found' USING ERRCODE='P0002'; END IF;
 SELECT session_id,number INTO v_session,v_number FROM sabora.dining_tables
  WHERE id=v_table FOR UPDATE;
 SELECT * INTO v_call FROM sabora.waiter_calls WHERE id=p_call_id FOR UPDATE;
 IF v_call.session_id IS DISTINCT FROM v_session THEN
  RAISE EXCEPTION 'waiter_call_stale' USING ERRCODE='40900';
 END IF;
 SELECT role INTO v_role FROM sabora.staff_members WHERE user_id=v_actor AND state='active';
 IF NOT FOUND OR v_role IS DISTINCT FROM p_capability->>'staffRole' THEN
  RAISE EXCEPTION 'waiter_call_forbidden' USING ERRCODE='42501';
 END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint
    >=(p_capability->>'expiresAtMs')::bigint OR v_key_expires<=clock_timestamp()
 THEN RAISE EXCEPTION 'invalid_waiter_call_capability' USING ERRCODE='42501'; END IF;
 IF v_call.status='attended' THEN
  RETURN jsonb_build_object('version',1,'id',v_call.id,'state','attended',
   'tableNumber',v_number,'repeated',true);
 END IF;
 UPDATE sabora.waiter_calls SET status='attended',attended_at=clock_timestamp(),
  attended_by=v_actor WHERE id=v_call.id;
 INSERT INTO sabora.waiter_call_events(call_id,event,actor_kind,actor_id,correlation_id)
  VALUES(v_call.id,'attended','staff',v_actor,v_request);
 INSERT INTO sabora.event_outbox(table_id,session_id,staff_role,audience,
  event_type,aggregate_id,aggregate_version,payload)
 VALUES(v_call.table_id,v_call.session_id,'waiter','waiter',
  'sabora.waiter_call.attended',v_call.id,2,
  jsonb_build_object('callId',v_call.id,'tableNumber',v_number,'state','attended'));
 RETURN jsonb_build_object('version',1,'id',v_call.id,'state','attended',
  'tableNumber',v_number,'repeated',false);
END;
$staff$;
ALTER FUNCTION sabora.waiter_call_staff_candidate(jsonb,text,uuid)
 OWNER TO sabora_waiter_call_fn_owner;
REVOKE ALL ON FUNCTION sabora.waiter_call_staff_candidate(jsonb,text,uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer;
GRANT EXECUTE ON FUNCTION sabora.waiter_call_staff_candidate(jsonb,text,uuid)
 TO sabora_waiter_call_staff_runtime;
REVOKE ALL ON FUNCTION sabora.guard_waiter_call_events_immutable()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer;
COMMIT;
