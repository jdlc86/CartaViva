-- One-restaurante, candidate-only; no live migrations or external Stripe calls.
-- Durable, append-only timeline for captured charge/refund acknowledgements.
-- Historical charge dates cannot safely be synthesized from mutable updated_at.
BEGIN;
CREATE TABLE sabora.finance_provider_events_candidate (
 kind text NOT NULL CHECK (kind IN ('capture','refund')),
 source_id uuid NOT NULL,
 account_id uuid NOT NULL REFERENCES sabora.customer_accounts(id),
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(kind,source_id)
);
ALTER TABLE sabora.finance_provider_events_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.finance_provider_events_candidate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.finance_provider_events_candidate
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
 sabora_h6_customer_runtime,sabora_h6_provider_runtime,sabora_h6_operations_runtime,
 sabora_m3_tables_runtime,sabora_m3_catalog_runtime;
GRANT SELECT ON sabora.finance_provider_events_candidate TO sabora_m3_management_fn_owner;
GRANT INSERT ON sabora.finance_provider_events_candidate TO sabora_h6_fn_owner;
CREATE POLICY finance_events_h6_insert_candidate ON sabora.finance_provider_events_candidate
 FOR INSERT TO sabora_h6_fn_owner WITH CHECK(true);
CREATE POLICY finance_events_m3_read_candidate ON sabora.finance_provider_events_candidate
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE FUNCTION sabora.append_finance_provider_event_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 -- Different ledger tables have different rowtypes. Never evaluate
 -- NEW.provider_charge_id on refund_attempts, even in an AND expression.
 IF TG_TABLE_NAME='payment_attempts' THEN
  IF NEW.state IN ('captured','refund_required') AND NEW.provider_charge_id IS NOT NULL
     AND (OLD.state IS DISTINCT FROM NEW.state OR OLD.provider_charge_id IS DISTINCT FROM NEW.provider_charge_id)
  THEN
   INSERT INTO sabora.finance_provider_events_candidate(kind,source_id,account_id,amount_cents)
   VALUES('capture',NEW.id,NEW.account_id,NEW.amount_cents) ON CONFLICT DO NOTHING;
  END IF;
 ELSIF TG_TABLE_NAME='refund_attempts' THEN
  IF NEW.state='succeeded' AND OLD.state IS DISTINCT FROM NEW.state THEN
   INSERT INTO sabora.finance_provider_events_candidate(kind,source_id,account_id,amount_cents)
   SELECT 'refund',NEW.id,p.account_id,NEW.amount_cents
   FROM sabora.payment_attempts p WHERE p.id=NEW.payment_attempt_id
   ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 RETURN NEW;
END;
$fn$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;
GRANT sabora_h6_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.append_finance_provider_event_candidate()
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.append_finance_provider_event_candidate()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,
  sabora_h6_provider_runtime,sabora_h6_operations_runtime,sabora_m3_catalog_runtime;
CREATE TRIGGER append_finance_capture_candidate
 AFTER UPDATE OF state,provider_charge_id ON sabora.payment_attempts
 FOR EACH ROW EXECUTE FUNCTION sabora.append_finance_provider_event_candidate();
CREATE TRIGGER append_finance_refund_candidate
 AFTER UPDATE OF state ON sabora.refund_attempts
 FOR EACH ROW EXECUTE FUNCTION sabora.append_finance_provider_event_candidate();
CREATE TRIGGER finance_event_no_change_candidate
 BEFORE UPDATE OR DELETE ON sabora.finance_provider_events_candidate
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER finance_event_no_truncate_candidate
 BEFORE TRUNCATE ON sabora.finance_provider_events_candidate
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_h6_history_mutation();

