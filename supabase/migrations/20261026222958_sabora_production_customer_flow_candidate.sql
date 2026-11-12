-- Sabora H3 production-readiness candidate. Dormant by default.
--
-- This migration creates NOLOGIN capabilities and sealed SECURITY DEFINER
-- wrappers only. It does not provision connection logins, credentials, keys,
-- browser grants or operational endpoints.
BEGIN;

CREATE ROLE sabora_customer_registration_runtime
  NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE sabora_customer_registration_fn_owner
  NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE sabora_customer_flow_runtime
  NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE sabora_customer_flow_fn_owner
  NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

GRANT USAGE ON SCHEMA sabora
  TO sabora_customer_registration_fn_owner, sabora_customer_flow_fn_owner;

GRANT INSERT(id, public_id, alias, company)
  ON sabora.customer_profiles TO sabora_customer_registration_fn_owner;
GRANT SELECT(id, public_id, alias, company)
  ON sabora.customer_profiles TO sabora_customer_registration_fn_owner;
GRANT INSERT(id, customer_id, token_hash, created_at, expires_at)
  ON sabora.customer_sessions TO sabora_customer_registration_fn_owner;
GRANT SELECT(id) ON sabora.customer_sessions TO sabora_customer_registration_fn_owner;

CREATE POLICY customer_registration_profile_insert
  ON sabora.customer_profiles FOR INSERT
  TO sabora_customer_registration_fn_owner WITH CHECK (true);
CREATE POLICY customer_registration_profile_read
  ON sabora.customer_profiles FOR SELECT
  TO sabora_customer_registration_fn_owner USING (true);
CREATE POLICY customer_registration_session_insert
  ON sabora.customer_sessions FOR INSERT
  TO sabora_customer_registration_fn_owner WITH CHECK (true);
CREATE POLICY customer_registration_session_read
  ON sabora.customer_sessions FOR SELECT
  TO sabora_customer_registration_fn_owner USING (true);

