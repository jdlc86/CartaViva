-- Sabora H6: durable events, account payment policy, Stripe orchestration and
-- incident/cancellation records. Candidate only: no LOGIN, secret, endpoint,
-- worker or production deployment is created or enabled by this migration.
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sabora_h6_customer_runtime') THEN
    CREATE ROLE sabora_h6_customer_runtime NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sabora_h6_operations_runtime') THEN
    CREATE ROLE sabora_h6_operations_runtime NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sabora_h6_fn_owner') THEN
    CREATE ROLE sabora_h6_fn_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sabora_h6_provider_runtime') THEN
    CREATE ROLE sabora_h6_provider_runtime NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname IN ('sabora_h6_customer_runtime','sabora_h6_operations_runtime',
       'sabora_h6_provider_runtime','sabora_h6_fn_owner')
       AND (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls
         OR rolcreatedb OR rolcreaterole OR rolreplication)
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_h6_role' USING errcode='0P000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid
    JOIN pg_catalog.pg_roles member ON member.oid=m.member
    WHERE granted.rolname IN ('sabora_h6_customer_runtime','sabora_h6_operations_runtime',
      'sabora_h6_provider_runtime','sabora_h6_fn_owner')
       OR member.rolname IN ('sabora_h6_customer_runtime','sabora_h6_operations_runtime',
         'sabora_h6_provider_runtime','sabora_h6_fn_owner')
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_h6_role_membership' USING errcode='0P000';
  END IF;
END;
$roles$;

ALTER TABLE sabora.dining_tables
  ADD COLUMN require_pay_as_ordered boolean NOT NULL DEFAULT false,
  ADD COLUMN payment_policy_version bigint NOT NULL DEFAULT 1
    CHECK (payment_policy_version > 0);

ALTER TABLE sabora.restaurant_settings
  ADD COLUMN refunds_require_approval boolean NOT NULL DEFAULT true;

CREATE TABLE sabora.customer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
  session_id uuid NOT NULL,
  visit_key text NOT NULL CHECK (visit_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
  payment_mode text CHECK (payment_mode IN ('pay_now','pay_at_end')),
  payment_mode_selected_at timestamptz,
  outstanding_cents bigint NOT NULL DEFAULT 0 CHECK (outstanding_cents >= 0),
  cash_settled_cents bigint NOT NULL DEFAULT 0 CHECK (cash_settled_cents >= 0),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','settled','blocked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (table_id,session_id,visit_key,customer_id),
  UNIQUE (id,table_id,session_id,visit_key,customer_id),
  CHECK ((payment_mode IS NULL)=(payment_mode_selected_at IS NULL))
);

CREATE TABLE sabora.order_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES sabora.orders(id),
  account_id uuid NOT NULL REFERENCES sabora.customer_accounts(id),
  revision_number integer NOT NULL DEFAULT 1 CHECK (revision_number > 0),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  payment_mode text CHECK (payment_mode IN ('pay_now','pay_at_end')),
  payment_policy_version bigint NOT NULL CHECK (payment_policy_version > 0),
  grouping_deadline timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN (
    'free_grouping','awaiting_authorization','grouping','payment_unknown',
    'capture_requested','captured','dispatch_requested','kitchen_acknowledged',
    'payment_failed','cancelled','compensation_required'
  )),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((amount_cents=0 AND payment_mode IS NULL) OR amount_cents>0)
);

CREATE TABLE sabora.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL UNIQUE REFERENCES sabora.order_rounds(id),
  account_id uuid NOT NULL REFERENCES sabora.customer_accounts(id),
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider='stripe'),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'eur' CHECK (currency='eur'),
  authorization_key text NOT NULL UNIQUE CHECK (authorization_key ~ '^h6_auth_[A-Za-z0-9_-]{16,96}$'),
  capture_key text NOT NULL UNIQUE CHECK (capture_key ~ '^h6_capture_[A-Za-z0-9_-]{16,96}$'),
  provider_intent_id text UNIQUE CHECK (provider_intent_id IS NULL OR provider_intent_id ~ '^pi_[A-Za-z0-9]{8,128}$'),
  provider_charge_id text CHECK (provider_charge_id IS NULL OR provider_charge_id ~ '^ch_[A-Za-z0-9]{8,128}$'),
  state text NOT NULL CHECK (state IN (
    'authorization_requested','requires_action','authorized','authorization_unknown',
    'authorization_failed','capture_requested','capture_unknown','captured',
    'capture_failed','release_requested','released','refund_required'
  )),
  capture_before timestamptz,
  provider_error_code text CHECK (provider_error_code IS NULL OR provider_error_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sabora.kitchen_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL UNIQUE REFERENCES sabora.order_rounds(id),
  order_id uuid NOT NULL UNIQUE REFERENCES sabora.orders(id),
  revision_number integer NOT NULL CHECK (revision_number > 0),
  dispatch_key text NOT NULL UNIQUE CHECK (dispatch_key ~ '^h6_dispatch_[A-Za-z0-9_-]{16,96}$'),
  state text NOT NULL CHECK (state IN ('blocked','requested','acknowledged','failed','compensation_required')),
  requested_at timestamptz,
  acknowledged_at timestamptz,
  failure_code text CHECK (failure_code IS NULL OR failure_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state='blocked' AND requested_at IS NULL AND acknowledged_at IS NULL)
    OR (state IN ('requested','failed','compensation_required') AND requested_at IS NOT NULL AND acknowledged_at IS NULL)
    OR (state='acknowledged' AND requested_at IS NOT NULL AND acknowledged_at IS NOT NULL))
);

CREATE TABLE sabora.incident_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES sabora.order_rounds(id),
  order_line_id uuid REFERENCES sabora.order_lines(id),
  origin text NOT NULL CHECK (origin IN ('kitchen','waiter_customer','waiter_restaurant')),
  actor_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id),
  correlation_id text NOT NULL CHECK (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  affected_cents bigint NOT NULL CHECK (affected_cents >= 0),
  state text NOT NULL CHECK (state IN ('awaiting_admin','refund_due','cash_refund_due','adjusted','rejected_customer_request','resolved')),
  cash_refund_cents bigint NOT NULL DEFAULT 0 CHECK (cash_refund_cents BETWEEN 0 AND affected_cents),
  requires_arbitration boolean NOT NULL,
  resolved_by uuid REFERENCES sabora.staff_members(user_id),
  resolution_reason text CHECK (resolution_reason IS NULL OR length(btrim(resolution_reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  UNIQUE (actor_user_id,correlation_id),
  CHECK ((state='awaiting_admin')=requires_arbitration OR state<>'awaiting_admin'),
  CHECK ((resolved_at IS NULL)=(resolved_by IS NULL))
);

CREATE TABLE sabora.refund_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid UNIQUE REFERENCES sabora.incident_cases(id),
  payment_attempt_id uuid NOT NULL REFERENCES sabora.payment_attempts(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key ~ '^h6_refund_[A-Za-z0-9_-]{16,96}$'),
  provider_refund_id text UNIQUE CHECK (provider_refund_id IS NULL OR provider_refund_id ~ '^re_[A-Za-z0-9]{8,128}$'),
  state text NOT NULL CHECK (state IN ('requested','unknown','succeeded','failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX refund_attempts_compensation_payment_unique
 ON sabora.refund_attempts(payment_attempt_id) WHERE incident_id IS NULL;

CREATE TABLE sabora.cash_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES sabora.customer_accounts(id),
  actor_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id),
  correlation_id text NOT NULL CHECK (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  kind text NOT NULL CHECK (kind IN ('payment','refund')),
  incident_id uuid UNIQUE REFERENCES sabora.incident_cases(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (actor_user_id,correlation_id),
  CHECK ((kind='refund')=(incident_id IS NOT NULL))
);

CREATE TABLE sabora.stripe_webhook_events (
  event_id text PRIMARY KEY CHECK (event_id ~ '^evt_[A-Za-z0-9]{8,128}$'),
  event_type text NOT NULL CHECK (event_type IN (
    'payment_intent.amount_capturable_updated','payment_intent.payment_failed',
    'payment_intent.succeeded','payment_intent.canceled',
    'charge.refunded','refund.updated'
  )),
  provider_object_id text NOT NULL CHECK (provider_object_id ~ '^(pi|ch|re)_[A-Za-z0-9]{8,128}$'),
  provider_created_at timestamptz NOT NULL,
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256)=32),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  outcome text CHECK (outcome IS NULL OR outcome IN ('applied','stale','ignored'))
);

CREATE TABLE sabora.event_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
  session_id uuid NOT NULL,
  visit_key text CHECK (visit_key IS NULL OR visit_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  customer_id uuid REFERENCES sabora.customer_profiles(id),
  account_id uuid REFERENCES sabora.customer_accounts(id),
  staff_role text CHECK (staff_role IS NULL OR staff_role IN ('admin','waiter','kitchen','root')),
  audience text NOT NULL CHECK (audience IN ('customer','visit','kitchen','waiter','admin')),
  event_type text NOT NULL CHECK (event_type ~ '^sabora\.[a-z0-9_.]{3,96}$'),
  aggregate_id uuid NOT NULL,
  aggregate_version bigint NOT NULL CHECK (aggregate_version > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(convert_to(payload::text,'UTF8'))<=16384),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '7 days'),
  CHECK (expires_at>created_at),
  CHECK ((audience='customer' AND customer_id IS NOT NULL AND account_id IS NOT NULL)
    OR (audience='visit' AND visit_key IS NOT NULL)
    OR (audience IN ('kitchen','waiter','admin') AND staff_role IS NOT NULL))
);
CREATE INDEX event_outbox_customer_cursor ON sabora.event_outbox(customer_id,account_id,id);
CREATE INDEX event_outbox_visit_cursor ON sabora.event_outbox(table_id,session_id,visit_key,id);
CREATE INDEX event_outbox_staff_cursor ON sabora.event_outbox(staff_role,id);
CREATE INDEX event_outbox_expiry ON sabora.event_outbox(expires_at,id);

CREATE TABLE sabora.h6_action_requests (
  actor_user_id uuid NOT NULL,
  correlation_id text NOT NULL CHECK (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  fingerprint bytea NOT NULL CHECK (octet_length(fingerprint)=32),
  action text NOT NULL CHECK (action IN ('report_incident','resolve_incident','settle_cash','refund_cash','ack_dispatch')),
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (actor_user_id,correlation_id)
);

DO $rls$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'customer_accounts','order_rounds','payment_attempts','kitchen_dispatches',
    'incident_cases','refund_attempts','cash_settlements','stripe_webhook_events',
    'event_outbox','h6_action_requests'
  ] LOOP
    EXECUTE format('ALTER TABLE sabora.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE sabora.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON sabora.%I FROM PUBLIC, anon, authenticated, sabora_admin_writer',v_table);
  END LOOP;
END;
$rls$;

CREATE FUNCTION sabora.reject_h6_history_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'h6_history_append_only' USING errcode='55000';
END;
$$;
REVOKE ALL ON FUNCTION sabora.reject_h6_history_mutation() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER h6_outbox_append_only BEFORE UPDATE OR DELETE ON sabora.event_outbox
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER h6_outbox_no_truncate BEFORE TRUNCATE ON sabora.event_outbox
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER h6_webhooks_append_only BEFORE UPDATE OR DELETE ON sabora.stripe_webhook_events
 FOR EACH ROW WHEN (OLD.processed_at IS NOT NULL) EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER h6_cash_append_only BEFORE UPDATE OR DELETE ON sabora.cash_settlements
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER h6_cash_no_truncate BEFORE TRUNCATE ON sabora.cash_settlements
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER h6_actions_append_only BEFORE UPDATE OR DELETE ON sabora.h6_action_requests
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_h6_history_mutation();
CREATE TRIGGER h6_actions_no_truncate BEFORE TRUNCATE ON sabora.h6_action_requests
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_h6_history_mutation();

CREATE FUNCTION sabora.notify_h6_outbox_after_commit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  PERFORM pg_catalog.pg_notify('sabora_h6_event_committed',NEW.id::text);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION sabora.notify_h6_outbox_after_commit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER h6_outbox_notify AFTER INSERT ON sabora.event_outbox
 FOR EACH ROW EXECUTE FUNCTION sabora.notify_h6_outbox_after_commit();

REVOKE ALL ON SCHEMA sabora FROM sabora_h6_fn_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA sabora FROM sabora_h6_fn_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sabora FROM sabora_h6_fn_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora FROM sabora_h6_fn_owner;
GRANT USAGE ON SCHEMA sabora,extensions TO sabora_h6_fn_owner;
GRANT USAGE,SELECT ON SEQUENCE sabora.event_outbox_id_seq TO sabora_h6_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text) TO sabora_h6_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.persist_customer_order_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean) TO sabora_h6_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.reject_h6_history_mutation() TO sabora_h6_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.notify_h6_outbox_after_commit() TO sabora_h6_fn_owner;

