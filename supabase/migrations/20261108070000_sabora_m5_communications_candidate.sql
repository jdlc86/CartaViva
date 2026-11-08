-- Sabora CV-014: isolated communications candidate. No operational activation.
-- No background polling: time boundaries are returned for one-shot scheduling and NOTIFY.
BEGIN;
CREATE ROLE sabora_m5_comms_fn_owner NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE sabora_m5_comms_admin_runtime NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE sabora_m5_comms_public_runtime NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA sabora TO sabora_m5_comms_fn_owner,sabora_m5_comms_admin_runtime,sabora_m5_comms_public_runtime;

-- Existing M3 signer and revocation semantics, expanding ONLY the allowed actions;
-- same HMAC/caller SQL LOGIN, active staff row, TTL and body-digest verification.
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
     'catalog.item_publish','catalog.item_withdraw','finance.read',
     'comms.read','comms.manage')
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
GRANT EXECUTE ON FUNCTION sabora.verify_management_capability_m3(jsonb,text) TO sabora_m5_comms_fn_owner;

CREATE TABLE sabora.comms_announcements_m5 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 draft jsonb NOT NULL CHECK(jsonb_typeof(draft)='object'),
 published_snapshot jsonb,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','paused','withdrawn')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 actor_id uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE sabora.comms_receipts_m5 (
 request_id uuid PRIMARY KEY, actor_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('save','publish','pause','resume','withdraw')),
 fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE sabora.comms_audit_m5 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid UNIQUE NOT NULL, actor_id uuid NOT NULL,
 announcement_id uuid NOT NULL, operation text NOT NULL,
 before_state jsonb, after_state jsonb NOT NULL,
 at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE sabora.comms_announcements_m5 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.comms_announcements_m5 FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.comms_receipts_m5 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.comms_receipts_m5 FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.comms_audit_m5 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.comms_audit_m5 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.comms_announcements_m5,sabora.comms_receipts_m5,sabora.comms_audit_m5 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON sabora.comms_announcements_m5 TO sabora_m5_comms_fn_owner;
GRANT SELECT,INSERT ON sabora.comms_receipts_m5 TO sabora_m5_comms_fn_owner;
GRANT SELECT,INSERT ON sabora.comms_audit_m5 TO sabora_m5_comms_fn_owner;
GRANT USAGE ON SEQUENCE sabora.comms_audit_m5_id_seq TO sabora_m5_comms_fn_owner;
CREATE POLICY comms_owner_announcements_m5 ON sabora.comms_announcements_m5
 FOR ALL TO sabora_m5_comms_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY comms_owner_receipts_m5 ON sabora.comms_receipts_m5
 FOR ALL TO sabora_m5_comms_fn_owner USING(true) WITH CHECK(true);
CREATE POLICY comms_owner_audit_m5 ON sabora.comms_audit_m5
 FOR ALL TO sabora_m5_comms_fn_owner USING(true) WITH CHECK(true);
CREATE TRIGGER comms_audit_immutable_m5 BEFORE UPDATE OR DELETE ON sabora.comms_audit_m5
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_management_audit_mutation_m3();
CREATE TRIGGER comms_audit_no_truncate_m5 BEFORE TRUNCATE ON sabora.comms_audit_m5
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_management_audit_mutation_m3();

