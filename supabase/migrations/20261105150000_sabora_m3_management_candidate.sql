-- Sabora M3 candidate: management of table readiness/QR and dynamic catalog.
-- Isolated candidate only. No LOGIN, endpoint, worker or operational activation.
BEGIN;

-- CV-005: scoped role access for existing function owners before REPLACE/ACL.
DO $cv005_early_owner_scope$
DECLARE ri record;
BEGIN
 FOR ri IN SELECT DISTINCT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication
 FROM pg_catalog.pg_roles r WHERE left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner' AND r.rolname<>current_user::text
 AND (EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=r.oid AND n.nspname='sabora')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=r.oid AND n.nspname='sabora'))
 LOOP
 IF ri.rolcanlogin OR ri.rolinherit OR ri.rolsuper OR ri.rolbypassrls OR ri.rolcreaterole OR ri.rolcreatedb OR ri.rolreplication THEN
  RAISE EXCEPTION 'cv005_unsafe_existing_fn_owner' USING errcode='0P000';
 END IF;
 EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',ri.rolname);
 END LOOP;
END;
$cv005_early_owner_scope$;



CREATE ROLE sabora_m3_management_fn_owner NOLOGIN NOINHERIT NOBYPASSRLS
 NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE sabora_m3_tables_runtime NOLOGIN NOINHERIT NOBYPASSRLS
 NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE sabora_m3_catalog_runtime NOLOGIN NOINHERIT NOBYPASSRLS
 NOSUPERUSER NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA sabora TO sabora_m3_management_fn_owner,
 sabora_m3_tables_runtime,sabora_m3_catalog_runtime;

-- Existing rows were already operational candidates, so they are backfilled
-- as LISTA. Every row created after this migration defaults fail-closed to
-- EN_PREPARACION; the only runtime creator also states that value explicitly.
ALTER TABLE sabora.dining_tables
 ADD COLUMN readiness_state text NOT NULL DEFAULT 'LISTA'
  CHECK (readiness_state IN ('EN_PREPARACION','LISTA','BLOQUEADA')),
 ADD COLUMN qr_enabled boolean NOT NULL DEFAULT true,
 ADD COLUMN management_revision bigint NOT NULL DEFAULT 1
  CHECK (management_revision>0),
 ADD COLUMN management_changed_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE sabora.dining_tables
 ALTER COLUMN readiness_state SET DEFAULT 'EN_PREPARACION';

COMMENT ON COLUMN sabora.dining_tables.readiness_state IS
 'Administrative preparation axis, independent from open/paused/closed occupancy';
COMMENT ON COLUMN sabora.dining_tables.qr_enabled IS
 'Whether the current QR version is intentionally issued; token material is never stored';

GRANT SELECT(readiness_state,qr_enabled,management_revision,management_changed_at)
 ON sabora.dining_tables TO sabora_admin_tables_reader;
GRANT SELECT(readiness_state,qr_enabled) ON sabora.dining_tables
 TO sabora_customer_flow_fn_owner;

CREATE TABLE sabora.management_mutation_receipts_m3 (
 request_id uuid PRIMARY KEY,
 actor_user_id uuid NOT NULL,
 operation text NOT NULL CHECK(length(operation) BETWEEN 1 AND 80),
 request_fingerprint bytea NOT NULL CHECK(octet_length(request_fingerprint)=32),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE sabora.management_audit_m3 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL UNIQUE,
 actor_user_id uuid NOT NULL,
 operation text NOT NULL CHECK(length(operation) BETWEEN 1 AND 80),
 target_type text NOT NULL CHECK(target_type IN ('table','category','catalog_item')),
 target_id uuid NOT NULL,
 before_state jsonb,
 after_state jsonb NOT NULL CHECK(jsonb_typeof(after_state)='object'),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE sabora.management_mutation_receipts_m3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.management_mutation_receipts_m3 FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.management_audit_m3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.management_audit_m3 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.management_mutation_receipts_m3,sabora.management_audit_m3
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader;

CREATE FUNCTION sabora.reject_management_audit_mutation_m3()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $reject_audit$
BEGIN
 RAISE EXCEPTION 'management_audit_append_only' USING ERRCODE='42501';
END;
$reject_audit$;
CREATE TRIGGER management_audit_m3_immutable
 BEFORE UPDATE OR DELETE ON sabora.management_audit_m3
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_management_audit_mutation_m3();
CREATE TRIGGER management_audit_m3_no_truncate
 BEFORE TRUNCATE ON sabora.management_audit_m3
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_management_audit_mutation_m3();

CREATE TABLE sabora.catalog_categories_m3 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80 AND name !~ '[[:cntrl:]]'),
 sort_order integer NOT NULL CHECK(sort_order BETWEEN 1 AND 10000),
 mandatory boolean NOT NULL DEFAULT false,
 hidden_at timestamptz,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX catalog_categories_m3_name_unique
 ON sabora.catalog_categories_m3(lower(btrim(name)));
ALTER TABLE sabora.catalog_categories_m3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.catalog_categories_m3 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.catalog_categories_m3
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader;

INSERT INTO sabora.catalog_categories_m3(id,name,sort_order,mandatory)
VALUES
 ('10000000-0000-4000-8000-000000000001','ENTRANTE',100,true),
 ('10000000-0000-4000-8000-000000000002','PRIMERO',200,true),
 ('10000000-0000-4000-8000-000000000003','SEGUNDO',300,true),
 ('10000000-0000-4000-8000-000000000004','POSTRE',400,true),
 ('10000000-0000-4000-8000-000000000005','BEBIDA',500,true);

ALTER TABLE sabora.catalog_items
 ADD COLUMN category_id uuid REFERENCES sabora.catalog_categories_m3(id);
UPDATE sabora.catalog_items SET category_id=CASE draft->>'category'
 WHEN 'Primeros' THEN '10000000-0000-4000-8000-000000000002'::uuid
 WHEN 'Segundos' THEN '10000000-0000-4000-8000-000000000003'::uuid
 WHEN 'Postres' THEN '10000000-0000-4000-8000-000000000004'::uuid
 WHEN 'Bebidas' THEN '10000000-0000-4000-8000-000000000005'::uuid
 END
WHERE draft ? 'category';

CREATE TABLE sabora.catalog_allergen_taxonomy_m3 (
 id smallint PRIMARY KEY CHECK(id BETWEEN 1 AND 14),
 name text NOT NULL UNIQUE,
 taxonomy_version integer NOT NULL DEFAULT 1 CHECK(taxonomy_version=1)
);
INSERT INTO sabora.catalog_allergen_taxonomy_m3(id,name) VALUES
 (1,'Cereales que contengan gluten'),(2,'Crustáceos'),(3,'Huevos'),
 (4,'Pescado'),(5,'Cacahuetes'),(6,'Soja'),(7,'Leche, incluida la lactosa'),
 (8,'Frutos de cáscara'),(9,'Apio'),(10,'Mostaza'),
 (11,'Granos de sésamo'),(12,'Dióxido de azufre y sulfitos'),
 (13,'Altramuces'),(14,'Moluscos');
ALTER TABLE sabora.catalog_allergen_taxonomy_m3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.catalog_allergen_taxonomy_m3 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.catalog_allergen_taxonomy_m3
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader;

ALTER TABLE sabora.order_lines DROP CONSTRAINT order_lines_category_check;
ALTER TABLE sabora.order_lines ADD CONSTRAINT order_lines_category_check
 CHECK(length(btrim(category)) BETWEEN 1 AND 80 AND category !~ '[[:cntrl:]]');

GRANT USAGE ON SCHEMA extensions TO sabora_m3_management_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text) TO sabora_m3_management_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.digest(bytea,text),
 extensions.gen_random_bytes(integer) TO sabora_m3_management_fn_owner;
GRANT SELECT(user_id,role,state),UPDATE(state) ON sabora.staff_members
 TO sabora_m3_management_fn_owner;
GRANT SELECT ON sabora.order_operation_signing_keys TO sabora_m3_management_fn_owner;
GRANT UPDATE(disabled_at) ON sabora.order_operation_signing_keys TO sabora_m3_management_fn_owner;
GRANT SELECT ON sabora.dining_tables TO sabora_m3_management_fn_owner;
GRANT INSERT(number,capacity,description,qr_token_hash,readiness_state,ordering_state,qr_enabled)
 ON sabora.dining_tables TO sabora_m3_management_fn_owner;
