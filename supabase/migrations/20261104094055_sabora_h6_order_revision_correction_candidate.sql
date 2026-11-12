-- H6 F21/R06: immutable corrective revisions while the five-minute dispatch
-- is still blocked.  This is a candidate-only, forward migration.  It does
-- not activate a worker, a provider, or any operational Supabase resource.
BEGIN;

ALTER TABLE sabora.order_lines
 ADD COLUMN revision_number integer NOT NULL DEFAULT 1 CHECK (revision_number > 0),
 ADD COLUMN is_current_revision boolean NOT NULL DEFAULT true;
ALTER TABLE sabora.order_lines
 DROP CONSTRAINT order_lines_order_id_line_number_key;
ALTER TABLE sabora.order_lines
 ADD CONSTRAINT order_lines_order_revision_line_unique
 UNIQUE(order_id,revision_number,line_number);
CREATE INDEX order_lines_current_revision_candidate
 ON sabora.order_lines(order_id,revision_number,line_number)
 WHERE is_current_revision;

CREATE TABLE sabora.order_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES sabora.orders(id),
 round_id uuid NOT NULL REFERENCES sabora.order_rounds(id),
 account_id uuid NOT NULL REFERENCES sabora.customer_accounts(id),
 revision_number integer NOT NULL CHECK (revision_number > 0),
 economic_snapshot jsonb NOT NULL CHECK (
   jsonb_typeof(economic_snapshot)='object'
   AND jsonb_typeof(economic_snapshot->'lines')='array'
 ),
 amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
 state text NOT NULL CHECK (state IN (
   'current','invalidated','dispatch_requested','acknowledged',
   'failed','compensation_required'
 )),
 invalidation jsonb CHECK (
   invalidation IS NULL OR (
     jsonb_typeof(invalidation)='object'
     AND jsonb_typeof(invalidation->'affectedLineNumbers')='array'
   )
 ),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 invalidated_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(order_id,revision_number),
 UNIQUE(round_id,revision_number),
 CHECK ((state='invalidated')=(invalidation IS NOT NULL)),
 CHECK ((state='invalidated')=(invalidated_at IS NOT NULL))
);
CREATE INDEX order_revisions_dispatch_guard_candidate
 ON sabora.order_revisions(round_id,revision_number,state);
CREATE UNIQUE INDEX order_revisions_single_current_candidate
 ON sabora.order_revisions(order_id) WHERE state='current';

CREATE TABLE sabora.order_revision_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES sabora.orders(id),
 customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
 request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{16,128}$'),
 request_fingerprint bytea NOT NULL CHECK (octet_length(request_fingerprint)=32),
 from_revision integer NOT NULL CHECK (from_revision > 0),
 to_revision integer NOT NULL CHECK (to_revision=from_revision+1),
 accepted_economic_change boolean NOT NULL,
 result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(customer_id,order_id,request_key),
 UNIQUE(order_id,to_revision)
);

ALTER TABLE sabora.order_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.order_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.order_revision_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.order_revision_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.order_revisions,sabora.order_revision_requests
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
      sabora_h6_customer_runtime,sabora_h6_provider_runtime,
      sabora_h6_operations_runtime;

GRANT SELECT,INSERT,UPDATE ON sabora.order_revisions TO sabora_h6_fn_owner;
GRANT SELECT,INSERT ON sabora.order_revision_requests TO sabora_h6_fn_owner;
GRANT SELECT(id,table_id,session_id,order_id,line_number,category,name,quantity,
 status,revision_number,is_current_revision),
 INSERT(table_id,session_id,order_id,line_number,category,name,quantity,status,
 revision_number,is_current_revision),UPDATE(is_current_revision)
 ON sabora.order_lines TO sabora_h6_fn_owner;
GRANT SELECT(id,published_revision,published_snapshot,withdrawn_at,sold_out),
 UPDATE(sold_out) ON sabora.catalog_items TO sabora_h6_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.prepare_customer_confirmation_line_candidate(
 bytea,uuid,text,text,text,uuid,uuid) TO sabora_h6_fn_owner;

CREATE POLICY h6_owner_order_revisions_select ON sabora.order_revisions
 FOR SELECT TO sabora_h6_fn_owner USING (true);
CREATE POLICY h6_owner_order_revisions_insert ON sabora.order_revisions
 FOR INSERT TO sabora_h6_fn_owner WITH CHECK (true);
CREATE POLICY h6_owner_order_revisions_update ON sabora.order_revisions
 FOR UPDATE TO sabora_h6_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY h6_owner_order_revision_requests_select ON sabora.order_revision_requests
 FOR SELECT TO sabora_h6_fn_owner USING (true);
CREATE POLICY h6_owner_order_revision_requests_insert ON sabora.order_revision_requests
 FOR INSERT TO sabora_h6_fn_owner WITH CHECK (true);
CREATE POLICY h6_owner_order_lines_revision_insert ON sabora.order_lines
 FOR INSERT TO sabora_h6_fn_owner WITH CHECK (true);
CREATE POLICY h6_owner_catalog_items_select ON sabora.catalog_items
 FOR SELECT TO sabora_h6_fn_owner USING (true);
CREATE POLICY h6_owner_catalog_items_update ON sabora.catalog_items
 FOR UPDATE TO sabora_h6_fn_owner USING (true) WITH CHECK (true);

-- Existing candidate fixtures may predate the economic quote ledger.  They
-- still receive a revision guard, but an empty snapshot cannot be invalidated
-- by a catalog item because it contains no fabricated item identity.
INSERT INTO sabora.order_revisions(
 order_id,round_id,account_id,revision_number,economic_snapshot,amount_cents,state)
SELECT r.order_id,r.id,r.account_id,r.revision_number,
 CASE WHEN jsonb_typeof(o.economic_snapshot->'lines')='array'
   THEN o.economic_snapshot
   ELSE jsonb_build_object('schemaVersion',0,'lines','[]'::jsonb)
 END,
 r.amount_cents,
 CASE d.state
   WHEN 'requested' THEN 'dispatch_requested'
   WHEN 'acknowledged' THEN 'acknowledged'
   WHEN 'failed' THEN 'failed'
   WHEN 'compensation_required' THEN 'compensation_required'
   ELSE 'current'
 END
FROM sabora.order_rounds r
JOIN sabora.orders o ON o.id=r.order_id
LEFT JOIN sabora.kitchen_dispatches d ON d.round_id=r.id;

CREATE FUNCTION sabora.seed_order_revision_h6_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $seed_revision$
DECLARE v_snapshot jsonb;
BEGIN
 SELECT CASE WHEN jsonb_typeof(o.economic_snapshot->'lines')='array'
   THEN o.economic_snapshot
   ELSE jsonb_build_object('schemaVersion',0,'lines','[]'::jsonb)
 END INTO v_snapshot FROM sabora.orders o WHERE o.id=NEW.order_id;
 INSERT INTO sabora.order_revisions(order_id,round_id,account_id,
  revision_number,economic_snapshot,amount_cents,state)
 VALUES(NEW.order_id,NEW.id,NEW.account_id,NEW.revision_number,
  v_snapshot,NEW.amount_cents,'current');
 RETURN NEW;
