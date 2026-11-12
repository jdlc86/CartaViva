-- H35-P1: signed SQL read publishes effective ADMIN ownership permissions.
-- No privilege expansion, mutable bearer identity, or new SQL login.
BEGIN;
-- CV-005 OPTION A: transaction-scoped owner membership for existing function ACL.
DO $cv005_existing_owner_access$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname,roles.rolcanlogin,roles.rolinherit,roles.rolsuper,roles.rolbypassrls,roles.rolcreaterole,roles.rolcreatedb,roles.rolreplication FROM pg_catalog.pg_roles roles
 WHERE roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner
CREATE OR REPLACE FUNCTION sabora.read_admin_tables_m3_candidate(
 p_capability jsonb,p_after_number integer,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read_tables$
DECLARE v_items jsonb;v_next integer;v_role text;v_owner uuid;v_admin_writer boolean:=false;
BEGIN
 IF p_after_number IS NULL OR p_after_number<0 OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_admin_projection_page' USING ERRCODE='22023';
 END IF;
 -- Ownership is locked *before* the signed verifier's keyring/staff locks:
 -- governor transfers take singleton -> key -> staff in that order.
 SELECT o.owner_user_id INTO v_owner FROM sabora.admin_write_ownership o
  WHERE o.singleton FOR SHARE;
 v_role:=sabora.verify_management_capability_m3(
  p_capability,p_after_number::text||':'||p_limit::text);
 IF p_capability->>'action'<>'tables.read' OR v_role NOT IN ('admin','root','waiter') THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 -- Only the currently authenticated ADMIN owner can write, never ROOT.
 v_admin_writer:=v_role='admin' AND
  COALESCE(v_owner=(p_capability->>'actorId')::uuid,false);
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
 RETURN jsonb_build_object('version',2,'items',v_items,'nextAfterNumber',v_next,
  'permissions',jsonb_build_object('configure',v_admin_writer,'qr',v_admin_writer,
   'readiness',v_admin_writer OR v_role='waiter',
   'occupancy',v_admin_writer OR v_role='waiter'));
END;
$read_tables$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_m3_management_fn_owner;
GRANT sabora_m3_management_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_catalog_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 TO sabora_m3_tables_runtime;
-- M5 has its own signed read capability. It must not depend on a table
-- gateway being mounted; the cross-module projection stays least-privileged.
GRANT SELECT(singleton,owner_user_id),UPDATE(singleton)
 ON sabora.admin_write_ownership TO sabora_m5_comms_fn_owner;
CREATE POLICY m5_comms_owner_lookup_read
 ON sabora.admin_write_ownership FOR SELECT TO sabora_m5_comms_fn_owner
 USING(singleton);
CREATE POLICY m5_comms_owner_lookup_lock
 ON sabora.admin_write_ownership FOR UPDATE TO sabora_m5_comms_fn_owner
 USING(singleton) WITH CHECK(singleton);
CREATE OR REPLACE FUNCTION sabora.read_admin_communications_m5(p_capability jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $admin_read$
DECLARE v_role text;v_items jsonb;v_owner uuid;v_admin_writer boolean:=false;
BEGIN
 -- Mirror governance lock order before HMAC/key and staff verification.
 SELECT o.owner_user_id INTO v_owner FROM sabora.admin_write_ownership o
  WHERE o.singleton FOR SHARE;
 v_role:=sabora.verify_management_capability_m3(p_capability,'comms.read');
 IF p_capability->>'action'<>'comms.read' OR v_role NOT IN ('admin','root')
 THEN RAISE EXCEPTION 'm3_management_forbidden' USING errcode='42501';END IF;
 v_admin_writer:=v_role='admin' AND
  COALESCE(v_owner=(p_capability->>'actorId')::uuid,false);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'state',state,'revision',revision,
  'draft',draft,'published',published_snapshot,'updatedAt',updated_at)
  ORDER BY updated_at DESC,id), '[]'::jsonb) INTO v_items
 FROM sabora.comms_announcements_m5;
 RETURN jsonb_build_object('version',1,'items',v_items,
  'permissions',jsonb_build_object('manage',v_admin_writer));