GRANT UPDATE(number,capacity,description,qr_token_hash,readiness_state,ordering_state,
 pause_until,qr_version,qr_enabled,management_revision,management_changed_at)
 ON sabora.dining_tables TO sabora_m3_management_fn_owner;
GRANT SELECT ON sabora.catalog_items TO sabora_m3_management_fn_owner;
GRANT INSERT(id,category_id,draft,draft_revision,updated_at) ON sabora.catalog_items
 TO sabora_m3_management_fn_owner;
GRANT UPDATE(category_id,draft,draft_revision,updated_at,published_snapshot,
 published_revision,published_at,withdrawn_at) ON sabora.catalog_items
 TO sabora_m3_management_fn_owner;
GRANT SELECT ON sabora.catalog_categories_m3 TO sabora_m3_management_fn_owner;
GRANT INSERT(id,name,sort_order) ON sabora.catalog_categories_m3 TO sabora_m3_management_fn_owner;
GRANT UPDATE(sort_order,hidden_at,revision,updated_at) ON sabora.catalog_categories_m3
 TO sabora_m3_management_fn_owner;
GRANT SELECT ON sabora.catalog_allergen_taxonomy_m3 TO sabora_m3_management_fn_owner;
GRANT SELECT,INSERT ON sabora.management_mutation_receipts_m3 TO sabora_m3_management_fn_owner;
GRANT INSERT ON sabora.management_audit_m3 TO sabora_m3_management_fn_owner;
GRANT USAGE ON SEQUENCE sabora.management_audit_m3_id_seq TO sabora_m3_management_fn_owner;
GRANT INSERT ON sabora.table_ordering_audit_candidate TO sabora_m3_management_fn_owner;
-- The SEC INVOKER table-close transition joins open accounts by id before
-- taking the table lock. Column-level SELECT must cover its JOIN predicate,
-- not just the projected customer_id and state.
GRANT SELECT(id,customer_id,state) ON sabora.customer_accounts TO sabora_m3_management_fn_owner;
GRANT SELECT(account_id,table_id,session_id) ON sabora.customer_account_operational_bindings
 TO sabora_m3_management_fn_owner;
GRANT EXECUTE ON FUNCTION sabora.transition_table_ordering_candidate(uuid,uuid,text,timestamptz)
 TO sabora_m3_management_fn_owner;

-- The existing AFTER UPDATE occupancy trigger is SECURITY INVOKER: closing
-- a table revokes visit grants by table/session, as the constrained M3
-- function owner. Grant ONLY the columns this trigger reads/writes. Never
-- grant table access to the physical runtime login or browser roles.
GRANT SELECT(table_id,session_id,revoked_at),UPDATE(revoked_at)
 ON sabora.customer_table_visits TO sabora_m3_management_fn_owner;

CREATE POLICY management_owner_staff_m3 ON sabora.staff_members
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY management_owner_staff_lock_m3 ON sabora.staff_members
 FOR UPDATE TO sabora_m3_management_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY management_owner_keys_m3 ON sabora.order_operation_signing_keys
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY management_owner_keys_lock_m3 ON sabora.order_operation_signing_keys
 FOR UPDATE TO sabora_m3_management_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY management_owner_tables_read_m3 ON sabora.dining_tables
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY management_owner_tables_insert_m3 ON sabora.dining_tables
 FOR INSERT TO sabora_m3_management_fn_owner WITH CHECK(true);
CREATE POLICY management_owner_tables_update_m3 ON sabora.dining_tables
 FOR UPDATE TO sabora_m3_management_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY management_owner_catalog_items_read_m3 ON sabora.catalog_items
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY management_owner_catalog_items_insert_m3 ON sabora.catalog_items
 FOR INSERT TO sabora_m3_management_fn_owner WITH CHECK(true);
CREATE POLICY management_owner_catalog_items_update_m3 ON sabora.catalog_items
 FOR UPDATE TO sabora_m3_management_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY management_owner_categories_read_m3 ON sabora.catalog_categories_m3
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY management_owner_categories_insert_m3 ON sabora.catalog_categories_m3
 FOR INSERT TO sabora_m3_management_fn_owner WITH CHECK(true);
CREATE POLICY management_owner_categories_update_m3 ON sabora.catalog_categories_m3
 FOR UPDATE TO sabora_m3_management_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY management_owner_taxonomy_m3 ON sabora.catalog_allergen_taxonomy_m3
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY management_owner_receipts_m3 ON sabora.management_mutation_receipts_m3
 FOR ALL TO sabora_m3_management_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY management_owner_audit_m3 ON sabora.management_audit_m3
 FOR INSERT TO sabora_m3_management_fn_owner WITH CHECK(true);
CREATE POLICY management_owner_ordering_audit_m3 ON sabora.table_ordering_audit_candidate
 FOR INSERT TO sabora_m3_management_fn_owner WITH CHECK(true);
CREATE POLICY management_owner_accounts_read_m3 ON sabora.customer_accounts
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY management_owner_bindings_read_m3 ON sabora.customer_account_operational_bindings
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
-- RLS stays FORCE; only the internal NOLOGIN owner can revoke visits via
-- the authenticated, HMAC-protected table transition. No INSERT/DELETE
-- permission or other UPDATE columns are exposed to this role.
CREATE POLICY management_owner_visits_read_for_close_m3 ON sabora.customer_table_visits
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY management_owner_visits_revoke_for_close_m3 ON sabora.customer_table_visits
 FOR UPDATE TO sabora_m3_management_fn_owner USING(true) WITH CHECK(true);

CREATE FUNCTION sabora.verify_management_capability_m3(p_capability jsonb,p_body text)
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
     'catalog.item_publish','catalog.item_withdraw')
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

CREATE FUNCTION sabora.table_state_json_m3(p_table sabora.dining_tables)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $state$
 SELECT jsonb_build_object(
  'tableId',p_table.id,'number',p_table.number,'capacity',p_table.capacity,
  'description',p_table.description,'readinessState',p_table.readiness_state,
  'orderingState',p_table.ordering_state,'pauseUntil',p_table.pause_until,
  'qrVersion',p_table.qr_version,'qrEnabled',p_table.qr_enabled,
  'revision',p_table.management_revision)
$state$;
ALTER FUNCTION sabora.table_state_json_m3(sabora.dining_tables)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.table_state_json_m3(sabora.dining_tables)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_tables_runtime,sabora_m3_catalog_runtime;