GRANT SELECT(id,customer_id,token_hash,expires_at,revoked_at),UPDATE(id)
 ON sabora.customer_sessions TO sabora_h6_fn_owner;
GRANT SELECT(id,table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at,revoked_at),UPDATE(id)
 ON sabora.customer_table_visits TO sabora_h6_fn_owner;
GRANT SELECT(id,session_id,qr_version,ordering_state,pause_until,require_pay_as_ordered,payment_policy_version,first_confirmed_at,grouping_window_seconds),UPDATE(id)
 ON sabora.dining_tables TO sabora_h6_fn_owner;
GRANT SELECT(id,table_id,session_id,customer_visit_key,economic_snapshot,confirmed_at,grouping)
 ON sabora.orders TO sabora_h6_fn_owner;
GRANT SELECT(id,order_id,status) ON sabora.order_lines TO sabora_h6_fn_owner;
GRANT SELECT(singleton,refunds_require_approval) ON sabora.restaurant_settings TO sabora_h6_fn_owner;
GRANT SELECT(user_id,role,state),UPDATE(state) ON sabora.staff_members TO sabora_h6_fn_owner;
GRANT SELECT(key_id,hmac_key,not_before,expires_at,disabled_at),UPDATE(disabled_at)
 ON sabora.order_operation_signing_keys TO sabora_h6_fn_owner;

GRANT SELECT,INSERT,UPDATE ON sabora.customer_accounts,sabora.order_rounds,
 sabora.payment_attempts,sabora.kitchen_dispatches,sabora.incident_cases,
 sabora.refund_attempts TO sabora_h6_fn_owner;
GRANT SELECT,INSERT ON sabora.cash_settlements,sabora.h6_action_requests TO sabora_h6_fn_owner;
GRANT SELECT,INSERT,UPDATE(processed_at,outcome) ON sabora.stripe_webhook_events TO sabora_h6_fn_owner;
GRANT SELECT,INSERT ON sabora.event_outbox TO sabora_h6_fn_owner;

DO $policies$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'customer_sessions','customer_table_visits','dining_tables','staff_members',
    'order_operation_signing_keys','customer_accounts','order_rounds','payment_attempts',
    'kitchen_dispatches','incident_cases','refund_attempts','cash_settlements',
    'stripe_webhook_events','event_outbox','h6_action_requests'
  ] LOOP
    EXECUTE format('CREATE POLICY h6_owner_%I_select ON sabora.%I FOR SELECT TO sabora_h6_fn_owner USING (true)',v_table,v_table);
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY[
    'customer_sessions','customer_table_visits','dining_tables','staff_members',
    'order_operation_signing_keys','customer_accounts','order_rounds','payment_attempts',
    'kitchen_dispatches','incident_cases','refund_attempts','stripe_webhook_events'
  ] LOOP
    EXECUTE format('CREATE POLICY h6_owner_%I_update ON sabora.%I FOR UPDATE TO sabora_h6_fn_owner USING (true) WITH CHECK (true)',v_table,v_table);
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY[
    'customer_accounts','order_rounds','payment_attempts','kitchen_dispatches',
    'incident_cases','refund_attempts','cash_settlements','stripe_webhook_events',
    'event_outbox','h6_action_requests'
  ] LOOP
    EXECUTE format('CREATE POLICY h6_owner_%I_insert ON sabora.%I FOR INSERT TO sabora_h6_fn_owner WITH CHECK (true)',v_table,v_table);
  END LOOP;
END;
$policies$;

CREATE POLICY h6_owner_restaurant_settings_select ON sabora.restaurant_settings
 FOR SELECT TO sabora_h6_fn_owner USING (true);
CREATE POLICY h6_owner_orders_select ON sabora.orders
 FOR SELECT TO sabora_h6_fn_owner USING (true);
CREATE POLICY h6_owner_order_lines_select ON sabora.order_lines
 FOR SELECT TO sabora_h6_fn_owner USING (true);