-- Explicit JSON contracts. Rich plain text is displayed as text, never parsed
-- as HTML/JavaScript. JPEG/PNG/WebP bytes are optional and capped (128 KiB).
CREATE FUNCTION sabora.validate_announcement_draft_m5(p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $validate$
DECLARE s jsonb;v jsonb;start_day date;end_day date;v_mode text;start_t time;end_t time;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR
  (SELECT count(*) FROM jsonb_object_keys(p))<>7 OR
  EXISTS(SELECT 1 FROM jsonb_object_keys(p) x(k) WHERE x.k NOT IN
   ('title','body','emoji','image','imageLicense','priority','schedule'))
 THEN RAISE EXCEPTION 'invalid_comms_draft_shape' USING errcode='22023';END IF;
 IF jsonb_typeof(p->'title')<>'string' OR length(btrim(p->>'title')) NOT BETWEEN 1 AND 120
  OR (p->>'title')~'[[:cntrl:]]'
  OR jsonb_typeof(p->'body')<>'string' OR length(btrim(p->>'body')) NOT BETWEEN 1 AND 1200
  OR (p->>'body')~'[^\x09\x0A\x0D\x20-\x7E\x80-\xFF]' -- UTF-8 controls are not a UI field
  OR jsonb_typeof(p->'emoji')<>'string' OR length(p->>'emoji')>12
  OR p->>'priority' NOT IN ('ALTA','BAJA') THEN
  RAISE EXCEPTION 'invalid_comms_content' USING errcode='22023'; END IF;
 IF p->'image' <> 'null'::jsonb THEN
  IF jsonb_typeof(p->'image')<>'string'
   OR length(p->>'image')>175000 OR
   (p->>'image') !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'
   OR jsonb_typeof(p->'imageLicense')<>'string'
   OR length(btrim(p->>'imageLicense')) NOT BETWEEN 5 AND 240
   OR octet_length(decode(split_part(p->>'image',',',2),'base64'))>131072
  THEN RAISE EXCEPTION 'invalid_comms_image' USING errcode='22023'; END IF;
 ELSE
  IF p->'imageLicense' <> 'null'::jsonb
   THEN RAISE EXCEPTION 'invalid_comms_image_license' USING errcode='22023'; END IF;
 END IF;
 s:=p->'schedule';
 IF jsonb_typeof(s)<>'object' OR
  (SELECT count(*) FROM jsonb_object_keys(s))<>7 OR
  EXISTS(SELECT 1 FROM jsonb_object_keys(s) x(k) WHERE x.k NOT IN
  ('mode','startDate','endDate','weekdays','startTime','endTime','timeZone'))
 THEN RAISE EXCEPTION 'invalid_comms_schedule' USING errcode='22023';END IF;
 v_mode:=s->>'mode';
 IF v_mode NOT IN ('once','daily','weekly') OR
   (s->>'startDate') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' OR
   (s->'endDate'<>'null'::jsonb AND
    (s->>'endDate') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$') OR
   (s->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
   (s->>'endTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
   (s->>'timeZone') IS NULL OR length(s->>'timeZone')>80 OR
   NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=s->>'timeZone') OR
   jsonb_typeof(s->'weekdays')<>'array'
 THEN RAISE EXCEPTION 'invalid_comms_schedule' USING errcode='22023';END IF;
 start_day:=(s->>'startDate')::date;
 end_day:=CASE WHEN s->'endDate'='null'::jsonb THEN NULL ELSE (s->>'endDate')::date END;
 start_t:=(s->>'startTime')::time;end_t:=(s->>'endTime')::time;
 IF to_char(start_day,'YYYY-MM-DD')<>s->>'startDate'
  OR (end_day IS NOT NULL AND (to_char(end_day,'YYYY-MM-DD')<>s->>'endDate' OR end_day<start_day))
  OR start_t>=end_t OR (v_mode='once' AND end_day IS DISTINCT FROM start_day)
  OR (v_mode<>'weekly' AND jsonb_array_length(s->'weekdays')<>0)
  OR (v_mode='weekly' AND (jsonb_array_length(s->'weekdays')<1 OR jsonb_array_length(s->'weekdays')>7
   OR EXISTS (SELECT 1 FROM jsonb_array_elements(s->'weekdays') x(value)
    WHERE jsonb_typeof(value)<>'number' OR value::text !~ '^[1-7]$')
   OR (SELECT count(DISTINCT x.value) FROM jsonb_array_elements(s->'weekdays') x(value))
       <>jsonb_array_length(s->'weekdays')))
 THEN RAISE EXCEPTION 'invalid_comms_schedule' USING errcode='22023'; END IF;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation
 OR invalid_parameter_value THEN
 RAISE EXCEPTION 'invalid_comms_schedule' USING errcode='22023';
END;
$validate$;
ALTER FUNCTION sabora.validate_announcement_draft_m5(jsonb) OWNER TO sabora_m5_comms_fn_owner;
REVOKE ALL ON FUNCTION sabora.validate_announcement_draft_m5(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION sabora.read_admin_communications_m5(p_capability jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $admin_read$
DECLARE v_role text;v_items jsonb;
BEGIN
 v_role:=sabora.verify_management_capability_m3(p_capability,'comms.read');
 IF p_capability->>'action'<>'comms.read' OR v_role NOT IN ('admin','root')
 THEN RAISE EXCEPTION 'm3_management_forbidden' USING errcode='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'state',state,'revision',revision,
  'draft',draft,'published',published_snapshot,'updatedAt',updated_at)
  ORDER BY updated_at DESC,id), '[]'::jsonb) INTO v_items
 FROM sabora.comms_announcements_m5;
 RETURN jsonb_build_object('version',1,'items',v_items);
END;
$admin_read$;
ALTER FUNCTION sabora.read_admin_communications_m5(jsonb) OWNER TO sabora_m5_comms_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_admin_communications_m5(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sabora.read_admin_communications_m5(jsonb) TO sabora_m5_comms_admin_runtime;

CREATE FUNCTION sabora.manage_communications_m5(p_capability jsonb,p_operation text,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $manage$
DECLARE v_role text;v_actor uuid;v_id uuid;v_request uuid;v_input jsonb;v_rec sabora.comms_announcements_m5%ROWTYPE;
v_fingerprint bytea;v_receipt sabora.comms_receipts_m5%ROWTYPE;v_before jsonb;v_after jsonb;
v_result jsonb;v_expected bigint;
BEGIN
 v_role:=sabora.verify_management_capability_m3(p_capability,p_body);
 IF p_capability->>'action'<>'comms.manage' OR v_role NOT IN ('admin','root')
 THEN RAISE EXCEPTION 'm3_management_forbidden' USING errcode='42501';END IF;
 IF p_operation NOT IN ('save','publish','pause','resume','withdraw')
 THEN RAISE EXCEPTION 'invalid_comms_operation' USING errcode='22023';END IF;
 v_input:=p_body::jsonb;
 IF jsonb_typeof(v_input)<>'object' OR
    (SELECT count(*) FROM jsonb_object_keys(v_input))<>3 OR
    NOT (v_input ?& array['id','revision','draft']) THEN
 RAISE EXCEPTION 'invalid_comms_request' USING errcode='22023'; END IF;
 v_actor:=(p_capability->>'actorId')::uuid;
 v_request:=(p_capability->>'requestId')::uuid;
 v_fingerprint:=extensions.digest(convert_to(p_operation||':'||p_body,'UTF8'),'sha256');
 PERFORM pg_advisory_xact_lock(hashtextextended(v_request::text,5014));
 SELECT * INTO v_receipt FROM sabora.comms_receipts_m5 WHERE request_id=v_request;
 IF FOUND THEN
  IF v_receipt.actor_id<>v_actor OR v_receipt.operation<>p_operation
    OR v_receipt.fingerprint<>v_fingerprint
  THEN RAISE EXCEPTION 'comms_idempotency_conflict' USING errcode='23505'; END IF;
  RETURN v_receipt.result||jsonb_build_object('replayed',true);
 END IF;
 IF v_input->'id'='null'::jsonb THEN v_id:=gen_random_uuid();
 ELSE v_id:=(v_input->>'id')::uuid; END IF;
 IF v_input->'revision'='null'::jsonb THEN v_expected:=NULL;
 ELSE v_expected:=(v_input->>'revision')::bigint; END IF;
 SELECT * INTO v_rec FROM sabora.comms_announcements_m5 WHERE id=v_id FOR UPDATE;
 IF FOUND AND (v_expected IS DISTINCT FROM v_rec.revision)
 THEN RAISE EXCEPTION 'comms_revision_conflict' USING errcode='23505'; END IF;
 IF NOT FOUND AND (p_operation<>'save' OR v_expected IS NOT NULL OR v_input->'id'<>'null'::jsonb)
 THEN RAISE EXCEPTION 'comms_not_found' USING errcode='P0002'; END IF;
 IF FOUND THEN
  v_before:=jsonb_build_object('state',v_rec.state,'revision',v_rec.revision);
 ELSE v_before:=NULL; END IF;
 IF p_operation='save' THEN
  PERFORM sabora.validate_announcement_draft_m5(v_input->'draft');
  IF v_rec.id IS NULL THEN
   INSERT INTO sabora.comms_announcements_m5(id,draft,actor_id)
    VALUES(v_id,v_input->'draft',v_actor)
    RETURNING * INTO v_rec;
  ELSE
   UPDATE sabora.comms_announcements_m5
    SET draft=v_input->'draft',revision=revision+1,actor_id=v_actor,updated_at=clock_timestamp()
    WHERE id=v_id RETURNING * INTO v_rec;
  END IF;
 ELSE
  IF v_input->'draft'<>'null'::jsonb
  THEN RAISE EXCEPTION 'invalid_comms_request' USING errcode='22023'; END IF;
  IF p_operation='publish' THEN
   PERFORM sabora.validate_announcement_draft_m5(v_rec.draft);
   UPDATE sabora.comms_announcements_m5
    SET published_snapshot=draft,state='published',revision=revision+1,
        actor_id=v_actor,updated_at=clock_timestamp()
    WHERE id=v_id RETURNING * INTO v_rec;
  ELSIF p_operation='pause' AND v_rec.state='published' THEN
   UPDATE sabora.comms_announcements_m5 SET state='paused',revision=revision+1,
    actor_id=v_actor,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_rec;
  ELSIF p_operation='resume' AND v_rec.state='paused' THEN
   UPDATE sabora.comms_announcements_m5 SET state='published',revision=revision+1,
    actor_id=v_actor,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_rec;
  ELSIF p_operation='withdraw' AND v_rec.state IN('published','paused') THEN
   UPDATE sabora.comms_announcements_m5 SET state='withdrawn',revision=revision+1,
    actor_id=v_actor,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_rec;
  ELSE RAISE EXCEPTION 'comms_state_conflict' USING errcode='23505';END IF;
 END IF;
 v_after:=jsonb_build_object('state',v_rec.state,'revision',v_rec.revision,'id',v_id);
 INSERT INTO sabora.comms_audit_m5(request_id,actor_id,announcement_id,operation,before_state,after_state)
 VALUES(v_request,v_actor,v_id,p_operation,v_before,v_after);
 v_result:=jsonb_build_object('id',v_id,'state',v_rec.state,'revision',v_rec.revision);
 INSERT INTO sabora.comms_receipts_m5(request_id,actor_id,operation,fingerprint,result)
 VALUES(v_request,v_actor,p_operation,v_fingerprint,v_result);
 -- This NOTIFY is delivered only after the whole transaction commits.
 PERFORM pg_notify('sabora_comms_changed',v_id::text);
 RETURN v_result||jsonb_build_object('replayed',false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'invalid_comms_request' USING errcode='22023';
END;
$manage$;
ALTER FUNCTION sabora.manage_communications_m5(jsonb,text,text) OWNER TO sabora_m5_comms_fn_owner;
REVOKE ALL ON FUNCTION sabora.manage_communications_m5(jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sabora.manage_communications_m5(jsonb,text,text) TO sabora_m5_comms_admin_runtime;

-- Public projection is guarded by a NOLOGIN owner and FORCE RLS.
-- Snapshot is read once per request; even future scheduled titles are never exposed.
CREATE FUNCTION sabora.read_public_communications_m5()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $public$
WITH now_clock AS (SELECT clock_timestamp() AS ts),
snapshots AS (
 SELECT a.id,a.published_snapshot p,n.ts,
  (n.ts AT TIME ZONE a.published_snapshot->'schedule'->>'timeZone')::date AS day_local,
  (n.ts AT TIME ZONE a.published_snapshot->'schedule'->>'timeZone')::time AS time_local,
  (a.published_snapshot->'schedule'->>'startDate')::date AS first_day,
  nullif(a.published_snapshot->'schedule'->>'endDate','')::date AS last_day,
  (a.published_snapshot->'schedule'->>'startTime')::time AS time_from,
  (a.published_snapshot->'schedule'->>'endTime')::time AS time_until,
  a.published_snapshot->'schedule'->>'mode' AS mode,
  a.published_snapshot->'schedule'->'weekdays' AS weekdays,
  a.published_snapshot->'schedule'->>'timeZone' AS tz
 FROM sabora.comms_announcements_m5 a CROSS JOIN now_clock n
 WHERE a.state='published' AND a.published_snapshot IS NOT NULL
),
dates AS (
 SELECT s.*, (greatest(s.day_local,s.first_day)+g.delta)::date AS candidate_day
 FROM snapshots s CROSS JOIN generate_series(0,7) g(delta)
),
eligible AS (
 SELECT d.* FROM dates d
 WHERE (d.last_day IS NULL OR d.candidate_day<=d.last_day)
  AND (d.mode='daily' OR (d.mode='once' AND d.candidate_day=d.first_day)
   OR (d.mode='weekly' AND d.weekdays @> to_jsonb(extract(isodow FROM d.candidate_day)::int)))
),
starts AS (
 SELECT DISTINCT e.id,e.tz,e.p,e.ts,e.day_local,e.time_local,e.first_day,e.last_day,e.time_from,
   e.time_until,e.mode,e.weekdays,e.candidate_day,
   ((e.candidate_day::timestamp+e.time_from) AT TIME ZONE e.tz) AS a,
   ((e.candidate_day::timestamp+e.time_until) AT TIME ZONE e.tz) AS b
 FROM (SELECT eligible.*,eligible.published_snapshot AS p FROM eligible) e
),
current_items AS (
 SELECT DISTINCT ON(id) id,p FROM starts
 WHERE candidate_day=day_local AND time_local>=time_from AND time_local<time_until
 ORDER BY id
),
boundaries AS (
 SELECT a AS at,ts FROM starts UNION ALL SELECT b AS at,ts FROM starts
)
SELECT jsonb_build_object('version',1,'items',
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'title',p->>'title',
    'body',p->>'body','emoji',p->>'emoji','priority',p->>'priority','image',p->'image')
    ORDER BY CASE WHEN p->>'priority'='ALTA' THEN 0 ELSE 1 END,id)
  FROM current_items),'[]'::jsonb),
 'nextTransitionAt',(SELECT min(at) FROM boundaries WHERE at>ts))
$public$;
ALTER FUNCTION sabora.read_public_communications_m5() OWNER TO sabora_m5_comms_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_public_communications_m5() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sabora.read_public_communications_m5() TO sabora_m5_comms_public_runtime;

-- Fail-closed technical constraints: no direct relations/data-API grants to runtime/browser roles.
COMMENT ON TABLE sabora.comms_announcements_m5 IS 'CV-014 candidate: versioned private drafts and sealed published projections, one Sabora restaurant';
COMMIT;