CREATE FUNCTION sabora.read_admin_tables_m3_candidate(
 p_capability jsonb,p_after_number integer,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read_tables$
DECLARE v_items jsonb;v_next integer;v_role text;
BEGIN
 IF p_after_number IS NULL OR p_after_number<0 OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_admin_projection_page' USING ERRCODE='22023';
 END IF;
 v_role:=sabora.verify_management_capability_m3(
  p_capability,p_after_number::text||':'||p_limit::text);
 IF p_capability->>'action'<>'tables.read' OR v_role NOT IN ('admin','root','waiter') THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 WITH page AS (
  SELECT t.* FROM sabora.dining_tables t WHERE t.number>p_after_number
   ORDER BY t.number,t.id LIMIT p_limit+1
 ), visible AS (
  SELECT * FROM page ORDER BY number,id LIMIT p_limit
 )
 SELECT COALESCE(jsonb_agg(sabora.table_state_json_m3(v) ORDER BY v.number,v.id),'[]'::jsonb),
  CASE WHEN (SELECT count(*) FROM page)>p_limit
    THEN (SELECT max(number) FROM visible) ELSE NULL END
 INTO v_items,v_next FROM visible v;
 RETURN jsonb_build_object('version',2,'items',v_items,'nextAfterNumber',v_next);
END;
$read_tables$;
ALTER FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_catalog_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 TO sabora_m3_tables_runtime;

CREATE FUNCTION sabora.manage_table_m3_candidate(
 p_capability jsonb,p_operation text,p_payload_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $manage_table$
DECLARE v_fingerprint bytea;v_receipt sabora.management_mutation_receipts_m3%ROWTYPE;
 v_table sabora.dining_tables%ROWTYPE;v_before jsonb;v_result jsonb;
 v_table_id uuid;v_expected bigint;v_number integer;v_capacity integer;
 v_description text;v_target text;v_token text;v_role text;
 p_actor uuid;p_request_id uuid;p_payload jsonb;
BEGIN
 v_role:=sabora.verify_management_capability_m3(p_capability,p_payload_text);
 IF p_capability->>'action' IS DISTINCT FROM 'table.'||p_operation
    OR (v_role NOT IN ('admin','root')
      AND NOT (v_role='waiter' AND p_operation='readiness')) THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 p_actor:=(p_capability->>'actorId')::uuid;
 p_request_id:=(p_capability->>'requestId')::uuid;
 p_payload:=p_payload_text::jsonb;
 IF p_request_id IS NULL OR p_operation NOT IN ('create','update','readiness','qr_rotate','qr_revoke')
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
 END IF;
 v_fingerprint:=extensions.digest(convert_to(p_operation||':'||p_payload::text,'UTF8'),'sha256');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,310051));
 SELECT * INTO v_receipt FROM sabora.management_mutation_receipts_m3
  WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_receipt.actor_user_id<>p_actor OR v_receipt.operation<>'table.'||p_operation
     OR v_receipt.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'management_idempotency_conflict' USING ERRCODE='23505';
  END IF;
  RETURN v_receipt.result||jsonb_build_object('replayed',true);
 END IF;

 IF p_operation='create' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k(key)
      WHERE k.key NOT IN ('number','capacity','description','qrToken'))
    OR (p_payload->>'number') !~ '^[1-9][0-9]*$'
    OR (p_payload->>'capacity') !~ '^[1-9][0-9]*$'
    OR jsonb_typeof(p_payload->'description') IS DISTINCT FROM 'string'
    OR length(p_payload->>'description')>240 OR (p_payload->>'description') ~ '[[:cntrl:]]'
    OR (p_payload->>'qrToken') !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' THEN
   RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
  END IF;
  BEGIN
   v_number:=(p_payload->>'number')::integer;v_capacity:=(p_payload->>'capacity')::integer;
  EXCEPTION WHEN numeric_value_out_of_range THEN
   RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
  END;
  IF v_number>100000 OR v_capacity>1000 THEN
   RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
  END IF;
  v_description:=btrim(p_payload->>'description');v_token:=p_payload->>'qrToken';
  INSERT INTO sabora.dining_tables(number,capacity,description,qr_token_hash,
    readiness_state,ordering_state,qr_enabled)
  VALUES(v_number,v_capacity,v_description,extensions.digest(convert_to(v_token,'UTF8'),'sha256'),
    'EN_PREPARACION','closed',true) RETURNING * INTO v_table;
  v_result:=sabora.table_state_json_m3(v_table);
 ELSE
  IF (p_payload->>'tableId') IS NULL OR (p_payload->>'expectedRevision') !~ '^[1-9][0-9]*$' THEN
   RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
  END IF;
  BEGIN
   v_table_id:=(p_payload->>'tableId')::uuid;v_expected:=(p_payload->>'expectedRevision')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
  END;
  SELECT * INTO v_table FROM sabora.dining_tables WHERE id=v_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found' USING ERRCODE='P0002'; END IF;
  IF v_table.management_revision<>v_expected THEN
   RAISE EXCEPTION 'table_revision_conflict' USING ERRCODE='40001';
  END IF;
  v_before:=sabora.table_state_json_m3(v_table);
  IF p_operation='update' THEN
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k(key)
      WHERE k.key NOT IN ('tableId','expectedRevision','number','capacity','description'))
     OR (p_payload->>'number') !~ '^[1-9][0-9]*$'
     OR (p_payload->>'capacity') !~ '^[1-9][0-9]*$'
     OR jsonb_typeof(p_payload->'description') IS DISTINCT FROM 'string'
     OR length(p_payload->>'description')>240 OR (p_payload->>'description') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
   END IF;
   BEGIN
    v_number:=(p_payload->>'number')::integer;v_capacity:=(p_payload->>'capacity')::integer;
   EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
   END;
   IF v_number>100000 OR v_capacity>1000 THEN
    RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
   END IF;
   UPDATE sabora.dining_tables SET number=v_number,capacity=v_capacity,
    description=btrim(p_payload->>'description'),management_revision=management_revision+1,
    management_changed_at=clock_timestamp() WHERE id=v_table_id RETURNING * INTO v_table;
  ELSIF p_operation='readiness' THEN
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k(key)
      WHERE k.key NOT IN ('tableId','expectedRevision','state'))
     OR p_payload->>'state' NOT IN ('EN_PREPARACION','LISTA','BLOQUEADA')
     OR p_payload->>'state'=v_table.readiness_state THEN
    RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
   END IF;
   UPDATE sabora.dining_tables SET readiness_state=p_payload->>'state',
    management_revision=management_revision+1,management_changed_at=clock_timestamp()
    WHERE id=v_table_id RETURNING * INTO v_table;
  ELSIF p_operation='qr_rotate' THEN
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k(key)
      WHERE k.key NOT IN ('tableId','expectedRevision','qrToken'))
     OR (p_payload->>'qrToken') !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' THEN
    RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
   END IF;
   UPDATE sabora.dining_tables SET
    qr_token_hash=extensions.digest(convert_to(p_payload->>'qrToken','UTF8'),'sha256'),
    qr_version=qr_version+1,qr_enabled=true,
    management_revision=management_revision+1,management_changed_at=clock_timestamp()
    WHERE id=v_table_id RETURNING * INTO v_table;
  ELSE
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k(key)
      WHERE k.key NOT IN ('tableId','expectedRevision')) THEN
    RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
   END IF;
   UPDATE sabora.dining_tables SET qr_token_hash=extensions.digest(
    extensions.gen_random_bytes(32),'sha256'),
    qr_version=qr_version+1,qr_enabled=false,
    management_revision=management_revision+1,management_changed_at=clock_timestamp()
    WHERE id=v_table_id RETURNING * INTO v_table;
  END IF;
  v_result:=sabora.table_state_json_m3(v_table);
 END IF;
 INSERT INTO sabora.management_audit_m3(request_id,actor_user_id,operation,
  target_type,target_id,before_state,after_state)
 VALUES(p_request_id,p_actor,'table.'||p_operation,'table',v_table.id,v_before,v_result);
 INSERT INTO sabora.management_mutation_receipts_m3(request_id,actor_user_id,operation,
  request_fingerprint,result)
 VALUES(p_request_id,p_actor,'table.'||p_operation,v_fingerprint,v_result);
 RETURN v_result||jsonb_build_object('replayed',false);