CREATE FUNCTION sabora.emit_h6_event_candidate(
  p_table_id uuid,p_session_id uuid,p_visit_key text,p_customer_id uuid,
  p_account_id uuid,p_staff_role text,p_audience text,p_event_type text,
  p_aggregate_id uuid,p_aggregate_version bigint,p_payload jsonb
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $emit$
DECLARE v_id bigint;
BEGIN
  IF p_table_id IS NULL OR p_session_id IS NULL OR p_aggregate_id IS NULL
    OR p_aggregate_version IS NULL OR p_aggregate_version<=0
    OR p_event_type !~ '^sabora\.[a-z0-9_.]{3,96}$'
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR octet_length(convert_to(p_payload::text,'UTF8'))>16384
  THEN RAISE EXCEPTION 'invalid_h6_event' USING errcode='22023'; END IF;
  INSERT INTO sabora.event_outbox(table_id,session_id,visit_key,customer_id,
    account_id,staff_role,audience,event_type,aggregate_id,aggregate_version,payload)
  VALUES(p_table_id,p_session_id,p_visit_key,p_customer_id,p_account_id,
    p_staff_role,p_audience,p_event_type,p_aggregate_id,p_aggregate_version,p_payload)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$emit$;
ALTER FUNCTION sabora.emit_h6_event_candidate(uuid,uuid,text,uuid,uuid,text,text,text,uuid,bigint,jsonb)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.emit_h6_event_candidate(uuid,uuid,text,uuid,uuid,text,text,text,uuid,bigint,jsonb)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.emit_h6_event_candidate(uuid,uuid,text,uuid,uuid,text,text,text,uuid,bigint,jsonb)
 TO sabora_h6_fn_owner;

CREATE FUNCTION sabora.confirm_customer_round_h6_candidate(
  p_session_hash bytea,p_table_id uuid,p_qr_token text,p_visit_key text,
  p_basket_id text,p_request_key text,p_request_fingerprint bytea,
  p_batch_id uuid,p_order_id uuid,p_lines jsonb,p_accepted_reprice boolean,
  p_payment_mode text
)
RETURNS TABLE(
  persisted_order_id uuid,persisted_grouping text,repeated boolean,
  account_id uuid,round_id uuid,amount_cents bigint,effective_payment_mode text,
  round_state text,payment_attempt_id uuid,authorization_key text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $confirm_h6$
DECLARE
  v_persist record; v_session record; v_visit record; v_table record;
  v_account sabora.customer_accounts%ROWTYPE;
  v_round sabora.order_rounds%ROWTYPE; v_payment sabora.payment_attempts%ROWTYPE;
  v_amount bigint; v_mode text; v_deadline timestamptz;
BEGIN
  IF p_payment_mode IS NOT NULL AND p_payment_mode NOT IN ('pay_now','pay_at_end') THEN
    RAISE EXCEPTION 'invalid_payment_mode' USING errcode='22023';
  END IF;

  SELECT * INTO v_persist FROM sabora.persist_customer_order_candidate(
    p_session_hash,p_table_id,p_qr_token,p_visit_key,p_basket_id,p_request_key,
    p_request_fingerprint,p_batch_id,p_order_id,p_lines,p_accepted_reprice
  );
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_h6_order_result' USING errcode='55000'; END IF;

  SELECT s.customer_id INTO v_session FROM sabora.customer_sessions s
   WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL
     AND s.expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_session_forbidden' USING errcode='42501'; END IF;
  SELECT v.customer_id,v.table_id,v.session_id,v.visit_key INTO v_visit
   FROM sabora.customer_table_visits v
   WHERE v.customer_id=v_session.customer_id AND v.table_id=p_table_id
     AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
     AND v.expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_visit_forbidden' USING errcode='42501'; END IF;
  SELECT t.session_id,t.require_pay_as_ordered,t.payment_policy_version,
         t.first_confirmed_at,t.grouping_window_seconds
    INTO v_table FROM sabora.dining_tables t
   WHERE t.id=p_table_id AND t.session_id=v_visit.session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_table_forbidden' USING errcode='42501'; END IF;

  SELECT COALESCE(sum((line.value->'evidence'->>'totalCents')::bigint),0)
    INTO v_amount FROM jsonb_array_elements(p_lines) line(value);
  IF v_amount<0 THEN RAISE EXCEPTION 'invalid_h6_order_amount' USING errcode='22023'; END IF;

  INSERT INTO sabora.customer_accounts(table_id,session_id,visit_key,customer_id)
  VALUES(p_table_id,v_table.session_id,p_visit_key,v_session.customer_id)
  ON CONFLICT(table_id,session_id,visit_key,customer_id) DO NOTHING;
  SELECT * INTO v_account FROM sabora.customer_accounts a
   WHERE a.table_id=p_table_id AND a.session_id=v_table.session_id
     AND a.visit_key=p_visit_key AND a.customer_id=v_session.customer_id FOR UPDATE;

  SELECT * INTO v_round FROM sabora.order_rounds r
   WHERE r.order_id=v_persist.persisted_order_id FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_payment FROM sabora.payment_attempts p WHERE p.round_id=v_round.id;
    RETURN QUERY SELECT v_persist.persisted_order_id,v_persist.persisted_grouping,true,
      v_account.id,v_round.id,v_round.amount_cents,v_round.payment_mode,v_round.state,
      v_payment.id,v_payment.authorization_key;
    RETURN;
  END IF;

  IF v_amount=0 THEN
    v_mode:=NULL;
  ELSE
    IF v_account.payment_mode IS NULL THEN
      IF p_payment_mode IS NULL THEN RAISE EXCEPTION 'payment_mode_required' USING errcode='22023'; END IF;
      IF v_table.require_pay_as_ordered AND p_payment_mode<>'pay_now' THEN
        RAISE EXCEPTION 'table_requires_pay_now' USING errcode='23514';
      END IF;
      UPDATE sabora.customer_accounts SET payment_mode=p_payment_mode,
        payment_mode_selected_at=clock_timestamp(),updated_at=clock_timestamp()
       WHERE id=v_account.id RETURNING * INTO v_account;
    ELSIF p_payment_mode IS NOT NULL AND p_payment_mode<>v_account.payment_mode THEN
      RAISE EXCEPTION 'payment_mode_conflict' USING errcode='23505';
    END IF;
    IF v_table.require_pay_as_ordered AND v_account.payment_mode='pay_at_end' THEN
      RAISE EXCEPTION 'payment_policy_conflict' USING errcode='23514';
    END IF;
    v_mode:=v_account.payment_mode;
  END IF;

  v_deadline:=COALESCE(v_table.first_confirmed_at,clock_timestamp())
    +make_interval(secs=>v_table.grouping_window_seconds);
  INSERT INTO sabora.order_rounds(order_id,account_id,amount_cents,payment_mode,
    payment_policy_version,grouping_deadline,state)
  VALUES(v_persist.persisted_order_id,v_account.id,v_amount,v_mode,
    v_table.payment_policy_version,v_deadline,
    CASE WHEN v_amount=0 THEN 'free_grouping'
      WHEN v_mode='pay_now' THEN 'awaiting_authorization' ELSE 'grouping' END)
  RETURNING * INTO v_round;

  INSERT INTO sabora.kitchen_dispatches(round_id,order_id,revision_number,dispatch_key,state)
  VALUES(v_round.id,v_round.order_id,v_round.revision_number,
    'h6_dispatch_'||replace(v_round.order_id::text,'-','_'),'blocked');

  IF v_amount>0 AND v_mode='pay_now' THEN
    INSERT INTO sabora.payment_attempts(round_id,account_id,amount_cents,
      authorization_key,capture_key,state)
    VALUES(v_round.id,v_account.id,v_amount,
      'h6_auth_'||replace(v_round.order_id::text,'-','_'),
      'h6_capture_'||replace(v_round.order_id::text,'-','_'),'authorization_requested')
    RETURNING * INTO v_payment;
  ELSIF v_amount>0 AND v_mode='pay_at_end' THEN
    UPDATE sabora.customer_accounts SET outstanding_cents=outstanding_cents+v_amount,
      updated_at=clock_timestamp() WHERE id=v_account.id RETURNING * INTO v_account;
  END IF;

  PERFORM sabora.emit_h6_event_candidate(p_table_id,v_table.session_id,p_visit_key,
    v_session.customer_id,v_account.id,NULL,'customer','sabora.round.confirmed',
    v_round.id,1,jsonb_build_object('orderId',v_round.order_id,'roundId',v_round.id,
      'amountCents',v_amount,'paymentMode',v_mode,'state',v_round.state));
  IF v_mode='pay_now' THEN
    PERFORM sabora.emit_h6_event_candidate(p_table_id,v_table.session_id,p_visit_key,
      v_session.customer_id,v_account.id,NULL,'customer','sabora.payment.authorization_requested',
      v_payment.id,1,jsonb_build_object('orderId',v_round.order_id,'paymentAttemptId',v_payment.id,
        'amountCents',v_amount));
  END IF;

  RETURN QUERY SELECT v_persist.persisted_order_id,v_persist.persisted_grouping,
    v_persist.repeated,v_account.id,v_round.id,v_amount,v_mode,v_round.state,
    v_payment.id,v_payment.authorization_key;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'invalid_h6_order_input' USING errcode='22023';
END;
$confirm_h6$;
ALTER FUNCTION sabora.confirm_customer_round_h6_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.confirm_customer_round_h6_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT USAGE ON SCHEMA sabora TO sabora_h6_customer_runtime;
GRANT EXECUTE ON FUNCTION sabora.confirm_customer_round_h6_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
 TO sabora_h6_customer_runtime;

CREATE FUNCTION sabora.read_customer_payment_policy_h6_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text
)
RETURNS TABLE(require_pay_as_ordered boolean,payment_policy_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $payment_policy$
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 OR p_table_id IS NULL
   OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$'
 THEN RAISE EXCEPTION 'invalid_customer_payment_scope' USING errcode='22023'; END IF;
 RETURN QUERY SELECT t.require_pay_as_ordered,t.payment_policy_version
  FROM sabora.customer_sessions s
  JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
  JOIN sabora.dining_tables t ON t.id=v.table_id AND t.session_id=v.session_id
  WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
    AND v.table_id=p_table_id AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
    AND v.expires_at>clock_timestamp() AND v.authorized_qr_version=t.qr_version
  FOR SHARE OF s,v,t;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer_payment_scope_forbidden' USING errcode='42501'; END IF;
END;
$payment_policy$;
ALTER FUNCTION sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)
 TO sabora_h6_customer_runtime;

CREATE FUNCTION sabora.read_customer_round_h6_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text,p_order_id uuid
)
RETURNS TABLE(
 account_id uuid,round_id uuid,amount_cents bigint,effective_payment_mode text,
 round_state text,payment_attempt_id uuid,authorization_key text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $customer_round$
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 OR p_table_id IS NULL
   OR p_order_id IS NULL OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$'
 THEN RAISE EXCEPTION 'invalid_customer_round_scope' USING errcode='22023'; END IF;
 RETURN QUERY SELECT a.id,r.id,r.amount_cents,r.payment_mode,r.state,p.id,p.authorization_key
  FROM sabora.customer_sessions s
  JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
  JOIN sabora.dining_tables t ON t.id=v.table_id AND t.session_id=v.session_id
  JOIN sabora.customer_accounts a ON a.customer_id=s.customer_id AND a.table_id=t.id
    AND a.session_id=t.session_id AND a.visit_key=v.visit_key
  JOIN sabora.orders o ON o.id=p_order_id AND o.table_id=t.id AND o.session_id=t.session_id
    AND o.customer_visit_key=v.visit_key
  JOIN sabora.order_rounds r ON r.order_id=o.id AND r.account_id=a.id
  LEFT JOIN sabora.payment_attempts p ON p.round_id=r.id
  WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
    AND v.table_id=p_table_id AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
    AND v.expires_at>clock_timestamp() AND v.authorized_qr_version=t.qr_version
  FOR SHARE OF s,v,t,a,o,r;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer_round_scope_forbidden' USING errcode='42501'; END IF;
END;
$customer_round$;
ALTER FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)
 TO sabora_h6_customer_runtime;

CREATE FUNCTION sabora.record_h6_authorization_outcome_candidate(
  p_order_id uuid,p_outcome text,p_provider_intent_id text,
  p_capture_before timestamptz,p_error_code text DEFAULT NULL
)
RETURNS TABLE(payment_attempt_id uuid,payment_state text,round_state text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $authorization_outcome$
DECLARE v_round sabora.order_rounds%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;v_repeated boolean:=false;
 v_next text;v_round_next text;
BEGIN
  IF p_order_id IS NULL OR p_outcome NOT IN ('authorized','requires_action','failed','unknown')
    OR (p_outcome IN ('authorized','requires_action') AND p_provider_intent_id !~ '^pi_[A-Za-z0-9]{8,128}$')
    OR (p_capture_before IS NOT NULL AND p_capture_before<=clock_timestamp())
    OR (p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_]{1,80}$')
  THEN RAISE EXCEPTION 'invalid_authorization_outcome' USING errcode='22023'; END IF;
  SELECT * INTO v_round FROM sabora.order_rounds WHERE order_id=p_order_id FOR UPDATE;
  SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
  SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
  SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
   INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
   FROM sabora.orders o WHERE o.id=p_order_id;
  IF NOT FOUND OR v_payment.id IS NULL THEN RAISE EXCEPTION 'payment_attempt_not_found' USING errcode='P0002'; END IF;
  v_next:=CASE p_outcome WHEN 'authorized' THEN 'authorized' WHEN 'requires_action' THEN 'requires_action'
    WHEN 'failed' THEN 'authorization_failed' ELSE 'authorization_unknown' END;
  v_round_next:=CASE p_outcome WHEN 'authorized' THEN 'grouping' WHEN 'requires_action' THEN 'awaiting_authorization'
    WHEN 'failed' THEN 'payment_failed' ELSE 'payment_unknown' END;
  IF v_payment.state=v_next THEN v_repeated:=true;
  ELSIF v_payment.state NOT IN ('authorization_requested','authorization_unknown','requires_action') THEN
    RAISE EXCEPTION 'invalid_authorization_transition' USING errcode='23514';
  ELSE
    UPDATE sabora.payment_attempts SET state=v_next,
      provider_intent_id=COALESCE(p_provider_intent_id,provider_intent_id),
      capture_before=CASE WHEN p_outcome='authorized' THEN p_capture_before ELSE capture_before END,
      provider_error_code=p_error_code,updated_at=clock_timestamp()
     WHERE id=v_payment.id RETURNING * INTO v_payment;
    UPDATE sabora.order_rounds SET state=v_round_next,updated_at=clock_timestamp()
     WHERE id=v_round.id RETURNING * INTO v_round;
    PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
      v_account.customer_id,v_account.id,NULL,'customer','sabora.payment.'||v_next,
      v_payment.id,2,jsonb_build_object('orderId',p_order_id,'paymentAttemptId',v_payment.id,'state',v_next));
  END IF;
  RETURN QUERY SELECT v_payment.id,v_payment.state,v_round.state,v_repeated;
