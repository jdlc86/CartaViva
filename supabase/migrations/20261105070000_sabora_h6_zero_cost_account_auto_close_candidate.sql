-- H6 zero-cost account lifecycle candidate. A complimentary round never
-- selects a payment mode. Its economic account stays open for the whole live
-- visit so a later positive round can reuse it; only the occupancy boundary
-- may close a fully resolved account whose complete history is zero-cost.
-- No worker, provider call or production activation is introduced here.
BEGIN;

-- Closure provenance must distinguish a signed staff decision from the
-- automatic business rule without fabricating a staff actor. The generated
-- column also classifies rows created by the pre-existing signed close RPC.
ALTER TABLE sabora.customer_accounts
 ADD COLUMN close_origin text GENERATED ALWAYS AS (
  CASE WHEN closed_at IS NULL THEN NULL
       WHEN closed_by IS NULL THEN 'system_zero_cost'
       ELSE 'staff' END
 ) STORED,
 DROP CONSTRAINT h6_account_close_fields_consistent,
 ADD CONSTRAINT h6_account_close_fields_consistent CHECK (
  (closed_at IS NULL AND closed_by IS NULL AND close_correlation_id IS NULL
    AND close_origin IS NULL)
  OR
  (closed_at IS NOT NULL AND close_correlation_id IS NOT NULL
    AND state='settled' AND (
      (closed_by IS NOT NULL AND close_origin='staff')
      OR
      (closed_by IS NULL AND close_origin='system_zero_cost'
       AND close_correlation_id ~ '^zero_cost_[0-9a-f]{32}$')
    ))
 );

COMMENT ON COLUMN sabora.customer_accounts.close_origin IS
 'Generated closure provenance: signed staff actor or automatic fully-resolved zero-cost occupancy close';