END;
$admin_read$;
-- CV-005 CANDIDATE (not approved): migration-only capability, revoked before COMMIT.
GRANT CREATE ON SCHEMA sabora TO sabora_m5_comms_fn_owner;
GRANT sabora_m5_comms_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_admin_communications_m5(jsonb) OWNER TO sabora_m5_comms_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_communications_m5(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sabora.read_admin_communications_m5(jsonb) TO sabora_m5_comms_admin_runtime;
-- Standalone signed catalog read: no dependency on an optional tables gateway.
CREATE OR REPLACE FUNCTION sabora.read_admin_catalog_m3_candidate(p_capability jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read_catalog$
DECLARE v_categories jsonb;v_items jsonb;v_taxonomy jsonb;v_role text;v_owner uuid;v_admin_writer boolean:=false;
BEGIN
 -- Owner lock before signed key/staff verification matches governance order.
 -- The owner UUID is not exposed in the output.
 SELECT o.owner_user_id INTO v_owner FROM sabora.admin_write_ownership o
  WHERE o.singleton FOR SHARE;
 v_role:=sabora.verify_management_capability_m3(p_capability,'catalog.read');
 IF p_capability->>'action'<>'catalog.read' OR v_role NOT IN ('admin','root') THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 v_admin_writer:=v_role='admin' AND
  COALESCE(v_owner=(p_capability->>'actorId')::uuid,false);
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
  'items',v_items,'allergenTaxonomyVersion',1,'allergens',v_taxonomy,
  'permissions',jsonb_build_object('manage',v_admin_writer));
END;
$read_catalog$;
ALTER FUNCTION sabora.read_admin_catalog_m3_candidate(jsonb)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_catalog_m3_candidate(jsonb)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_tables_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_admin_catalog_m3_candidate(jsonb)
 TO sabora_m3_catalog_runtime;

REVOKE sabora_m5_comms_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_m5_comms_fn_owner;
REVOKE sabora_m3_management_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_m3_management_fn_owner;
COMMIT;
 AND roles.rolname<>current_user::text
 AND (EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=roles.oid AND n.nspname='sabora')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=roles.oid AND n.nspname='sabora'))
 LOOP
  IF r.rolcanlogin OR r.rolinherit OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication THEN RAISE EXCEPTION 'cv005_unsafe_preexisting_fn_owner' USING errcode='0P000'; END IF;
  EXECUTE format('GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',r.rolname);
 END LOOP;
END;
$cv005_existing_owner_access$;

CREATE OR REPLACE FUNCTION sabora.read_admin_tables_m3_candidate(
 p_capability jsonb,p_after_number integer,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read_tables$
DECLARE v_items jsonb;v_next integer;v_role text;v_owner uuid;v_admin_writer boolean:=false;
BEGIN
 IF p_after_number IS NULL OR p_after_number<0 OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'invalid_admin_projection_page' USING ERRCODE='22023';
 END IF;
 -- Ownership is locked *before* the signed verifier's keyring/staff locks:
 -- governor transfers take singleton -> key -> staff in that order.
 SELECT o.owner_user_id INTO v_owner FROM sabora.admin_write_ownership o
  WHERE o.singleton FOR SHARE;
 v_role:=sabora.verify_management_capability_m3(
  p_capability,p_after_number::text||':'||p_limit::text);
 IF p_capability->>'action'<>'tables.read' OR v_role NOT IN ('admin','root','waiter') THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 -- Only the currently authenticated ADMIN owner can write, never ROOT.
 v_admin_writer:=v_role='admin' AND
  COALESCE(v_owner=(p_capability->>'actorId')::uuid,false);
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
 RETURN jsonb_build_object('version',2,'items',v_items,'nextAfterNumber',v_next,
  'permissions',jsonb_build_object('configure',v_admin_writer,'qr',v_admin_writer,
   'readiness',v_admin_writer OR v_role='waiter',
   'occupancy',v_admin_writer OR v_role='waiter'));
END;
$read_tables$;
-- CV-005 CANDIDATE: transaction-scoped PG17 ownership transfer.
GRANT CREATE ON SCHEMA sabora TO sabora_m3_management_fn_owner;
GRANT sabora_m3_management_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_catalog_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)
 TO sabora_m3_tables_runtime;
-- M5 has its own signed read capability. It must not depend on a table
-- gateway being mounted; the cross-module projection stays least-privileged.
GRANT SELECT(singleton,owner_user_id),UPDATE(singleton)
 ON sabora.admin_write_ownership TO sabora_m5_comms_fn_owner;