END;
$authorization_outcome$;
ALTER FUNCTION sabora.record_h6_authorization_outcome_candidate(uuid,text,text,timestamptz,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.record_h6_authorization_outcome_candidate(uuid,text,text,timestamptz,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime;
GRANT USAGE ON SCHEMA sabora TO sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.record_h6_authorization_outcome_candidate(uuid,text,text,timestamptz,text)
 TO sabora_h6_provider_runtime;

CREATE FUNCTION sabora.request_h6_capture_dispatch_candidate(p_order_id uuid,p_now timestamptz)
RETURNS TABLE(payment_attempt_id uuid,provider_intent_id text,capture_key text,
 dispatch_id uuid,dispatch_key text,action text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $request_capture$
DECLARE v_round sabora.order_rounds%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_dispatch sabora.kitchen_dispatches%ROWTYPE;v_account sabora.customer_accounts%ROWTYPE;
 v_order sabora.orders%ROWTYPE;v_repeated boolean:=false;
BEGIN
  IF p_order_id IS NULL OR p_now IS NULL THEN RAISE EXCEPTION 'invalid_capture_request' USING errcode='22023'; END IF;
  SELECT * INTO v_round FROM sabora.order_rounds WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round_not_found' USING errcode='P0002'; END IF;
  SELECT * INTO v_dispatch FROM sabora.kitchen_dispatches WHERE round_id=v_round.id FOR UPDATE;
  SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
  SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
   INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
   FROM sabora.orders o WHERE o.id=p_order_id;
  IF p_now<v_round.grouping_deadline THEN RAISE EXCEPTION 'grouping_window_open' USING errcode='23514'; END IF;
  IF v_dispatch.state IN ('requested','acknowledged') THEN
    RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text,v_dispatch.id,v_dispatch.dispatch_key,'dispatch',true;RETURN;
  END IF;
  IF v_round.amount_cents=0 OR v_round.payment_mode='pay_at_end' THEN
    UPDATE sabora.kitchen_dispatches SET state='requested',requested_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_dispatch.id RETURNING * INTO v_dispatch;
    UPDATE sabora.order_rounds SET state='dispatch_requested',updated_at=clock_timestamp()
     WHERE id=v_round.id RETURNING * INTO v_round;
    PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
      'kitchen','kitchen','sabora.kitchen.dispatch_requested',v_dispatch.id,1,
      jsonb_build_object('orderId',p_order_id,'roundId',v_round.id,
       'dispatchId',v_dispatch.id,'revisionNumber',1));
    RETURN QUERY SELECT NULL::uuid,NULL::text,NULL::text,v_dispatch.id,v_dispatch.dispatch_key,'dispatch',false;RETURN;
  END IF;
  SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
  IF v_payment.state IN ('capture_requested','capture_unknown') THEN v_repeated:=true;
  ELSIF v_payment.state<>'authorized' THEN RAISE EXCEPTION 'payment_not_capturable' USING errcode='23514';
  ELSE
    IF v_payment.capture_before IS NULL OR v_payment.capture_before<=p_now THEN
      RAISE EXCEPTION 'authorization_expired' USING errcode='23514';
    END IF;
    UPDATE sabora.payment_attempts SET state='capture_requested',updated_at=clock_timestamp()
     WHERE id=v_payment.id RETURNING * INTO v_payment;
    UPDATE sabora.order_rounds SET state='capture_requested',updated_at=clock_timestamp()
     WHERE id=v_round.id;
    PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
      v_account.customer_id,v_account.id,NULL,'customer','sabora.payment.capture_requested',
      v_payment.id,3,jsonb_build_object('orderId',p_order_id,'paymentAttemptId',v_payment.id));
  END IF;
  RETURN QUERY SELECT v_payment.id,v_payment.provider_intent_id,v_payment.capture_key,
    v_dispatch.id,v_dispatch.dispatch_key,'capture',v_repeated;
END;
$request_capture$;
ALTER FUNCTION sabora.request_h6_capture_dispatch_candidate(uuid,timestamptz) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.request_h6_capture_dispatch_candidate(uuid,timestamptz)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.request_h6_capture_dispatch_candidate(uuid,timestamptz)
 TO sabora_h6_provider_runtime;

CREATE FUNCTION sabora.record_h6_capture_outcome_candidate(
 p_order_id uuid,p_outcome text,p_provider_charge_id text DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS TABLE(payment_state text,round_state text,dispatch_id uuid,dispatch_state text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $capture_outcome$
DECLARE v_round sabora.order_rounds%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_dispatch sabora.kitchen_dispatches%ROWTYPE;v_account sabora.customer_accounts%ROWTYPE;
 v_order sabora.orders%ROWTYPE;v_repeated boolean:=false;v_state text;
BEGIN
 IF p_outcome NOT IN ('captured','failed','unknown')
   OR (p_outcome='captured' AND p_provider_charge_id !~ '^ch_[A-Za-z0-9]{8,128}$')
   OR (p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_]{1,80}$')
 THEN RAISE EXCEPTION 'invalid_capture_outcome' USING errcode='22023'; END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE order_id=p_order_id FOR UPDATE;
 SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
 SELECT * INTO v_dispatch FROM sabora.kitchen_dispatches WHERE round_id=v_round.id FOR UPDATE;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=p_order_id;
 v_state:=CASE p_outcome WHEN 'captured' THEN 'captured' WHEN 'failed' THEN 'capture_failed' ELSE 'capture_unknown' END;
 IF v_payment.state=v_state THEN v_repeated:=true;
 ELSIF v_payment.state NOT IN ('capture_requested','capture_unknown') THEN
   RAISE EXCEPTION 'invalid_capture_transition' USING errcode='23514';
 ELSE
   UPDATE sabora.payment_attempts SET state=v_state,
     provider_charge_id=COALESCE(p_provider_charge_id,provider_charge_id),
     provider_error_code=p_error_code,updated_at=clock_timestamp()
    WHERE id=v_payment.id RETURNING * INTO v_payment;
   IF p_outcome='captured' THEN
     UPDATE sabora.kitchen_dispatches SET state='requested',requested_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE id=v_dispatch.id RETURNING * INTO v_dispatch;
     UPDATE sabora.order_rounds SET state='dispatch_requested',updated_at=clock_timestamp()
      WHERE id=v_round.id RETURNING * INTO v_round;
     PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
       'kitchen','kitchen','sabora.kitchen.dispatch_requested',v_dispatch.id,1,
       jsonb_build_object('orderId',p_order_id,'roundId',v_round.id,
        'dispatchId',v_dispatch.id,'revisionNumber',1));
   ELSE
     UPDATE sabora.order_rounds SET state=CASE p_outcome WHEN 'unknown' THEN 'payment_unknown' ELSE 'payment_failed' END,
       updated_at=clock_timestamp() WHERE id=v_round.id RETURNING * INTO v_round;
   END IF;
   PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
     v_account.customer_id,v_account.id,NULL,'customer','sabora.payment.'||v_state,
     v_payment.id,4,jsonb_build_object('orderId',p_order_id,'paymentAttemptId',v_payment.id,'state',v_state));
 END IF;
 RETURN QUERY SELECT v_payment.state,v_round.state,v_dispatch.id,v_dispatch.state,v_repeated;
END;
$capture_outcome$;
ALTER FUNCTION sabora.record_h6_capture_outcome_candidate(uuid,text,text,text) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.record_h6_capture_outcome_candidate(uuid,text,text,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.record_h6_capture_outcome_candidate(uuid,text,text,text)
 TO sabora_h6_provider_runtime;

-- A successful provider capture followed by a local dispatch-recording failure
-- must never be retried as another payment or silently treated as dispatched.
-- This separate, idempotent compensation marker is attempted only after the
-- provider has returned a concrete captured charge and the atomic outcome
-- transaction has failed.
CREATE FUNCTION sabora.record_h6_capture_compensation_candidate(
 p_order_id uuid,p_provider_charge_id text,p_error_code text
)
RETURNS TABLE(payment_state text,round_state text,dispatch_id uuid,dispatch_state text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $capture_compensation$
DECLARE v_round sabora.order_rounds%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_dispatch sabora.kitchen_dispatches%ROWTYPE;v_account sabora.customer_accounts%ROWTYPE;
 v_order sabora.orders%ROWTYPE;v_refund sabora.refund_attempts%ROWTYPE;v_repeated boolean:=false;
BEGIN
 IF p_order_id IS NULL OR p_provider_charge_id !~ '^ch_[A-Za-z0-9]{8,128}$'
   OR p_error_code !~ '^[a-z0-9_]{1,80}$'
 THEN RAISE EXCEPTION 'invalid_capture_compensation' USING errcode='22023'; END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE order_id=p_order_id FOR UPDATE;
 SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
 SELECT * INTO v_dispatch FROM sabora.kitchen_dispatches WHERE round_id=v_round.id FOR UPDATE;
 IF v_payment.id IS NULL OR v_dispatch.id IS NULL THEN
  RAISE EXCEPTION 'capture_compensation_not_found' USING errcode='P0002';
 END IF;
 IF v_payment.state='refund_required' AND v_round.state='compensation_required'
    AND v_dispatch.state='compensation_required' THEN
  IF v_payment.provider_charge_id IS DISTINCT FROM p_provider_charge_id THEN
   RAISE EXCEPTION 'capture_compensation_conflict' USING errcode='23505';
  END IF;
  v_repeated:=true;
 ELSIF v_payment.state NOT IN ('capture_requested','capture_unknown')
    OR v_dispatch.state<>'blocked' THEN
  RAISE EXCEPTION 'invalid_capture_compensation_transition' USING errcode='23514';
 ELSE
  UPDATE sabora.payment_attempts SET state='refund_required',provider_charge_id=p_provider_charge_id,
   provider_error_code=p_error_code,updated_at=clock_timestamp() WHERE id=v_payment.id RETURNING * INTO v_payment;
  UPDATE sabora.order_rounds SET state='compensation_required',updated_at=clock_timestamp()
   WHERE id=v_round.id RETURNING * INTO v_round;
  UPDATE sabora.kitchen_dispatches SET state='compensation_required',requested_at=clock_timestamp(),
   failure_code=p_error_code,updated_at=clock_timestamp() WHERE id=v_dispatch.id RETURNING * INTO v_dispatch;
  INSERT INTO sabora.refund_attempts(incident_id,payment_attempt_id,amount_cents,idempotency_key,state)
   VALUES(NULL,v_payment.id,v_payment.amount_cents,
    'h6_refund_'||replace(v_payment.id::text,'-','_'),'requested') RETURNING * INTO v_refund;
  SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
  SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
   INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
   FROM sabora.orders o WHERE o.id=p_order_id;
  PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
   v_account.customer_id,v_account.id,NULL,'customer','sabora.payment.compensation_required',
   v_payment.id,6,jsonb_build_object('orderId',p_order_id,'paymentAttemptId',v_payment.id,
    'state','refund_required','refundAttemptId',v_refund.id));
  PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
   'admin','admin','sabora.payment.compensation_required',v_payment.id,6,
   jsonb_build_object('orderId',p_order_id,'paymentAttemptId',v_payment.id,
    'dispatchId',v_dispatch.id,'providerChargeId',p_provider_charge_id,'refundAttemptId',v_refund.id));
 END IF;
 RETURN QUERY SELECT v_payment.state,v_round.state,v_dispatch.id,v_dispatch.state,v_repeated;
END;
$capture_compensation$;
ALTER FUNCTION sabora.record_h6_capture_compensation_candidate(uuid,text,text) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.record_h6_capture_compensation_candidate(uuid,text,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.record_h6_capture_compensation_candidate(uuid,text,text)
 TO sabora_h6_provider_runtime;

CREATE FUNCTION sabora.read_customer_event_backlog_h6_candidate(
 p_session_hash bytea,p_table_id uuid,p_visit_key text,p_account_id uuid,
 p_after_cursor bigint DEFAULT 0,p_limit integer DEFAULT 100
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $customer_events$
DECLARE v_customer uuid;v_session uuid;v_min bigint;v_max bigint;v_events jsonb;v_resync boolean;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32 OR p_table_id IS NULL
   OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$' OR p_account_id IS NULL
   OR p_after_cursor<0 OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'invalid_event_cursor' USING errcode='22023'; END IF;
 SELECT s.customer_id,t.session_id INTO v_customer,v_session
  FROM sabora.customer_sessions s
  JOIN sabora.customer_table_visits v ON v.customer_id=s.customer_id
  JOIN sabora.dining_tables t ON t.id=v.table_id AND t.session_id=v.session_id
  JOIN sabora.customer_accounts a ON a.id=p_account_id AND a.customer_id=s.customer_id
    AND a.table_id=t.id AND a.session_id=t.session_id AND a.visit_key=v.visit_key
  WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
    AND v.table_id=p_table_id AND v.visit_key=p_visit_key AND v.revoked_at IS NULL
    AND v.expires_at>clock_timestamp() AND v.authorized_qr_version=t.qr_version
  FOR SHARE OF s,v,t,a;
 IF NOT FOUND THEN RAISE EXCEPTION 'event_scope_forbidden' USING errcode='42501'; END IF;

 SELECT min(e.id),max(e.id) INTO v_min,v_max FROM sabora.event_outbox e
  WHERE e.expires_at>clock_timestamp() AND e.table_id=p_table_id AND e.session_id=v_session
    AND ((e.audience='customer' AND e.customer_id=v_customer AND e.account_id=p_account_id)
      OR (e.audience='visit' AND e.visit_key=p_visit_key));
 v_resync:=p_after_cursor>0 AND v_min IS NOT NULL AND p_after_cursor<v_min;
 IF v_resync THEN v_events:='[]'::jsonb;
 ELSE
   SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'eventKey',q.event_key,
     'type',q.event_type,'aggregateId',q.aggregate_id,'aggregateVersion',q.aggregate_version,
     'payload',q.payload,'createdAt',q.created_at) ORDER BY q.id),'[]'::jsonb)
    INTO v_events FROM (
      SELECT e.* FROM sabora.event_outbox e
       WHERE e.expires_at>clock_timestamp() AND e.id>p_after_cursor
         AND e.table_id=p_table_id AND e.session_id=v_session
         AND ((e.audience='customer' AND e.customer_id=v_customer AND e.account_id=p_account_id)
           OR (e.audience='visit' AND e.visit_key=p_visit_key))
       ORDER BY e.id LIMIT p_limit
    ) q;
 END IF;
 RETURN jsonb_build_object('version',1,'resyncRequired',v_resync,
   'nextCursor',CASE WHEN jsonb_array_length(v_events)>0
      THEN (v_events->(jsonb_array_length(v_events)-1)->>'id')::bigint ELSE p_after_cursor END,
   'minAvailableCursor',v_min,'maxAvailableCursor',v_max,'events',v_events);