END;
$seed_revision$;
-- CV-005 CANDIDATE (not approved): migration-only capability, revoked before COMMIT.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.seed_order_revision_h6_candidate() OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.seed_order_revision_h6_candidate()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_provider_runtime,sabora_h6_operations_runtime;
CREATE TRIGGER h6_seed_order_revision_candidate
 AFTER INSERT ON sabora.order_rounds FOR EACH ROW
 EXECUTE FUNCTION sabora.seed_order_revision_h6_candidate();

CREATE FUNCTION sabora.guard_order_revision_history_h6_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $guard_revision$
BEGIN
 IF OLD.id<>NEW.id OR OLD.order_id<>NEW.order_id OR OLD.round_id<>NEW.round_id
   OR OLD.account_id<>NEW.account_id
   OR OLD.revision_number<>NEW.revision_number
   OR OLD.economic_snapshot IS DISTINCT FROM NEW.economic_snapshot
   OR OLD.amount_cents<>NEW.amount_cents OR OLD.created_at<>NEW.created_at
 THEN RAISE EXCEPTION 'h6_revision_history_immutable' USING errcode='55000';END IF;
 IF OLD.state<>NEW.state AND NOT (
   (OLD.state='current' AND NEW.state IN ('invalidated','dispatch_requested',
     'acknowledged','failed','compensation_required')) OR
   (OLD.state='dispatch_requested' AND NEW.state IN
     ('acknowledged','failed','compensation_required'))
 ) THEN
  RAISE EXCEPTION 'h6_revision_transition_forbidden' USING errcode='23514';END IF;
 RETURN NEW;
END;
$guard_revision$;
ALTER FUNCTION sabora.guard_order_revision_history_h6_candidate() OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.guard_order_revision_history_h6_candidate()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_provider_runtime,sabora_h6_operations_runtime;
CREATE TRIGGER h6_order_revision_history_guard
 BEFORE UPDATE ON sabora.order_revisions FOR EACH ROW
 EXECUTE FUNCTION sabora.guard_order_revision_history_h6_candidate();
CREATE TRIGGER h6_order_revision_requests_append_only
 BEFORE UPDATE OR DELETE ON sabora.order_revision_requests FOR EACH ROW
 EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER h6_order_revision_requests_no_truncate
 BEFORE TRUNCATE ON sabora.order_revision_requests FOR EACH STATEMENT
 EXECUTE FUNCTION sabora.reject_h6_history_mutation();

-- A dispatch may cross blocked -> requested only for the numbered current
-- revision.  This is the fencing point shared by direct dispatch and Stripe
-- capture completion, so a stale scheduler cannot ship an invalid revision.
CREATE FUNCTION sabora.fence_current_order_revision_dispatch_h6_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $fence_dispatch$
BEGIN
 IF NEW.state='requested' AND OLD.state='blocked' THEN
  PERFORM 1 FROM sabora.order_revisions v
   WHERE v.round_id=NEW.round_id AND v.order_id=NEW.order_id
     AND v.revision_number=NEW.revision_number AND v.state='current'
   FOR UPDATE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'order_revision_not_dispatchable' USING errcode='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$fence_dispatch$;
ALTER FUNCTION sabora.fence_current_order_revision_dispatch_h6_candidate()
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.fence_current_order_revision_dispatch_h6_candidate()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_provider_runtime,sabora_h6_operations_runtime;
CREATE TRIGGER h6_current_revision_dispatch_fence
 BEFORE UPDATE ON sabora.kitchen_dispatches FOR EACH ROW
 EXECUTE FUNCTION sabora.fence_current_order_revision_dispatch_h6_candidate();

CREATE FUNCTION sabora.project_order_revision_dispatch_h6_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $project_dispatch$
BEGIN
 IF (TG_OP='INSERT' OR NEW.state IS DISTINCT FROM OLD.state)
    AND NEW.state IN ('requested','acknowledged','failed','compensation_required') THEN
  UPDATE sabora.order_revisions SET
   state=CASE NEW.state
    WHEN 'requested' THEN 'dispatch_requested'
    WHEN 'acknowledged' THEN 'acknowledged'
    WHEN 'failed' THEN 'failed'
    WHEN 'compensation_required' THEN 'compensation_required'
    ELSE state END,
   updated_at=clock_timestamp()
  WHERE round_id=NEW.round_id AND revision_number=NEW.revision_number
    AND (state='current' OR (state='dispatch_requested' AND
      NEW.state IN ('acknowledged','failed','compensation_required')));
 END IF;
 RETURN NEW;
END;
$project_dispatch$;
ALTER FUNCTION sabora.project_order_revision_dispatch_h6_candidate()
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.project_order_revision_dispatch_h6_candidate()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_provider_runtime,sabora_h6_operations_runtime;
CREATE TRIGGER h6_order_revision_dispatch_projection
 AFTER INSERT OR UPDATE ON sabora.kitchen_dispatches FOR EACH ROW
 EXECUTE FUNCTION sabora.project_order_revision_dispatch_h6_candidate();