EXCEPTION
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'invalid_table_management_input' USING ERRCODE='22023';
END;
$manage_table$;
ALTER FUNCTION sabora.manage_table_m3_candidate(jsonb,text,text)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.manage_table_m3_candidate(jsonb,text,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_catalog_runtime;
GRANT EXECUTE ON FUNCTION sabora.manage_table_m3_candidate(jsonb,text,text)
 TO sabora_m3_tables_runtime;

CREATE FUNCTION sabora.transition_table_occupancy_m3_candidate(
 p_capability jsonb,p_payload_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $occupancy$
DECLARE v_payload jsonb;v_fingerprint bytea;v_receipt sabora.management_mutation_receipts_m3%ROWTYPE;
 v_table sabora.dining_tables%ROWTYPE;v_before jsonb;v_result jsonb;v_role text;
 p_actor uuid;p_request_id uuid;p_table_id uuid;p_target text;p_pause_until timestamptz;
BEGIN
 v_role:=sabora.verify_management_capability_m3(p_capability,p_payload_text);
 IF p_capability->>'action'<>'table.occupancy'
    OR v_role NOT IN ('admin','root','waiter') THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 v_payload:=p_payload_text::jsonb;
 IF jsonb_typeof(v_payload) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(v_payload))<>3
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_payload) k(key)
      WHERE k.key NOT IN ('tableId','target','pauseUntil'))
    OR jsonb_typeof(v_payload->'tableId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_payload->'target') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_payload->'pauseUntil') NOT IN ('string','null') THEN
  RAISE EXCEPTION 'invalid_table_transition' USING ERRCODE='22023'; END IF;
 p_actor:=(p_capability->>'actorId')::uuid;
 p_request_id:=(p_capability->>'requestId')::uuid;
 p_table_id:=(v_payload->>'tableId')::uuid;
 p_target:=v_payload->>'target';
 p_pause_until:=CASE WHEN jsonb_typeof(v_payload->'pauseUntil')='null' THEN NULL
  ELSE (v_payload->>'pauseUntil')::timestamptz END;
 IF p_request_id IS NULL OR p_table_id IS NULL OR p_target NOT IN ('open','paused','closed') THEN
  RAISE EXCEPTION 'invalid_table_transition' USING ERRCODE='22023';
 END IF;
 v_fingerprint:=extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,310052));
 SELECT * INTO v_receipt FROM sabora.management_mutation_receipts_m3
  WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_receipt.actor_user_id<>p_actor OR v_receipt.operation<>'table.occupancy'
    OR v_receipt.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'management_idempotency_conflict' USING ERRCODE='23505';
  END IF;
  RETURN v_receipt.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO v_table FROM sabora.dining_tables WHERE id=p_table_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found' USING ERRCODE='P0002'; END IF;
 v_before:=sabora.table_state_json_m3(v_table);
 PERFORM * FROM sabora.transition_table_ordering_candidate(
  p_actor,p_table_id,p_target,p_pause_until);
 SELECT * INTO v_table FROM sabora.dining_tables WHERE id=p_table_id;
 v_result:=sabora.table_state_json_m3(v_table);
 INSERT INTO sabora.management_audit_m3(request_id,actor_user_id,operation,
  target_type,target_id,before_state,after_state)
 VALUES(p_request_id,p_actor,'table.occupancy','table',p_table_id,v_before,v_result);
 INSERT INTO sabora.management_mutation_receipts_m3(request_id,actor_user_id,operation,
  request_fingerprint,result)
 VALUES(p_request_id,p_actor,'table.occupancy',v_fingerprint,v_result);
 RETURN v_result||jsonb_build_object('replayed',false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
 RAISE EXCEPTION 'invalid_table_transition' USING ERRCODE='22023';
END;
$occupancy$;
ALTER FUNCTION sabora.transition_table_occupancy_m3_candidate(jsonb,text)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.transition_table_occupancy_m3_candidate(jsonb,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_catalog_runtime;
GRANT EXECUTE ON FUNCTION sabora.transition_table_occupancy_m3_candidate(jsonb,text)
 TO sabora_m3_tables_runtime;

CREATE OR REPLACE FUNCTION sabora.validate_catalog_snapshot(p_snapshot jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,pg_temp AS $validate_catalog$
DECLARE v_group jsonb;v_value jsonb;v_extra jsonb;v_discount jsonb;
BEGIN
 IF jsonb_typeof(p_snapshot)='object' AND NOT (p_snapshot ? 'categoryId') THEN
  RETURN jsonb_typeof(p_snapshot->'name')='string'
   AND length(btrim(p_snapshot->>'name')) BETWEEN 1 AND 160
   AND (p_snapshot->>'name') !~ '[[:cntrl:]]'
   AND p_snapshot->>'category' IN ('Bebidas','Primeros','Segundos','Postres')
   AND jsonb_typeof(p_snapshot->'priceCents')='number'
   AND (p_snapshot->>'priceCents') ~ '^(0|[1-9][0-9]*)$'
   AND length(p_snapshot->>'priceCents')<=15
   AND (NOT p_snapshot ? 'options' OR p_snapshot->'options'='[]'::jsonb)
   AND (NOT p_snapshot ? 'extras' OR p_snapshot->'extras'='[]'::jsonb)
   AND (NOT p_snapshot ? 'discount' OR p_snapshot->'discount'='null'::jsonb)
   AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p_snapshot) field(key)
    WHERE field.key NOT IN ('name','category','priceCents','allergens','options','extras','discount'))
   AND jsonb_typeof(p_snapshot->'allergens')='array'
   AND jsonb_array_length(p_snapshot->'allergens')<=32
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_snapshot->'allergens') a(value)
    WHERE jsonb_typeof(a.value)<>'string'
      OR length(btrim(a.value#>>'{}')) NOT BETWEEN 1 AND 100
      OR (a.value#>>'{}') ~ '[[:cntrl:]]');
 END IF;
 IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_snapshot) k(key) WHERE k.key NOT IN
    ('name','description','imageUrl','category','categoryId','priceCents','allergens',
     'allergenDeclaration','options','extras','discount'))
  OR jsonb_typeof(p_snapshot->'name') IS DISTINCT FROM 'string'
  OR length(btrim(p_snapshot->>'name')) NOT BETWEEN 1 AND 160
  OR (p_snapshot->>'name') ~ '[[:cntrl:]]'
  OR jsonb_typeof(p_snapshot->'description') IS DISTINCT FROM 'string'
  OR length(p_snapshot->>'description')>2000 OR (p_snapshot->>'description') ~ '[[:cntrl:]]'
  OR NOT (jsonb_typeof(p_snapshot->'imageUrl') IN ('string','null'))
  OR (jsonb_typeof(p_snapshot->'imageUrl')='string' AND
      (length(p_snapshot->>'imageUrl')>2048 OR p_snapshot->>'imageUrl' !~ '^https://'))
  OR jsonb_typeof(p_snapshot->'category') IS DISTINCT FROM 'string'
  OR length(btrim(p_snapshot->>'category')) NOT BETWEEN 1 AND 80
  OR (p_snapshot->>'category') ~ '[[:cntrl:]]'
  OR (p_snapshot->>'categoryId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR jsonb_typeof(p_snapshot->'priceCents') IS DISTINCT FROM 'number'
  OR (p_snapshot->>'priceCents') !~ '^(0|[1-9][0-9]*)$'
  OR length(p_snapshot->>'priceCents')>15
  OR jsonb_typeof(p_snapshot->'allergens') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_snapshot->'allergens')>14
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_snapshot->'allergens') a(value)
     WHERE jsonb_typeof(a.value)<>'string' OR length(btrim(a.value#>>'{}')) NOT BETWEEN 1 AND 100
       OR (a.value#>>'{}') ~ '[[:cntrl:]]')
  OR jsonb_typeof(p_snapshot->'allergenDeclaration') IS DISTINCT FROM 'object'
  OR (p_snapshot->'allergenDeclaration'->>'status') NOT IN ('PENDIENTE_DE_VERIFICAR','VERIFICADA')
  OR p_snapshot->'allergenDeclaration'->>'taxonomyVersion' IS DISTINCT FROM '1'
  OR jsonb_typeof(p_snapshot->'allergenDeclaration'->'ids') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_snapshot->'allergenDeclaration'->'ids')>14
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_snapshot->'allergenDeclaration'->'ids') a(value)
     WHERE a.value !~ '^([1-9]|1[0-4])$')
  OR jsonb_typeof(p_snapshot->'options') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_snapshot->'options')>32
  OR jsonb_typeof(p_snapshot->'extras') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_snapshot->'extras')>50 THEN RETURN false; END IF;

 IF (SELECT count(*) FROM jsonb_array_elements_text(p_snapshot->'allergens'))
    <>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_snapshot->'allergens'))
  OR (SELECT count(*) FROM jsonb_array_elements_text(p_snapshot->'allergenDeclaration'->'ids'))
    <>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_snapshot->'allergenDeclaration'->'ids'))
 THEN RETURN false; END IF;

 FOR v_group IN SELECT value FROM jsonb_array_elements(p_snapshot->'options') LOOP
  IF jsonb_typeof(v_group) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_group) k(key)
     WHERE k.key NOT IN ('id','name','values','required','maxSelections'))
   OR (v_group->>'id') !~ '^[A-Za-z0-9_-]{1,64}$'
   OR length(btrim(v_group->>'name')) NOT BETWEEN 1 AND 100
   OR (v_group->>'name') ~ '[[:cntrl:]]'
   OR jsonb_typeof(v_group->'required') IS DISTINCT FROM 'boolean'
   OR (v_group->>'maxSelections') !~ '^([1-9]|1[0-9]|20)$'
   OR jsonb_typeof(v_group->'values') IS DISTINCT FROM 'array'
   OR jsonb_array_length(v_group->'values') NOT BETWEEN 1 AND 20
   OR (v_group->>'maxSelections')::integer>jsonb_array_length(v_group->'values')
  THEN RETURN false; END IF;
  FOR v_value IN SELECT value FROM jsonb_array_elements(v_group->'values') LOOP
   IF jsonb_typeof(v_value) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_value) k(key)
      WHERE k.key NOT IN ('id','name','priceCents','available','allergens'))
    OR (v_value->>'id') !~ '^[A-Za-z0-9_-]{1,64}$'
    OR length(btrim(v_value->>'name')) NOT BETWEEN 1 AND 100
    OR (v_value->>'priceCents') !~ '^(0|[1-9][0-9]*)$'
    OR length(v_value->>'priceCents')>15
    OR jsonb_typeof(v_value->'available') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v_value->'allergens') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_value->'allergens')>14
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_value->'allergens') a(value)
      WHERE NOT (p_snapshot->'allergens' @> jsonb_build_array(a.value)))
   THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(v_group->'values'))<>
     (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(v_group->'values'))
  THEN RETURN false; END IF;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'options'))<>
    (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_snapshot->'options'))
 THEN RETURN false; END IF;

 FOR v_extra IN SELECT value FROM jsonb_array_elements(p_snapshot->'extras') LOOP
  IF jsonb_typeof(v_extra) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_extra) k(key)
     WHERE k.key NOT IN ('id','name','priceCents','available','allergens'))
   OR (v_extra->>'id') !~ '^[A-Za-z0-9_-]{1,64}$'
   OR length(btrim(v_extra->>'name')) NOT BETWEEN 1 AND 100
   OR (v_extra->>'priceCents') !~ '^(0|[1-9][0-9]*)$'
   OR length(v_extra->>'priceCents')>15
   OR jsonb_typeof(v_extra->'available') IS DISTINCT FROM 'boolean'
   OR jsonb_typeof(v_extra->'allergens') IS DISTINCT FROM 'array'
   OR jsonb_array_length(v_extra->'allergens')>14
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_extra->'allergens') a(value)
     WHERE NOT (p_snapshot->'allergens' @> jsonb_build_array(a.value)))
  THEN RETURN false; END IF;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'extras'))<>
    (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_snapshot->'extras'))
 THEN RETURN false; END IF;

 v_discount:=p_snapshot->'discount';
 IF jsonb_typeof(v_discount) NOT IN ('object','null') THEN RETURN false; END IF;
 IF jsonb_typeof(v_discount)='object' AND NOT (
   (v_discount->>'type'='fixed'
    AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_discount) key)
      =ARRAY['amountCents','type']
    AND (v_discount->>'amountCents') ~ '^(0|[1-9][0-9]*)$'
    AND length(v_discount->>'amountCents')<=15)
   OR
   (v_discount->>'type'='percent'
    AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_discount) key)
      =ARRAY['basisPoints','type']
    AND (v_discount->>'basisPoints') ~ '^(0|[1-9][0-9]{0,3}|10000)$'
    AND (v_discount->>'basisPoints')::integer BETWEEN 0 AND 10000)
  ) THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$validate_catalog$;