END;
$customer_events$;
ALTER FUNCTION sabora.read_customer_event_backlog_h6_candidate(bytea,uuid,text,uuid,bigint,integer)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_customer_event_backlog_h6_candidate(bytea,uuid,text,uuid,bigint,integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_event_backlog_h6_candidate(bytea,uuid,text,uuid,bigint,integer)
 TO sabora_h6_customer_runtime;

CREATE FUNCTION sabora.verify_h6_staff_capability_candidate(
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
   OR p_action NOT IN ('report_incident','resolve_incident','settle_cash','refund_cash','ack_dispatch','read_events')
   OR p_target_id IS NULL OR p_correlation_id !~ '^[A-Za-z0-9_-]{8,128}$'
   OR p_issued_at_ms>v_now+5000 OR p_issued_at_ms<v_now-60000
   OR p_expires_at_ms<=v_now OR p_expires_at_ms>p_issued_at_ms+60000
   OR p_signature_hex !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501'; END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_key_expiry
  FROM sabora.order_operation_signing_keys k WHERE k.key_id=p_key_id
    AND k.disabled_at IS NULL AND k.not_before<=clock_timestamp()
    AND k.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501'; END IF;
 SELECT m.role INTO v_role FROM sabora.staff_members m
  WHERE m.user_id=p_actor_user_id AND m.state='active' FOR UPDATE;
 IF NOT FOUND OR v_role IS DISTINCT FROM p_staff_role THEN
   RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501';
 END IF;
 v_payload:='h6-v1'||chr(10)||p_database_role||chr(10)||p_actor_user_id::text||chr(10)
  ||p_staff_role||chr(10)||p_action||chr(10)||p_target_id::text||chr(10)
  ||p_correlation_id||chr(10)||p_issued_at_ms::text||chr(10)||p_expires_at_ms::text;
 v_expected:=encode(extensions.hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
 IF length(v_expected)<>length(p_signature_hex)
   OR extensions.hmac(convert_to(v_expected,'UTF8'),convert_to('sabora-h6-capability-compare','UTF8'),'sha256')
      <>extensions.hmac(convert_to(p_signature_hex,'UTF8'),convert_to('sabora-h6-capability-compare','UTF8'),'sha256')
 THEN RAISE EXCEPTION 'invalid_h6_staff_capability' USING errcode='42501'; END IF;
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

CREATE FUNCTION sabora.acknowledge_kitchen_dispatch_h6_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_dispatch_id uuid,p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $ack_dispatch$
DECLARE v_role text;v_dispatch sabora.kitchen_dispatches%ROWTYPE;v_round sabora.order_rounds%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;v_existing jsonb;v_result jsonb;v_fingerprint bytea;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'ack_dispatch',p_dispatch_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('kitchen','admin') THEN RAISE EXCEPTION 'h6_staff_action_forbidden' USING errcode='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_actor_user_id::text||':'||p_correlation_id,0));
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
   RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to('ack_dispatch:'||p_dispatch_id::text,'UTF8'));
 SELECT r.result INTO v_existing FROM sabora.h6_action_requests r
  WHERE r.actor_user_id=p_actor_user_id AND r.correlation_id=p_correlation_id;
 IF FOUND THEN
   IF (SELECT fingerprint FROM sabora.h6_action_requests WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id)<>v_fingerprint
   THEN RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
   RETURN v_existing||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_dispatch FROM sabora.kitchen_dispatches d WHERE d.id=p_dispatch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'dispatch_not_found' USING errcode='P0002'; END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
   RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_dispatch.round_id FOR UPDATE;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=v_round.order_id;
 IF v_dispatch.state='acknowledged' THEN
   v_result:=jsonb_build_object('dispatchId',v_dispatch.id,'orderId',v_order.id,'state','acknowledged');
 ELSIF v_dispatch.state<>'requested' THEN RAISE EXCEPTION 'dispatch_not_acknowledgeable' USING errcode='23514';
 ELSE
   UPDATE sabora.kitchen_dispatches SET state='acknowledged',acknowledged_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=v_dispatch.id RETURNING * INTO v_dispatch;
   UPDATE sabora.order_rounds SET state='kitchen_acknowledged',updated_at=clock_timestamp()
    WHERE id=v_round.id;
   PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
    v_account.customer_id,v_account.id,NULL,'customer','sabora.kitchen.dispatch_acknowledged',
    v_dispatch.id,2,jsonb_build_object('orderId',v_order.id,'dispatchId',v_dispatch.id));
   PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
    'waiter','waiter','sabora.kitchen.dispatch_acknowledged',v_dispatch.id,2,
    jsonb_build_object('orderId',v_order.id,'roundId',v_round.id,'dispatchId',v_dispatch.id));
   v_result:=jsonb_build_object('dispatchId',v_dispatch.id,'orderId',v_order.id,'state','acknowledged');
 END IF;
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'ack_dispatch',v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$ack_dispatch$;
ALTER FUNCTION sabora.acknowledge_kitchen_dispatch_h6_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.acknowledge_kitchen_dispatch_h6_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT USAGE ON SCHEMA sabora TO sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.acknowledge_kitchen_dispatch_h6_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;

CREATE FUNCTION sabora.enforce_h6_dispatch_before_preparation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF OLD.status='confirmed' AND NEW.status='preparing'
   AND EXISTS(SELECT 1 FROM sabora.kitchen_dispatches d WHERE d.order_id=OLD.order_id)
   AND NOT EXISTS(SELECT 1 FROM sabora.kitchen_dispatches d WHERE d.order_id=OLD.order_id AND d.state='acknowledged')
 THEN RAISE EXCEPTION 'kitchen_dispatch_not_acknowledged' USING errcode='23514'; END IF;
 RETURN NEW;
END;
$$;
ALTER FUNCTION sabora.enforce_h6_dispatch_before_preparation() OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.enforce_h6_dispatch_before_preparation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER h6_dispatch_before_preparation BEFORE UPDATE OF status ON sabora.order_lines
 FOR EACH ROW EXECUTE FUNCTION sabora.enforce_h6_dispatch_before_preparation();