-- Called by the catalog trigger in the same transaction as an availability
-- or publication change.  Lock ordering makes the result deterministic with
-- a concurrent deadline: catalog change wins -> invalidated; dispatch wins ->
-- no customer edit and the staff incident path remains authoritative.
CREATE FUNCTION sabora.invalidate_grouping_revisions_for_catalog_h6_candidate(
 p_item_id uuid,p_reason text,p_published_revision bigint
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $invalidate_revision$
DECLARE v_revision record;v_lines jsonb;v_binding record;v_account record;
 v_count integer:=0;v_payload jsonb;
BEGIN
 IF p_item_id IS NULL OR p_reason NOT IN ('sold_out','withdrawn','catalog_changed')
  OR p_published_revision IS NULL OR p_published_revision<1
 THEN RAISE EXCEPTION 'invalid_revision_invalidation' USING errcode='22023';END IF;
 FOR v_revision IN
  SELECT v.id,v.order_id,v.round_id,v.account_id,v.revision_number,
         v.economic_snapshot,d.id AS dispatch_id
  FROM sabora.order_revisions v
  JOIN sabora.order_rounds r ON r.id=v.round_id
  JOIN sabora.kitchen_dispatches d ON d.round_id=r.id
  WHERE v.state='current' AND d.state='blocked'
    AND r.state IN ('free_grouping','awaiting_authorization','grouping')
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(v.economic_snapshot->'lines') x(value)
      WHERE x.value->>'itemId'=p_item_id::text)
  ORDER BY v.round_id
  FOR UPDATE OF v,r,d
 LOOP
  SELECT jsonb_agg(n ORDER BY n) INTO v_lines
  FROM (SELECT ordinality::integer AS n
    FROM jsonb_array_elements(v_revision.economic_snapshot->'lines')
      WITH ORDINALITY x(value,ordinality)
    WHERE x.value->>'itemId'=p_item_id::text) affected;
  v_payload:=jsonb_build_object('reason',p_reason,'itemId',p_item_id,
   'catalogRevision',p_published_revision,'affectedLineNumbers',v_lines);
  UPDATE sabora.order_revisions SET state='invalidated',invalidation=v_payload,
   invalidated_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE id=v_revision.id;
  SELECT a.customer_id INTO v_account FROM sabora.customer_accounts a
   WHERE a.id=v_revision.account_id;
  SELECT b.table_id,b.session_id,b.visit_key INTO v_binding
   FROM sabora.customer_account_operational_bindings b
   WHERE b.account_id=v_revision.account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'h6_economic_binding_missing' USING errcode='42501';END IF;
  v_payload:=v_payload||jsonb_build_object('orderId',v_revision.order_id,
   'roundId',v_revision.round_id,'revisionNumber',v_revision.revision_number,
   'dispatchId',v_revision.dispatch_id);
  PERFORM sabora.emit_h6_event_candidate(v_binding.table_id,v_binding.session_id,
   v_binding.visit_key,v_account.customer_id,v_revision.account_id,NULL,'customer',
   'sabora.order.revision_invalidated',v_revision.id,v_revision.revision_number,v_payload);
  PERFORM sabora.emit_h6_event_candidate(v_binding.table_id,v_binding.session_id,
   NULL,NULL,NULL,'kitchen','kitchen','sabora.order.revision_invalidated',
   v_revision.id,v_revision.revision_number,v_payload);
  PERFORM sabora.emit_h6_event_candidate(v_binding.table_id,v_binding.session_id,
   NULL,NULL,NULL,'waiter','waiter','sabora.order.revision_invalidated',
   v_revision.id,v_revision.revision_number,v_payload);
  v_count:=v_count+1;
 END LOOP;
 RETURN v_count;
END;
$invalidate_revision$;
ALTER FUNCTION sabora.invalidate_grouping_revisions_for_catalog_h6_candidate(uuid,text,bigint)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.invalidate_grouping_revisions_for_catalog_h6_candidate(uuid,text,bigint)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_provider_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.invalidate_grouping_revisions_for_catalog_h6_candidate(uuid,text,bigint)
 TO sabora_h6_fn_owner;

CREATE FUNCTION sabora.invalidate_grouping_revisions_on_catalog_h6_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $catalog_revision_trigger$
DECLARE v_reason text;
BEGIN
 IF NEW.sold_out IS DISTINCT FROM OLD.sold_out AND NEW.sold_out THEN
  v_reason:='sold_out';
 ELSIF NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at AND NEW.withdrawn_at IS NOT NULL THEN
  v_reason:='withdrawn';
 ELSIF NEW.published_revision IS DISTINCT FROM OLD.published_revision
    OR NEW.published_snapshot IS DISTINCT FROM OLD.published_snapshot THEN
  v_reason:='catalog_changed';
 ELSE RETURN NEW;END IF;
 PERFORM sabora.invalidate_grouping_revisions_for_catalog_h6_candidate(
  NEW.id,v_reason,coalesce(NEW.published_revision,OLD.published_revision));
 RETURN NEW;
END;
$catalog_revision_trigger$;
ALTER FUNCTION sabora.invalidate_grouping_revisions_on_catalog_h6_candidate()
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.invalidate_grouping_revisions_on_catalog_h6_candidate()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_provider_runtime,sabora_h6_operations_runtime;
CREATE TRIGGER h6_catalog_revision_invalidation
 AFTER UPDATE OF sold_out,withdrawn_at,published_revision,published_snapshot
 ON sabora.catalog_items FOR EACH ROW
 EXECUTE FUNCTION sabora.invalidate_grouping_revisions_on_catalog_h6_candidate();

-- Customer event authorization follows the mutable operational destination,
-- never the account's immutable historical table.  The destination visit,
-- live table session and customer identity must still match atomically.
CREATE OR REPLACE FUNCTION sabora.read_customer_event_backlog_h6_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text,p_account_id uuid,
 p_after_cursor bigint DEFAULT 0,p_limit integer DEFAULT 100
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $customer_events_binding$
DECLARE v_customer uuid;v_session uuid;v_min bigint;v_max bigint;
 v_events jsonb;v_resync boolean;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 OR p_table_id IS NULL
   OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$' OR p_account_id IS NULL
   OR p_after_cursor<0 OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'invalid_event_cursor' USING errcode='22023';END IF;
 SELECT s.customer_id,b.session_id INTO v_customer,v_session
 FROM sabora.customer_sessions s
 JOIN sabora.customer_accounts a ON a.id=p_account_id
  AND a.customer_id=s.customer_id
 JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
  AND b.table_id=p_table_id AND b.visit_key=p_visit_key
 JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
  AND v.table_id=b.table_id AND v.session_id=b.session_id
  AND v.visit_key=b.visit_key
 JOIN sabora.dining_tables t ON t.id=b.table_id AND t.session_id=b.session_id
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
  AND s.expires_at>clock_timestamp() AND v.revoked_at IS NULL
  AND v.expires_at>clock_timestamp() AND v.authorized_qr_version=t.qr_version
 FOR SHARE OF s,a,b,v,t;
 IF NOT FOUND THEN RAISE EXCEPTION 'event_scope_forbidden' USING errcode='42501';END IF;

 SELECT min(e.id),max(e.id) INTO v_min,v_max FROM sabora.event_outbox e
 WHERE e.expires_at>clock_timestamp() AND e.table_id=p_table_id
  AND e.session_id=v_session AND (
   (e.audience='customer' AND e.customer_id=v_customer AND e.account_id=p_account_id)
   OR (e.audience='visit' AND e.visit_key=p_visit_key));
 v_resync:=p_after_cursor>0 AND v_min IS NOT NULL AND p_after_cursor<v_min;
 IF v_resync THEN v_events:='[]'::jsonb;
 ELSE
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'eventKey',q.event_key,
   'type',q.event_type,'aggregateId',q.aggregate_id,
   'aggregateVersion',q.aggregate_version,'payload',q.payload,
   'createdAt',q.created_at) ORDER BY q.id),'[]'::jsonb) INTO v_events
  FROM (SELECT e.* FROM sabora.event_outbox e
   WHERE e.expires_at>clock_timestamp() AND e.id>p_after_cursor
    AND e.table_id=p_table_id AND e.session_id=v_session AND (
     (e.audience='customer' AND e.customer_id=v_customer AND e.account_id=p_account_id)
     OR (e.audience='visit' AND e.visit_key=p_visit_key))
   ORDER BY e.id LIMIT p_limit) q;
 END IF;
 RETURN jsonb_build_object('version',1,'resyncRequired',v_resync,
  'nextCursor',CASE WHEN jsonb_array_length(v_events)>0
   THEN (v_events->(jsonb_array_length(v_events)-1)->>'id')::bigint
   ELSE p_after_cursor END,
  'minAvailableCursor',v_min,'maxAvailableCursor',v_max,'events',v_events);
