-- Disposable PG17 only, AFTER root, first-admin and directory/outbox overlays.
-- No LOGIN or runtime grant. Distinct audience; final mutation revalidates under lock.
BEGIN;
CREATE FUNCTION sabora.resolve_staff_first_admin_subject_candidate(
 p_key_id text,p_actor uuid,p_enrollment uuid,p_action text,p_correlation text,
 p_issued bigint,p_expires bigint,p_signature text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $resolve_staff_subject$
DECLARE v_key bytea;v_expiry timestamptz;v_now timestamptz:=clock_timestamp();
 v_expected bytea;v_provided bytea;v_diff integer:=0;v_i integer;v_subject uuid;
BEGIN
 IF p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_actor IS NULL OR p_enrollment IS NULL OR p_action IS NULL
  OR p_action<>'activate' OR session_user::text<>'sabora_staff_first_admin_login'
  OR p_correlation IS NULL OR p_correlation !~ '^[A-Za-z0-9_-]{8,128}$'
  OR p_issued IS NULL OR p_expires IS NULL
  OR p_expires::numeric-p_issued::numeric NOT BETWEEN 1 AND 30000
  OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$'
  OR p_issued::numeric>floor(extract(epoch FROM v_now)*1000)::numeric+5000
  OR p_expires<=floor(extract(epoch FROM v_now)*1000)
 THEN RAISE EXCEPTION 'staff_first_admin_subject_forbidden' USING ERRCODE='42501'; END IF;
 SELECT hmac_key,expires_at INTO v_key,v_expiry FROM sabora.staff_lifecycle_signing_keys
  WHERE key_id=p_key_id AND disabled_at IS NULL AND not_before<=v_now AND expires_at>v_now;
 IF NOT FOUND THEN RAISE EXCEPTION 'staff_first_admin_subject_forbidden' USING ERRCODE='42501'; END IF;
 v_expected:=extensions.hmac(convert_to('sabora.staff-first-admin-subject.v1'||chr(10)||p_key_id||chr(10)
  ||session_user::text||chr(10)||p_actor::text||chr(10)||p_enrollment::text||chr(10)
  ||p_action||chr(10)||p_correlation||chr(10)||p_issued::text||chr(10)||p_expires::text,'UTF8'),v_key,'sha256');
 v_provided:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP
  v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_provided,v_i));
 END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'staff_first_admin_subject_forbidden' USING ERRCODE='42501'; END IF;
 SELECT e.auth_user_id INTO v_subject
 FROM sabora.staff_enrollments e
 JOIN sabora.admin_write_ownership o ON o.singleton AND o.owner_user_id IS NULL
 JOIN sabora.staff_members m ON m.user_id=p_actor AND m.role='root' AND m.state='active'
 JOIN sabora.root_bootstrap_receipt r ON r.singleton AND r.root_user_id=p_actor
 WHERE e.id=p_enrollment AND e.created_by=p_actor AND e.requested_role='admin'
 AND NOT EXISTS(SELECT 1 FROM sabora.admin_ownership_audit h WHERE h.action IN ('accept','force_transfer') AND h.next_owner_id IS NOT NULL);
 IF v_subject IS NULL OR v_expiry<=clock_timestamp()
  OR p_expires<=floor(extract(epoch FROM clock_timestamp())*1000)
 THEN RAISE EXCEPTION 'staff_first_admin_subject_forbidden' USING ERRCODE='42501'; END IF;
 RETURN v_subject;
END;
$resolve_staff_subject$;
ALTER FUNCTION sabora.resolve_staff_first_admin_subject_candidate(text,uuid,uuid,text,text,bigint,bigint,text)
 OWNER TO sabora_staff_lifecycle_fn_owner;