CREATE FUNCTION sabora.apply_h6_incident_economic_effect_candidate(p_incident_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $incident_effect$
DECLARE v_incident sabora.incident_cases%ROWTYPE;v_round sabora.order_rounds%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_cash_refund bigint;
BEGIN
 SELECT * INTO v_incident FROM sabora.incident_cases WHERE id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found' USING errcode='P0002'; END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_incident.round_id FOR UPDATE;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id FOR UPDATE;
 IF v_incident.affected_cents=0 THEN RETURN 'resolved'; END IF;
 IF v_round.payment_mode='pay_at_end' THEN
   v_cash_refund:=greatest(v_incident.affected_cents-v_account.outstanding_cents,0);
   IF v_cash_refund>COALESCE((SELECT sum(CASE WHEN c.kind='payment' THEN c.amount_cents ELSE -c.amount_cents END)
      FROM sabora.cash_settlements c WHERE c.account_id=v_account.id),0) THEN
     RAISE EXCEPTION 'incident_exceeds_cash_paid' USING errcode='23514';
   END IF;
   UPDATE sabora.customer_accounts SET outstanding_cents=greatest(outstanding_cents-v_incident.affected_cents,0),
     state=CASE WHEN greatest(outstanding_cents-v_incident.affected_cents,0)=0 THEN 'settled' ELSE state END,
     updated_at=clock_timestamp() WHERE id=v_account.id;
   UPDATE sabora.incident_cases SET cash_refund_cents=v_cash_refund WHERE id=v_incident.id;
   RETURN CASE WHEN v_cash_refund>0 THEN 'cash_refund_due' ELSE 'adjusted' END;
 END IF;
 IF v_round.payment_mode='pay_now' THEN
   SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
   IF v_payment.state IN ('authorization_unknown','capture_unknown') THEN
     RAISE EXCEPTION 'payment_outcome_unknown' USING errcode='23514';
   ELSIF v_payment.state='captured' THEN
     IF COALESCE((SELECT sum(r.amount_cents) FROM sabora.refund_attempts r
       WHERE r.payment_attempt_id=v_payment.id),0)+v_incident.affected_cents>v_payment.amount_cents
     THEN RAISE EXCEPTION 'incident_exceeds_captured_amount' USING errcode='23514'; END IF;
     INSERT INTO sabora.refund_attempts(incident_id,payment_attempt_id,amount_cents,idempotency_key,state)
     VALUES(v_incident.id,v_payment.id,v_incident.affected_cents,
       'h6_refund_'||replace(v_incident.id::text,'-','_'),'requested');
     RETURN 'refund_due';
   ELSIF v_payment.state IN ('authorized','capture_requested') THEN
     UPDATE sabora.payment_attempts SET state='release_requested',updated_at=clock_timestamp()
      WHERE id=v_payment.id;
     RETURN 'refund_due';
   ELSIF v_payment.state IN ('authorization_failed','capture_failed','released') THEN
     RETURN 'resolved';
   ELSE
     RAISE EXCEPTION 'incident_payment_not_reconcilable' USING errcode='23514';
   END IF;
 END IF;
 RETURN 'resolved';
END;
$incident_effect$;
ALTER FUNCTION sabora.apply_h6_incident_economic_effect_candidate(uuid) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.apply_h6_incident_economic_effect_candidate(uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.apply_h6_incident_economic_effect_candidate(uuid) TO sabora_h6_fn_owner;

CREATE FUNCTION sabora.report_h6_incident_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_round_id uuid,p_order_line_id uuid,p_origin text,p_reason text,p_affected_cents bigint,
 p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $report_incident$
DECLARE v_role text;v_round sabora.order_rounds%ROWTYPE;v_account sabora.customer_accounts%ROWTYPE;
 v_order sabora.orders%ROWTYPE;v_requires boolean;v_refunds_approval boolean;v_incident sabora.incident_cases%ROWTYPE;
 v_result jsonb;v_existing record;v_fingerprint bytea;v_state text;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'report_incident',p_round_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF p_origin NOT IN ('kitchen','waiter_customer','waiter_restaurant') OR p_reason IS NULL
   OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_affected_cents<0
   OR (p_origin='kitchen' AND v_role NOT IN ('kitchen','admin'))
   OR (p_origin LIKE 'waiter_%' AND v_role NOT IN ('waiter','admin'))
 THEN RAISE EXCEPTION 'invalid_incident_request' USING errcode='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_actor_user_id::text||':'||p_correlation_id,0));
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to(p_round_id::text||':'||coalesce(p_order_line_id::text,'')||':'
  ||p_origin||':'||btrim(p_reason)||':'||p_affected_cents::text,'UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests
  WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE id=p_round_id FOR UPDATE;
 IF NOT FOUND OR p_affected_cents>v_round.amount_cents THEN
  RAISE EXCEPTION 'invalid_incident_amount' USING errcode='23514'; END IF;
 IF p_order_line_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM sabora.order_lines l WHERE l.id=p_order_line_id AND l.order_id=v_round.order_id
 ) THEN RAISE EXCEPTION 'incident_line_scope_forbidden' USING errcode='42501'; END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 SELECT refunds_require_approval INTO v_refunds_approval FROM sabora.restaurant_settings WHERE singleton=true;
 IF p_origin='waiter_customer' AND NOT coalesce(v_refunds_approval,true) THEN
  RAISE EXCEPTION 'customer_cancellation_limits_not_configured' USING errcode='23514';
 END IF;
 v_requires:=p_origin IN ('kitchen','waiter_customer');
 INSERT INTO sabora.incident_cases(round_id,order_line_id,origin,actor_user_id,correlation_id,
   reason,affected_cents,state,requires_arbitration)
 VALUES(p_round_id,p_order_line_id,p_origin,p_actor_user_id,p_correlation_id,btrim(p_reason),
   p_affected_cents,CASE WHEN v_requires THEN 'awaiting_admin' ELSE 'refund_due' END,v_requires)
 RETURNING * INTO v_incident;
 IF NOT v_requires THEN
  v_state:=sabora.apply_h6_incident_economic_effect_candidate(v_incident.id);
  UPDATE sabora.incident_cases SET state=v_state,resolved_by=p_actor_user_id,
    resolution_reason='restaurant_origin_automatic_due',resolved_at=clock_timestamp()
   WHERE id=v_incident.id RETURNING * INTO v_incident;
 END IF;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=v_round.order_id;
 PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
   v_account.customer_id,v_account.id,NULL,'customer','sabora.incident.'||v_incident.state,
   v_incident.id,1,jsonb_build_object('incidentId',v_incident.id,'orderId',v_order.id,
    'origin',v_incident.origin,'state',v_incident.state,'affectedCents',v_incident.affected_cents));
 IF v_incident.state='cash_refund_due' THEN
  PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
   'waiter','waiter','sabora.incident.cash_refund_due',v_incident.id,2,
   jsonb_build_object('incidentId',v_incident.id,'orderId',v_order.id,'accountId',v_account.id,
    'amountCents',v_incident.cash_refund_cents));
 END IF;
 IF v_requires THEN
  PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
   'admin','admin','sabora.incident.awaiting_admin',v_incident.id,1,
   jsonb_build_object('incidentId',v_incident.id,'orderId',v_order.id,'origin',v_incident.origin));
 END IF;
 v_result:=jsonb_build_object('incidentId',v_incident.id,'state',v_incident.state,
  'requiresArbitration',v_incident.requires_arbitration);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'report_incident',v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$report_incident$;
ALTER FUNCTION sabora.report_h6_incident_authorized_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.report_h6_incident_authorized_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.report_h6_incident_authorized_candidate(text,text,uuid,text,uuid,uuid,text,text,bigint,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;

CREATE FUNCTION sabora.resolve_h6_incident_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_incident_id uuid,p_resolution text,p_reason text,p_correlation_id text,
 p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $resolve_incident$
DECLARE v_role text;v_incident sabora.incident_cases%ROWTYPE;v_round sabora.order_rounds%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;v_state text;
 v_fingerprint bytea;v_existing record;v_result jsonb;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'resolve_incident',p_incident_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('admin','root') OR p_resolution NOT IN ('approve','reject')
   OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500
 THEN RAISE EXCEPTION 'invalid_incident_resolution' USING errcode='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_actor_user_id::text||':'||p_correlation_id,0));
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to(p_incident_id::text||':'||p_resolution||':'||btrim(p_reason),'UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_incident FROM sabora.incident_cases WHERE id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found' USING errcode='P0002'; END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 IF v_incident.state<>'awaiting_admin' THEN RAISE EXCEPTION 'incident_already_resolved' USING errcode='23514'; END IF;
 IF v_incident.origin='kitchen' AND p_resolution='reject' THEN
  RAISE EXCEPTION 'kitchen_refund_cannot_be_denied' USING errcode='23514'; END IF;
 IF p_resolution='approve' THEN v_state:=sabora.apply_h6_incident_economic_effect_candidate(v_incident.id);
 ELSE v_state:='rejected_customer_request'; END IF;
 UPDATE sabora.incident_cases SET state=v_state,resolved_by=p_actor_user_id,
  resolution_reason=btrim(p_reason),resolved_at=clock_timestamp(),requires_arbitration=false
  WHERE id=v_incident.id RETURNING * INTO v_incident;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_incident.round_id;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=v_round.order_id;
 PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
  v_account.customer_id,v_account.id,NULL,'customer','sabora.incident.'||v_state,v_incident.id,2,
  jsonb_build_object('incidentId',v_incident.id,'orderId',v_order.id,'state',v_state,
   'affectedCents',v_incident.affected_cents));
 IF v_state='cash_refund_due' THEN
  PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
   'waiter','waiter','sabora.incident.cash_refund_due',v_incident.id,3,
   jsonb_build_object('incidentId',v_incident.id,'orderId',v_order.id,'accountId',v_account.id,
    'amountCents',v_incident.cash_refund_cents));
 END IF;
 v_result:=jsonb_build_object('incidentId',v_incident.id,'state',v_state);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'resolve_incident',v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$resolve_incident$;