-- Internal predicate/effect. It is intentionally not executable by any
-- application runtime. The table-close trigger is the only automatic caller.
-- The caller already owns the dining-table row lock; locking the account here
-- serializes against cash, explicit close and transfer decisions.
CREATE FUNCTION sabora.try_auto_close_zero_cost_account_h6_candidate(
 p_account_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $auto_close$
DECLARE
 v_account sabora.customer_accounts%ROWTYPE;
 v_binding sabora.customer_account_operational_bindings%ROWTYPE;
 v_closed_at timestamptz;
 v_correlation text;
BEGIN
 IF p_account_id IS NULL THEN RETURN false; END IF;

 SELECT * INTO v_account FROM sabora.customer_accounts a
  WHERE a.id=p_account_id FOR UPDATE;
 IF NOT FOUND OR v_account.state<>'open' OR v_account.outstanding_cents<>0
   OR v_account.payment_mode IS NOT NULL THEN RETURN false; END IF;

 SELECT * INTO v_binding FROM sabora.customer_account_operational_bindings b
  WHERE b.account_id=p_account_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;

 -- Active occupancy means that a later positive order must still be able to
 -- reuse this account and select the table's approved payment policy.
 PERFORM 1 FROM sabora.dining_tables t
  WHERE t.id=v_binding.table_id AND t.session_id=v_binding.session_id
    AND t.ordering_state IN ('open','paused');
 IF FOUND THEN RETURN false; END IF;

 -- "Outstanding = 0" is never enough: at least one round must exist and the
 -- entire durable account history must be intrinsically zero-cost. A paid,
 -- refunded or cash-settled account can therefore never enter this path.
 IF NOT EXISTS(SELECT 1 FROM sabora.order_rounds r
      WHERE r.account_id=p_account_id)
   OR EXISTS(SELECT 1 FROM sabora.order_rounds r
      WHERE r.account_id=p_account_id AND r.amount_cents<>0)
   OR EXISTS(SELECT 1 FROM sabora.payment_attempts p
      WHERE p.account_id=p_account_id)
   OR EXISTS(SELECT 1 FROM sabora.cash_settlements c
      WHERE c.account_id=p_account_id)
 THEN RETURN false; END IF;

 -- Every round is either acknowledged by kitchen or durably cancelled.
 -- Cancellation does not invent physical delivery. An acknowledged round
 -- requires its actual dispatch and each line must be READY with a durable
 -- pickup task (or retain the distinct historical picked_up state).
 IF EXISTS(SELECT 1 FROM sabora.order_rounds r
      WHERE r.account_id=p_account_id
        AND r.state NOT IN ('kitchen_acknowledged','cancelled'))
   OR EXISTS(SELECT 1 FROM sabora.order_rounds r
      LEFT JOIN sabora.kitchen_dispatches d ON d.round_id=r.id
      WHERE r.account_id=p_account_id AND (
       (r.state='kitchen_acknowledged' AND d.state IS DISTINCT FROM 'acknowledged')
       OR
       (r.state='cancelled' AND (d.id IS NULL
         OR d.state NOT IN ('blocked','failed','acknowledged')))
      ))
   OR EXISTS(SELECT 1 FROM sabora.order_rounds r
      JOIN sabora.order_lines l ON l.order_id=r.order_id
      WHERE r.account_id=p_account_id AND r.state='kitchen_acknowledged'
        AND (l.status NOT IN ('ready','picked_up')
          OR (l.status='ready' AND NOT EXISTS(
            SELECT 1 FROM sabora.pickup_tasks task
             WHERE task.order_line_id=l.id
               AND task.state IN ('ready','claimed')))))
   OR EXISTS(SELECT 1 FROM sabora.incident_cases i
      JOIN sabora.order_rounds r ON r.id=i.round_id
      WHERE r.account_id=p_account_id
        AND i.state NOT IN ('adjusted','rejected_customer_request','resolved'))
   OR EXISTS(SELECT 1 FROM sabora.refund_attempts f
      JOIN sabora.payment_attempts p ON p.id=f.payment_attempt_id
      WHERE p.account_id=p_account_id AND f.state<>'succeeded')
 THEN RETURN false; END IF;

 v_closed_at:=clock_timestamp();
 v_correlation:='zero_cost_'||replace(p_account_id::text,'-','');
 UPDATE sabora.customer_accounts SET state='settled',closed_at=v_closed_at,
  closed_by=NULL,close_correlation_id=v_correlation,updated_at=v_closed_at
  WHERE id=p_account_id AND state='open' RETURNING * INTO v_account;
 IF NOT FOUND THEN RETURN false; END IF;

 -- The account is terminal, so outstanding move grants become unusable while
 -- their original approval audit fields remain intact.
 UPDATE sabora.customer_table_change_requests SET status='revoked',
  revoked_at=v_closed_at WHERE account_id=p_account_id AND status='pending';
 UPDATE sabora.customer_table_change_requests SET revoked_at=v_closed_at
  WHERE account_id=p_account_id AND status='approved' AND revoked_at IS NULL;

 PERFORM sabora.emit_h6_event_candidate(
  v_binding.table_id,v_binding.session_id,v_binding.visit_key,
  v_account.customer_id,v_account.id,NULL,'customer',
  'sabora.account.closed',v_account.id,1,
  jsonb_build_object('accountId',v_account.id,'state','settled',
   'outstandingCents',0,'closeOrigin','system_zero_cost',
   'resolution','business_resolved','deliveryConfirmed',false));
 RETURN true;
END;
$auto_close$;
ALTER FUNCTION sabora.try_auto_close_zero_cost_account_h6_candidate(uuid)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.try_auto_close_zero_cost_account_h6_candidate(uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
  sabora_h6_customer_runtime,sabora_h6_operations_runtime,
  sabora_h6_provider_runtime,sabora_h6_account_close_runtime;

CREATE FUNCTION sabora.auto_close_zero_cost_accounts_on_occupancy_h6_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $occupancy_auto_close$
DECLARE v_account_id uuid;
BEGIN
 IF OLD.ordering_state<>'closed' AND NEW.ordering_state='closed' THEN
  FOR v_account_id IN
   SELECT b.account_id FROM sabora.customer_account_operational_bindings b
   JOIN sabora.customer_accounts a ON a.id=b.account_id
   WHERE b.table_id=NEW.id AND b.session_id=OLD.session_id AND a.state='open'
   ORDER BY b.account_id
  LOOP
   PERFORM sabora.try_auto_close_zero_cost_account_h6_candidate(v_account_id);
  END LOOP;
 END IF;
 RETURN NEW;
END;
$occupancy_auto_close$;
ALTER FUNCTION sabora.auto_close_zero_cost_accounts_on_occupancy_h6_candidate()
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.auto_close_zero_cost_accounts_on_occupancy_h6_candidate()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
  sabora_h6_customer_runtime,sabora_h6_operations_runtime,
  sabora_h6_provider_runtime,sabora_h6_account_close_runtime;

CREATE TRIGGER sabora_h6_zero_cost_account_auto_close
 AFTER UPDATE OF ordering_state ON sabora.dining_tables
 FOR EACH ROW
 WHEN (OLD.ordering_state<>'closed' AND NEW.ordering_state='closed')
 EXECUTE FUNCTION sabora.auto_close_zero_cost_accounts_on_occupancy_h6_candidate();

-- Keep H6 confirmation's customer-advisory -> account/binding -> table order.
-- Before a staff close takes the table row, acquire the same advisory fences
-- for every currently bound account in deterministic customer order. This
-- prevents the new AFTER trigger from inverting confirmation's lock order.
CREATE OR REPLACE FUNCTION sabora.transition_table_ordering_candidate(
 p_actor uuid,p_table uuid,p_target text,p_pause_until timestamptz DEFAULT NULL)
RETURNS TABLE(table_id uuid,ordering_state text,session_id uuid,changed_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,sabora
AS $table_transition$
DECLARE v_role text;v_state text;v_deadline timestamptz;v_preview_session uuid;
 v_locked_session uuid;v_customer uuid;
BEGIN
 IF p_actor IS NULL OR p_table IS NULL OR p_target IS NULL
    OR p_target NOT IN ('open','paused','closed') THEN
  RAISE EXCEPTION 'invalid_table_transition' USING ERRCODE='22023';
 END IF;
 SELECT m.role INTO v_role FROM sabora.staff_members m
 WHERE m.user_id=p_actor AND m.state='active' FOR SHARE;
 IF NOT FOUND OR v_role NOT IN ('waiter','admin','root') THEN
  RAISE EXCEPTION 'staff_not_authorized' USING ERRCODE='42501';
 END IF;

 IF p_target='closed' THEN
  SELECT t.session_id INTO v_preview_session FROM sabora.dining_tables t
   WHERE t.id=p_table;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found' USING ERRCODE='P0002'; END IF;
  FOR v_customer IN
   SELECT DISTINCT a.customer_id
   FROM sabora.customer_account_operational_bindings b
   JOIN sabora.customer_accounts a ON a.id=b.account_id AND a.state='open'
   WHERE b.table_id=p_table AND b.session_id=v_preview_session
   ORDER BY a.customer_id
  LOOP
   PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_customer::text,140630));
  END LOOP;
 END IF;

 SELECT t.ordering_state,t.session_id INTO v_state,v_locked_session
 FROM sabora.dining_tables t
 WHERE t.id=p_table FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found' USING ERRCODE='P0002'; END IF;
 IF p_target='closed' AND v_locked_session IS DISTINCT FROM v_preview_session THEN
  RAISE EXCEPTION 'table_transition_scope_changed' USING ERRCODE='40001';
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
END;
$table_transition$;
REVOKE ALL ON FUNCTION sabora.transition_table_ordering_candidate(uuid,uuid,text,timestamptz)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_h6_customer_runtime,sabora_h6_operations_runtime,
  sabora_h6_provider_runtime,sabora_h6_account_close_runtime;

COMMIT;