ALTER FUNCTION sabora.validate_catalog_snapshot(jsonb)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.validate_catalog_snapshot(jsonb)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_tables_runtime,sabora_m3_catalog_runtime;

CREATE FUNCTION sabora.read_admin_catalog_m3_candidate(p_capability jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read_catalog$
DECLARE v_categories jsonb;v_items jsonb;v_taxonomy jsonb;v_role text;
BEGIN
 v_role:=sabora.verify_management_capability_m3(p_capability,'catalog.read');
 IF p_capability->>'action'<>'catalog.read' OR v_role NOT IN ('admin','root') THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,
  'sortOrder',c.sort_order,'mandatory',c.mandatory,'hidden',c.hidden_at IS NOT NULL,
  'revision',c.revision) ORDER BY c.sort_order,c.name,c.id),'[]'::jsonb)
 INTO v_categories FROM sabora.catalog_categories_m3 c;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'categoryId',q.category_id,
  'draft',q.draft,'draftRevision',q.draft_revision,
  'publishedRevision',q.published_revision,'publishedSnapshot',q.published_snapshot,
  'publishedAt',q.published_at,'withdrawn',q.withdrawn_at IS NOT NULL,
  'soldOut',q.sold_out) ORDER BY q.sort_order,q.updated_at DESC,q.id),'[]'::jsonb)
 INTO v_items FROM (
  SELECT i.*,coalesce(c.sort_order,10001) AS sort_order
  FROM sabora.catalog_items i LEFT JOIN sabora.catalog_categories_m3 c ON c.id=i.category_id
  ORDER BY coalesce(c.sort_order,10001),i.updated_at DESC,i.id LIMIT 500
 ) q;
 SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) ORDER BY a.id)
  INTO v_taxonomy FROM sabora.catalog_allergen_taxonomy_m3 a;
 RETURN jsonb_build_object('version',2,'scope','administrative','categories',v_categories,
  'items',v_items,'allergenTaxonomyVersion',1,'allergens',v_taxonomy);
END;
$read_catalog$;
ALTER FUNCTION sabora.read_admin_catalog_m3_candidate(jsonb)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_catalog_m3_candidate(jsonb)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_tables_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_admin_catalog_m3_candidate(jsonb)
 TO sabora_m3_catalog_runtime;

