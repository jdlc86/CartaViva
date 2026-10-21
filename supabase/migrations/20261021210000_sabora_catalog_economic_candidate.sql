-- Candidate private helpers. No grants to runtime roles.
BEGIN;
CREATE FUNCTION sabora.valid_catalog_cents(v jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $body$
 SELECT jsonb_typeof(v)='number' AND (v #>> '{}') ~ '^(0|[1-9][0-9]*)$'
 AND length(v #>> '{}')<=15
$body$;
CREATE FUNCTION sabora.validate_catalog_modifier_value(v jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $body$
 SELECT jsonb_typeof(v)='object'
 AND (v->>'id') ~ '^[A-Za-z0-9_-]{1,64}$'
 AND jsonb_typeof(v->'name')='string'
 AND length(btrim(v->>'name')) BETWEEN 1 AND 100
 AND (v->>'name') !~ '[[:cntrl:]]'
 AND sabora.valid_catalog_cents(v->'priceCents')
 AND jsonb_typeof(v->'available')='boolean'
 AND jsonb_typeof(v->'allergens')='array'
 AND jsonb_array_length(v->'allergens')<=32
 AND NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(v->'allergens') AS a(value)
  WHERE jsonb_typeof(a.value)<>'string'
   OR length(btrim(a.value #>> '{}')) NOT BETWEEN 1 AND 100
   OR (a.value #>> '{}') ~ '[[:cntrl:]]'
 )
 AND NOT EXISTS(
  SELECT 1 FROM jsonb_object_keys(v) AS k(key)
  WHERE k.key NOT IN ('id','name','priceCents','available','allergens')
 )
$body$;
REVOKE ALL ON FUNCTION sabora.valid_catalog_cents(jsonb)
 FROM PUBLIC, anon, authenticated, sabora_admin_writer, sabora_catalog_reader;
REVOKE ALL ON FUNCTION sabora.validate_catalog_modifier_value(jsonb)
 FROM PUBLIC, anon, authenticated, sabora_admin_writer, sabora_catalog_reader;
COMMIT;

-- Candidate modifier validation only. Not wired to publication or browser roles.
-- SQL parity target: apps/api/src/catalog-economic-modifiers.mjs.
BEGIN;
CREATE FUNCTION sabora.validate_catalog_economic_modifiers(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $body$
DECLARE
 v_options jsonb; v_extras jsonb; v_discount jsonb;
 v_group jsonb; v_value jsonb; v_item jsonb; v_seen text[];
 v_ids text[]; v_group_ids text[] := ARRAY[]::text[];
 v_extra_ids text[] := ARRAY[]::text[];
 v_value_ids text[];
 v_text text; v_amount numeric;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 v_options:=COALESCE(p->'options','[]'::jsonb);
 v_extras:=COALESCE(p->'extras','[]'::jsonb);
 v_discount:=COALESCE(p->'discount','null'::jsonb);
 IF jsonb_typeof(v_options) IS DISTINCT FROM 'array' OR
    jsonb_typeof(v_extras) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(v_options)>32 OR jsonb_array_length(v_extras)>50 THEN RETURN false; END IF;
 FOR v_group IN SELECT value FROM jsonb_array_elements(v_options) LOOP
  IF jsonb_typeof(v_group) IS DISTINCT FROM 'object' OR
    EXISTS(SELECT 1 FROM jsonb_object_keys(v_group) AS k(key)
           WHERE k.key NOT IN ('id','name','required','maxSelections','values')) THEN RETURN false; END IF;
  IF (v_group->>'id') IS NULL OR (v_group->>'id') !~ '^[A-Za-z0-9_-]{1,64}$' OR
     (v_group->>'id')=ANY(v_group_ids) THEN RETURN false; END IF;
  v_group_ids:=array_append(v_group_ids,v_group->>'id');
  IF jsonb_typeof(v_group->'name') IS DISTINCT FROM 'string' OR
     length(btrim(v_group->>'name')) NOT BETWEEN 1 AND 100 OR
     (v_group->>'name') ~ '[[:cntrl:]]' OR
     jsonb_typeof(v_group->'required') IS DISTINCT FROM 'boolean' OR
     jsonb_typeof(v_group->'maxSelections') IS DISTINCT FROM 'number' OR
     (v_group->>'maxSelections') !~ '^[1-9][0-9]*$' OR
     length(v_group->>'maxSelections')>2 OR
     (v_group->>'maxSelections')::integer>20 OR
     jsonb_typeof(v_group->'values') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(v_group->'values') NOT BETWEEN 1 AND 20 OR
     (v_group->>'maxSelections')::integer>jsonb_array_length(v_group->'values') THEN RETURN false; END IF;
  v_value_ids:=ARRAY[]::text[];
  FOR v_value IN SELECT value FROM jsonb_array_elements(v_group->'values') LOOP
   IF NOT sabora.validate_catalog_modifier_value(v_value) THEN RETURN false; END IF;
   IF (v_value->>'id')=ANY(v_value_ids) THEN RETURN false; END IF;
   v_value_ids:=array_append(v_value_ids,v_value->>'id');
  END LOOP;
 END LOOP;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_extras) LOOP
  IF NOT sabora.validate_catalog_modifier_value(v_item) THEN RETURN false; END IF;
  IF (v_item->>'id')=ANY(v_extra_ids) THEN RETURN false; END IF;
  v_extra_ids:=array_append(v_extra_ids,v_item->>'id');
 END LOOP;
 IF jsonb_typeof(v_discount)='null' THEN RETURN true; END IF;
 IF jsonb_typeof(v_discount) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF v_discount->>'type'='fixed' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_discount) AS k(key)
            WHERE k.key NOT IN ('type','amountCents')) THEN RETURN false; END IF;
  RETURN sabora.valid_catalog_cents(v_discount->'amountCents');
 ELSIF v_discount->>'type'='percent' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_discount) AS k(key)
            WHERE k.key NOT IN ('type','basisPoints')) THEN RETURN false; END IF;
  IF jsonb_typeof(v_discount->'basisPoints') IS DISTINCT FROM 'number' OR
     (v_discount->>'basisPoints') !~ '^(0|[1-9][0-9]*)$' OR
     length(v_discount->>'basisPoints')>5 THEN RETURN false; END IF;
  RETURN (v_discount->>'basisPoints')::integer<=10000;
 END IF;
 RETURN false;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RETURN false;
END
$body$;
REVOKE ALL ON FUNCTION sabora.validate_catalog_economic_modifiers(jsonb)
 FROM PUBLIC, anon, authenticated, sabora_admin_writer, sabora_catalog_reader;
COMMIT;