CREATE FUNCTION sabora.register_customer_profile_session_candidate(
  p_profile_id uuid,
  p_public_id text,
  p_alias text,
  p_company text,
  p_session_id uuid,
  p_token_hash bytea,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
RETURNS TABLE(profile_id uuid, public_id text, alias text, company text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $registration$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_profile_id IS NULL OR p_session_id IS NULL
    OR p_public_id !~ '^SB-[2-9A-HJ-NP-Y]{12}$'
    OR p_alias IS NULL OR length(btrim(p_alias)) NOT BETWEEN 1 AND 80
    OR p_alias ~ '[[:cntrl:]]'
    OR (p_company IS NOT NULL AND (
      length(btrim(p_company)) NOT BETWEEN 1 AND 160
      OR p_company ~ '[[:cntrl:]]'
    ))
    OR p_token_hash IS NULL OR octet_length(p_token_hash) <> 32
    OR p_created_at IS NULL OR p_expires_at IS NULL
    OR p_created_at < v_now - interval '5 minutes'
    OR p_created_at > v_now + interval '30 seconds'
    OR p_expires_at < p_created_at + interval '1 minute'
    OR p_expires_at > p_created_at + interval '90 days'
  THEN
    RAISE EXCEPTION 'invalid_customer_registration_input' USING errcode = '22023';
  END IF;

  INSERT INTO sabora.customer_profiles(id, public_id, alias, company)
    VALUES (p_profile_id, p_public_id, btrim(p_alias),
      CASE WHEN p_company IS NULL THEN NULL ELSE btrim(p_company) END);
  INSERT INTO sabora.customer_sessions(
    id, customer_id, token_hash, created_at, expires_at
  ) VALUES (
    p_session_id, p_profile_id, p_token_hash, p_created_at, p_expires_at
  );

  RETURN QUERY SELECT p_profile_id, p_public_id, btrim(p_alias),
    CASE WHEN p_company IS NULL THEN NULL ELSE btrim(p_company) END;
END;
$registration$;
ALTER FUNCTION sabora.register_customer_profile_session_candidate(
  uuid, text, text, text, uuid, bytea, timestamptz, timestamptz
) OWNER TO sabora_customer_registration_fn_owner;
REVOKE ALL ON FUNCTION sabora.register_customer_profile_session_candidate(
  uuid, text, text, text, uuid, bytea, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated, sabora_admin_writer,
  sabora_customer_session_runtime, sabora_catalog_reader;
GRANT USAGE ON SCHEMA sabora TO sabora_customer_registration_runtime;
GRANT EXECUTE ON FUNCTION sabora.register_customer_profile_session_candidate(
  uuid, text, text, text, uuid, bytea, timestamptz, timestamptz
) TO sabora_customer_registration_runtime;

CREATE TABLE sabora.customer_order_attempt_batches (
  id uuid PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
  session_id uuid NOT NULL,
  visit_id text NOT NULL CHECK (visit_id ~ '^[A-Za-z0-9_-]{16,128}$'),
  basket_id text NOT NULL CHECK (basket_id ~ '^[A-Za-z0-9_-]{16,128}$'),
  actor_id text NOT NULL CHECK (actor_id ~ '^[A-Za-z0-9_-]{16,128}$'),
  customer_id uuid NOT NULL REFERENCES sabora.customer_profiles(id),
  request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  request_fingerprint bytea NOT NULL CHECK (octet_length(request_fingerprint) = 32),
  accepted_reprice boolean NOT NULL DEFAULT false,
  accepted_at timestamptz,
  economic_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(economic_snapshot) = 'object'
    AND economic_snapshot->>'schemaVersion' = '1'
    AND jsonb_typeof(economic_snapshot->'lines') = 'array'
    AND jsonb_array_length(economic_snapshot->'lines') BETWEEN 1 AND 50
  ),
  order_id uuid NOT NULL REFERENCES sabora.orders(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT customer_order_attempt_acceptance CHECK (
    (accepted_reprice AND accepted_at IS NOT NULL)
    OR (NOT accepted_reprice AND accepted_at IS NULL)
  ),
  CONSTRAINT customer_order_attempt_scope_unique UNIQUE (
    table_id, session_id, visit_id, basket_id, actor_id, request_key
  ),
  CONSTRAINT customer_order_attempt_order_unique UNIQUE (order_id),
  CONSTRAINT customer_order_attempt_order_scope FOREIGN KEY (
    table_id, session_id, order_id
  ) REFERENCES sabora.orders(table_id, session_id, id)
);

CREATE TABLE sabora.customer_order_attempt_lines (
  batch_id uuid NOT NULL REFERENCES sabora.customer_order_attempt_batches(id),
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 50),
  quote_id uuid NOT NULL UNIQUE REFERENCES sabora.catalog_displayed_quotes(id),
  item_id uuid NOT NULL REFERENCES sabora.catalog_items(id),
  economic_evidence jsonb NOT NULL CHECK (
    jsonb_typeof(economic_evidence) = 'object'
    AND economic_evidence->>'schemaVersion' = '1'
  ),
  PRIMARY KEY (batch_id, line_number)
);

CREATE INDEX customer_order_attempt_customer_lookup
  ON sabora.customer_order_attempt_batches(customer_id, created_at DESC, id);
ALTER TABLE sabora.customer_order_attempt_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.customer_order_attempt_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.customer_order_attempt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.customer_order_attempt_lines FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.customer_order_attempt_batches,
  sabora.customer_order_attempt_lines
  FROM PUBLIC, anon, authenticated, sabora_admin_writer;

CREATE TRIGGER customer_order_attempt_batches_append_only
  BEFORE UPDATE OR DELETE ON sabora.customer_order_attempt_batches
  FOR EACH ROW EXECUTE FUNCTION sabora.reject_catalog_ledger_mutation();
CREATE TRIGGER customer_order_attempt_batches_no_truncate
  BEFORE TRUNCATE ON sabora.customer_order_attempt_batches
  FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_catalog_ledger_mutation();
CREATE TRIGGER customer_order_attempt_lines_append_only
  BEFORE UPDATE OR DELETE ON sabora.customer_order_attempt_lines
  FOR EACH ROW EXECUTE FUNCTION sabora.reject_catalog_ledger_mutation();
CREATE TRIGGER customer_order_attempt_lines_no_truncate
  BEFORE TRUNCATE ON sabora.customer_order_attempt_lines
  FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_catalog_ledger_mutation();

GRANT SELECT(id, customer_id, token_hash, expires_at, revoked_at)
  ON sabora.customer_sessions TO sabora_customer_flow_fn_owner;
-- PostgreSQL locking clauses require UPDATE on at least one column. Limiting
-- that capability to the immutable identifier lets the sealed NOLOGIN owner
-- serialize with revocation without granting a mutable business column.
GRANT UPDATE(id) ON sabora.customer_sessions TO sabora_customer_flow_fn_owner;
GRANT SELECT(id, public_id, alias, company)
  ON sabora.customer_profiles TO sabora_customer_flow_fn_owner;
GRANT UPDATE(id) ON sabora.customer_profiles TO sabora_customer_flow_fn_owner;
GRANT SELECT(id, session_id, qr_token_hash, qr_version, ordering_state,
  pause_until, first_confirmed_at, grouping_window_seconds)
  ON sabora.dining_tables TO sabora_customer_flow_fn_owner;
GRANT UPDATE(first_confirmed_at) ON sabora.dining_tables
  TO sabora_customer_flow_fn_owner;
GRANT SELECT(id, table_id, session_id, customer_id, visit_key, actor_id,
  authorized_qr_version, expires_at, revoked_at)
  ON sabora.customer_table_visits TO sabora_customer_flow_fn_owner;
GRANT UPDATE(id) ON sabora.customer_table_visits TO sabora_customer_flow_fn_owner;
GRANT INSERT(id, table_id, session_id, customer_id, visit_key, actor_id,
  authorized_qr_version, granted_at, expires_at)
  ON sabora.customer_table_visits TO sabora_customer_flow_fn_owner;
GRANT SELECT(id, published_revision, published_snapshot, withdrawn_at, sold_out)
  ON sabora.catalog_items TO sabora_customer_flow_fn_owner;
GRANT UPDATE(id) ON sabora.catalog_items TO sabora_customer_flow_fn_owner;
GRANT SELECT(id, table_id, session_id, visit_id, basket_id, actor_id, item_id,
  published_revision, subtotal_cents, discount_cents, total_cents, evidence,
  created_at, expires_at)
  ON sabora.catalog_displayed_quotes TO sabora_customer_flow_fn_owner;
GRANT UPDATE(id) ON sabora.catalog_displayed_quotes TO sabora_customer_flow_fn_owner;
GRANT INSERT(id, table_id, session_id, visit_id, basket_id, actor_id, item_id,
  published_revision, subtotal_cents, discount_cents, total_cents, evidence,
  expires_at)
  ON sabora.catalog_displayed_quotes TO sabora_customer_flow_fn_owner;
GRANT INSERT(id, table_id, session_id, company, employee_number, customer_alias,
  customer_identifier, customer_visit_key, economic_snapshot, confirmed_at,
  grouping, items)
  ON sabora.orders TO sabora_customer_flow_fn_owner;
GRANT SELECT(id, table_id, session_id, grouping, confirmed_at)
  ON sabora.orders TO sabora_customer_flow_fn_owner;
GRANT INSERT(table_id, session_id, order_id, line_number, category, name, quantity)
  ON sabora.order_lines TO sabora_customer_flow_fn_owner;
GRANT SELECT(id, table_id, session_id, visit_id, basket_id, actor_id,
  customer_id, request_key, request_fingerprint, accepted_reprice, accepted_at,
  economic_snapshot, order_id, created_at)
  ON sabora.customer_order_attempt_batches TO sabora_customer_flow_fn_owner;
GRANT UPDATE(id) ON sabora.customer_order_attempt_batches TO sabora_customer_flow_fn_owner;
GRANT INSERT(id, table_id, session_id, visit_id, basket_id, actor_id,
  customer_id, request_key, request_fingerprint, accepted_reprice, accepted_at,
  economic_snapshot, order_id)
  ON sabora.customer_order_attempt_batches TO sabora_customer_flow_fn_owner;
GRANT SELECT(batch_id, line_number, quote_id, item_id, economic_evidence)
  ON sabora.customer_order_attempt_lines TO sabora_customer_flow_fn_owner;
GRANT INSERT(batch_id, line_number, quote_id, item_id, economic_evidence)
  ON sabora.customer_order_attempt_lines TO sabora_customer_flow_fn_owner;

CREATE POLICY customer_flow_session_read ON sabora.customer_sessions
  FOR SELECT TO sabora_customer_flow_fn_owner USING (true);
CREATE POLICY customer_flow_session_lock ON sabora.customer_sessions
  FOR UPDATE TO sabora_customer_flow_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY customer_flow_profile_read ON sabora.customer_profiles
  FOR SELECT TO sabora_customer_flow_fn_owner USING (true);
CREATE POLICY customer_flow_profile_lock ON sabora.customer_profiles
  FOR UPDATE TO sabora_customer_flow_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY customer_flow_table_read ON sabora.dining_tables
  FOR SELECT TO sabora_customer_flow_fn_owner USING (true);
CREATE POLICY customer_flow_table_update ON sabora.dining_tables
  FOR UPDATE TO sabora_customer_flow_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY customer_flow_visit_read ON sabora.customer_table_visits
  FOR SELECT TO sabora_customer_flow_fn_owner USING (true);
CREATE POLICY customer_flow_visit_lock ON sabora.customer_table_visits
  FOR UPDATE TO sabora_customer_flow_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY customer_flow_visit_insert ON sabora.customer_table_visits
  FOR INSERT TO sabora_customer_flow_fn_owner WITH CHECK (true);
CREATE POLICY customer_flow_catalog_read ON sabora.catalog_items
  FOR SELECT TO sabora_customer_flow_fn_owner USING (true);
CREATE POLICY customer_flow_catalog_lock ON sabora.catalog_items
  FOR UPDATE TO sabora_customer_flow_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY customer_flow_quote_read ON sabora.catalog_displayed_quotes
  FOR SELECT TO sabora_customer_flow_fn_owner USING (true);
CREATE POLICY customer_flow_quote_lock ON sabora.catalog_displayed_quotes
  FOR UPDATE TO sabora_customer_flow_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY customer_flow_quote_insert ON sabora.catalog_displayed_quotes
  FOR INSERT TO sabora_customer_flow_fn_owner WITH CHECK (true);
CREATE POLICY customer_flow_order_read ON sabora.orders
  FOR SELECT TO sabora_customer_flow_fn_owner USING (true);
CREATE POLICY customer_flow_order_insert ON sabora.orders
  FOR INSERT TO sabora_customer_flow_fn_owner WITH CHECK (true);
CREATE POLICY customer_flow_order_line_insert ON sabora.order_lines
  FOR INSERT TO sabora_customer_flow_fn_owner WITH CHECK (true);
CREATE POLICY customer_flow_attempt_read ON sabora.customer_order_attempt_batches
  FOR SELECT TO sabora_customer_flow_fn_owner USING (true);
CREATE POLICY customer_flow_attempt_lock ON sabora.customer_order_attempt_batches
  FOR UPDATE TO sabora_customer_flow_fn_owner USING (true) WITH CHECK (true);
CREATE POLICY customer_flow_attempt_insert ON sabora.customer_order_attempt_batches
  FOR INSERT TO sabora_customer_flow_fn_owner WITH CHECK (true);
CREATE POLICY customer_flow_attempt_line_read ON sabora.customer_order_attempt_lines
  FOR SELECT TO sabora_customer_flow_fn_owner USING (true);
CREATE POLICY customer_flow_attempt_line_insert ON sabora.customer_order_attempt_lines
  FOR INSERT TO sabora_customer_flow_fn_owner WITH CHECK (true);

CREATE FUNCTION sabora.authorize_customer_visit_candidate(
  p_session_hash bytea,
  p_table_id uuid,
  p_qr_token text,
  p_visit_key text,
  p_basket_id text,
  p_expires_at timestamptz
)
RETURNS TABLE(
  table_id uuid, session_id uuid, visit_key text, basket_id text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $visit$
DECLARE
  v_customer_id uuid;
  v_table sabora.dining_tables%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_session_hash IS NULL OR octet_length(p_session_hash) <> 32
    OR p_table_id IS NULL OR p_qr_token IS NULL
    OR length(p_qr_token) NOT BETWEEN 32 AND 512
    OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$'
    OR p_basket_id !~ '^[A-Za-z0-9_-]{16,128}$'
    OR p_expires_at IS NULL
    OR p_expires_at < v_now + interval '1 minute'
    OR p_expires_at > v_now + interval '24 hours'
  THEN
    RAISE EXCEPTION 'invalid_customer_visit_input' USING errcode = '22023';
  END IF;

  SELECT s.customer_id INTO v_customer_id
    FROM sabora.customer_sessions s
    JOIN sabora.customer_profiles p ON p.id = s.customer_id
    WHERE s.token_hash = p_session_hash
      AND s.revoked_at IS NULL AND s.expires_at > v_now
    FOR SHARE OF s, p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer_session_forbidden' USING errcode = '42501';
  END IF;

  SELECT t.id, t.session_id, t.qr_version
    INTO v_table.id, v_table.session_id, v_table.qr_version
    FROM sabora.dining_tables t
    WHERE t.id = p_table_id
      AND t.qr_token_hash = sha256(convert_to(p_qr_token, 'UTF8'))
      AND (
        t.ordering_state = 'open'
        OR (t.ordering_state = 'paused' AND t.pause_until IS NOT NULL
          AND t.pause_until <= v_now)
      )
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer_table_forbidden' USING errcode = '42501';
  END IF;

  INSERT INTO sabora.customer_table_visits(
    id, table_id, session_id, customer_id, visit_key, actor_id,
    authorized_qr_version, granted_at, expires_at
  ) VALUES (
    gen_random_uuid(), v_table.id, v_table.session_id, v_customer_id,
    p_visit_key, v_customer_id::text, v_table.qr_version, v_now, p_expires_at
  );

  RETURN QUERY SELECT v_table.id, v_table.session_id, p_visit_key,
    p_basket_id, p_expires_at;
END;
$visit$;

CREATE FUNCTION sabora.prepare_customer_quote_candidate(
  p_session_hash bytea,
  p_table_id uuid,
  p_qr_token text,
  p_visit_key text,
  p_basket_id text,
  p_item_id uuid
)
RETURNS TABLE(
  customer_id uuid, actor_id text, session_id uuid,
  customer_alias text, customer_identifier text,
  published_revision bigint, published_snapshot jsonb, available boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $prepare_quote$
  SELECT s.customer_id, v.actor_id, t.session_id,
         p.alias, p.public_id, c.published_revision, c.published_snapshot,
         (c.withdrawn_at IS NULL AND NOT c.sold_out) AS available
    FROM sabora.customer_sessions s
    JOIN sabora.customer_profiles p ON p.id = s.customer_id
    JOIN sabora.dining_tables t ON t.id = p_table_id
    JOIN sabora.customer_table_visits v
      ON v.table_id = t.id AND v.session_id = t.session_id
      AND v.customer_id = s.customer_id
    JOIN sabora.catalog_items c ON c.id = p_item_id
    WHERE octet_length(p_session_hash) = 32
      AND s.token_hash = p_session_hash
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
      AND p_visit_key ~ '^[A-Za-z0-9_-]{16,128}$'
      AND p_basket_id ~ '^[A-Za-z0-9_-]{16,128}$'
      AND v.visit_key = p_visit_key
      AND v.actor_id = s.customer_id::text
      AND v.revoked_at IS NULL AND v.expires_at > clock_timestamp()
      AND v.authorized_qr_version = t.qr_version
      AND length(p_qr_token) BETWEEN 32 AND 512
      AND t.qr_token_hash = sha256(convert_to(p_qr_token, 'UTF8'))
      AND (t.ordering_state = 'open' OR (
        t.ordering_state = 'paused' AND t.pause_until IS NOT NULL
        AND t.pause_until <= clock_timestamp()
      ))
      AND c.published_revision IS NOT NULL
      AND c.published_snapshot IS NOT NULL
    FOR UPDATE OF t
    FOR SHARE OF s, p, v, c
$prepare_quote$;

CREATE FUNCTION sabora.insert_customer_quote_candidate(
  p_session_hash bytea,
  p_table_id uuid,
  p_qr_token text,
  p_visit_key text,
  p_basket_id text,
  p_quote_id uuid,
  p_item_id uuid,
  p_published_revision bigint,
  p_evidence jsonb,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $insert_quote$
DECLARE
  v_context record;
  v_now timestamptz := clock_timestamp();
  v_subtotal bigint;
  v_discount bigint;
  v_total bigint;
BEGIN
  IF p_quote_id IS NULL OR p_item_id IS NULL
    OR p_published_revision IS NULL OR p_published_revision <= 0
    OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
    OR p_evidence->>'schemaVersion' IS DISTINCT FROM '1'
    OR p_evidence->>'itemId' IS DISTINCT FROM p_item_id::text
    OR (p_evidence->>'publishedRevision') IS NULL
    OR (p_evidence->>'publishedRevision') !~ '^[1-9][0-9]*$'
    OR (p_evidence->>'publishedRevision')::bigint <> p_published_revision
    OR (p_evidence->>'subtotalCents') !~ '^(0|[1-9][0-9]*)$'
    OR (p_evidence->>'discountCents') !~ '^(0|[1-9][0-9]*)$'
    OR (p_evidence->>'totalCents') !~ '^(0|[1-9][0-9]*)$'
    OR p_expires_at IS NULL OR p_expires_at <= v_now
    OR p_expires_at > v_now + interval '30 minutes'
  THEN
    RAISE EXCEPTION 'invalid_customer_quote_input' USING errcode = '22023';
  END IF;
  v_subtotal := (p_evidence->>'subtotalCents')::bigint;
  v_discount := (p_evidence->>'discountCents')::bigint;
  v_total := (p_evidence->>'totalCents')::bigint;
  IF v_discount > v_subtotal OR v_total <> v_subtotal - v_discount THEN
    RAISE EXCEPTION 'invalid_customer_quote_input' USING errcode = '22023';
  END IF;

  SELECT * INTO v_context FROM sabora.prepare_customer_quote_candidate(
    p_session_hash, p_table_id, p_qr_token, p_visit_key, p_basket_id, p_item_id
  );
  IF NOT FOUND OR v_context.available IS DISTINCT FROM true
    OR v_context.published_revision <> p_published_revision
  THEN
    RAISE EXCEPTION 'customer_quote_context_changed' USING errcode = '40001';
  END IF;

  INSERT INTO sabora.catalog_displayed_quotes(
    id, table_id, session_id, visit_id, basket_id, actor_id, item_id,
    published_revision, subtotal_cents, discount_cents, total_cents,
    evidence, expires_at
  ) VALUES (
    p_quote_id, p_table_id, v_context.session_id, p_visit_key, p_basket_id,
    v_context.actor_id, p_item_id, p_published_revision,
    v_subtotal, v_discount, v_total, p_evidence, p_expires_at
  );
  RETURN p_quote_id;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid_customer_quote_input' USING errcode = '22023';
END;
$insert_quote$;

CREATE FUNCTION sabora.lookup_customer_order_attempt_candidate(
  p_session_hash bytea,
  p_table_id uuid,
  p_qr_token text,
  p_visit_key text,
  p_basket_id text,
  p_request_key text
)
RETURNS TABLE(
  customer_id uuid, actor_id text, session_id uuid,
  customer_alias text, customer_identifier text,
  request_fingerprint bytea, order_id uuid, "grouping" text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $lookup_attempt$
  SELECT s.customer_id, v.actor_id, t.session_id, p.alias, p.public_id,
         b.request_fingerprint, b.order_id, o.grouping
    FROM sabora.customer_sessions s
    JOIN sabora.customer_profiles p ON p.id = s.customer_id
    JOIN sabora.dining_tables t ON t.id = p_table_id
    JOIN sabora.customer_table_visits v
      ON v.table_id = t.id AND v.session_id = t.session_id
      AND v.customer_id = s.customer_id
    LEFT JOIN sabora.customer_order_attempt_batches b
      ON b.table_id = t.id AND b.session_id = t.session_id
      AND b.visit_id = p_visit_key AND b.basket_id = p_basket_id
      AND b.actor_id = v.actor_id AND b.request_key = p_request_key
    LEFT JOIN sabora.orders o ON o.id = b.order_id
    WHERE octet_length(p_session_hash) = 32
      AND s.token_hash = p_session_hash
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
      AND p_visit_key ~ '^[A-Za-z0-9_-]{16,128}$'
      AND p_basket_id ~ '^[A-Za-z0-9_-]{16,128}$'
      AND p_request_key ~ '^[A-Za-z0-9_-]{16,128}$'
      AND v.visit_key = p_visit_key AND v.actor_id = s.customer_id::text
      AND v.revoked_at IS NULL AND v.expires_at > clock_timestamp()
      AND v.authorized_qr_version = t.qr_version
      AND length(p_qr_token) BETWEEN 32 AND 512
      AND t.qr_token_hash = sha256(convert_to(p_qr_token, 'UTF8'))
      AND (t.ordering_state = 'open' OR (
        t.ordering_state = 'paused' AND t.pause_until IS NOT NULL
        AND t.pause_until <= clock_timestamp()
      ))
    FOR UPDATE OF t
    FOR SHARE OF s, p, v
$lookup_attempt$;

CREATE FUNCTION sabora.prepare_customer_confirmation_line_candidate(
  p_session_hash bytea,
  p_table_id uuid,
  p_qr_token text,
  p_visit_key text,
  p_basket_id text,
  p_item_id uuid,
  p_quote_id uuid
)
RETURNS TABLE(
  published_revision bigint, published_snapshot jsonb, available boolean,
  quote_evidence jsonb, quote_expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $prepare_confirmation$
  SELECT c.published_revision, c.published_snapshot,
         (c.withdrawn_at IS NULL AND NOT c.sold_out) AS available,
         q.evidence, q.expires_at
    FROM sabora.customer_sessions s
    JOIN sabora.dining_tables t ON t.id = p_table_id
    JOIN sabora.customer_table_visits v
      ON v.table_id = t.id AND v.session_id = t.session_id
      AND v.customer_id = s.customer_id
    JOIN sabora.catalog_items c ON c.id = p_item_id
    JOIN sabora.catalog_displayed_quotes q
      ON q.id = p_quote_id AND q.table_id = t.id
      AND q.session_id = t.session_id AND q.visit_id = p_visit_key
      AND q.basket_id = p_basket_id AND q.actor_id = s.customer_id::text
      AND q.item_id = c.id
    WHERE octet_length(p_session_hash) = 32
      AND s.token_hash = p_session_hash
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
      AND v.visit_key = p_visit_key AND v.actor_id = s.customer_id::text
      AND v.revoked_at IS NULL AND v.expires_at > clock_timestamp()
      AND v.authorized_qr_version = t.qr_version
      AND length(p_qr_token) BETWEEN 32 AND 512
      AND t.qr_token_hash = sha256(convert_to(p_qr_token, 'UTF8'))
      AND (t.ordering_state = 'open' OR (
        t.ordering_state = 'paused' AND t.pause_until IS NOT NULL
        AND t.pause_until <= clock_timestamp()
      ))
      AND c.published_revision IS NOT NULL
      AND c.published_snapshot IS NOT NULL
      AND q.expires_at > clock_timestamp()
    FOR UPDATE OF t
    FOR SHARE OF s, v, c, q
$prepare_confirmation$;

CREATE FUNCTION sabora.persist_customer_order_candidate(
  p_session_hash bytea,
  p_table_id uuid,
  p_qr_token text,
  p_visit_key text,
  p_basket_id text,
  p_request_key text,
  p_request_fingerprint bytea,
  p_batch_id uuid,
  p_order_id uuid,
  p_lines jsonb,
  p_accepted_reprice boolean
)
RETURNS TABLE(
  persisted_order_id uuid, persisted_grouping text, repeated boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $persist_order$
DECLARE
  v_context record;
  v_existing sabora.customer_order_attempt_batches%ROWTYPE;
  v_table sabora.dining_tables%ROWTYPE;
  v_line jsonb;
  v_quote sabora.catalog_displayed_quotes%ROWTYPE;
  v_catalog sabora.catalog_items%ROWTYPE;
  v_evidence jsonb;
  v_items jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_grouping text;
  v_confirmed_at timestamptz;
  v_line_number integer := 0;
  v_has_reprice boolean := false;
BEGIN
  IF p_session_hash IS NULL OR octet_length(p_session_hash) <> 32
    OR p_table_id IS NULL OR p_batch_id IS NULL OR p_order_id IS NULL
    OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$'
    OR p_basket_id !~ '^[A-Za-z0-9_-]{16,128}$'
    OR p_request_key !~ '^[A-Za-z0-9_-]{16,128}$'
    OR p_request_fingerprint IS NULL
    OR octet_length(p_request_fingerprint) <> 32
    OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50
    OR p_accepted_reprice IS NULL
  THEN
    RAISE EXCEPTION 'invalid_customer_order_input' USING errcode = '22023';
  END IF;

  SELECT * INTO v_context FROM sabora.lookup_customer_order_attempt_candidate(
    p_session_hash, p_table_id, p_qr_token, p_visit_key, p_basket_id, p_request_key
  );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer_order_context_forbidden' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_context.customer_id::text || ':' || p_basket_id || ':' || p_request_key, 0
  ));
  SELECT * INTO v_existing
    FROM sabora.customer_order_attempt_batches b
    WHERE b.table_id = p_table_id AND b.session_id = v_context.session_id
      AND b.visit_id = p_visit_key AND b.basket_id = p_basket_id
      AND b.actor_id = v_context.actor_id AND b.request_key = p_request_key
    FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint <> p_request_fingerprint THEN
      RAISE EXCEPTION 'customer_order_idempotency_conflict' USING errcode = '23505';
    END IF;
    SELECT o.grouping INTO v_grouping FROM sabora.orders o
      WHERE o.id = v_existing.order_id;
    RETURN QUERY SELECT v_existing.order_id, v_grouping, true;
    RETURN;
  END IF;

  SELECT t.id, t.session_id, t.first_confirmed_at, t.grouping_window_seconds
    INTO v_table.id, v_table.session_id, v_table.first_confirmed_at,
         v_table.grouping_window_seconds
    FROM sabora.dining_tables t
    WHERE t.id = p_table_id AND t.session_id = v_context.session_id
      AND (t.ordering_state = 'open' OR (
        t.ordering_state = 'paused' AND t.pause_until IS NOT NULL
        AND t.pause_until <= clock_timestamp()
      ))
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer_order_context_changed' USING errcode = '40001';
  END IF;

  PERFORM 1 FROM sabora.catalog_items c
    WHERE c.id IN (
      SELECT (entry.value->>'itemId')::uuid
      FROM jsonb_array_elements(p_lines) entry(value)
    )
    ORDER BY c.id FOR SHARE;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_line_number := v_line_number + 1;
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
      OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_line) k(key)
        WHERE k.key NOT IN ('quoteId', 'itemId', 'evidence')
      )
      OR (v_line->>'quoteId') IS NULL OR (v_line->>'itemId') IS NULL
      OR jsonb_typeof(v_line->'evidence') IS DISTINCT FROM 'object'
    THEN
      RAISE EXCEPTION 'invalid_customer_order_input' USING errcode = '22023';
    END IF;
    BEGIN
      v_evidence := v_line->'evidence';
      SELECT * INTO v_quote FROM sabora.catalog_displayed_quotes q
        WHERE q.id = (v_line->>'quoteId')::uuid
          AND q.table_id = p_table_id AND q.session_id = v_context.session_id
          AND q.visit_id = p_visit_key AND q.basket_id = p_basket_id
          AND q.actor_id = v_context.actor_id
          AND q.item_id = (v_line->>'itemId')::uuid
          AND q.expires_at > clock_timestamp()
        FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'customer_order_quote_invalid' USING errcode = '40001';
      END IF;
      SELECT c.id, c.published_revision, c.published_snapshot,
             c.withdrawn_at, c.sold_out
        INTO v_catalog.id, v_catalog.published_revision,
             v_catalog.published_snapshot, v_catalog.withdrawn_at,
             v_catalog.sold_out
        FROM sabora.catalog_items c
        WHERE c.id = v_quote.item_id AND c.withdrawn_at IS NULL
          AND NOT c.sold_out AND c.published_revision IS NOT NULL
          AND c.published_snapshot IS NOT NULL
        FOR SHARE;
      IF NOT FOUND
        OR v_evidence->>'schemaVersion' IS DISTINCT FROM '1'
        OR v_evidence->>'itemId' IS DISTINCT FROM v_quote.item_id::text
        OR (v_evidence->>'publishedRevision')::bigint <> v_catalog.published_revision
        OR (v_evidence->>'quantity')::integer NOT BETWEEN 1 AND 20
        OR length(btrim(v_evidence->>'itemName')) NOT BETWEEN 1 AND 160
        OR v_evidence->>'category' NOT IN ('Bebidas', 'Primeros', 'Segundos', 'Postres')
        OR (v_evidence->>'subtotalCents') !~ '^(0|[1-9][0-9]*)$'
        OR (v_evidence->>'discountCents') !~ '^(0|[1-9][0-9]*)$'
        OR (v_evidence->>'totalCents') !~ '^(0|[1-9][0-9]*)$'
        OR (v_evidence->>'totalCents')::bigint
          <> (v_evidence->>'subtotalCents')::bigint
             - (v_evidence->>'discountCents')::bigint
      THEN
        RAISE EXCEPTION 'customer_order_evidence_invalid' USING errcode = '40001';
      END IF;
      IF v_evidence IS DISTINCT FROM v_quote.evidence THEN
        v_has_reprice := true;
      END IF;
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'category', CASE v_evidence->>'category'
          WHEN 'Bebidas' THEN 'drink'
          WHEN 'Primeros' THEN 'starter'
          WHEN 'Segundos' THEN 'main'
          WHEN 'Postres' THEN 'dessert'
        END,
        'name', v_evidence->>'itemName',
        'quantity', (v_evidence->>'quantity')::integer
      ));
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'invalid_customer_order_input' USING errcode = '22023';
    END;
  END LOOP;
  IF v_has_reprice IS DISTINCT FROM p_accepted_reprice THEN
    RAISE EXCEPTION 'customer_order_acceptance_invalid' USING errcode = '40001';
  END IF;

  v_snapshot := jsonb_build_object('schemaVersion', 1, 'lines', p_lines);
  WITH instant AS (SELECT clock_timestamp() AS at), created AS (
    INSERT INTO sabora.orders(
      id, table_id, session_id, company, employee_number,
      customer_alias, customer_identifier, customer_visit_key,
      economic_snapshot, confirmed_at, grouping, items
    ) SELECT p_order_id, p_table_id, v_context.session_id, NULL, NULL,
      v_context.customer_alias, v_context.customer_identifier, p_visit_key,
      v_snapshot, instant.at,
      CASE WHEN v_table.first_confirmed_at IS NULL THEN 'first'
        WHEN instant.at < v_table.first_confirmed_at
          + make_interval(secs => v_table.grouping_window_seconds)
        THEN 'grouped' ELSE 'late' END,
      v_items FROM instant
    RETURNING grouping, confirmed_at
  )
  SELECT grouping, confirmed_at INTO v_grouping, v_confirmed_at FROM created;

  IF v_grouping = 'first' THEN
    UPDATE sabora.dining_tables SET first_confirmed_at = v_confirmed_at
      WHERE id = p_table_id AND first_confirmed_at IS NULL;
  END IF;

  INSERT INTO sabora.customer_order_attempt_batches(
    id, table_id, session_id, visit_id, basket_id, actor_id, customer_id,
    request_key, request_fingerprint, accepted_reprice, accepted_at,
    economic_snapshot, order_id
  ) VALUES (
    p_batch_id, p_table_id, v_context.session_id, p_visit_key, p_basket_id,
    v_context.actor_id, v_context.customer_id, p_request_key,
    p_request_fingerprint, p_accepted_reprice,
    CASE WHEN p_accepted_reprice THEN clock_timestamp() ELSE NULL END,
    v_snapshot, p_order_id
  );

  v_line_number := 0;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO sabora.customer_order_attempt_lines(
      batch_id, line_number, quote_id, item_id, economic_evidence
    ) VALUES (
      p_batch_id, v_line_number, (v_line->>'quoteId')::uuid,
      (v_line->>'itemId')::uuid, v_line->'evidence'
    );
  END LOOP;

  RETURN QUERY SELECT p_order_id, v_grouping, false;
END;
$persist_order$;

ALTER FUNCTION sabora.authorize_customer_visit_candidate(
  bytea, uuid, text, text, text, timestamptz
) OWNER TO sabora_customer_flow_fn_owner;
ALTER FUNCTION sabora.prepare_customer_quote_candidate(
  bytea, uuid, text, text, text, uuid
) OWNER TO sabora_customer_flow_fn_owner;
ALTER FUNCTION sabora.insert_customer_quote_candidate(
  bytea, uuid, text, text, text, uuid, uuid, bigint, jsonb, timestamptz
) OWNER TO sabora_customer_flow_fn_owner;
ALTER FUNCTION sabora.lookup_customer_order_attempt_candidate(
  bytea, uuid, text, text, text, text
) OWNER TO sabora_customer_flow_fn_owner;
ALTER FUNCTION sabora.prepare_customer_confirmation_line_candidate(
  bytea, uuid, text, text, text, uuid, uuid
) OWNER TO sabora_customer_flow_fn_owner;
ALTER FUNCTION sabora.persist_customer_order_candidate(
  bytea, uuid, text, text, text, text, bytea, uuid, uuid, jsonb, boolean
) OWNER TO sabora_customer_flow_fn_owner;

REVOKE ALL ON FUNCTION sabora.authorize_customer_visit_candidate(
  bytea, uuid, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, sabora_admin_writer;
REVOKE ALL ON FUNCTION sabora.prepare_customer_quote_candidate(
  bytea, uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated, sabora_admin_writer;
REVOKE ALL ON FUNCTION sabora.insert_customer_quote_candidate(
  bytea, uuid, text, text, text, uuid, uuid, bigint, jsonb, timestamptz
) FROM PUBLIC, anon, authenticated, sabora_admin_writer;
REVOKE ALL ON FUNCTION sabora.lookup_customer_order_attempt_candidate(
  bytea, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated, sabora_admin_writer;
REVOKE ALL ON FUNCTION sabora.prepare_customer_confirmation_line_candidate(
  bytea, uuid, text, text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated, sabora_admin_writer;
REVOKE ALL ON FUNCTION sabora.persist_customer_order_candidate(
  bytea, uuid, text, text, text, text, bytea, uuid, uuid, jsonb, boolean
) FROM PUBLIC, anon, authenticated, sabora_admin_writer;

GRANT USAGE ON SCHEMA sabora TO sabora_customer_flow_runtime;
GRANT EXECUTE ON FUNCTION sabora.authorize_customer_visit_candidate(
  bytea, uuid, text, text, text, timestamptz
) TO sabora_customer_flow_runtime;
GRANT EXECUTE ON FUNCTION sabora.prepare_customer_quote_candidate(
  bytea, uuid, text, text, text, uuid
) TO sabora_customer_flow_runtime;
GRANT EXECUTE ON FUNCTION sabora.insert_customer_quote_candidate(
  bytea, uuid, text, text, text, uuid, uuid, bigint, jsonb, timestamptz
) TO sabora_customer_flow_runtime;
GRANT EXECUTE ON FUNCTION sabora.lookup_customer_order_attempt_candidate(
  bytea, uuid, text, text, text, text
) TO sabora_customer_flow_runtime;
GRANT EXECUTE ON FUNCTION sabora.prepare_customer_confirmation_line_candidate(
  bytea, uuid, text, text, text, uuid, uuid
) TO sabora_customer_flow_runtime;
GRANT EXECUTE ON FUNCTION sabora.persist_customer_order_candidate(
  bytea, uuid, text, text, text, text, bytea, uuid, uuid, jsonb, boolean
) TO sabora_customer_flow_runtime;

COMMIT;