END;
$customer_events_binding$;
ALTER FUNCTION sabora.read_customer_event_backlog_h6_candidate(
 bytea,uuid,text,uuid,bigint,integer) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_event_backlog_h6_candidate(
 bytea,uuid,text,uuid,bigint,integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,
      sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_event_backlog_h6_candidate(
 bytea,uuid,text,uuid,bigint,integer) TO sabora_h6_customer_runtime;

CREATE FUNCTION sabora.read_customer_order_revision_h6_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text,p_order_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read_revision$
DECLARE v_customer uuid;v_revision sabora.order_revisions%ROWTYPE;
 v_round sabora.order_rounds%ROWTYPE;v_lines jsonb;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 OR p_table_id IS NULL
  OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$' OR p_order_id IS NULL
 THEN RAISE EXCEPTION 'invalid_customer_revision_request' USING errcode='22023';END IF;
 SELECT s.customer_id INTO v_customer FROM sabora.customer_sessions s
  JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
  JOIN sabora.dining_tables t ON t.id=v.table_id AND t.session_id=v.session_id
  WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
    AND s.expires_at>clock_timestamp() AND v.table_id=p_table_id
    AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
    AND v.expires_at>clock_timestamp() AND v.authorized_qr_version=t.qr_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer_revision_scope_forbidden' USING errcode='42501';END IF;
 SELECT r.* INTO v_round FROM sabora.order_rounds r
  JOIN sabora.customer_accounts a ON a.id=r.account_id AND a.customer_id=v_customer
  JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
  WHERE r.order_id=p_order_id AND b.table_id=p_table_id
    AND b.visit_key=p_visit_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer_revision_scope_forbidden' USING errcode='42501';END IF;
 SELECT * INTO v_revision FROM sabora.order_revisions
  WHERE round_id=v_round.id AND revision_number=v_round.revision_number;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_revision_not_found' USING errcode='P0002';END IF;
 SELECT jsonb_agg(jsonb_build_object(
   'lineNumber',x.ordinality,'itemId',x.value->>'itemId',
   'itemName',x.value->'evidence'->>'itemName',
   'quantity',(x.value->'evidence'->>'quantity')::integer,
   'totalCents',(x.value->'evidence'->>'totalCents')::bigint,
   'affected',coalesce(v_revision.invalidation->'affectedLineNumbers','[]'::jsonb)
     @> jsonb_build_array(x.ordinality::integer),
   'evidence',x.value->'evidence'
  ) ORDER BY x.ordinality) INTO v_lines
 FROM jsonb_array_elements(v_revision.economic_snapshot->'lines')
  WITH ORDINALITY x(value,ordinality);
 RETURN jsonb_build_object('version',1,'orderId',p_order_id,'roundId',v_round.id,
  'revisionNumber',v_revision.revision_number,'state',v_revision.state,
  'amountCents',v_revision.amount_cents,'paymentMode',v_round.payment_mode,
  'invalidation',v_revision.invalidation,'lines',coalesce(v_lines,'[]'::jsonb));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'invalid_customer_revision_request' USING errcode='22023';
END;
$read_revision$;
ALTER FUNCTION sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,
      sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)
 TO sabora_h6_customer_runtime;