ALTER FUNCTION sabora.resolve_h6_incident_authorized_candidate(text,text,uuid,text,uuid,text,text,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.resolve_h6_incident_authorized_candidate(text,text,uuid,text,uuid,text,text,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.resolve_h6_incident_authorized_candidate(text,text,uuid,text,uuid,text,text,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;

CREATE FUNCTION sabora.settle_h6_account_cash_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_account_id uuid,p_amount_cents bigint,p_correlation_id text,
 p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $settle_cash$
DECLARE v_role text;v_account sabora.customer_accounts%ROWTYPE;v_fingerprint bytea;
 v_existing record;v_settlement sabora.cash_settlements%ROWTYPE;v_result jsonb;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'settle_cash',p_account_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('waiter','admin','root') OR p_amount_cents<=0 THEN
  RAISE EXCEPTION 'invalid_cash_settlement' USING errcode='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_actor_user_id::text||':'||p_correlation_id,0));
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to(p_account_id::text||':'||p_amount_cents::text||':payment','UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=p_account_id FOR UPDATE;
 IF NOT FOUND OR v_account.payment_mode<>'pay_at_end' OR v_account.outstanding_cents<>p_amount_cents THEN
  RAISE EXCEPTION 'cash_settlement_conflict' USING errcode='23514'; END IF;
 IF EXISTS(SELECT 1 FROM sabora.payment_attempts p WHERE p.account_id=p_account_id
   AND p.state IN ('authorization_unknown','capture_unknown','authorization_requested','capture_requested'))
 THEN RAISE EXCEPTION 'payment_outcome_unknown' USING errcode='23514'; END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 INSERT INTO sabora.cash_settlements(account_id,actor_user_id,correlation_id,amount_cents,kind)
 VALUES(p_account_id,p_actor_user_id,p_correlation_id,p_amount_cents,'payment') RETURNING * INTO v_settlement;
 UPDATE sabora.customer_accounts SET outstanding_cents=0,cash_settled_cents=cash_settled_cents+p_amount_cents,
  state='settled',updated_at=clock_timestamp() WHERE id=p_account_id RETURNING * INTO v_account;
 PERFORM sabora.emit_h6_event_candidate(v_account.table_id,v_account.session_id,v_account.visit_key,
  v_account.customer_id,v_account.id,NULL,'customer','sabora.account.cash_settled',v_settlement.id,1,
  jsonb_build_object('accountId',v_account.id,'settlementId',v_settlement.id,'amountCents',p_amount_cents));
 v_result:=jsonb_build_object('accountId',v_account.id,'settlementId',v_settlement.id,
  'amountCents',p_amount_cents,'state','settled');
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
 VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'settle_cash',v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$settle_cash$;
ALTER FUNCTION sabora.settle_h6_account_cash_authorized_candidate(text,text,uuid,text,uuid,bigint,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.settle_h6_account_cash_authorized_candidate(text,text,uuid,text,uuid,bigint,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.settle_h6_account_cash_authorized_candidate(text,text,uuid,text,uuid,bigint,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;

CREATE FUNCTION sabora.refund_h6_cash_authorized_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_incident_id uuid,p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $refund_cash$
DECLARE v_role text;v_incident sabora.incident_cases%ROWTYPE;v_round sabora.order_rounds%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;v_existing record;
 v_fingerprint bytea;v_settlement sabora.cash_settlements%ROWTYPE;v_result jsonb;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'refund_cash',p_incident_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF v_role NOT IN ('waiter','admin','root') THEN RAISE EXCEPTION 'cash_refund_forbidden' USING errcode='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  p_actor_user_id::text||':'||p_correlation_id,0));
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 v_fingerprint:=sha256(convert_to('refund_cash:'||p_incident_id::text,'UTF8'));
 SELECT * INTO v_existing FROM sabora.h6_action_requests
  WHERE actor_user_id=p_actor_user_id AND correlation_id=p_correlation_id;
 IF FOUND THEN
  IF v_existing.fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'h6_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_existing.result||jsonb_build_object('repeated',true);
 END IF;
 SELECT * INTO v_incident FROM sabora.incident_cases WHERE id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found' USING errcode='P0002'; END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 IF v_incident.state<>'cash_refund_due' OR v_incident.cash_refund_cents<=0 THEN
  RAISE EXCEPTION 'cash_refund_not_due' USING errcode='23514'; END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_incident.round_id;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id FOR UPDATE;
 INSERT INTO sabora.cash_settlements(account_id,actor_user_id,correlation_id,amount_cents,kind,incident_id)
  VALUES(v_account.id,p_actor_user_id,p_correlation_id,v_incident.cash_refund_cents,'refund',v_incident.id)
  RETURNING * INTO v_settlement;
 UPDATE sabora.incident_cases SET state='resolved' WHERE id=v_incident.id RETURNING * INTO v_incident;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=v_round.order_id;
 PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
  v_account.customer_id,v_account.id,NULL,'customer','sabora.refund.cash_recorded',v_settlement.id,1,
  jsonb_build_object('incidentId',v_incident.id,'orderId',v_order.id,'amountCents',v_settlement.amount_cents));
 v_result:=jsonb_build_object('incidentId',v_incident.id,'settlementId',v_settlement.id,
  'state','resolved','amountCents',v_settlement.amount_cents);
 INSERT INTO sabora.h6_action_requests(actor_user_id,correlation_id,fingerprint,action,result)
  VALUES(p_actor_user_id,p_correlation_id,v_fingerprint,'refund_cash',v_result);
 RETURN v_result||jsonb_build_object('repeated',false);
END;
$refund_cash$;
ALTER FUNCTION sabora.refund_h6_cash_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.refund_h6_cash_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,sabora_h6_customer_runtime;
GRANT EXECUTE ON FUNCTION sabora.refund_h6_cash_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)
 TO sabora_h6_operations_runtime;

CREATE FUNCTION sabora.read_staff_event_backlog_h6_candidate(
 p_key_id text,p_database_role text,p_actor_user_id uuid,p_staff_role text,
 p_correlation_id text,p_issued_at_ms bigint,p_expires_at_ms bigint,p_signature_hex text,
 p_after_cursor bigint DEFAULT 0,p_limit integer DEFAULT 100
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $staff_events$
DECLARE v_role text;v_min bigint;v_max bigint;v_events jsonb;v_resync boolean;
BEGIN
 v_role:=sabora.verify_h6_staff_capability_candidate(p_key_id,p_database_role,p_actor_user_id,
  p_staff_role,'read_events',p_actor_user_id,p_correlation_id,p_issued_at_ms,p_expires_at_ms,p_signature_hex);
 IF p_after_cursor<0 OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_event_cursor' USING errcode='22023'; END IF;
 SELECT min(id),max(id) INTO v_min,v_max FROM sabora.event_outbox e
  WHERE e.expires_at>clock_timestamp() AND (
   e.staff_role=v_role OR v_role IN ('admin','root') AND e.audience IN ('admin','kitchen','waiter'));
 v_resync:=p_after_cursor>0 AND v_min IS NOT NULL AND p_after_cursor<v_min;
 IF v_resync THEN v_events:='[]'::jsonb;
 ELSE
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'eventKey',q.event_key,
   'type',q.event_type,'aggregateId',q.aggregate_id,'aggregateVersion',q.aggregate_version,
   'payload',q.payload,'createdAt',q.created_at) ORDER BY q.id),'[]'::jsonb) INTO v_events
  FROM (SELECT e.* FROM sabora.event_outbox e WHERE e.expires_at>clock_timestamp()
    AND e.id>p_after_cursor AND (e.staff_role=v_role OR v_role IN ('admin','root')
      AND e.audience IN ('admin','kitchen','waiter')) ORDER BY e.id LIMIT p_limit) q;
 END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=p_expires_at_ms THEN
  RAISE EXCEPTION 'expired_h6_staff_capability' USING errcode='42501'; END IF;
 RETURN jsonb_build_object('version',1,'role',v_role,'resyncRequired',v_resync,
  'nextCursor',CASE WHEN jsonb_array_length(v_events)>0
   THEN (v_events->(jsonb_array_length(v_events)-1)->>'id')::bigint ELSE p_after_cursor END,
  'minAvailableCursor',v_min,'maxAvailableCursor',v_max,'events',v_events);
END;
$staff_events$;
ALTER FUNCTION sabora.read_staff_event_backlog_h6_candidate(text,text,uuid,text,text,bigint,bigint,text,bigint,integer)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_staff_event_backlog_h6_candidate(text,text,uuid,text,text,bigint,bigint,text,bigint,integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_staff_event_backlog_h6_candidate(text,text,uuid,text,text,bigint,bigint,text,bigint,integer)
 TO sabora_h6_operations_runtime;

CREATE FUNCTION sabora.ingest_stripe_webhook_h6_candidate(
 p_event_id text,p_event_type text,p_provider_object_id text,p_provider_created_at timestamptz,
 p_payload_sha256 bytea,p_provider_charge_id text DEFAULT NULL,p_capture_before timestamptz DEFAULT NULL,
 p_refund_attempt_id uuid DEFAULT NULL,p_refund_status text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $stripe_webhook$
DECLARE v_existing sabora.stripe_webhook_events%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_round sabora.order_rounds%ROWTYPE;v_dispatch sabora.kitchen_dispatches%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;v_outcome text:='ignored';
BEGIN
 IF p_event_id !~ '^evt_[A-Za-z0-9]{8,128}$' OR p_event_type NOT IN (
  'payment_intent.amount_capturable_updated','payment_intent.payment_failed',
  'payment_intent.succeeded','payment_intent.canceled','charge.refunded','refund.updated')
  OR p_provider_object_id !~ '^(pi|ch|re)_[A-Za-z0-9]{8,128}$'
  OR p_provider_created_at IS NULL OR p_payload_sha256 IS NULL OR octet_length(p_payload_sha256)<>32
 OR (p_event_type='payment_intent.amount_capturable_updated' AND p_capture_before IS NULL)
  OR (p_event_type='refund.updated' AND (p_refund_attempt_id IS NULL OR
      p_refund_status NOT IN ('pending','requires_action','succeeded','failed','canceled')))
 THEN RAISE EXCEPTION 'invalid_stripe_webhook' USING errcode='22023'; END IF;
 SELECT * INTO v_existing FROM sabora.stripe_webhook_events WHERE event_id=p_event_id;
 IF FOUND THEN
  IF v_existing.payload_sha256<>p_payload_sha256 OR v_existing.event_type<>p_event_type
  THEN RAISE EXCEPTION 'stripe_event_identity_conflict' USING errcode='23505'; END IF;
  RETURN jsonb_build_object('eventId',p_event_id,'outcome',v_existing.outcome,'repeated',true);
 END IF;
 INSERT INTO sabora.stripe_webhook_events(event_id,event_type,provider_object_id,provider_created_at,payload_sha256)
 VALUES(p_event_id,p_event_type,p_provider_object_id,p_provider_created_at,p_payload_sha256);

 SELECT * INTO v_payment FROM sabora.payment_attempts p
  WHERE p.provider_intent_id=p_provider_object_id FOR UPDATE;
 IF FOUND THEN
  SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_payment.round_id FOR UPDATE;
  SELECT * INTO v_dispatch FROM sabora.kitchen_dispatches WHERE round_id=v_round.id FOR UPDATE;
  SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
  SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
   INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
   FROM sabora.orders o WHERE o.id=v_round.order_id;
  IF p_event_type='payment_intent.amount_capturable_updated'
    AND v_payment.state IN ('authorization_requested','authorization_unknown','requires_action') THEN
    UPDATE sabora.payment_attempts SET state=CASE WHEN p_capture_before>clock_timestamp()
      THEN 'authorized' ELSE 'authorization_failed' END,capture_before=p_capture_before,
      provider_error_code=CASE WHEN p_capture_before<=clock_timestamp() THEN 'authorization_expired' ELSE NULL END,
      updated_at=clock_timestamp() WHERE id=v_payment.id;
    UPDATE sabora.order_rounds SET state=CASE WHEN p_capture_before>clock_timestamp()
      THEN 'grouping' ELSE 'payment_failed' END,updated_at=clock_timestamp() WHERE id=v_round.id;
    v_outcome:='applied';
  ELSIF p_event_type='payment_intent.succeeded'
    AND v_payment.state IN ('capture_requested','capture_unknown') THEN
    UPDATE sabora.payment_attempts SET state='captured',provider_charge_id=COALESCE(p_provider_charge_id,provider_charge_id),
      updated_at=clock_timestamp() WHERE id=v_payment.id;
    UPDATE sabora.kitchen_dispatches SET state='requested',requested_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE id=v_dispatch.id;
    UPDATE sabora.order_rounds SET state='dispatch_requested',updated_at=clock_timestamp() WHERE id=v_round.id;
    PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,NULL,NULL,NULL,
      'kitchen','kitchen','sabora.kitchen.dispatch_requested',v_dispatch.id,1,
      jsonb_build_object('orderId',v_order.id,'roundId',v_round.id,
       'dispatchId',v_dispatch.id,'revisionNumber',1));
    v_outcome:='applied';
  ELSIF p_event_type='payment_intent.payment_failed'
    AND v_payment.state IN ('authorization_requested','authorization_unknown','requires_action','capture_requested','capture_unknown') THEN
    UPDATE sabora.payment_attempts SET state=CASE WHEN v_payment.state LIKE 'capture_%' THEN 'capture_failed' ELSE 'authorization_failed' END,
      updated_at=clock_timestamp() WHERE id=v_payment.id;
    UPDATE sabora.order_rounds SET state='payment_failed',updated_at=clock_timestamp() WHERE id=v_round.id;
    v_outcome:='applied';
  ELSIF p_event_type='payment_intent.canceled'
    AND v_payment.state NOT IN ('captured','released') THEN
    UPDATE sabora.payment_attempts SET state='released',updated_at=clock_timestamp() WHERE id=v_payment.id;
    UPDATE sabora.order_rounds SET state='payment_failed',updated_at=clock_timestamp() WHERE id=v_round.id;
    v_outcome:='applied';
  ELSE v_outcome:='stale'; END IF;
  IF v_outcome='applied' THEN
   PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
    v_account.customer_id,v_account.id,NULL,'customer','sabora.stripe.webhook_applied',v_payment.id,5,
    jsonb_build_object('orderId',v_order.id,'paymentAttemptId',v_payment.id,'eventType',p_event_type));
  END IF;
 END IF;
 IF v_payment.id IS NULL AND p_event_type='refund.updated' THEN
  IF NOT EXISTS(SELECT 1 FROM sabora.refund_attempts r WHERE r.id=p_refund_attempt_id
    AND (r.provider_refund_id IS NULL OR r.provider_refund_id=p_provider_object_id)) THEN
   v_outcome:='ignored';
  ELSIF p_refund_status IN ('succeeded','failed') THEN
   PERFORM sabora.record_h6_refund_outcome_candidate(p_refund_attempt_id,p_refund_status,
    CASE WHEN p_refund_status='succeeded' THEN p_provider_object_id ELSE NULL END);
   v_outcome:='applied';
  ELSE v_outcome:='stale'; END IF;
 END IF;
 UPDATE sabora.stripe_webhook_events SET processed_at=clock_timestamp(),outcome=v_outcome WHERE event_id=p_event_id;
 RETURN jsonb_build_object('eventId',p_event_id,'outcome',v_outcome,'repeated',false);
END;
$stripe_webhook$;
ALTER FUNCTION sabora.ingest_stripe_webhook_h6_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text)
 OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.ingest_stripe_webhook_h6_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.ingest_stripe_webhook_h6_candidate(text,text,text,timestamptz,bytea,text,timestamptz,uuid,text)
 TO sabora_h6_provider_runtime;

CREATE FUNCTION sabora.record_h6_refund_outcome_candidate(
 p_refund_attempt_id uuid,p_outcome text,p_provider_refund_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $refund_outcome$
DECLARE v_refund sabora.refund_attempts%ROWTYPE;v_incident sabora.incident_cases%ROWTYPE;
 v_round sabora.order_rounds%ROWTYPE;v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;
 v_next text;v_repeated boolean:=false;
BEGIN
 IF p_outcome NOT IN ('succeeded','failed','unknown') OR (p_outcome='succeeded'
   AND p_provider_refund_id !~ '^re_[A-Za-z0-9]{8,128}$') THEN
  RAISE EXCEPTION 'invalid_refund_outcome' USING errcode='22023'; END IF;
 SELECT * INTO v_refund FROM sabora.refund_attempts WHERE id=p_refund_attempt_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found' USING errcode='P0002'; END IF;
 v_next:=p_outcome;
 IF v_refund.state=v_next THEN v_repeated:=true;
 ELSIF v_refund.state NOT IN ('requested','unknown') THEN RAISE EXCEPTION 'invalid_refund_transition' USING errcode='23514';
 ELSE UPDATE sabora.refund_attempts SET state=v_next,provider_refund_id=COALESCE(p_provider_refund_id,provider_refund_id),
  updated_at=clock_timestamp() WHERE id=v_refund.id RETURNING * INTO v_refund; END IF;
 IF v_refund.incident_id IS NULL THEN
  SELECT r.* INTO v_round FROM sabora.order_rounds r WHERE r.id=(
   SELECT p.round_id FROM sabora.payment_attempts p WHERE p.id=v_refund.payment_attempt_id);
 ELSE
  SELECT * INTO v_incident FROM sabora.incident_cases WHERE id=v_refund.incident_id;
  SELECT * INTO v_round FROM sabora.order_rounds WHERE id=v_incident.round_id;
 END IF;
 IF p_outcome='succeeded' AND v_refund.incident_id IS NOT NULL THEN
  UPDATE sabora.incident_cases SET state='resolved' WHERE id=v_refund.incident_id;
 ELSIF p_outcome='succeeded' AND v_refund.incident_id IS NULL THEN
  UPDATE sabora.payment_attempts SET state='released',updated_at=clock_timestamp()
   WHERE id=v_refund.payment_attempt_id;
  UPDATE sabora.order_rounds SET state='cancelled',updated_at=clock_timestamp() WHERE id=v_round.id;
  UPDATE sabora.kitchen_dispatches SET state='failed',failure_code='compensated_refund',
   updated_at=clock_timestamp() WHERE round_id=v_round.id AND state='compensation_required';
 END IF;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=v_round.order_id;
 PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
  v_account.customer_id,v_account.id,NULL,'customer','sabora.refund.'||v_next,v_refund.id,2,
  jsonb_build_object('orderId',v_order.id,'refundAttemptId',v_refund.id,'state',v_next,
   'amountCents',v_refund.amount_cents));
 RETURN jsonb_build_object('refundAttemptId',v_refund.id,'state',v_next,'repeated',v_repeated);
END;
$refund_outcome$;
ALTER FUNCTION sabora.record_h6_refund_outcome_candidate(uuid,text,text) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.record_h6_refund_outcome_candidate(uuid,text,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,
  sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.record_h6_refund_outcome_candidate(uuid,text,text)
 TO sabora_h6_provider_runtime;

CREATE FUNCTION sabora.request_h6_refund_candidate(p_refund_attempt_id uuid)
RETURNS TABLE(refund_attempt_id uuid,provider_charge_id text,amount_cents bigint,
 idempotency_key text,action text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $request_refund$
DECLARE v_refund sabora.refund_attempts%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
BEGIN
 SELECT * INTO v_refund FROM sabora.refund_attempts WHERE id=p_refund_attempt_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found' USING errcode='P0002'; END IF;
 SELECT * INTO v_payment FROM sabora.payment_attempts WHERE id=v_refund.payment_attempt_id FOR UPDATE;
 IF v_refund.state='succeeded' THEN
  RETURN QUERY SELECT v_refund.id,v_payment.provider_charge_id,v_refund.amount_cents,
   v_refund.idempotency_key,'done',true;RETURN;
 ELSIF v_refund.state='failed' THEN
  RETURN QUERY SELECT v_refund.id,v_payment.provider_charge_id,v_refund.amount_cents,
   v_refund.idempotency_key,'blocked',true;RETURN;
 ELSIF v_payment.state NOT IN ('captured','refund_required') OR v_payment.provider_charge_id IS NULL THEN
  RAISE EXCEPTION 'refund_source_unavailable' USING errcode='23514';
 END IF;
 RETURN QUERY SELECT v_refund.id,v_payment.provider_charge_id,v_refund.amount_cents,
  v_refund.idempotency_key,'refund',(v_refund.state='unknown');
END;
$request_refund$;
ALTER FUNCTION sabora.request_h6_refund_candidate(uuid) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.request_h6_refund_candidate(uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.request_h6_refund_candidate(uuid) TO sabora_h6_provider_runtime;

CREATE FUNCTION sabora.request_h6_release_candidate(p_order_id uuid)
RETURNS TABLE(payment_attempt_id uuid,provider_intent_id text,idempotency_key text,action text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $request_release$
DECLARE v_round sabora.order_rounds%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
BEGIN
 SELECT * INTO v_round FROM sabora.order_rounds WHERE order_id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'round_not_found' USING errcode='P0002'; END IF;
 SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
 IF v_payment.id IS NULL THEN RAISE EXCEPTION 'payment_attempt_not_found' USING errcode='P0002'; END IF;
 IF v_payment.state='released' THEN
  RETURN QUERY SELECT v_payment.id,v_payment.provider_intent_id,
   'h6_release_'||replace(v_payment.id::text,'-','_'),'done',true;RETURN;
 ELSIF v_payment.state<>'release_requested' OR v_payment.provider_intent_id IS NULL THEN
  RAISE EXCEPTION 'payment_not_releasable' USING errcode='23514';
 END IF;
 RETURN QUERY SELECT v_payment.id,v_payment.provider_intent_id,
  'h6_release_'||replace(v_payment.id::text,'-','_'),'release',false;
END;
$request_release$;
ALTER FUNCTION sabora.request_h6_release_candidate(uuid) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.request_h6_release_candidate(uuid)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.request_h6_release_candidate(uuid) TO sabora_h6_provider_runtime;

CREATE FUNCTION sabora.record_h6_release_outcome_candidate(
 p_order_id uuid,p_outcome text,p_error_code text DEFAULT NULL)
RETURNS TABLE(payment_state text,round_state text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $release_outcome$
DECLARE v_round sabora.order_rounds%ROWTYPE;v_payment sabora.payment_attempts%ROWTYPE;
 v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;v_repeated boolean:=false;
BEGIN
 IF p_outcome NOT IN ('released','failed','unknown') OR
    (p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_]{1,80}$')
 THEN RAISE EXCEPTION 'invalid_release_outcome' USING errcode='22023'; END IF;
 SELECT * INTO v_round FROM sabora.order_rounds WHERE order_id=p_order_id FOR UPDATE;
 SELECT * INTO v_payment FROM sabora.payment_attempts WHERE round_id=v_round.id FOR UPDATE;
 IF v_payment.id IS NULL THEN RAISE EXCEPTION 'payment_attempt_not_found' USING errcode='P0002'; END IF;
 IF p_outcome='released' AND v_payment.state='released' THEN v_repeated:=true;
 ELSIF v_payment.state<>'release_requested' THEN
  RAISE EXCEPTION 'invalid_release_transition' USING errcode='23514';
 ELSE
  UPDATE sabora.payment_attempts SET state=CASE p_outcome WHEN 'released' THEN 'released'
    WHEN 'unknown' THEN 'authorization_unknown' ELSE 'release_requested' END,
    provider_error_code=p_error_code,updated_at=clock_timestamp() WHERE id=v_payment.id RETURNING * INTO v_payment;
  UPDATE sabora.order_rounds SET state=CASE p_outcome WHEN 'released' THEN 'cancelled'
    WHEN 'unknown' THEN 'payment_unknown' ELSE state END,updated_at=clock_timestamp()
    WHERE id=v_round.id RETURNING * INTO v_round;
  SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
  SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
   INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
   FROM sabora.orders o WHERE o.id=p_order_id;
  PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
   v_account.customer_id,v_account.id,NULL,'customer','sabora.payment.release_'||p_outcome,
   v_payment.id,7,jsonb_build_object('orderId',p_order_id,'paymentAttemptId',v_payment.id,'outcome',p_outcome));
 END IF;
 RETURN QUERY SELECT v_payment.state,v_round.state,v_repeated;
END;
$release_outcome$;
ALTER FUNCTION sabora.record_h6_release_outcome_candidate(uuid,text,text) OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.record_h6_release_outcome_candidate(uuid,text,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_customer_runtime,sabora_h6_operations_runtime;
GRANT EXECUTE ON FUNCTION sabora.record_h6_release_outcome_candidate(uuid,text,text)
 TO sabora_h6_provider_runtime;

CREATE FUNCTION sabora.project_order_line_event_to_h6_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $line_event$
DECLARE v_round sabora.order_rounds%ROWTYPE;v_account sabora.customer_accounts%ROWTYPE;v_order sabora.orders%ROWTYPE;
BEGIN
 SELECT r.* INTO v_round FROM sabora.order_rounds r WHERE r.order_id=NEW.order_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT * INTO v_account FROM sabora.customer_accounts WHERE id=v_round.account_id;
 SELECT o.id,o.table_id,o.session_id,o.customer_visit_key
  INTO v_order.id,v_order.table_id,v_order.session_id,v_order.customer_visit_key
  FROM sabora.orders o WHERE o.id=NEW.order_id;
 PERFORM sabora.emit_h6_event_candidate(v_order.table_id,v_order.session_id,v_order.customer_visit_key,
  v_account.customer_id,v_account.id,NULL,'customer','sabora.order_line.'||NEW.to_status,
  NEW.order_line_id,(extract(epoch FROM NEW.occurred_at)*1000000)::bigint,
  jsonb_build_object('orderId',NEW.order_id,'lineId',NEW.order_line_id,'status',NEW.to_status));
 RETURN NEW;
END;
$line_event$;
ALTER FUNCTION sabora.project_order_line_event_to_h6_candidate() OWNER TO sabora_h6_fn_owner;
REVOKE ALL ON FUNCTION sabora.project_order_line_event_to_h6_candidate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER h6_order_line_event_outbox AFTER INSERT ON sabora.order_line_events
 FOR EACH ROW EXECUTE FUNCTION sabora.project_order_line_event_to_h6_candidate();

COMMENT ON TABLE sabora.event_outbox IS
 'H6 seven-day logical replay window; expired rows are excluded. Physical pruning requires a separately authorized maintenance procedure.';
COMMENT ON FUNCTION sabora.read_customer_event_backlog_h6_candidate(bytea,uuid,text,uuid,bigint,integer) IS
 'One-shot authorized replay, maximum 100 events. It is invoked on connect/reconnect or a committed-event signal, never by periodic business polling.';

COMMIT;