CREATE FUNCTION sabora.manage_catalog_m3_candidate(
 p_capability jsonb,p_operation text,p_payload_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $manage_catalog$
DECLARE v_fingerprint bytea;v_receipt sabora.management_mutation_receipts_m3%ROWTYPE;
 v_category sabora.catalog_categories_m3%ROWTYPE;v_item sabora.catalog_items%ROWTYPE;
 v_before jsonb;v_result jsonb;v_id uuid;v_expected bigint;v_sort integer;
 v_draft_input jsonb;v_snapshot jsonb;v_allergens jsonb;v_ids jsonb;
 v_status text;v_target_type text;v_role text;
 p_actor uuid;p_request_id uuid;p_payload jsonb;
BEGIN
 v_role:=sabora.verify_management_capability_m3(p_capability,p_payload_text);
 IF p_capability->>'action' IS DISTINCT FROM 'catalog.'||p_operation
    OR v_role NOT IN ('admin','root') THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 p_actor:=(p_capability->>'actorId')::uuid;
 p_request_id:=(p_capability->>'requestId')::uuid;
 p_payload:=p_payload_text::jsonb;
 IF p_request_id IS NULL OR p_operation NOT IN
   ('category_create','category_reorder','category_visibility',
    'item_save','item_publish','item_withdraw')
   OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023';
 END IF;
 v_fingerprint:=extensions.digest(convert_to(p_operation||':'||p_payload::text,'UTF8'),'sha256');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,310053));
 SELECT * INTO v_receipt FROM sabora.management_mutation_receipts_m3
  WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_receipt.actor_user_id<>p_actor OR v_receipt.operation<>'catalog.'||p_operation
    OR v_receipt.request_fingerprint<>v_fingerprint THEN
   RAISE EXCEPTION 'management_idempotency_conflict' USING ERRCODE='23505';
  END IF;
  RETURN v_receipt.result||jsonb_build_object('replayed',true);
 END IF;

 IF p_operation='category_create' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k(key)
      WHERE k.key NOT IN ('categoryId','name','sortOrder'))
    OR (p_payload->>'categoryId') IS NULL
    OR length(btrim(p_payload->>'name')) NOT BETWEEN 1 AND 80
    OR (p_payload->>'name') ~ '[[:cntrl:]]'
    OR upper(btrim(p_payload->>'name'))='TODOS'
    OR (p_payload->>'sortOrder') !~ '^[1-9][0-9]{0,3}$' THEN
   RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023';
  END IF;
  BEGIN v_id:=(p_payload->>'categoryId')::uuid;v_sort:=(p_payload->>'sortOrder')::integer;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023'; END;
  INSERT INTO sabora.catalog_categories_m3(id,name,sort_order)
   VALUES(v_id,btrim(p_payload->>'name'),v_sort) RETURNING * INTO v_category;
  v_result:=jsonb_build_object('categoryId',v_category.id,'name',v_category.name,
   'sortOrder',v_category.sort_order,'mandatory',v_category.mandatory,
   'hidden',false,'revision',v_category.revision);
  v_target_type:='category';
 ELSIF p_operation IN ('category_reorder','category_visibility') THEN
  IF (p_payload->>'categoryId') IS NULL OR (p_payload->>'expectedRevision') !~ '^[1-9][0-9]*$' THEN
   RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023';
  END IF;
  BEGIN v_id:=(p_payload->>'categoryId')::uuid;v_expected:=(p_payload->>'expectedRevision')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023'; END;
  SELECT * INTO v_category FROM sabora.catalog_categories_m3 WHERE id=v_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog_category_not_found' USING ERRCODE='P0002'; END IF;
  IF v_category.revision<>v_expected THEN
   RAISE EXCEPTION 'catalog_revision_conflict' USING ERRCODE='40001'; END IF;
  v_before:=jsonb_build_object('categoryId',v_category.id,'name',v_category.name,
   'sortOrder',v_category.sort_order,'mandatory',v_category.mandatory,
   'hidden',v_category.hidden_at IS NOT NULL,'revision',v_category.revision);
  IF p_operation='category_reorder' THEN
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k(key)
      WHERE k.key NOT IN ('categoryId','expectedRevision','sortOrder'))
     OR (p_payload->>'sortOrder') !~ '^[1-9][0-9]{0,3}$' THEN
    RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023'; END IF;
   v_sort:=(p_payload->>'sortOrder')::integer;
   UPDATE sabora.catalog_categories_m3 SET sort_order=v_sort,revision=revision+1,
    updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_category;
  ELSE
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k(key)
      WHERE k.key NOT IN ('categoryId','expectedRevision','hidden'))
     OR jsonb_typeof(p_payload->'hidden') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023'; END IF;
   -- Valid request shape, but hiding a mandatory category conflicts with
   -- an invariant; surface a 409 rather than masquerading as a 400/503.
   IF v_category.mandatory AND (p_payload->>'hidden')::boolean THEN
    RAISE EXCEPTION 'catalog_category_visibility_conflict' USING ERRCODE='23514';
   END IF;
   UPDATE sabora.catalog_categories_m3 SET
    hidden_at=CASE WHEN (p_payload->>'hidden')::boolean THEN clock_timestamp() ELSE NULL END,
    revision=revision+1,updated_at=clock_timestamp()
    WHERE id=v_id RETURNING * INTO v_category;
  END IF;
  v_result:=jsonb_build_object('categoryId',v_category.id,'name',v_category.name,
   'sortOrder',v_category.sort_order,'mandatory',v_category.mandatory,
   'hidden',v_category.hidden_at IS NOT NULL,'revision',v_category.revision);
  v_target_type:='category';
 ELSE
  IF (p_payload->>'itemId') IS NULL OR (p_payload->>'expectedRevision') !~ '^(0|[1-9][0-9]*)$' THEN
   RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023'; END IF;
  BEGIN v_id:=(p_payload->>'itemId')::uuid;v_expected:=(p_payload->>'expectedRevision')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023'; END;
  SELECT * INTO v_item FROM sabora.catalog_items WHERE id=v_id FOR UPDATE;
  IF p_operation='item_save' THEN
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k(key)
      WHERE k.key NOT IN ('itemId','expectedRevision','categoryId','draft'))
     OR (p_payload->>'categoryId') IS NULL
     OR jsonb_typeof(p_payload->'draft') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023'; END IF;
   BEGIN v_category.id:=(p_payload->>'categoryId')::uuid;
   EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023'; END;
   SELECT * INTO v_category FROM sabora.catalog_categories_m3
    WHERE id=v_category.id AND hidden_at IS NULL FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'catalog_category_not_available' USING ERRCODE='23514'; END IF;
   v_draft_input:=p_payload->'draft';
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_draft_input) k(key) WHERE k.key NOT IN
      ('name','description','imageUrl','priceCents','allergenIds','allergenStatus',
       'options','extras','discount'))
     OR jsonb_typeof(v_draft_input->'allergenIds') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_draft_input->'allergenIds')>14
     OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_draft_input->'allergenIds') a(value)
       WHERE a.value !~ '^([1-9]|1[0-4])$')
     OR (SELECT count(*) FROM jsonb_array_elements_text(v_draft_input->'allergenIds'))<>
        (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(v_draft_input->'allergenIds'))
     OR v_draft_input->>'allergenStatus' NOT IN ('PENDIENTE_DE_VERIFICAR','VERIFICADA') THEN
    RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023'; END IF;
   SELECT COALESCE(jsonb_agg(a.name ORDER BY a.id),'[]'::jsonb),
          COALESCE(jsonb_agg(a.id ORDER BY a.id),'[]'::jsonb)
    INTO v_allergens,v_ids
    FROM sabora.catalog_allergen_taxonomy_m3 a
    WHERE a.id IN (SELECT value::smallint FROM jsonb_array_elements_text(v_draft_input->'allergenIds'));
   IF jsonb_array_length(v_ids)<>jsonb_array_length(v_draft_input->'allergenIds') THEN
    RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023'; END IF;
   v_status:=v_draft_input->>'allergenStatus';
   v_snapshot:=jsonb_build_object(
    'name',v_draft_input->'name','description',coalesce(v_draft_input->'description','""'::jsonb),
    'imageUrl',coalesce(v_draft_input->'imageUrl','null'::jsonb),
    'category',to_jsonb(v_category.name),'categoryId',to_jsonb(v_category.id::text),
    'priceCents',v_draft_input->'priceCents','allergens',v_allergens,
    'allergenDeclaration',jsonb_build_object('status',v_status,'taxonomyVersion',1,
      'ids',v_ids,'verifiedBy',CASE WHEN v_status='VERIFICADA' THEN to_jsonb(p_actor::text) ELSE 'null'::jsonb END,
      'verifiedAt',CASE WHEN v_status='VERIFICADA' THEN to_jsonb(clock_timestamp()) ELSE 'null'::jsonb END),
    'options',coalesce(v_draft_input->'options','[]'::jsonb),
    'extras',coalesce(v_draft_input->'extras','[]'::jsonb),
    'discount',coalesce(v_draft_input->'discount','null'::jsonb));
   IF sabora.validate_catalog_snapshot(v_snapshot) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'invalid_catalog_snapshot' USING ERRCODE='22023'; END IF;
   IF v_item.id IS NULL THEN
    IF v_expected<>0 THEN RAISE EXCEPTION 'catalog_revision_conflict' USING ERRCODE='40001'; END IF;
    INSERT INTO sabora.catalog_items(id,category_id,draft,draft_revision,updated_at)
     VALUES(v_id,v_category.id,v_snapshot,1,clock_timestamp()) RETURNING * INTO v_item;
   ELSE
    IF v_expected<>v_item.draft_revision THEN
     RAISE EXCEPTION 'catalog_revision_conflict' USING ERRCODE='40001'; END IF;
    v_before:=jsonb_build_object('itemId',v_item.id,'categoryId',v_item.category_id,
     'draft',v_item.draft,'draftRevision',v_item.draft_revision,
     'publishedRevision',v_item.published_revision,'withdrawn',v_item.withdrawn_at IS NOT NULL);
    UPDATE sabora.catalog_items SET category_id=v_category.id,draft=v_snapshot,
     draft_revision=draft_revision+1,updated_at=clock_timestamp()
     WHERE id=v_id RETURNING * INTO v_item;
   END IF;
  ELSE
   IF NOT FOUND THEN RAISE EXCEPTION 'catalog_item_not_found' USING ERRCODE='P0002'; END IF;
   IF v_expected<>v_item.draft_revision THEN
    RAISE EXCEPTION 'catalog_revision_conflict' USING ERRCODE='40001'; END IF;
   v_before:=jsonb_build_object('itemId',v_item.id,'categoryId',v_item.category_id,
    'draft',v_item.draft,'draftRevision',v_item.draft_revision,
    'publishedRevision',v_item.published_revision,'withdrawn',v_item.withdrawn_at IS NOT NULL);
   IF p_operation='item_publish' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k(key)
       WHERE k.key NOT IN ('itemId','expectedRevision'))
      OR sabora.validate_catalog_snapshot(v_item.draft) IS DISTINCT FROM true
      OR v_item.draft->'allergenDeclaration'->>'status'<>'VERIFICADA'
      OR NOT EXISTS(SELECT 1 FROM sabora.catalog_categories_m3 c
         WHERE c.id=v_item.category_id AND c.hidden_at IS NULL
           AND c.name=v_item.draft->>'category') THEN
     RAISE EXCEPTION 'catalog_item_not_publishable' USING ERRCODE='23514'; END IF;
    UPDATE sabora.catalog_items SET published_snapshot=draft,
     published_revision=draft_revision,published_at=clock_timestamp(),withdrawn_at=NULL,
     updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_item;
   ELSE
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k(key)
       WHERE k.key NOT IN ('itemId','expectedRevision'))
      OR v_item.published_revision IS NULL OR v_item.withdrawn_at IS NOT NULL THEN
     RAISE EXCEPTION 'catalog_item_not_withdrawable' USING ERRCODE='23514'; END IF;
    UPDATE sabora.catalog_items SET withdrawn_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_id RETURNING * INTO v_item;
   END IF;
  END IF;
  v_result:=jsonb_build_object('itemId',v_item.id,'categoryId',v_item.category_id,
   'draft',v_item.draft,'draftRevision',v_item.draft_revision,
   'publishedRevision',v_item.published_revision,'publishedSnapshot',v_item.published_snapshot,
   'withdrawn',v_item.withdrawn_at IS NOT NULL,'soldOut',v_item.sold_out);
  v_target_type:='catalog_item';
 END IF;

 INSERT INTO sabora.management_audit_m3(request_id,actor_user_id,operation,
  target_type,target_id,before_state,after_state)
 VALUES(p_request_id,p_actor,'catalog.'||p_operation,v_target_type,v_id,v_before,v_result);
 INSERT INTO sabora.management_mutation_receipts_m3(request_id,actor_user_id,operation,
  request_fingerprint,result)
 VALUES(p_request_id,p_actor,'catalog.'||p_operation,v_fingerprint,v_result);
 RETURN v_result||jsonb_build_object('replayed',false);
