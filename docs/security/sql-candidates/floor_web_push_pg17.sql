-- Sabora PG17 candidate, installed after genesis by the DBA.
BEGIN;
CREATE ROLE sabora_floor_push_fn_owner NOLOGIN NOINHERIT NOSUPERUSER
 NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE,CREATE ON SCHEMA sabora TO sabora_floor_push_fn_owner;
GRANT sabora_floor_push_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;

CREATE TABLE sabora.floor_push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 staff_id uuid NOT NULL REFERENCES sabora.staff_members(user_id),
 endpoint text NOT NULL UNIQUE CHECK(length(endpoint) BETWEEN 24 AND 2048),
 p256dh text NOT NULL CHECK(p256dh ~ '^[A-Za-z0-9_-]{87}$'),
 auth text NOT NULL CHECK(auth ~ '^[A-Za-z0-9_-]{22}$')
);
CREATE INDEX floor_push_subscriptions_staff ON sabora.floor_push_subscriptions(staff_id);
CREATE TABLE sabora.floor_push_schedule (
 kind text NOT NULL CHECK(kind IN ('call','pickup')),
 signal_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 due_at timestamptz NOT NULL,
 fence uuid,
 PRIMARY KEY(kind,signal_id)
);
CREATE INDEX floor_push_schedule_due ON sabora.floor_push_schedule(due_at);
ALTER TABLE sabora.floor_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.floor_push_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.floor_push_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.floor_push_schedule FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.floor_push_subscriptions,sabora.floor_push_schedule FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON sabora.floor_push_subscriptions,sabora.floor_push_schedule
 TO sabora_floor_push_fn_owner;
GRANT SELECT(user_id,role,state) ON sabora.staff_members TO sabora_floor_push_fn_owner;
GRANT SELECT(id,table_id,session_id,status) ON sabora.waiter_calls TO sabora_floor_push_fn_owner;
GRANT SELECT(id,session_id) ON sabora.dining_tables TO sabora_floor_push_fn_owner;
CREATE POLICY floor_push_owner_subscriptions ON sabora.floor_push_subscriptions
 TO sabora_floor_push_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY floor_push_owner_schedule ON sabora.floor_push_schedule
 TO sabora_floor_push_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY floor_push_owner_staff ON sabora.staff_members FOR SELECT
 TO sabora_floor_push_fn_owner USING(role='waiter' AND state='active');
CREATE POLICY floor_push_owner_calls ON sabora.waiter_calls FOR SELECT
 TO sabora_floor_push_fn_owner USING(status='pending');
CREATE POLICY floor_push_owner_tables ON sabora.dining_tables FOR SELECT
 TO sabora_floor_push_fn_owner USING(true);

CREATE FUNCTION sabora.sync_floor_push_candidate() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $sync$
BEGIN
 IF TG_TABLE_NAME='waiter_calls' THEN
  IF NEW.status='pending' THEN
   INSERT INTO sabora.floor_push_schedule(kind,signal_id,revision,due_at)
    VALUES('call',NEW.id,1,clock_timestamp()) ON CONFLICT DO NOTHING;
  ELSE
   DELETE FROM sabora.floor_push_schedule WHERE kind='call' AND signal_id=NEW.id;
  END IF;
 ELSIF TG_TABLE_NAME='pickup_tasks' THEN
  IF NEW.state='ready' THEN
   INSERT INTO sabora.floor_push_schedule(kind,signal_id,revision,due_at)
    VALUES('pickup',NEW.id,NEW.version,clock_timestamp())
    ON CONFLICT(kind,signal_id) DO UPDATE
     SET revision=EXCLUDED.revision,due_at=EXCLUDED.due_at,fence=NULL
     WHERE sabora.floor_push_schedule.revision<EXCLUDED.revision;
  ELSE
   DELETE FROM sabora.floor_push_schedule WHERE kind='pickup' AND signal_id=NEW.id;
  END IF;
 ELSIF TG_TABLE_NAME='dining_tables' THEN
  DELETE FROM sabora.floor_push_schedule s USING sabora.waiter_calls c
   WHERE s.kind='call' AND s.signal_id=c.id AND c.table_id=OLD.id AND c.session_id=OLD.session_id;
 ELSIF TG_TABLE_NAME='staff_members' THEN
  DELETE FROM sabora.floor_push_subscriptions WHERE staff_id=OLD.user_id;
 END IF;
 RETURN NULL;
END;
$sync$;
CREATE TRIGGER floor_push_waiter_call AFTER INSERT OR UPDATE OF status ON sabora.waiter_calls
 FOR EACH ROW EXECUTE FUNCTION sabora.sync_floor_push_candidate();
CREATE TRIGGER floor_push_pickup AFTER INSERT OR UPDATE OF state,version ON sabora.pickup_tasks
 FOR EACH ROW EXECUTE FUNCTION sabora.sync_floor_push_candidate();
CREATE TRIGGER floor_push_occupation AFTER UPDATE OF session_id ON sabora.dining_tables
 FOR EACH ROW WHEN(OLD.session_id IS DISTINCT FROM NEW.session_id)
 EXECUTE FUNCTION sabora.sync_floor_push_candidate();