-- Sealed M3 catalog login continues to expose ONLY exact RPCs.
CREATE OR REPLACE FUNCTION sabora.verify_management_capability_m3(p_capability jsonb,p_body text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $verify_management$
DECLARE v_key bytea;v_role text;v_payload text;v_expected text;v_now bigint;
BEGIN
 v_now:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF jsonb_typeof(p_capability) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(p_capability))<>10
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_capability) k(key) WHERE k.key NOT IN
    ('keyId','databaseRole','actorId','staffRole','action','requestId','bodyHashHex',
     'issuedAtMs','expiresAtMs','signatureHex'))
  OR (p_capability->>'keyId') !~ '^[A-Za-z0-9_-]{8,64}$'
  OR (p_capability->>'databaseRole') IS DISTINCT FROM session_user
  OR (p_capability->>'actorId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR p_capability->>'staffRole' NOT IN ('admin','root','waiter')
  OR p_capability->>'action' NOT IN
    ('tables.read','table.create','table.update','table.readiness','table.qr_rotate',
     'table.qr_revoke','table.occupancy','catalog.read','catalog.category_create',
     'catalog.category_reorder','catalog.category_visibility','catalog.item_save',
     'catalog.item_publish','catalog.item_withdraw','finance.read')
  OR (p_capability->>'requestId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR (p_capability->>'bodyHashHex') !~ '^[0-9a-f]{64}$'
  OR p_body IS NULL OR octet_length(convert_to(p_body,'UTF8'))>65536
  OR encode(extensions.digest(convert_to(p_body,'UTF8'),'sha256'),'hex')
      IS DISTINCT FROM p_capability->>'bodyHashHex'
  OR (p_capability->>'issuedAtMs') !~ '^(0|[1-9][0-9]*)$'
  OR (p_capability->>'expiresAtMs') !~ '^(0|[1-9][0-9]*)$'
  OR (p_capability->>'issuedAtMs')::bigint>v_now+5000
  OR (p_capability->>'issuedAtMs')::bigint<v_now-60000
  OR (p_capability->>'expiresAtMs')::bigint<=v_now
  OR (p_capability->>'expiresAtMs')::bigint>(p_capability->>'issuedAtMs')::bigint+60000
  OR (p_capability->>'signatureHex') !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501';
 END IF;
 SELECT k.hmac_key INTO v_key FROM sabora.order_operation_signing_keys k
  WHERE k.key_id=p_capability->>'keyId' AND k.disabled_at IS NULL
   AND k.not_before<=clock_timestamp() AND k.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 SELECT m.role INTO v_role FROM sabora.staff_members m
  WHERE m.user_id=(p_capability->>'actorId')::uuid AND m.state='active' FOR UPDATE;
 IF NOT FOUND OR v_role IS DISTINCT FROM p_capability->>'staffRole' THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 v_payload:='m3-management-v1'||chr(10)||(p_capability->>'databaseRole')||chr(10)
  ||(p_capability->>'actorId')||chr(10)||(p_capability->>'staffRole')||chr(10)
  ||(p_capability->>'action')||chr(10)||(p_capability->>'requestId')||chr(10)
  ||(p_capability->>'bodyHashHex')||chr(10)||(p_capability->>'issuedAtMs')||chr(10)
  ||(p_capability->>'expiresAtMs');
 v_expected:=encode(extensions.hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
 IF length(v_expected)<>length(p_capability->>'signatureHex')
  OR extensions.hmac(convert_to(v_expected,'UTF8'),
       convert_to('sabora-m3-capability-compare','UTF8'),'sha256')
     <>extensions.hmac(convert_to(p_capability->>'signatureHex','UTF8'),
       convert_to('sabora-m3-capability-compare','UTF8'),'sha256') THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501';
 END IF;
 RETURN v_role;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501';
END;
$verify_management$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_m3_management_fn_owner;
GRANT sabora_m3_management_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.verify_management_capability_m3(jsonb,text)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.verify_management_capability_m3(jsonb,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_tables_runtime,sabora_m3_catalog_runtime;


-- Account economics, distinct round revisions and item evidence are read only
-- by the trusted NOLOGIN function owner, never by SQL runtime or web clients.
GRANT SELECT ON sabora.customer_accounts,sabora.order_rounds,sabora.order_revisions,
 sabora.orders,sabora.order_lines,sabora.incident_cases,sabora.payment_attempts,
 sabora.refund_attempts,sabora.cash_settlements TO sabora_m3_management_fn_owner;
CREATE POLICY finance_owner_accounts_candidate ON sabora.customer_accounts
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY finance_owner_rounds_candidate ON sabora.order_rounds
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY finance_owner_revisions_candidate ON sabora.order_revisions
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY finance_owner_orders_candidate ON sabora.orders
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY finance_owner_lines_candidate ON sabora.order_lines
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY finance_owner_incidents_candidate ON sabora.incident_cases
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY finance_owner_payments_candidate ON sabora.payment_attempts
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY finance_owner_refunds_candidate ON sabora.refund_attempts
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY finance_owner_cash_candidate ON sabora.cash_settlements
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);

CREATE FUNCTION sabora.read_admin_finance_dashboard_candidate(
 p_capability jsonb,p_period text,p_month text,p_time_zone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $read$
DECLARE
 v_role text;v_asof timestamptz:=clock_timestamp();
 v_day date;v_month date;v_from timestamptz;v_to timestamptz;
 v_prev_from timestamptz;v_prev_to timestamptz;
 v_month_from timestamptz;v_month_to timestamptz;
 v_zone text;v_sales bigint;v_prev_sales bigint;v_today_sales bigint;v_month_sales bigint;
 v_day_from timestamptz;v_day_to timestamptz;v_current_month_from timestamptz;v_current_month_to timestamptz;
 v_orders bigint;v_accounts bigint;v_pending bigint;v_cash bigint;v_card bigint;
 v_tips bigint:=0;v_cash_prev bigint;v_card_prev bigint;
 v_today_cash bigint;v_month_cash bigint;v_today_card bigint;v_month_card bigint;
 v_trend jsonb;v_top jsonb;v_gaps bigint;v_ranking_gaps bigint;
BEGIN
 v_role:=sabora.verify_management_capability_m3(p_capability,
  'finance:'||coalesce(p_period,'')||':'||coalesce(p_month,'')||':'||coalesce(p_time_zone,''));
 IF p_capability->>'action'<>'finance.read' OR v_role NOT IN('admin','root')
 THEN RAISE EXCEPTION 'm3_management_forbidden' USING errcode='42501'; END IF;
 IF p_period NOT IN ('today','last7','thisMonth','previousMonth')
   OR p_period IS NULL OR
   (p_month IS NOT NULL AND p_month !~ '^(20[0-9]{2})-(0[1-9]|1[0-2])$')
   OR (p_month IS NOT NULL AND p_period<>'thisMonth')
   OR p_time_zone IS NULL OR length(p_time_zone)>80
   OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_time_zone)
 THEN RAISE EXCEPTION 'invalid_finance_period' USING errcode='22023';END IF;
 v_zone:=p_time_zone;
 v_day:=(v_asof AT TIME ZONE v_zone)::date;
 v_month:=date_trunc('month',v_day::timestamp)::date;
 v_day_from:=v_day::timestamp AT TIME ZONE v_zone;
 v_day_to:=(v_day+1)::timestamp AT TIME ZONE v_zone;
 v_current_month_from:=v_month::timestamp AT TIME ZONE v_zone;
 v_current_month_to:=(v_month+interval '1 month') AT TIME ZONE v_zone;
 IF p_month IS NOT NULL THEN
  v_month:=to_date(p_month||'-01','YYYY-MM-DD');
  IF v_month>date_trunc('month',v_day::timestamp)::date
     OR v_month<date_trunc('month',v_day::timestamp)::date-interval '60 months'
  THEN RAISE EXCEPTION 'invalid_finance_period' USING errcode='22023';END IF;
 END IF;
 CASE p_period
 WHEN 'today' THEN v_from:=v_day::timestamp AT TIME ZONE v_zone;
   v_to:=(v_day+1)::timestamp AT TIME ZONE v_zone;
   v_prev_from:=(v_day-1)::timestamp AT TIME ZONE v_zone;
 WHEN 'last7' THEN v_from:=(v_day-6)::timestamp AT TIME ZONE v_zone;
   v_to:=(v_day+1)::timestamp AT TIME ZONE v_zone;
   v_prev_from:=(v_day-13)::timestamp AT TIME ZONE v_zone;
 WHEN 'thisMonth' THEN v_from:=v_month::timestamp AT TIME ZONE v_zone;
   v_to:=(v_month+interval '1 month') AT TIME ZONE v_zone;
   v_prev_from:=(v_month-interval '1 month') AT TIME ZONE v_zone;
 WHEN 'previousMonth' THEN v_from:=(v_month-interval '1 month') AT TIME ZONE v_zone;
   v_to:=v_month::timestamp AT TIME ZONE v_zone;
   v_prev_from:=(v_month-interval '2 months') AT TIME ZONE v_zone;
 END CASE;
 v_prev_to:=v_from;
 -- The trend follows the selected comparison month, not always today.
 IF p_period='previousMonth' THEN v_month:=(v_month-interval '1 month')::date; END IF;
 v_month_from:=v_month::timestamp AT TIME ZONE v_zone;
 v_month_to:=(v_month+interval '1 month') AT TIME ZONE v_zone;
 -- No fake historical capture dates. A preexisting charge without its
 -- append-only confirmed event makes payment KPIs unavailable, not zero.
 SELECT count(*) INTO v_gaps FROM (
  SELECT p.id FROM sabora.payment_attempts p
   WHERE p.state IN('captured','refund_required') AND p.provider_charge_id IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM sabora.finance_provider_events_candidate e
    WHERE e.kind='capture' AND e.source_id=p.id)
  UNION ALL
  SELECT r.id FROM sabora.refund_attempts r
   WHERE r.state='succeeded'
   AND NOT EXISTS(SELECT 1 FROM sabora.finance_provider_events_candidate e
    WHERE e.kind='refund' AND e.source_id=r.id)
 ) missing;
 -- Attributed to original confirmed consumption date; a later approved
 -- restaurant adjustment is attributed to the adjustment completion date.
 WITH movements AS (
  SELECT o.confirmed_at AS at,r.amount_cents AS amount
   FROM sabora.order_rounds r JOIN sabora.orders o ON o.id=r.order_id
   WHERE r.state NOT IN('cancelled','payment_failed')
  UNION ALL
  SELECT i.resolved_at AS at,-i.affected_cents AS amount
   FROM sabora.incident_cases i
   WHERE i.resolved_at IS NOT NULL
     AND i.state IN('adjusted','refund_due','cash_refund_due','resolved')
 )
 SELECT coalesce(sum(amount) FILTER(WHERE at>=v_from AND at<v_to),0)::bigint,
  coalesce(sum(amount) FILTER(WHERE at>=v_prev_from AND at<v_prev_to),0)::bigint,
  coalesce(sum(amount) FILTER(WHERE at>=v_day_from AND at<v_day_to),0)::bigint,
  coalesce(sum(amount) FILTER(WHERE at>=v_current_month_from AND at<v_current_month_to),0)::bigint
 INTO v_sales,v_prev_sales,v_today_sales,v_month_sales FROM movements;
 SELECT count(DISTINCT r.order_id),count(DISTINCT r.account_id) FILTER(WHERE r.amount_cents>0)
 INTO v_orders,v_accounts FROM sabora.order_rounds r
 JOIN sabora.orders o ON o.id=r.order_id
 WHERE o.confirmed_at>=v_from AND o.confirmed_at<v_to
   AND r.state NOT IN('cancelled','payment_failed');
 SELECT coalesce(sum(outstanding_cents),0)::bigint INTO v_pending
 FROM sabora.customer_accounts WHERE state IN('open','blocked');
 WITH movements AS (
  SELECT c.created_at AS at,
   CASE WHEN kind='payment' THEN c.amount_cents ELSE -c.amount_cents END AS amount
  FROM sabora.cash_settlements c
 ) SELECT coalesce(sum(amount) FILTER(WHERE at>=v_from AND at<v_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_prev_from AND at<v_prev_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_day_from AND at<v_day_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_current_month_from AND at<v_current_month_to),0)::bigint
 INTO v_cash,v_cash_prev,v_today_cash,v_month_cash FROM movements;
 WITH movements AS (
 SELECT e.confirmed_at AS at,
   CASE WHEN e.kind='capture' THEN e.amount_cents ELSE -e.amount_cents END AS amount
 FROM sabora.finance_provider_events_candidate e
 ) SELECT coalesce(sum(amount) FILTER(WHERE at>=v_from AND at<v_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_prev_from AND at<v_prev_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_day_from AND at<v_day_to),0)::bigint,
   coalesce(sum(amount) FILTER(WHERE at>=v_current_month_from AND at<v_current_month_to),0)::bigint
 INTO v_card,v_card_prev,v_today_card,v_month_card FROM movements;
 WITH days AS (
  SELECT generate_series(v_month::timestamp,
   (v_month+interval '1 month'-interval '1 day')::timestamp,
   interval '1 day')::date AS day
 ),movements AS (
  SELECT o.confirmed_at AS at,r.amount_cents AS amount
   FROM sabora.order_rounds r JOIN sabora.orders o ON o.id=r.order_id
   WHERE r.state NOT IN('cancelled','payment_failed') AND
    o.confirmed_at>=v_month_from AND o.confirmed_at<v_month_to
  UNION ALL
  SELECT i.resolved_at AS at,-i.affected_cents AS amount
   FROM sabora.incident_cases i WHERE i.resolved_at>=v_month_from
    AND i.resolved_at<v_month_to AND
    i.state IN('adjusted','refund_due','cash_refund_due','resolved')
 ), daily AS (
  SELECT (at AT TIME ZONE v_zone)::date AS day,sum(amount)::bigint AS cents
  FROM movements GROUP BY 1
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'date',to_char(d.day,'YYYY-MM-DD'),'netSalesCents',coalesce(m.cents,0)) ORDER BY d.day),'[]'::jsonb)
 INTO v_trend FROM days d LEFT JOIN daily m ON m.day=d.day;
 -- Product ranking must not invent item identities for old revision snapshots.
 SELECT count(*) INTO v_ranking_gaps FROM sabora.order_rounds r
 JOIN sabora.orders o ON o.id=r.order_id
 LEFT JOIN sabora.order_revisions v ON v.round_id=r.id AND v.revision_number=r.revision_number
 WHERE o.confirmed_at>=v_from AND o.confirmed_at<v_to
  AND r.state NOT IN('cancelled','payment_failed') AND r.amount_cents>0
  AND (v.id IS NULL OR jsonb_array_length(v.economic_snapshot->'lines')=0 OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(v.economic_snapshot->'lines') x
    WHERE x->>'itemId' IS NULL OR x->'evidence'->>'itemName' IS NULL OR x->'evidence'->>'quantity' IS NULL
      OR x->'evidence'->>'totalCents' IS NULL));
 -- A whole-round cancellation without item scope prevents a truthful
 -- per-product ranking; suppress ranking rather than guessing attribution.
 IF EXISTS(SELECT 1 FROM sabora.incident_cases i JOIN sabora.order_rounds r ON r.id=i.round_id
   JOIN sabora.orders o ON o.id=r.order_id
   WHERE o.confirmed_at>=v_from AND o.confirmed_at<v_to
    AND i.resolved_at IS NOT NULL AND i.affected_cents>0
    AND i.order_line_id IS NULL AND i.state IN('adjusted','refund_due','cash_refund_due','resolved'))
 THEN v_ranking_gaps:=v_ranking_gaps+1; END IF;
 IF v_ranking_gaps=0 THEN
  WITH item_lines AS (
   SELECT x.line->>'itemId' AS item_id,
    x.line->'evidence'->>'itemName' AS item_name,
    (x.line->'evidence'->>'quantity')::bigint AS quantity,
    (x.line->'evidence'->>'totalCents')::bigint AS amount,
    l.id AS line_id
   FROM sabora.order_rounds r JOIN sabora.orders o ON o.id=r.order_id
   JOIN sabora.order_revisions v ON v.round_id=r.id AND v.revision_number=r.revision_number
   CROSS JOIN LATERAL jsonb_array_elements(v.economic_snapshot->'lines')
    WITH ORDINALITY x(line,line_number)
   LEFT JOIN sabora.order_lines l ON l.order_id=r.order_id
     AND l.revision_number=r.revision_number AND l.line_number=x.line_number
   WHERE o.confirmed_at>=v_from AND o.confirmed_at<v_to
    AND r.state NOT IN('cancelled','payment_failed')
  ), net AS (
   SELECT i.item_id,i.item_name,
    sum(CASE WHEN EXISTS(SELECT 1 FROM sabora.incident_cases c
      WHERE c.order_line_id=i.line_id AND c.affected_cents>=i.amount
        AND c.resolved_at IS NOT NULL AND c.state IN('adjusted','refund_due','cash_refund_due','resolved'))
      THEN 0 ELSE i.quantity END)::bigint AS units,
    (sum(i.amount)-coalesce((SELECT sum(c.affected_cents)
       FROM sabora.incident_cases c WHERE c.order_line_id IN
        (SELECT x.line_id FROM item_lines x WHERE x.item_id=i.item_id)
        AND c.resolved_at IS NOT NULL AND c.state IN('adjusted','refund_due','cash_refund_due','resolved')),0))::bigint AS cents
   FROM item_lines i GROUP BY i.item_id,i.item_name
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',item_id,'name',item_name,
   'units',units,'netSalesCents',cents) ORDER BY units DESC,cents DESC,item_id),'[]'::jsonb)
  INTO v_top FROM (SELECT * FROM net ORDER BY units DESC,cents DESC,item_id LIMIT 10) ranked;
 ELSE v_top:=NULL; END IF;
 RETURN jsonb_build_object('version',1,'status','ready','timeZone',v_zone,
  'asOf',v_asof,'period',p_period,'month',to_char(v_month,'YYYY-MM'),
  'from',v_from,'to',v_to,
  'salesCents',v_sales,'previousSalesCents',v_prev_sales,
  'todaySalesCents',v_today_sales,'monthSalesCents',v_month_sales,
  'todayCollectedCents',CASE WHEN v_gaps=0 THEN v_today_cash+v_today_card ELSE NULL END,
  'monthCollectedCents',CASE WHEN v_gaps=0 THEN v_month_cash+v_month_card ELSE NULL END,
  'ordersCount',v_orders,'consumingAccounts',v_accounts,
  'averageTicketCents',CASE WHEN v_accounts>0 THEN round(v_sales::numeric/v_accounts)::bigint ELSE NULL END,
  'outstandingCents',v_pending,
  'cashCollectedCents',v_cash,
  'stripeCollectedCents',CASE WHEN v_gaps=0 THEN v_card ELSE NULL END,
  'collectedCents',CASE WHEN v_gaps=0 THEN v_cash+v_card ELSE NULL END,
  'previousCollectedCents',CASE WHEN v_gaps=0 THEN v_cash_prev+v_card_prev ELSE NULL END,
  'tipsCents',NULL,'tipsAvailable',false,
  'historicalCoverage',CASE WHEN v_gaps=0 THEN 'complete' ELSE 'incomplete' END,
  'rankingComplete',v_ranking_gaps=0,'dailySales',v_trend,'topItems',v_top);
END;
$read$;
ALTER FUNCTION sabora.read_admin_finance_dashboard_candidate(jsonb,text,text,text)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_finance_dashboard_candidate(jsonb,text,text,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
   sabora_m3_tables_runtime,sabora_h6_provider_runtime,sabora_h6_customer_runtime,
   sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_admin_finance_dashboard_candidate(jsonb,text,text,text)
 TO sabora_m3_catalog_runtime;
REVOKE sabora_h6_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_h6_fn_owner;
REVOKE sabora_m3_management_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_m3_management_fn_owner;
COMMIT;