EXCEPTION
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'invalid_catalog_management_input' USING ERRCODE='22023';
END;
$manage_catalog$;
ALTER FUNCTION sabora.manage_catalog_m3_candidate(jsonb,text,text)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.manage_catalog_m3_candidate(jsonb,text,text)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_tables_runtime;
GRANT EXECUTE ON FUNCTION sabora.manage_catalog_m3_candidate(jsonb,text,text)
 TO sabora_m3_catalog_runtime;

GRANT SELECT(category_id) ON sabora.catalog_items TO sabora_catalog_fn_owner;
GRANT SELECT ON sabora.catalog_categories_m3 TO sabora_catalog_fn_owner;
CREATE POLICY catalog_reader_categories_m3 ON sabora.catalog_categories_m3
 FOR SELECT TO sabora_catalog_fn_owner USING(true);

CREATE OR REPLACE FUNCTION sabora.read_published_catalog()
RETURNS TABLE(id uuid,published_snapshot jsonb,sold_out boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $read_public_catalog$
 SELECT i.id,i.published_snapshot,i.sold_out
 FROM sabora.catalog_items i
 LEFT JOIN sabora.catalog_categories_m3 c ON c.id=i.category_id
 WHERE i.published_snapshot IS NOT NULL AND i.withdrawn_at IS NULL
  AND (i.category_id IS NULL OR c.hidden_at IS NULL)
 ORDER BY coalesce(c.sort_order,10001),i.published_at DESC,i.id
 LIMIT 500
$read_public_catalog$;
-- CV-005 CANDIDATE (not approved): migration-only capability, revoked before COMMIT.
GRANT CREATE ON SCHEMA sabora TO sabora_catalog_fn_owner;
GRANT sabora_catalog_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_published_catalog() OWNER TO sabora_catalog_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_published_catalog()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_customer_session_runtime,
  sabora_m3_management_fn_owner,sabora_m3_tables_runtime,sabora_m3_catalog_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_published_catalog() TO sabora_catalog_reader;

CREATE FUNCTION sabora.enforce_table_readiness_m3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $readiness_gate$
DECLARE v_ready text;v_qr boolean;
BEGIN
 SELECT readiness_state,qr_enabled INTO v_ready,v_qr
 FROM sabora.dining_tables WHERE id=NEW.table_id AND session_id=NEW.session_id FOR SHARE;
 IF NOT FOUND OR v_ready<>'LISTA'
    OR (TG_TABLE_NAME='customer_table_visits' AND v_qr IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'customer_table_forbidden' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$readiness_gate$;
ALTER FUNCTION sabora.enforce_table_readiness_m3()
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.enforce_table_readiness_m3()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_tables_runtime,sabora_m3_catalog_runtime;
CREATE TRIGGER customer_visit_readiness_m3
 BEFORE INSERT ON sabora.customer_table_visits FOR EACH ROW
 EXECUTE FUNCTION sabora.enforce_table_readiness_m3();
CREATE TRIGGER customer_quote_readiness_m3
 BEFORE INSERT ON sabora.catalog_displayed_quotes FOR EACH ROW
 EXECUTE FUNCTION sabora.enforce_table_readiness_m3();
CREATE TRIGGER customer_order_readiness_m3
 BEFORE INSERT ON sabora.orders FOR EACH ROW
 EXECUTE FUNCTION sabora.enforce_table_readiness_m3();

-- The current H6 entrypoint delegates persistence here. The replacement keeps
-- its locks/idempotency intact and removes only the obsolete four-category
-- mapping while adding the administrative readiness gate.
CREATE OR REPLACE FUNCTION sabora.persist_customer_order_candidate(
  p_session_hash bytea,p_table_id uuid,p_qr_token text,p_visit_key text,
  p_basket_id text,p_request_key text,p_request_fingerprint bytea,
  p_batch_id uuid,p_order_id uuid,p_lines jsonb,p_accepted_reprice boolean
)
RETURNS TABLE(persisted_order_id uuid,persisted_grouping text,repeated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $persist_order_m3$
DECLARE
 v_context record;v_existing sabora.customer_order_attempt_batches%ROWTYPE;
 v_table sabora.dining_tables%ROWTYPE;v_line jsonb;
 v_quote sabora.catalog_displayed_quotes%ROWTYPE;v_catalog sabora.catalog_items%ROWTYPE;
 v_evidence jsonb;v_items jsonb:='[]'::jsonb;v_snapshot jsonb;v_grouping text;
 v_confirmed_at timestamptz;v_line_number integer:=0;v_has_reprice boolean:=false;
BEGIN
 IF p_session_hash IS NULL OR octet_length(p_session_hash)<>32
  OR p_table_id IS NULL OR p_batch_id IS NULL OR p_order_id IS NULL
  OR p_visit_key !~ '^[A-Za-z0-9_-]{16,128}$'
  OR p_basket_id !~ '^[A-Za-z0-9_-]{16,128}$'
  OR p_request_key !~ '^[A-Za-z0-9_-]{16,128}$'
  OR p_request_fingerprint IS NULL OR octet_length(p_request_fingerprint)<>32
  OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50
  OR p_accepted_reprice IS NULL THEN
  RAISE EXCEPTION 'invalid_customer_order_input' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_context FROM sabora.lookup_customer_order_attempt_candidate(
  p_session_hash,p_table_id,p_qr_token,p_visit_key,p_basket_id,p_request_key);
 IF NOT FOUND THEN
  RAISE EXCEPTION 'customer_order_context_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  v_context.customer_id::text||':'||p_basket_id||':'||p_request_key,0));
 SELECT * INTO v_existing FROM sabora.customer_order_attempt_batches b
  WHERE b.table_id=p_table_id AND b.session_id=v_context.session_id
   AND b.visit_id=p_visit_key AND b.basket_id=p_basket_id
   AND b.actor_id=v_context.actor_id AND b.request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
  IF v_existing.request_fingerprint<>p_request_fingerprint THEN
   RAISE EXCEPTION 'customer_order_idempotency_conflict' USING ERRCODE='23505'; END IF;
  SELECT o.grouping INTO v_grouping FROM sabora.orders o WHERE o.id=v_existing.order_id;
  RETURN QUERY SELECT v_existing.order_id,v_grouping,true;RETURN;
 END IF;
 SELECT t.id,t.session_id,t.first_confirmed_at,t.grouping_window_seconds
  INTO v_table.id,v_table.session_id,v_table.first_confirmed_at,v_table.grouping_window_seconds
 FROM sabora.dining_tables t
 WHERE t.id=p_table_id AND t.session_id=v_context.session_id
  AND t.readiness_state='LISTA' AND t.qr_enabled
  AND (t.ordering_state='open' OR (t.ordering_state='paused'
    AND t.pause_until IS NOT NULL AND t.pause_until<=clock_timestamp()))
 FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'customer_order_context_changed' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM sabora.catalog_items c WHERE c.id IN(
  SELECT (entry.value->>'itemId')::uuid FROM jsonb_array_elements(p_lines) entry(value))
  ORDER BY c.id FOR SHARE;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  v_line_number:=v_line_number+1;
  IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_line) k(key)
      WHERE k.key NOT IN ('quoteId','itemId','evidence'))
   OR (v_line->>'quoteId') IS NULL OR (v_line->>'itemId') IS NULL
   OR jsonb_typeof(v_line->'evidence') IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'invalid_customer_order_input' USING ERRCODE='22023'; END IF;
  BEGIN
   v_evidence:=v_line->'evidence';
   SELECT * INTO v_quote FROM sabora.catalog_displayed_quotes q
    WHERE q.id=(v_line->>'quoteId')::uuid AND q.table_id=p_table_id
     AND q.session_id=v_context.session_id AND q.visit_id=p_visit_key
     AND q.basket_id=p_basket_id AND q.actor_id=v_context.actor_id
     AND q.item_id=(v_line->>'itemId')::uuid AND q.expires_at>clock_timestamp()
    FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'customer_order_quote_invalid' USING ERRCODE='40001'; END IF;
   SELECT c.id,c.published_revision,c.published_snapshot,c.withdrawn_at,c.sold_out
    INTO v_catalog.id,v_catalog.published_revision,v_catalog.published_snapshot,
         v_catalog.withdrawn_at,v_catalog.sold_out
   FROM sabora.catalog_items c WHERE c.id=v_quote.item_id AND c.withdrawn_at IS NULL
    AND NOT c.sold_out AND c.published_revision IS NOT NULL
    AND c.published_snapshot IS NOT NULL FOR SHARE;
   IF NOT FOUND OR v_evidence->>'schemaVersion' IS DISTINCT FROM '1'
    OR v_evidence->>'itemId' IS DISTINCT FROM v_quote.item_id::text
    OR (v_evidence->>'publishedRevision')::bigint<>v_catalog.published_revision
    OR (v_evidence->>'quantity')::integer NOT BETWEEN 1 AND 20
    OR length(btrim(v_evidence->>'itemName')) NOT BETWEEN 1 AND 160
    OR length(btrim(v_evidence->>'category')) NOT BETWEEN 1 AND 80
    OR (v_evidence->>'category') ~ '[[:cntrl:]]'
    OR (v_evidence->>'subtotalCents') !~ '^(0|[1-9][0-9]*)$'
    OR (v_evidence->>'discountCents') !~ '^(0|[1-9][0-9]*)$'
    OR (v_evidence->>'totalCents') !~ '^(0|[1-9][0-9]*)$'
    OR (v_evidence->>'totalCents')::bigint<>(v_evidence->>'subtotalCents')::bigint
       -(v_evidence->>'discountCents')::bigint THEN
    RAISE EXCEPTION 'customer_order_evidence_invalid' USING ERRCODE='40001'; END IF;
   IF v_evidence IS DISTINCT FROM v_quote.evidence THEN v_has_reprice:=true; END IF;
   v_items:=v_items||jsonb_build_array(jsonb_build_object(
    'category',v_evidence->>'category','name',v_evidence->>'itemName',
    'quantity',(v_evidence->>'quantity')::integer));
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'invalid_customer_order_input' USING ERRCODE='22023';
  END;
 END LOOP;
 IF v_has_reprice IS DISTINCT FROM p_accepted_reprice THEN
  RAISE EXCEPTION 'customer_order_acceptance_invalid' USING ERRCODE='40001'; END IF;
 v_snapshot:=jsonb_build_object('schemaVersion',1,'lines',p_lines);
 WITH instant AS(SELECT clock_timestamp() at),created AS(
  INSERT INTO sabora.orders(id,table_id,session_id,company,employee_number,
   customer_alias,customer_identifier,customer_visit_key,economic_snapshot,
   confirmed_at,grouping,items)
  SELECT p_order_id,p_table_id,v_context.session_id,NULL,NULL,
   v_context.customer_alias,v_context.customer_identifier,p_visit_key,v_snapshot,instant.at,
   CASE WHEN v_table.first_confirmed_at IS NULL THEN 'first'
    WHEN instant.at<v_table.first_confirmed_at+
      make_interval(secs=>v_table.grouping_window_seconds) THEN 'grouped' ELSE 'late' END,
   v_items FROM instant RETURNING grouping,confirmed_at)
 SELECT grouping,confirmed_at INTO v_grouping,v_confirmed_at FROM created;
 IF v_grouping='first' THEN
  UPDATE sabora.dining_tables SET first_confirmed_at=v_confirmed_at
   WHERE id=p_table_id AND first_confirmed_at IS NULL; END IF;
 INSERT INTO sabora.customer_order_attempt_batches(
  id,table_id,session_id,visit_id,basket_id,actor_id,customer_id,
  request_key,request_fingerprint,accepted_reprice,accepted_at,economic_snapshot,order_id)
 VALUES(p_batch_id,p_table_id,v_context.session_id,p_visit_key,p_basket_id,
  v_context.actor_id,v_context.customer_id,p_request_key,p_request_fingerprint,
  p_accepted_reprice,CASE WHEN p_accepted_reprice THEN clock_timestamp() ELSE NULL END,
  v_snapshot,p_order_id);
 v_line_number:=0;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  v_line_number:=v_line_number+1;
  INSERT INTO sabora.customer_order_attempt_lines(
   batch_id,line_number,quote_id,item_id,economic_evidence)
  VALUES(p_batch_id,v_line_number,(v_line->>'quoteId')::uuid,
   (v_line->>'itemId')::uuid,v_line->'evidence');
 END LOOP;
 RETURN QUERY SELECT p_order_id,v_grouping,false;
END;
$persist_order_m3$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_customer_flow_fn_owner;
GRANT sabora_customer_flow_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.persist_customer_order_candidate(
 bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean)
 OWNER TO sabora_customer_flow_fn_owner;

GRANT SELECT ON sabora.order_revisions,sabora.orders TO sabora_m3_management_fn_owner;
CREATE POLICY management_owner_order_revisions_m3 ON sabora.order_revisions
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);
CREATE POLICY management_owner_orders_m3 ON sabora.orders
 FOR SELECT TO sabora_m3_management_fn_owner USING(true);