CREATE TRIGGER floor_push_membership AFTER UPDATE OF state,role ON sabora.staff_members
 FOR EACH ROW WHEN(OLD.role='waiter' AND OLD.state='active' AND (NEW.role<>'waiter' OR NEW.state<>'active'))
 EXECUTE FUNCTION sabora.sync_floor_push_candidate();

INSERT INTO sabora.floor_push_schedule(kind,signal_id,revision,due_at)
 SELECT 'call',c.id,1,clock_timestamp() FROM sabora.waiter_calls c
 JOIN sabora.dining_tables t ON t.id=c.table_id AND t.session_id=c.session_id WHERE c.status='pending'
 UNION ALL SELECT 'pickup',p.id,p.version,clock_timestamp() FROM sabora.pickup_tasks p WHERE p.state='ready';

CREATE FUNCTION sabora.manage_floor_push_candidate(p_actor uuid,p_action text,p_endpoint text,p_key text,p_auth text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $manage$
BEGIN
 IF p_actor IS NULL OR p_endpoint IS NULL OR p_action IS NULL OR p_action NOT IN ('status','enable','disable') THEN
  RAISE EXCEPTION 'invalid_floor_push_subscription' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM sabora.staff_members WHERE user_id=p_actor AND state='active' AND role='waiter') THEN
  RAISE EXCEPTION 'floor_push_subscription_forbidden' USING ERRCODE='42501';
 END IF;
 IF p_action='status' THEN
  RETURN EXISTS(SELECT 1 FROM sabora.floor_push_subscriptions WHERE endpoint=p_endpoint AND staff_id=p_actor);
 ELSIF p_action='disable' THEN
  DELETE FROM sabora.floor_push_subscriptions WHERE endpoint=p_endpoint AND staff_id=p_actor;
  RETURN false;
 END IF;
 INSERT INTO sabora.floor_push_subscriptions(staff_id,endpoint,p256dh,auth)
  VALUES(p_actor,p_endpoint,p_key,p_auth)
  ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth
  WHERE sabora.floor_push_subscriptions.staff_id=p_actor;
 RETURN FOUND;
END;
$manage$;

CREATE FUNCTION sabora.claim_floor_push_candidate()
 RETURNS TABLE(kind text,signal_id uuid,revision bigint,fence uuid)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $claim$
 WITH due AS (
  SELECT s.kind,s.signal_id FROM sabora.floor_push_schedule s
   WHERE s.due_at<=statement_timestamp() ORDER BY s.due_at,s.signal_id
   FOR UPDATE SKIP LOCKED LIMIT 16
 )
 UPDATE sabora.floor_push_schedule s
  SET due_at=statement_timestamp()+interval '30 seconds',fence=gen_random_uuid()
  FROM due WHERE s.kind=due.kind AND s.signal_id=due.signal_id
  RETURNING s.kind,s.signal_id,s.revision,s.fence
$claim$;

CREATE FUNCTION sabora.read_floor_push_candidate(p_kind text,p_signal uuid,p_fence uuid,p_device uuid)
 RETURNS TABLE(id uuid,endpoint text,p256dh text,auth text)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $read$
 SELECT d.id,d.endpoint,d.p256dh,d.auth FROM sabora.floor_push_subscriptions d
 JOIN sabora.staff_members m ON m.user_id=d.staff_id AND m.role='waiter' AND m.state='active'
 WHERE (p_device IS NULL OR d.id=p_device) AND EXISTS(
  SELECT 1 FROM sabora.floor_push_schedule s WHERE s.kind=p_kind AND s.signal_id=p_signal AND s.fence=p_fence
   AND s.due_at>statement_timestamp()
 )
$read$;

CREATE FUNCTION sabora.finish_floor_push_candidate(p_kind text,p_signal uuid,p_fence uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $finish$
 DELETE FROM sabora.floor_push_schedule
  WHERE kind='pickup' AND p_kind='pickup' AND signal_id=p_signal AND fence=p_fence
$finish$;

CREATE FUNCTION sabora.expire_floor_push_device_candidate(p_device uuid,p_endpoint text,p_key text,p_auth text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $expire$
 DELETE FROM sabora.floor_push_subscriptions
  WHERE id=p_device AND endpoint=p_endpoint AND p256dh=p_key AND auth=p_auth
$expire$;

DO $owners$
DECLARE signature regprocedure;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'sabora.sync_floor_push_candidate()',
  'sabora.manage_floor_push_candidate(uuid,text,text,text,text)',
  'sabora.claim_floor_push_candidate()',
  'sabora.read_floor_push_candidate(text,uuid,uuid,uuid)',
  'sabora.finish_floor_push_candidate(text,uuid,uuid)',
  'sabora.expire_floor_push_device_candidate(uuid,text,text,text)'
 ]::regprocedure[] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO sabora_floor_push_fn_owner',signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',signature);
 END LOOP;
END;
$owners$;
REVOKE CREATE ON SCHEMA sabora FROM sabora_floor_push_fn_owner;
REVOKE sabora_floor_push_fn_owner FROM CURRENT_USER GRANTED BY CURRENT_USER;
COMMIT;