CREATE FUNCTION sabora.resubmit_customer_order_revision_h6_candidate(
 p_session_hash bytea,p_table_id uuid,p_qr_token text,p_visit_key text,
 p_basket_id text,p_order_id uuid,p_expected_revision integer,p_request_key text,
 p_replacements jsonb,p_accepted_economic_change boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $resubmit_revision$
DECLARE v_customer uuid;v_visit_session uuid;v_round sabora.order_rounds%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_revision sabora.order_revisions%ROWTYPE;
 v_dispatch sabora.kitchen_dispatches%ROWTYPE;v_existing sabora.order_revision_requests%ROWTYPE;
 v_line jsonb;v_old_line jsonb;v_prepared record;v_next_lines jsonb:='[]'::jsonb;
 v_next_snapshot jsonb;v_amount bigint;v_difference bigint;v_line_number integer;
 v_fingerprint bytea;v_economic_changed boolean:=false;v_result jsonb;
 v_destination record;v_payment sabora.payment_attempts%ROWTYPE;v_direct_dispatch boolean:=false;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 OR p_table_id IS NULL
  OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$'
  OR p_basket_id !~ '^[A-Za-z0-9_-]{16,128}$' OR p_order_id IS NULL
  OR p_expected_revision IS NULL OR p_expected_revision<1
  OR p_request_key !~ '^[A-Za-z0-9_-]{16,128}$'
  OR jsonb_typeof(p_replacements) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_replacements) NOT BETWEEN 1 AND 50
  OR p_accepted_economic_change IS NULL
 THEN RAISE EXCEPTION 'invalid_customer_revision_request' USING errcode='22023';END IF;
 SELECT s.customer_id,v.session_id INTO v_customer,v_visit_session
 FROM sabora.customer_sessions s
 JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
 JOIN sabora.dining_tables t ON t.id=v.table_id AND t.session_id=v.session_id
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() AND v.table_id=p_table_id
   AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
   AND v.expires_at>clock_timestamp() AND v.authorized_qr_version=t.qr_version
   AND t.ordering_state='open' FOR UPDATE OF s,v,t;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer_revision_scope_forbidden' USING errcode='42501';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  v_customer::text||':'||p_order_id::text,140631));
 SELECT r.* INTO v_round FROM sabora.order_rounds r
 JOIN sabora.customer_accounts a ON a.id=r.account_id
 JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
 WHERE r.order_id=p_order_id AND a.customer_id=v_customer AND a.state='open'
   AND b.table_id=p_table_id AND b.session_id=v_visit_session
   AND b.visit_key=p_visit_key FOR UPDATE OF r,a,b;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer_revision_scope_forbidden' USING errcode='42501';END IF;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id FOR UPDATE;
 v_fingerprint:=sha256(convert_to(p_expected_revision::text||':'||
  p_accepted_economic_change::text||':'||p_replacements::text,'UTF8'));
 SELECT * INTO v_existing FROM sabora.order_revision_requests q
  WHERE q.customer_id=v_customer AND q.order_id=p_order_id
    AND q.request_key=p_request_key;
 IF FOUND THEN
  IF v_existing.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'revision_idempotency_conflict' USING errcode='23505';END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_revision FROM sabora.order_revisions
  WHERE round_id=v_round.id AND revision_number=p_expected_revision FOR UPDATE;
 IF NOT FOUND OR v_round.revision_number<>p_expected_revision THEN
  RAISE EXCEPTION 'revision_concurrency_conflict' USING errcode='40001';END IF;
 SELECT * INTO v_dispatch FROM sabora.kitchen_dispatches
  WHERE round_id=v_round.id FOR UPDATE;
 IF v_revision.state<>'invalidated' OR v_dispatch.state<>'blocked' THEN
  RAISE EXCEPTION 'revision_not_correctable' USING errcode='23514';END IF;
 IF jsonb_array_length(v_revision.invalidation->'affectedLineNumbers')
    <>jsonb_array_length(p_replacements)
  OR (SELECT count(DISTINCT (x.value->>'lineNumber')::integer)
      FROM jsonb_array_elements(p_replacements) x(value))
    <>jsonb_array_length(p_replacements)
 THEN RAISE EXCEPTION 'invalid_revision_replacements' USING errcode='22023';END IF;

 FOR v_line IN SELECT value FROM jsonb_array_elements(p_replacements) LOOP
  IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_line) k(key)
      WHERE k.key NOT IN ('lineNumber','quoteId','itemId','evidence'))
   OR (v_line->>'lineNumber') !~ '^[1-9][0-9]*$'
   OR NOT (v_revision.invalidation->'affectedLineNumbers'
      @> jsonb_build_array((v_line->>'lineNumber')::integer))
   OR jsonb_typeof(v_line->'evidence') IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'invalid_revision_replacements' USING errcode='22023';END IF;
  SELECT * INTO v_prepared FROM sabora.prepare_customer_confirmation_line_candidate(
   p_session_hash,p_table_id,p_qr_token,p_visit_key,p_basket_id,
   (v_line->>'itemId')::uuid,(v_line->>'quoteId')::uuid);
  IF NOT FOUND OR v_prepared.available IS DISTINCT FROM true
    OR v_prepared.quote_evidence IS DISTINCT FROM v_line->'evidence'
    OR (v_line->'evidence'->>'publishedRevision')::bigint<>v_prepared.published_revision
  THEN RAISE EXCEPTION 'revision_quote_invalid' USING errcode='40001';END IF;
 END LOOP;

 FOR v_old_line,v_line_number IN
  SELECT x.value,x.ordinality::integer
  FROM jsonb_array_elements(v_revision.economic_snapshot->'lines')
   WITH ORDINALITY x(value,ordinality)
 LOOP
  SELECT x.value INTO v_line FROM jsonb_array_elements(p_replacements) x(value)
   WHERE (x.value->>'lineNumber')::integer=v_line_number;
  IF FOUND THEN
   IF jsonb_build_array(
      v_old_line->'evidence'->'basePriceCents',v_old_line->'evidence'->'selected',
      v_old_line->'evidence'->'discount',v_old_line->'evidence'->'unitSubtotalCents',
      v_old_line->'evidence'->'unitDiscountCents',v_old_line->'evidence'->'subtotalCents',
      v_old_line->'evidence'->'discountCents',v_old_line->'evidence'->'totalCents')
     IS DISTINCT FROM jsonb_build_array(
      v_line->'evidence'->'basePriceCents',v_line->'evidence'->'selected',
      v_line->'evidence'->'discount',v_line->'evidence'->'unitSubtotalCents',
      v_line->'evidence'->'unitDiscountCents',v_line->'evidence'->'subtotalCents',
      v_line->'evidence'->'discountCents',v_line->'evidence'->'totalCents') THEN
    v_economic_changed:=true;
   END IF;
   v_next_lines:=v_next_lines||jsonb_build_array(jsonb_build_object(
    'quoteId',v_line->>'quoteId','itemId',v_line->>'itemId','evidence',v_line->'evidence'));
  ELSE v_next_lines:=v_next_lines||jsonb_build_array(v_old_line);END IF;
 END LOOP;
 IF p_accepted_economic_change IS DISTINCT FROM v_economic_changed THEN
  RAISE EXCEPTION 'revision_acceptance_required' USING errcode='23514';END IF;
 v_next_snapshot:=jsonb_build_object('schemaVersion',1,'lines',v_next_lines);
 SELECT coalesce(sum((x.value->'evidence'->>'totalCents')::bigint),0)
  INTO v_amount FROM jsonb_array_elements(v_next_lines) x(value);
 v_difference:=v_amount-v_revision.amount_cents;
 IF v_round.payment_mode='pay_now' THEN
  SELECT * INTO v_payment FROM sabora.payment_attempts
   WHERE round_id=v_round.id FOR UPDATE;
  IF v_amount<>v_revision.amount_cents THEN
   RAISE EXCEPTION 'revision_payment_adjustment_required' USING errcode='23514';END IF;
 ELSIF v_round.payment_mode='pay_at_end' THEN
  IF v_difference<0 AND v_account.outstanding_cents<(-v_difference) THEN
   RAISE EXCEPTION 'revision_economic_reconciliation_required' USING errcode='23514';END IF;
  UPDATE sabora.customer_accounts SET outstanding_cents=outstanding_cents+v_difference,
   updated_at=clock_timestamp() WHERE id=v_account.id RETURNING * INTO v_account;
  v_direct_dispatch:=true;
 ELSIF v_round.payment_mode IS NULL AND v_amount=0 THEN
  v_direct_dispatch:=true;
 ELSE RAISE EXCEPTION 'revision_payment_mode_required' USING errcode='23514';END IF;

 UPDATE sabora.order_lines SET is_current_revision=false
  WHERE order_id=p_order_id AND revision_number=p_expected_revision
    AND is_current_revision;
 INSERT INTO sabora.order_revisions(order_id,round_id,account_id,revision_number,
  economic_snapshot,amount_cents,state)
 VALUES(p_order_id,v_round.id,v_round.account_id,p_expected_revision+1,
  v_next_snapshot,v_amount,'current');
 INSERT INTO sabora.order_lines(table_id,session_id,order_id,line_number,category,
  name,quantity,status,revision_number,is_current_revision)
 SELECT o.table_id,o.session_id,o.id,x.ordinality,
  CASE x.value->'evidence'->>'category' WHEN 'Bebidas' THEN 'drink'
   WHEN 'Primeros' THEN 'starter' WHEN 'Segundos' THEN 'main'
   WHEN 'Postres' THEN 'dessert' END,
  x.value->'evidence'->>'itemName',(x.value->'evidence'->>'quantity')::integer,
  'confirmed',p_expected_revision+1,true
 FROM sabora.orders o
 CROSS JOIN LATERAL jsonb_array_elements(v_next_lines) WITH ORDINALITY x(value,ordinality)
 WHERE o.id=p_order_id;
 SELECT d.table_id,d.session_id,d.visit_key INTO v_destination
 FROM sabora.order_round_delivery_destinations d WHERE d.round_id=v_round.id;
 INSERT INTO sabora.order_line_delivery_destinations(order_line_id,round_id,
  account_id,order_id,table_id,session_id,visit_key)
 SELECT l.id,v_round.id,v_round.account_id,p_order_id,
  v_destination.table_id,v_destination.session_id,v_destination.visit_key
 FROM sabora.order_lines l WHERE l.order_id=p_order_id
  AND l.revision_number=p_expected_revision+1 AND l.is_current_revision;
 UPDATE sabora.order_rounds SET revision_number=p_expected_revision+1,
  amount_cents=v_amount,payment_mode=CASE WHEN v_amount=0 THEN NULL ELSE payment_mode END,
  grouping_deadline=clock_timestamp(),
  state=CASE WHEN v_direct_dispatch THEN 'dispatch_requested'
    WHEN payment_mode='pay_now' THEN 'grouping' ELSE state END,
  updated_at=clock_timestamp() WHERE id=v_round.id RETURNING * INTO v_round;
 UPDATE sabora.kitchen_dispatches SET revision_number=p_expected_revision+1,
  dispatch_key='h6_dispatch_'||replace(p_order_id::text,'-','_')||'_r'||(p_expected_revision+1)::text,
  state=CASE WHEN v_direct_dispatch THEN 'requested' ELSE 'blocked' END,
  requested_at=CASE WHEN v_direct_dispatch THEN clock_timestamp() ELSE NULL END,
  acknowledged_at=NULL,failure_code=NULL,updated_at=clock_timestamp()
  WHERE id=v_dispatch.id RETURNING * INTO v_dispatch;
 IF v_direct_dispatch THEN
  PERFORM sabora.emit_h6_event_candidate(v_destination.table_id,v_destination.session_id,
   NULL,NULL,NULL,'kitchen','kitchen','sabora.kitchen.dispatch_requested',
   v_dispatch.id,p_expected_revision+1,jsonb_build_object('orderId',p_order_id,
    'roundId',v_round.id,'dispatchId',v_dispatch.id,
    'revisionNumber',p_expected_revision+1));
 END IF;
 PERFORM sabora.emit_h6_event_candidate(v_destination.table_id,v_destination.session_id,
  v_destination.visit_key,v_customer,v_round.account_id,NULL,'customer',
  'sabora.order.revision_submitted',(SELECT id FROM sabora.order_revisions
    WHERE round_id=v_round.id AND revision_number=p_expected_revision+1),
  p_expected_revision+1,jsonb_build_object('orderId',p_order_id,'roundId',v_round.id,
   'revisionNumber',p_expected_revision+1,'amountCents',v_amount,
   'differenceCents',v_difference,'dispatchState',v_dispatch.state));
 v_result:=jsonb_build_object('version',1,'orderId',p_order_id,'roundId',v_round.id,
  'revisionNumber',p_expected_revision+1,'amountCents',v_amount,
  'differenceCents',v_difference,'state',v_round.state,'dispatchId',v_dispatch.id,
  'dispatchState',v_dispatch.state,'captureRequired',
   (v_round.payment_mode='pay_now' AND v_payment.state='authorized'));
 INSERT INTO sabora.order_revision_requests(order_id,customer_id,request_key,
  request_fingerprint,from_revision,to_revision,accepted_economic_change,result)
 VALUES(p_order_id,v_customer,p_request_key,v_fingerprint,p_expected_revision,
  p_expected_revision+1,p_accepted_economic_change,v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'invalid_customer_revision_request' USING errcode='22023';
END;
$resubmit_revision$;
ALTER FUNCTION sabora.resubmit_customer_order_revision_h6_candidate(
 bytea,uuid,text,text,text,uuid,integer,text,jsonb,boolean)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.resubmit_customer_order_revision_h6_candidate(
 bytea,uuid,text,text,text,uuid,integer,text,jsonb,boolean)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,
      sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.resubmit_customer_order_revision_h6_candidate(
 bytea,uuid,text,text,text,uuid,integer,text,jsonb,boolean)
 TO sabora_h6_customer_runtime;

-- Catalogue availability is a separate signed operation.  Adding the action
-- does not broaden the login: the runtime still has no direct relation access.
ALTER TABLE sabora.h6_action_requests DROP CONSTRAINT h6_action_requests_action_check;
ALTER TABLE sabora.h6_action_requests ADD CONSTRAINT h6_action_requests_action_check
 CHECK(action IN ('report_incident','resolve_incident','settle_cash','refund_cash',
  'ack_dispatch','claim_pickup','cancel_pickup','correct_ready','close_account',
  'set_catalog_sold_out'));

CREATE OR REPLACE FUNCTION sabora.verify_h6_staff_capability_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_action text,p_target_id uuid,p_correlation_id text,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $verify_staff$
DECLARE v_key bytea;v_key_expiry timestamptz;v_role text;v_payload text;v_expected text;v_now bigint;
BEGIN
 v_now:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF p_key_id !~ '^[A-Za-z0-9_-]{8,64}$' OR p_database_role IS DISTINCT FROM session_user
   OR p_actor_user_id IS NULL OR p_staff_role NOT IN ('admin','waiter','kitchen','root')
   OR p_action NOT IN ('report_incident','resolve_incident','settle_cash','refund_cash',
                      'ack_dispatch','read_events','close_account','set_catalog_sold_out')
   OR p_target_id IS NULL OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
   OR p_issued_at_ms>v_now+5000 OR p_issued_at_ms<v_now-60000
   OR p_expires_at_ms<=v_now OR p_expires_at_ms>p_issued_at_ms+60000
   OR p_signature_hex !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501';END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_key_expiry
  FROM sabora.order_operation_signing_keys k WHERE k.key_id=p_key_id
   AND k.disabled_at IS NULL AND k.not_before<=clock_timestamp()
   AND k.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501';END IF;
 SELECT m.role INTO v_role FROM sabora.staff_members m
  WHERE m.user_id=p_actor_user_id AND m.state='active' FOR UPDATE;
 IF NOT FOUND OR v_role IS DISTINCT FROM p_staff_role THEN
  RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501';END IF;
 v_payload:='h6-v1'||chr(10)||p_database_role||chr(10)||p_actor_user_id::text||chr(10)
  ||p_staff_role||chr(10)||p_action||chr(10)||p_target_id::text||chr(10)
  ||p_correlation_id||chr(10)||p_issued_at_ms::text||chr(10)||p_expires_at_ms::text;
 v_expected:=encode(extensions.hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
 IF length(v_expected)<>length(p_signature_hex)
  OR extensions.hmac(convert_to(v_expected,'UTF8'),convert_to('sabora-h6-capability-compare','UTF8'),'sha256')
   <>extensions.hmac(convert_to(p_signature_hex,'UTF8'),convert_to('sabora-h6-capability-compare','UTF8'),'sha256')
 THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501';END IF;
 RETURN v_role;
END;
$verify_staff$;
ALTER FUNCTION sabora.verify_h6_staff_capability_candidate(text,text,uuid,text,text,uuid,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.verify_h6_staff_capability_candidate(text,text,uuid,text,text,uuid,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.verify_h6_staff_capability_candidate(text,text,uuid,text,text,uuid,text,bigint,bigint,text)
 TO sabora_h6_fn_owner;

CREATE FUNCTION sabora.set_catalog_sold_out_h6_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_item_id uuid,p_sold_out boolean,p_correlation_id text,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $set_sold_out$
DECLARE v_role text;v_item record;v_existing record;
 v_fingerprint bytea;v_result jsonb;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,
  p_actor_user_id,p_staff_role,'set_catalog_sold_out',p_item_id,p_correlation_id,
  p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('kitchen','admin','root') THEN
  RAISE EXCEPTION 'catalog_availability_forbidden' USING errcode='42501';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_actor_user_id::text||':'||p_correlation_id,0));
 v_fingerprint:=sha256(convert_to('set_catalog_sold_out:'||p_item_id::text||':'||p_sold_out::text,'UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests
  WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.action<>'set_catalog_sold_out' OR v_existing.fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505';END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT id,published_revision,withdrawn_at,sold_out INTO v_item
  FROM sabora.catalog_items WHERE id=p_item_id FOR UPDATE;
 IF NOT FOUND OR v_item.published_revision IS NULL OR v_item.withdrawn_at IS NOT NULL THEN
  RAISE EXCEPTION 'catalog_item_not_found' USING errcode='P0002';END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501';END IF;
 UPDATE sabora.catalog_items SET sold_out=p_sold_out WHERE id=p_item_id
  RETURNING id,published_revision,sold_out INTO v_item;
 v_result:=jsonb_build_object('version',1,'itemId',v_item.id,'soldOut',v_item.sold_out,
  'publishedRevision',v_item.published_revision);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'set_catalog_sold_out',v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$set_sold_out$;
ALTER FUNCTION sabora.set_catalog_sold_out_h6_candidate(
 text,text,uuid,text,uuid,boolean,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.set_catalog_sold_out_h6_candidate(
 text,text,uuid,text,uuid,boolean,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.set_catalog_sold_out_h6_candidate(
 text,text,uuid,text,uuid,boolean,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;

-- Kitchen reads only the current revision after an actual dispatch request.
-- Old immutable lines remain available to audit/history functions, but cannot
-- reappear on the active board or be moved through the preparation lifecycle.
GRANT SELECT(id,order_id,revision_number) ON sabora.order_rounds
 TO sabora_order_operations_fn_owner;
GRANT SELECT(round_id,order_id,revision_number,state) ON sabora.kitchen_dispatches
 TO sabora_order_operations_fn_owner;
GRANT SELECT(round_id,revision_number,state) ON sabora.order_revisions
 TO sabora_order_operations_fn_owner;
GRANT SELECT(revision_number,is_current_revision) ON sabora.order_lines
 TO sabora_order_operations_fn_owner;
CREATE POLICY order_operations_order_rounds_revision_read ON sabora.order_rounds
 FOR SELECT TO sabora_order_operations_fn_owner USING (true);
CREATE POLICY order_operations_kitchen_dispatch_revision_read ON sabora.kitchen_dispatches
 FOR SELECT TO sabora_order_operations_fn_owner USING (true);
CREATE POLICY order_operations_order_revisions_read ON sabora.order_revisions
 FOR SELECT TO sabora_order_operations_fn_owner USING (true);

CREATE OR REPLACE FUNCTION sabora.enforce_h6_dispatch_before_preparation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $prepare_fence$
BEGIN
 IF OLD.status='confirmed' AND NEW.status='preparing' THEN
  -- The H4 operational contract predates H6 and legitimately has no economic
  -- snapshot or kitchen-dispatch ledger.  Fence only schema-v1 H6 revisions;
  -- every such revision must have an acknowledged dispatch before preparation.
  PERFORM 1 FROM sabora.order_rounds r
   JOIN sabora.order_revisions v ON v.round_id=r.id
    AND v.revision_number=r.revision_number
   WHERE r.order_id=OLD.order_id AND OLD.is_current_revision
    AND OLD.revision_number=r.revision_number
    AND v.economic_snapshot->>'schemaVersion'='1';
  IF FOUND THEN
   PERFORM 1 FROM sabora.order_rounds r
    JOIN sabora.kitchen_dispatches d ON d.round_id=r.id
    JOIN sabora.order_revisions v ON v.round_id=r.id
     AND v.revision_number=r.revision_number
    WHERE r.order_id=OLD.order_id AND d.order_id=OLD.order_id
     AND d.revision_number=r.revision_number AND d.state='acknowledged'
     AND v.state='acknowledged' AND OLD.is_current_revision
     AND OLD.revision_number=r.revision_number;
   IF NOT FOUND THEN
    RAISE EXCEPTION 'kitchen_dispatch_not_acknowledged' USING errcode='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$prepare_fence$;
ALTER FUNCTION sabora.enforce_h6_dispatch_before_preparation() OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.enforce_h6_dispatch_before_preparation()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_provider_runtime,sabora_h6_operations_runtime;

-- Active work is projected only from the current, dispatched revision.  A
-- legacy picked-up row remains readable as immutable waiter/admin history even
-- when it predates the H6 dispatch and revision ledgers.
CREATE OR REPLACE FUNCTION sabora.read_order_operations_delivery_pickup_board_h6_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_status text,p_after_confirmed_at_ms bigint,p_after_order_id uuid,
 p_after_line_number integer,p_limit integer,p_issued_at_ms bigint,
 p_expires_at_ms bigint,p_signature_hex text
)
RETURNS TABLE(
 order_id uuid,line_id uuid,table_number integer,customer_label text,
 confirmed_at timestamptz,"grouping" text,line_number integer,
 category text,name text,quantity integer,status text,
 notification_id uuid,notification_created_at timestamptz,
 notification_acknowledged_at timestamptz,
 pickup_task_id uuid,pickup_state text,pickup_version bigint,
 pickup_claimed_by uuid,pickup_claimed_display_id text,
 pickup_claimed_at timestamptz,pickup_updated_at timestamptz,
 delivery_table_id uuid,delivery_session_id uuid,delivery_visit_key text,
 delivery_version bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $board_delivery_pickup$
DECLARE v_scope text;v_after timestamptz;
BEGIN
 IF p_staff_role NOT IN ('admin','waiter','kitchen')
 OR (p_status IS NOT NULL AND p_status NOT IN ('confirmed','preparing','ready','picked_up'))
 OR (p_staff_role='kitchen' AND p_status='picked_up')
 OR (p_staff_role='waiter' AND p_status IN ('confirmed','preparing'))
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
 OR NOT ((p_after_confirmed_at_ms IS NULL AND p_after_order_id IS NULL
 AND p_after_line_number IS NULL) OR
 (p_after_confirmed_at_ms IS NOT NULL AND p_after_confirmed_at_ms>=0
 AND p_after_order_id IS NOT NULL AND p_after_line_number>0))
 THEN RAISE EXCEPTION 'invalid_order_operations_scope' USING errcode='42501';END IF;
 v_scope:='status='||coalesce(p_status,'*')||
 ';after_ms='||coalesce(p_after_confirmed_at_ms::text,'*')||
 ';after_order='||coalesce(lower(p_after_order_id::text),'*')||
 ';after_line='||coalesce(p_after_line_number::text,'*')||
 ';limit='||p_limit::text;
 PERFORM sabora.authorize_order_operation_read_candidate(
  p_key_id,p_database_role,p_actor_user_id,p_staff_role,'board',v_scope,
  p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF p_after_confirmed_at_ms IS NOT NULL THEN
  v_after:=to_timestamp(p_after_confirmed_at_ms::numeric/1000);
 END IF;
 RETURN QUERY
 SELECT o.id,l.id,dt.number,coalesce(o.customer_alias,o.company),
  o.confirmed_at,o.grouping,l.line_number,l.category,l.name,l.quantity,l.status,
  coalesce(tn.id,ln.id),coalesce(tn.created_at,ln.created_at),
  coalesce(tn.acknowledged_at,ln.acknowledged_at),
  pt.id,pt.state,pt.version,pt.claimed_by,pt.claimed_display_id,
  pt.claimed_at,pt.updated_at,
  coalesce(dest.table_id,l.table_id),coalesce(dest.session_id,l.session_id),
  dest.visit_key,coalesce(dest.destination_version,1::bigint)
 FROM sabora.order_lines l
 JOIN sabora.orders o ON o.id=l.order_id
 LEFT JOIN sabora.order_rounds r ON r.order_id=o.id
  AND r.revision_number=l.revision_number
 LEFT JOIN sabora.kitchen_dispatches kd ON kd.round_id=r.id
  AND kd.revision_number=r.revision_number
  AND kd.state IN ('requested','acknowledged')
 LEFT JOIN sabora.order_revisions rv ON rv.round_id=r.id
  AND rv.revision_number=r.revision_number
  AND rv.state IN ('dispatch_requested','acknowledged')
 LEFT JOIN sabora.order_line_delivery_destinations dest ON dest.order_line_id=l.id
 JOIN sabora.dining_tables dt ON dt.id=coalesce(dest.table_id,l.table_id)
 LEFT JOIN sabora.pickup_tasks pt ON pt.order_line_id=l.id
 LEFT JOIN sabora.pickup_notifications tn ON tn.id=pt.notification_id
   AND pt.state IN ('ready','claimed')
 LEFT JOIN LATERAL(SELECT n.id,n.created_at,n.acknowledged_at
  FROM sabora.pickup_notifications n WHERE pt.id IS NULL
   AND n.order_line_id=l.id ORDER BY n.created_at DESC,n.id DESC LIMIT 1) ln ON true
 WHERE (l.status='picked_up' OR
  (l.is_current_revision AND kd.state IS NOT NULL AND rv.state IS NOT NULL))
 AND (dest.order_line_id IS NOT NULL OR l.status='picked_up')
 AND (p_staff_role='admin' OR
  (p_staff_role='kitchen' AND l.status IN ('confirmed','preparing','ready')) OR
  (p_staff_role='waiter' AND l.status IN ('ready','picked_up')))
 AND (p_status IS NULL OR l.status=p_status)
 AND (v_after IS NULL OR (o.confirmed_at,o.id,l.line_number)>
  (v_after,p_after_order_id,p_after_line_number))
 ORDER BY o.confirmed_at,o.id,l.line_number LIMIT p_limit+1;
END;
$board_delivery_pickup$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_order_operations_fn_owner;
GRANT sabora_order_operations_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_order_operations_delivery_pickup_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 OWNER TO sabora_order_operations_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_order_operations_delivery_pickup_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_staff_reader,sabora_admin_writer,
      sabora_h6_operations_runtime;

-- Scheduler discovery excludes invalidated revisions.  The BEFORE dispatch
-- trigger remains the final fence if invalidation races a previously listed
-- deadline.
CREATE OR REPLACE FUNCTION sabora.list_schedulable_h6_rounds_candidate(p_limit integer)
RETURNS TABLE(order_id uuid,grouping_deadline timestamptz,server_now timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $schedule$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_h6_dispatch_limit' USING errcode='22023';END IF;
 RETURN QUERY SELECT r.order_id,r.grouping_deadline,clock_timestamp()
 FROM sabora.order_rounds r
 JOIN sabora.kitchen_dispatches d ON d.round_id=r.id
 JOIN sabora.customer_accounts a ON a.id=r.account_id
 JOIN sabora.order_revisions v ON v.round_id=r.id
  AND v.revision_number=r.revision_number AND v.state='current'
 WHERE r.state IN ('grouping','free_grouping') AND d.state='blocked'
  AND d.revision_number=r.revision_number AND a.state='open'
  AND (r.payment_mode IS DISTINCT FROM 'pay_now' OR EXISTS(
   SELECT 1 FROM sabora.payment_attempts p
    WHERE p.round_id=r.id AND p.state='authorized'))
 ORDER BY r.grouping_deadline,r.id LIMIT p_limit;
END;
$schedule$;
ALTER FUNCTION sabora.list_schedulable_h6_rounds_candidate(integer)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.list_schedulable_h6_rounds_candidate(integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.list_schedulable_h6_rounds_candidate(integer)
 TO sabora_h6_provider_runtime;

-- Older H6 provider/ACK functions emitted a literal revision 1.  Preserve
-- their state-version semantics while deriving the customer-visible revision
-- from the locked dispatch row.  The durable event therefore cannot claim an
-- obsolete revision after a pay-now correction or kitchen acknowledgement.
CREATE FUNCTION sabora.bind_dispatch_event_revision_h6_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $bind_dispatch_revision$
DECLARE v_revision integer;
BEGIN
 IF NEW.event_type IN ('sabora.kitchen.dispatch_requested',
                       'sabora.kitchen.dispatch_acknowledged') THEN
  SELECT d.revision_number INTO v_revision FROM sabora.kitchen_dispatches d
   WHERE d.id=NEW.aggregate_id;
  IF FOUND THEN
   NEW.payload:=jsonb_set(NEW.payload,'{revisionNumber}',to_jsonb(v_revision),true);
  END IF;
 END IF;
 RETURN NEW;
END;
$bind_dispatch_revision$;
ALTER FUNCTION sabora.bind_dispatch_event_revision_h6_candidate()
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.bind_dispatch_event_revision_h6_candidate()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
      sabora_h6_provider_runtime,sabora_h6_operations_runtime;
CREATE TRIGGER h6_bind_dispatch_event_revision
 BEFORE INSERT ON sabora.event_outbox FOR EACH ROW
 EXECUTE FUNCTION sabora.bind_dispatch_event_revision_h6_candidate();

REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;
REVOKE sabora_order_operations_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_order_operations_fn_owner;
COMMIT;