REVOKE ALL ON FUNCTION sabora.resolve_staff_first_admin_subject_candidate(text,uuid,uuid,text,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated;
-- Only the genesis ROOT may recover the exceptional enrollment; the ordinary
-- directory remains ADMIN-only. No token, Auth UUID or provider data returned.
GRANT SELECT(given_name,family_name,operational_display_id) ON sabora.staff_enrollments TO sabora_staff_lifecycle_fn_owner;
GRANT SELECT(enrollment_id,email) ON sabora.staff_directory_contacts TO sabora_staff_lifecycle_fn_owner;
CREATE POLICY first_admin_contact_read ON sabora.staff_directory_contacts FOR SELECT
 TO sabora_staff_lifecycle_fn_owner USING(EXISTS(
  SELECT 1 FROM sabora.staff_enrollments e JOIN sabora.root_bootstrap_receipt r
    ON r.singleton AND r.root_user_id=e.created_by
  WHERE e.id=staff_directory_contacts.enrollment_id AND e.requested_role='admin'
 ));
CREATE FUNCTION sabora.read_staff_first_admin_state_candidate(
 p_key_id text,p_actor uuid,p_issued bigint,p_expires bigint,p_signature text
) RETURNS TABLE(phase text,enrollment_id uuid,given_name text,family_name text,email text,
 operational_display_id text,enrollment_state text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $first_admin_state$
DECLARE v_now timestamptz:=clock_timestamp();v_key bytea;v_expiry timestamptz;
 v_expected bytea;v_given bytea;v_diff integer:=0;v_i integer;v_owner uuid;v_count bigint;
BEGIN
 IF session_user::text<>'sabora_staff_first_admin_login' OR p_actor IS NULL
  OR p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$'
  OR p_issued IS NULL OR p_expires IS NULL
  OR p_expires::numeric-p_issued::numeric NOT BETWEEN 1 AND 30000
  OR p_issued::numeric>floor(extract(epoch FROM v_now)*1000)::numeric+5000
  OR p_expires<=floor(extract(epoch FROM v_now)*1000)
 THEN RAISE EXCEPTION 'first_admin_state_forbidden' USING ERRCODE='42501'; END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_expiry FROM sabora.staff_lifecycle_signing_keys k
 WHERE k.key_id=p_key_id AND k.disabled_at IS NULL AND k.not_before<=v_now AND k.expires_at>v_now FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'first_admin_state_forbidden' USING ERRCODE='42501'; END IF;
 v_expected:=extensions.hmac(convert_to('sabora.staff-first-admin-state.v1'||chr(10)||p_key_id||chr(10)
  ||session_user::text||chr(10)||p_actor::text||chr(10)||p_issued::text||chr(10)||p_expires::text,'UTF8'),v_key,'sha256');
 v_given:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_given,v_i)); END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'first_admin_state_forbidden' USING ERRCODE='42501'; END IF;
 SELECT o.owner_user_id INTO v_owner FROM sabora.admin_write_ownership o WHERE o.singleton FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM sabora.root_bootstrap_receipt r JOIN sabora.staff_members m
  ON m.user_id=r.root_user_id AND m.role='root' AND m.state='active'
  WHERE r.singleton AND r.root_user_id=p_actor)
  OR v_expiry<=clock_timestamp() OR p_expires<=floor(extract(epoch FROM clock_timestamp())*1000)
 THEN RAISE EXCEPTION 'first_admin_state_forbidden' USING ERRCODE='42501'; END IF;
 IF v_owner IS NOT NULL OR EXISTS(SELECT 1 FROM sabora.admin_ownership_audit h
  WHERE h.action IN ('accept','force_transfer') AND h.next_owner_id IS NOT NULL) THEN
  RETURN QUERY SELECT 'closed'::text,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
 END IF;
 SELECT count(*) INTO v_count FROM sabora.staff_enrollments e WHERE e.state<>'revoked';
 IF v_count=0 AND NOT EXISTS(SELECT 1 FROM sabora.staff_members m WHERE m.user_id<>p_actor AND m.state<>'revoked') THEN
  RETURN QUERY SELECT 'empty'::text,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
 END IF;
 IF v_count=1 THEN
  RETURN QUERY SELECT 'current'::text,e.id,e.given_name,e.family_name,c.email,e.operational_display_id,e.state
   FROM sabora.staff_enrollments e JOIN sabora.staff_directory_contacts c ON c.enrollment_id=e.id
   WHERE e.created_by=p_actor AND e.requested_role='admin' AND e.state IN ('invited','accepted','registered','active')
    AND (e.state<>'active' OR EXISTS(SELECT 1 FROM sabora.staff_members a WHERE a.user_id=e.auth_user_id AND a.role='admin' AND a.state='active'))
    AND NOT EXISTS(SELECT 1 FROM sabora.staff_members m WHERE m.user_id<>p_actor AND m.state<>'revoked'
     AND (e.state<>'active' OR m.user_id IS DISTINCT FROM e.auth_user_id OR m.role<>'admin' OR m.state<>'active'));
  IF FOUND THEN RETURN; END IF;
 END IF;
 RETURN QUERY SELECT 'blocked'::text,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text;
END;
$first_admin_state$;
ALTER FUNCTION sabora.read_staff_first_admin_state_candidate(text,uuid,bigint,bigint,text) OWNER TO sabora_staff_lifecycle_fn_owner;
REVOKE ALL ON FUNCTION sabora.read_staff_first_admin_state_candidate(text,uuid,bigint,bigint,text) FROM PUBLIC,anon,authenticated;
COMMIT;