CREATE POLICY m5_comms_owner_lookup_read
 ON sabora.admin_write_ownership FOR SELECT TO sabora_m5_comms_fn_owner
 USING(singleton);
CREATE POLICY m5_comms_owner_lookup_lock
 ON sabora.admin_write_ownership FOR UPDATE TO sabora_m5_comms_fn_owner
 USING(singleton) WITH CHECK(singleton);
CREATE OR REPLACE FUNCTION sabora.read_admin_communications_m5(p_capability jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $admin_read$
DECLARE v_role text;v_items jsonb;v_owner uuid;v_admin_writer boolean:=false;
BEGIN
 -- Mirror governance lock order before HMAC/key and staff verification.
 SELECT o.owner_user_id INTO v_owner FROM sabora.admin_write_ownership o
  WHERE o.singleton FOR SHARE;
 v_role:=sabora.verify_management_capability_m3(p_capability,'comms.read');
 IF p_capability->>'action'<>'comms.read' OR v_role NOT IN ('admin','root')
 THEN RAISE EXCEPTION 'm3_management_forbidden' USING errcode='42501';END IF;
 v_admin_writer:=v_role='admin' AND
  COALESCE(v_owner=(p_capability->>'actorId')::uuid,false);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'state',state,'revision',revision,
  'draft',draft,'published',published_snapshot,'updatedAt',updated_at)
  ORDER BY updated_at DESC,id), '[]'::jsonb) INTO v_items
 FROM sabora.comms_announcements_m5;
 RETURN jsonb_build_object('version',1,'items',v_items,
  'permissions',jsonb_build_object('manage',v_admin_writer));
END;
$admin_read$;
-- CV-005 CANDIDATE (not approved): migration-only capability, revoked before COMMIT.
GRANT CREATE ON SCHEMA sabora TO sabora_m5_comms_fn_owner;
GRANT sabora_m5_comms_fn_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;
ALTER FUNCTION sabora.read_admin_communications_m5(jsonb) OWNER TO sabora_m5_comms_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_communications_m5(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sabora.read_admin_communications_m5(jsonb) TO sabora_m5_comms_admin_runtime;
-- Standalone signed catalog read: no dependency on an optional tables gateway.
CREATE OR REPLACE FUNCTION sabora.read_admin_catalog_m3_candidate(p_capability jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read_catalog$
DECLARE v_categories jsonb;v_items jsonb;v_taxonomy jsonb;v_role text;v_owner uuid;v_admin_writer boolean:=false;
BEGIN
 -- Owner lock before signed key/staff verification matches governance order.
 -- The owner UUID is not exposed in the output.
 SELECT o.owner_user_id INTO v_owner FROM sabora.admin_write_ownership o
  WHERE o.singleton FOR SHARE;
 v_role:=sabora.verify_management_capability_m3(p_capability,'catalog.read');
 IF p_capability->>'action'<>'catalog.read' OR v_role NOT IN ('admin','root') THEN
  RAISE EXCEPTION 'invalid_m3_management_capability' USING ERRCODE='42501'; END IF;
 v_admin_writer:=v_role='admin' AND
  COALESCE(v_owner=(p_capability->>'actorId')::uuid,false);
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
  'items',v_items,'allergenTaxonomyVersion',1,'allergens',v_taxonomy,
  'permissions',jsonb_build_object('manage',v_admin_writer));
END;
$read_catalog$;
ALTER FUNCTION sabora.read_admin_catalog_m3_candidate(jsonb)
 OWNER TO sabora_m3_management_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_catalog_m3_candidate(jsonb)
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader,
  sabora_m3_tables_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_admin_catalog_m3_candidate(jsonb)
 TO sabora_m3_catalog_runtime;

REVOKE sabora_m5_comms_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_m5_comms_fn_owner;
REVOKE sabora_m3_management_fn_owner FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA sabora FROM sabora_m3_management_fn_owner;

-- CV-005: release every own-granted owner membership before COMMIT.
DO $cv005_existing_owner_release$
DECLARE r name;
BEGIN
 FOR r IN SELECT DISTINCT roles.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles roles ON roles.oid=m.roleid
 WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user::text)
 AND roles.rolname ~ '^sabora_[a-z0-9_]+_fn_owner
 LOOP EXECUTE format('REVOKE %I FROM CURRENT_USER',r); END LOOP;
END;
$cv005_existing_owner_release$;
COMMIT;
