-- Standalone candidate economic modifier validation. The active publisher
-- remains unchanged and continues rejecting nonempty economic modifiers.
BEGIN;
CREATE FUNCTION sabora.validate_catalog_economic_modifier_entry(p_entry jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $entry$
 SELECT jsonb_typeof(p_entry)='object'
 AND (SELECT count(*)=5 FROM jsonb_object_keys(p_entry))
 AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_entry) AS field(key)
  WHERE field.key NOT IN ('id','name','priceCents','available','allergens'))
 AND (p_entry->>'id') ~ '^[a-zA-Z0-9_-]{1,64}$'
 AND length(btrim(p_entry->>'name')) BETWEEN 1 AND 100
 AND (p_entry->>'name') !~ '[[:cntrl:]]'
 AND jsonb_typeof(p_entry->'priceCents')='number'
 AND (p_entry->>'priceCents') ~ '^(0|[1-9][0-9]*)$'
 AND length(p_entry->>'priceCents')<=15
 AND jsonb_typeof(p_entry->'available')='boolean'
 AND jsonb_typeof(p_entry->'allergens')='array'
 AND jsonb_array_length(p_entry->'allergens')<=32
 AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(p_entry->'allergens') a(value)
  WHERE jsonb_typeof(a.value)<>'string'
   OR length(btrim(a.value #>> '{}')) NOT BETWEEN 1 AND 100
   OR (a.value #>> '{}') ~ '[[:cntrl:]]'
 )
$entry$;
REVOKE ALL ON FUNCTION sabora.validate_catalog_economic_modifier_entry(jsonb)
 FROM PUBLIC, anon, authenticated, sabora_admin_writer, sabora_catalog_reader;

CREATE FUNCTION sabora.validate_catalog_economic_modifiers(p_snapshot jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $body$
DECLARE
 v_options jsonb; v_extras jsonb; v_discount jsonb;
 v_group jsonb; v_value jsonb; v_extra jsonb;
 v_ids text[]; v_value_ids text[]; v_id text; v_n numeric;
BEGIN
 IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 v_options:=COALESCE(p_snapshot->'options','[]'::jsonb);
 v_extras:=COALESCE(p_snapshot->'extras','[]'::jsonb);
 v_discount:=COALESCE(p_snapshot->'discount','null'::jsonb);
 IF jsonb_typeof(v_options) IS DISTINCT FROM 'array' OR
    jsonb_typeof(v_extras) IS DISTINCT FROM 'array' OR
    jsonb_array_length(v_options)>32 OR jsonb_array_length(v_extras)>50 THEN RETURN false; END IF;
 v_ids:=ARRAY[]::text[];
 FOR v_group IN SELECT value FROM jsonb_array_elements(v_options) LOOP
  IF jsonb_typeof(v_group) IS DISTINCT FROM 'object' OR
     (SELECT count(*) FROM jsonb_object_keys(v_group) AS field(key)
       WHERE field.key NOT IN ('id','name','required','maxSelections','values'))>0 OR
     (v_group->>'id') !~ '^[a-zA-Z0-9_-]{1,64}$' OR
     length(btrim(v_group->>'name')) NOT BETWEEN 1 AND 100 OR
     (v_group->>'name') ~ '[[:cntrl:]]' OR
     jsonb_typeof(v_group->'required') IS DISTINCT FROM 'boolean' OR
     jsonb_typeof(v_group->'maxSelections') IS DISTINCT FROM 'number' OR
     (v_group->>'maxSelections') !~ '^[0-9]+$' OR
     jsonb_typeof(v_group->'values') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  v_id:=v_group->>'id';
  IF v_id=ANY(v_ids) THEN RETURN false; END IF;
  v_ids:=array_append(v_ids,v_id);
  v_n:=(v_group->>'maxSelections')::numeric;
  IF v_n<1 OR v_n>20 OR jsonb_array_length(v_group->'values') NOT BETWEEN 1 AND 20 OR
     v_n>jsonb_array_length(v_group->'values') THEN RETURN false; END IF;
  v_value_ids:=ARRAY[]::text[];
  FOR v_value IN SELECT value FROM jsonb_array_elements(v_group->'values') LOOP
   IF NOT sabora.validate_catalog_economic_modifier_entry(v_value) THEN RETURN false; END IF;
   v_id:=v_value->>'id';
   IF v_id=ANY(v_value_ids) THEN RETURN false; END IF;
   v_value_ids:=array_append(v_value_ids,v_id);
  END LOOP;
 END LOOP;
 v_ids:=ARRAY[]::text[];
 FOR v_extra IN SELECT value FROM jsonb_array_elements(v_extras) LOOP
  IF NOT sabora.validate_catalog_economic_modifier_entry(v_extra) THEN RETURN false; END IF;
  v_id:=v_extra->>'id';
  IF v_id=ANY(v_ids) THEN RETURN false; END IF;
  v_ids:=array_append(v_ids,v_id);
 END LOOP;
 IF jsonb_typeof(v_discount)='null' THEN RETURN true; END IF;
 IF jsonb_typeof(v_discount) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF v_discount->>'type'='fixed' THEN
  RETURN (SELECT count(*)=2 FROM jsonb_object_keys(v_discount)) AND
   (SELECT bool_and(field.key IN ('type','amountCents')) FROM jsonb_object_keys(v_discount) AS field(key)) AND
   jsonb_typeof(v_discount->'amountCents')='number' AND
   (v_discount->>'amountCents') ~ '^(0|[1-9][0-9]*)$' AND
   length(v_discount->>'amountCents')<=15;
 ELSIF v_discount->>'type'='percent' THEN
  RETURN (SELECT count(*)=2 FROM jsonb_object_keys(v_discount)) AND
   (SELECT bool_and(field.key IN ('type','basisPoints')) FROM jsonb_object_keys(v_discount) AS field(key)) AND
   jsonb_typeof(v_discount->'basisPoints')='number' AND
   (v_discount->>'basisPoints') ~ '^(0|[1-9][0-9]*)$' AND
   length(v_discount->>'basisPoints')<=5 AND
   (v_discount->>'basisPoints')::numeric<=10000;
 END IF;
 RETURN false;
EXCEPTION WHEN data_exception OR numeric_value_out_of_range THEN RETURN false;
END $body$;
REVOKE ALL ON FUNCTION sabora.validate_catalog_economic_modifiers(jsonb)
 FROM PUBLIC, anon, authenticated, sabora_admin_writer, sabora_catalog_reader;
COMMIT;
