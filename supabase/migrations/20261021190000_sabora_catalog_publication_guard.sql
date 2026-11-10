-- Catalog publication is an explicit operation. This migration only adds
-- validation and a privileged-inaccessible function; no runtime grants.
BEGIN;
CREATE FUNCTION sabora.validate_catalog_snapshot(p_snapshot jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $validate$
 SELECT jsonb_typeof(p_snapshot)='object'
 AND jsonb_typeof(p_snapshot->'name')='string'
 AND length(btrim(p_snapshot->>'name')) BETWEEN 1 AND 160
 AND (p_snapshot->>'name') !~ '[[:cntrl:]]'
 AND (p_snapshot->>'category') IN ('Bebidas','Primeros','Segundos','Postres')
 AND jsonb_typeof(p_snapshot->'priceCents')='number'
 AND (p_snapshot->>'priceCents') ~ '^(0|[1-9][0-9]*)$'
 AND length(p_snapshot->>'priceCents')<=15
 AND (
  (NOT p_snapshot ? 'options' OR p_snapshot->'options'='[]'::jsonb)
  AND (NOT p_snapshot ? 'extras' OR p_snapshot->'extras'='[]'::jsonb)
  AND (NOT p_snapshot ? 'discount' OR p_snapshot->'discount'='null'::jsonb)
 )
 AND NOT EXISTS (
  SELECT 1 FROM jsonb_object_keys(p_snapshot) AS field(key)
  WHERE field.key NOT IN ('name','category','priceCents','allergens','options','extras','discount')
 )
 AND jsonb_typeof(p_snapshot->'allergens')='array'
 AND jsonb_array_length(p_snapshot->'allergens')<=32
 AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(p_snapshot->'allergens') AS a(value)
  WHERE jsonb_typeof(a.value)<>'string'
    OR length(btrim(a.value #>> '{}')) NOT BETWEEN 1 AND 100
    OR (a.value #>> '{}') ~ '[[:cntrl:]]'
 )
$validate$;
REVOKE ALL ON FUNCTION sabora.validate_catalog_snapshot(jsonb)
 FROM PUBLIC, anon, authenticated, sabora_admin_writer;

CREATE FUNCTION sabora.publish_catalog_item(p_item_id uuid,p_expected_revision bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $publish$
DECLARE v_item sabora.catalog_items%ROWTYPE;
BEGIN
 SELECT * INTO v_item FROM sabora.catalog_items
 WHERE id=p_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'catalog_item_not_found'; END IF;
 IF p_expected_revision IS DISTINCT FROM v_item.draft_revision OR p_expected_revision<=0 THEN
  RAISE EXCEPTION 'catalog_revision_conflict'; END IF;
 IF sabora.validate_catalog_snapshot(v_item.draft) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'invalid_catalog_snapshot'; END IF;
 UPDATE sabora.catalog_items
 SET published_snapshot=v_item.draft,
     published_revision=v_item.draft_revision,
     published_at=now(),
     withdrawn_at=NULL,
     updated_at=now()
 WHERE id=p_item_id;
 RETURN v_item.draft_revision;
END
$publish$;
REVOKE ALL ON FUNCTION sabora.publish_catalog_item(uuid,bigint)
 FROM PUBLIC, anon, authenticated, sabora_admin_writer;
-- SECURITY INVOKER + no EXECUTE grants: not reachable by application roles.
-- Only a future reviewed writer capability may call this transaction.
COMMIT;
