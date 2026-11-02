-- Candidate-only B3: durable customer decisions on the existing H6 append-only
-- outbox. Commit and event insertion are one PostgreSQL transaction; NOTIFY
-- is a wake-up hint, never the source of truth. No active deployment.
BEGIN;

CREATE FUNCTION sabora.project_table_change_decision_to_h6_outbox_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $project$
DECLARE v_table uuid;v_session uuid;v_visit text;
BEGIN
 IF NEW.status NOT IN ('approved','rejected') OR OLD.status IS NOT DISTINCT FROM NEW.status
 THEN RETURN NEW; END IF;
 IF OLD.status<>'pending' THEN
  RAISE EXCEPTION 'table_change_outbox_transition_forbidden' USING errcode='42501';
 END IF;
 SELECT b.table_id,b.session_id,b.visit_key INTO v_table,v_session,v_visit
 FROM sabora.customer_account_operational_bindings b WHERE b.account_id=NEW.account_id;
 IF NOT FOUND OR v_table IS DISTINCT FROM NEW.source_table_id
    OR v_visit IS DISTINCT FROM NEW.visit_key THEN
  RAISE EXCEPTION 'table_change_outbox_binding_mismatch' USING errcode='42501';
 END IF;
 INSERT INTO sabora.event_outbox(table_id,session_id,visit_key,customer_id,
  account_id,audience,event_type,aggregate_id,aggregate_version,payload)
 VALUES(v_table,v_session,v_visit,NEW.customer_id,NEW.account_id,'customer',
  'sabora.table_change.'||NEW.status,NEW.id,1,
  jsonb_build_object('requestId',NEW.id,'expiresAtMs',
    floor(extract(epoch FROM NEW.expires_at)*1000)::bigint));
 RETURN NEW;
END;
$project$;
ALTER FUNCTION sabora.project_table_change_decision_to_h6_outbox_candidate()
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.project_table_change_decision_to_h6_outbox_candidate()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
CREATE TRIGGER sabora_h6_table_change_decision_outbox_candidate
 AFTER UPDATE OF status ON sabora.customer_table_change_requests
 FOR EACH ROW
 WHEN (NEW.status IN ('approved','rejected') AND OLD.status IS DISTINCT FROM NEW.status)
 EXECUTE FUNCTION sabora.project_table_change_decision_to_h6_outbox_candidate();

-- Stateless session-bound backlog. Customers cannot specify an account,
-- table, customer ID or any other person's event scope. A unique open account
-- is resolved inside the SECURITY DEFINER SQL function.
CREATE FUNCTION sabora.read_customer_table_change_outbox_h6_candidate(
 p_session_hash bytea,p_after_cursor bigint DEFAULT 0,p_limit integer DEFAULT 100
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $backlog$
DECLARE v_customer uuid;v_account uuid;v_open_count bigint;
 v_min bigint;v_max bigint;v_events jsonb;v_resync boolean;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32
    OR p_after_cursor IS NULL OR p_after_cursor<0
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_table_change_cursor' USING errcode='22023';
 END IF;
 SELECT s.customer_id INTO v_customer FROM sabora.customer_sessions s
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp();
 IF NOT FOUND THEN
  RAISE EXCEPTION 'customer_session_forbidden' USING errcode='42501';
 END IF;
 SELECT count(*),min(a.id::text)::uuid INTO v_open_count,v_account
 FROM sabora.customer_accounts a WHERE a.customer_id=v_customer AND a.state='open';
 IF v_open_count>1 THEN
  RAISE EXCEPTION 'table_change_account_forbidden' USING errcode='42501';
 END IF;
 IF v_open_count=0 THEN
  RETURN jsonb_build_object('version',1,'resyncRequired',false,
   'nextCursor',p_after_cursor,'minAvailableCursor',NULL,
   'maxAvailableCursor',NULL,'events','[]'::jsonb);
 END IF;
 SELECT min(e.id),max(e.id) INTO v_min,v_max FROM sabora.event_outbox e
 WHERE e.customer_id=v_customer AND e.account_id=v_account
 AND e.audience='customer' AND e.event_type IN
  ('sabora.table_change.approved','sabora.table_change.rejected')
 AND e.expires_at>clock_timestamp();
 v_resync:=p_after_cursor>0 AND v_min IS NOT NULL AND p_after_cursor<v_min;
 IF v_resync THEN v_events:='[]'::jsonb;
 ELSE
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'eventKey',q.event_key,
   'type',q.event_type,'requestId',q.aggregate_id,'expiresAtMs',
   (q.payload->>'expiresAtMs')::bigint,'createdAt',q.created_at)
   ORDER BY q.id),'[]'::jsonb) INTO v_events
  FROM (
   SELECT e.* FROM sabora.event_outbox e
   WHERE e.customer_id=v_customer AND e.account_id=v_account
   AND e.audience='customer' AND e.event_type IN
    ('sabora.table_change.approved','sabora.table_change.rejected')
   AND e.expires_at>clock_timestamp() AND e.id>p_after_cursor
   ORDER BY e.id LIMIT p_limit
  ) q;
 END IF;
 RETURN jsonb_build_object('version',1,'resyncRequired',v_resync,
  'nextCursor',CASE WHEN jsonb_array_length(v_events)>0
   THEN (v_events->(jsonb_array_length(v_events)-1)->>'id')::bigint
   ELSE p_after_cursor END,
  'minAvailableCursor',v_min,'maxAvailableCursor',v_max,'events',v_events);
END;
$backlog$;
ALTER FUNCTION sabora.read_customer_table_change_outbox_h6_candidate(bytea,bigint,integer)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_table_change_outbox_h6_candidate(bytea,bigint,integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_table_change_outbox_h6_candidate(bytea,bigint,integer)
 TO sabora_f12_customer_runtime;
COMMIT;