CREATE FUNCTION sabora.restore_dynamic_order_line_category_m3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $line_category$
DECLARE v_category text;
BEGIN
 IF NEW.category IS NOT NULL THEN RETURN NEW; END IF;
 SELECT r.economic_snapshot->'lines'->(NEW.line_number-1)->'evidence'->>'category'
  INTO v_category FROM sabora.order_revisions r
  WHERE r.order_id=NEW.order_id AND r.revision_number=NEW.revision_number;
 IF v_category IS NULL THEN
  SELECT o.economic_snapshot->'lines'->(NEW.line_number-1)->'evidence'->>'category'
   INTO v_category FROM sabora.orders o WHERE o.id=NEW.order_id;
 END IF;
 IF length(btrim(v_category)) NOT BETWEEN 1 AND 80 OR v_category ~ '[[:cntrl:]]' THEN
  RAISE EXCEPTION 'invalid_order_line_category' USING ERRCODE='23514';
 END IF;
 NEW.category:=v_category;
 RETURN NEW;
END;
$line_category$;
ALTER FUNCTION sabora.restore_dynamic_order_line_category_m3()
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.restore_dynamic_order_line_category_m3()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_tables_runtime,sabora_m3_catalog_runtime;
CREATE TRIGGER order_line_dynamic_category_m3
 BEFORE INSERT ON sabora.order_lines FOR EACH ROW
 EXECUTE FUNCTION sabora.restore_dynamic_order_line_category_m3();

REVOKE sabora_catalog_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_catalog_fn_owner;
REVOKE sabora_m3_management_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_m3_management_fn_owner;
REVOKE sabora_customer_flow_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_customer_flow_fn_owner;


-- CV-005: no DBA-issued function-owner membership may survive COMMIT.
DO $cv005_early_owner_release$
DECLARE role_name name;
BEGIN
 FOR role_name IN SELECT DISTINCT r.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
 WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND left(r.rolname,7)='sabora_' AND right(r.rolname,9)='_fn_owner'
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',role_name); END LOOP;
END;
$cv005_early_owner_release$;

COMMIT;
