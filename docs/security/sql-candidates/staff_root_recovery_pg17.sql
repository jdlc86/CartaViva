-- Candidate only: transactional ROOT recovery factor kernel.
-- No runtime login, provider invocation, session issuance or production migration.
BEGIN;
CREATE ROLE sabora_root_recovery_fn_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
 NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE TABLE sabora.root_recovery_keys_candidate(
 key_id text PRIMARY KEY CHECK(key_id ~ '^[A-Za-z0-9_-]{8,64}$'),
 hmac_key bytea NOT NULL CHECK(octet_length(hmac_key)=32),
 expires_at timestamptz NOT NULL,
 purpose text NOT NULL DEFAULT 'control' CHECK(purpose IN ('control','mail_worker'))
);
CREATE TABLE sabora.root_recovery_state_candidate(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 root_user_id uuid NOT NULL UNIQUE REFERENCES sabora.staff_members(user_id) ON DELETE RESTRICT,
 email_hash text NOT NULL CHECK(email_hash ~ '^[0-9a-f]{64}$'),
 code_hash text NOT NULL CHECK(code_hash ~ '^[0-9a-f]{64}$'),
 interval_days integer NOT NULL CHECK(interval_days BETWEEN 1 AND 365),
 failures bigint NOT NULL DEFAULT 0 CHECK(failures>=0),
 blocked_until timestamptz,
 link_hash text,link_expires_at timestamptz,
 pending_link_hash text,pending_link_expires_at timestamptz,
 challenge_hash text,challenge_expires_at timestamptz,
 grant_hash text,grant_expires_at timestamptz,
 registration_pending boolean NOT NULL DEFAULT false,
 pending_operation_hash text CHECK(pending_operation_hash ~ '^[0-9a-f]{64}$'),
 pending_registration_deadline timestamptz,
 pending_credential_hash text CHECK(pending_credential_hash ~ '^[0-9a-f]{64}$'),
 pending_ceremony_hash text CHECK(pending_ceremony_hash ~ '^[0-9a-f]{64}$'),
 pending_registration_receipt_hash text CHECK(pending_registration_receipt_hash ~ '^[0-9a-f]{64}$'),
 pending_revocation_receipt_hash text CHECK(pending_revocation_receipt_hash ~ '^[0-9a-f]{64}$'),
 primary_credential_hash text CHECK(primary_credential_hash ~ '^[0-9a-f]{64}$'),
 backup_credential_hash text CHECK(backup_credential_hash ~ '^[0-9a-f]{64}$'),
 retired_credential_hashes text[] NOT NULL DEFAULT ARRAY[]::text[],
 CHECK(registration_pending=(pending_operation_hash IS NOT NULL)),
 CHECK(registration_pending=(pending_registration_deadline IS NOT NULL)),
 CHECK((pending_credential_hash IS NULL)=(pending_ceremony_hash IS NULL)),
 CHECK(registration_pending OR pending_credential_hash IS NULL),
 CHECK(pending_registration_receipt_hash IS NULL OR pending_credential_hash IS NOT NULL),
 CHECK(pending_revocation_receipt_hash IS NULL OR pending_registration_receipt_hash IS NOT NULL),
 CHECK((link_hash IS NULL)=(link_expires_at IS NULL)),
 CHECK((pending_link_hash IS NULL)=(pending_link_expires_at IS NULL)),
 CHECK((challenge_hash IS NULL)=(challenge_expires_at IS NULL)),
 CHECK((grant_hash IS NULL)=(grant_expires_at IS NULL))
);
CREATE TABLE sabora.root_recovery_audit_candidate(
 request_id uuid PRIMARY KEY,root_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id),
 action text NOT NULL,outcome text NOT NULL,failures bigint NOT NULL,
 mail_job_id uuid,
 credential_evidence_hash text CHECK(credential_evidence_hash ~ '^[0-9a-f]{64}$'),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE sabora.root_recovery_keys_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_recovery_keys_candidate FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_recovery_state_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_recovery_state_candidate FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_recovery_audit_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_recovery_audit_candidate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.root_recovery_keys_candidate,sabora.root_recovery_state_candidate,
 sabora.root_recovery_audit_candidate FROM PUBLIC,anon,authenticated;
CREATE TRIGGER root_recovery_audit_immutable BEFORE UPDATE OR DELETE ON sabora.root_recovery_audit_candidate
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER root_recovery_audit_no_truncate BEFORE TRUNCATE ON sabora.root_recovery_audit_candidate
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
GRANT USAGE ON SCHEMA sabora,extensions TO sabora_root_recovery_fn_owner;
GRANT EXECUTE ON FUNCTION extensions.hmac(bytea,bytea,text) TO sabora_root_recovery_fn_owner;
GRANT SELECT(key_id,hmac_key,expires_at,purpose) ON sabora.root_recovery_keys_candidate TO sabora_root_recovery_fn_owner;
GRANT SELECT,INSERT,UPDATE ON sabora.root_recovery_state_candidate TO sabora_root_recovery_fn_owner;
GRANT SELECT(request_id),INSERT(request_id,root_user_id,action,outcome,failures,mail_job_id,credential_evidence_hash)
 ON sabora.root_recovery_audit_candidate TO sabora_root_recovery_fn_owner;
GRANT SELECT(root_user_id,singleton,credential_hash) ON sabora.root_bootstrap_receipt TO sabora_root_recovery_fn_owner;
GRANT SELECT(user_id,role,state) ON sabora.staff_members TO sabora_root_recovery_fn_owner;
CREATE POLICY recovery_key_read ON sabora.root_recovery_keys_candidate FOR SELECT TO sabora_root_recovery_fn_owner USING(true);
CREATE POLICY recovery_state_read ON sabora.root_recovery_state_candidate FOR SELECT TO sabora_root_recovery_fn_owner USING(singleton);
CREATE POLICY recovery_state_insert ON sabora.root_recovery_state_candidate FOR INSERT TO sabora_root_recovery_fn_owner WITH CHECK(singleton);
CREATE POLICY recovery_state_update ON sabora.root_recovery_state_candidate FOR UPDATE TO sabora_root_recovery_fn_owner USING(singleton) WITH CHECK(singleton);
CREATE POLICY recovery_audit_read ON sabora.root_recovery_audit_candidate FOR SELECT TO sabora_root_recovery_fn_owner USING(true);
CREATE POLICY recovery_audit_insert ON sabora.root_recovery_audit_candidate FOR INSERT TO sabora_root_recovery_fn_owner WITH CHECK(true);
CREATE POLICY recovery_receipt_read ON sabora.root_bootstrap_receipt FOR SELECT TO sabora_root_recovery_fn_owner USING(singleton);
CREATE POLICY recovery_member_read ON sabora.staff_members FOR SELECT TO sabora_root_recovery_fn_owner USING(role='root' AND state='active');

-- A dedicated trusted backend signs each exact internal command. The public
-- browser must never be allowed to choose action/actor/proofs through this RPC.
-- Failure is a RETURN, not an exception, so counters and audit commit.
CREATE FUNCTION sabora.root_recovery_transition_candidate(
 p_key_id text,p_action text,p_actor uuid,p_request uuid,p_a text,p_b text,p_c text,
 p_days integer,p_issued bigint,p_expires bigint,p_signature text
) RETURNS TABLE(outcome text,failures bigint,blocked_until timestamptz)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $recovery$
DECLARE s sabora.root_recovery_state_candidate%ROWTYPE;
 v_key bytea;v_key_expiry timestamptz;v_now timestamptz;
 v_expected bytea;v_given bytea;v_diff integer:=0;v_i integer;
 v_result text;v_fails bigint:=0;v_block timestamptz;v_genesis_hash text;v_counted boolean:=false;
 v_notice_job uuid;
BEGIN
 IF session_user::text<>'sabora_root_recovery_login' OR p_actor IS NULL OR p_request IS NULL
  OR p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$'
  OR p_issued IS NULL OR p_expires IS NULL
  OR p_expires::numeric-p_issued::numeric NOT BETWEEN 1 AND 30000
  OR p_issued::numeric>floor(extract(epoch FROM clock_timestamp())*1000)::numeric+5000
  OR p_expires<=floor(extract(epoch FROM clock_timestamp())*1000)
  OR (p_a IS NOT NULL AND p_a !~ '^[0-9a-f]{64}$')
  OR (p_b IS NOT NULL AND p_b !~ '^[0-9a-f]{64}$')
  OR (p_c IS NOT NULL AND p_c !~ '^[0-9a-f]{64}$')
  OR NOT coalesce(CASE p_action
   WHEN 'configure' THEN p_a IS NOT NULL AND p_b IS NOT NULL AND p_c IS NULL AND p_days BETWEEN 1 AND 365
   WHEN 'prepare_link' THEN p_a IS NOT NULL AND p_b IS NULL AND p_c IS NULL AND p_days IS NULL
   WHEN 'confirm_link' THEN p_a IS NOT NULL AND p_b IS NULL AND p_c IS NULL AND p_days IS NULL
   WHEN 'reject_link' THEN p_a IS NOT NULL AND p_b IS NULL AND p_c IS NULL AND p_days IS NULL
   WHEN 'challenge' THEN p_a IS NOT NULL AND p_b IS NOT NULL AND p_c IS NULL AND p_days IS NULL
   WHEN 'attempt' THEN p_a IS NOT NULL AND p_b IS NOT NULL AND p_c IS NOT NULL AND p_days IS NULL
   WHEN 'claim' THEN p_a IS NOT NULL AND p_b IS NULL AND p_c IS NULL AND p_days IS NULL
   WHEN 'add_backup' THEN p_a IS NOT NULL AND p_b IS NOT NULL AND p_c IS NOT NULL AND p_days IS NULL
   WHEN 'backup_status' THEN p_a IS NOT NULL AND p_b IS NULL AND p_c IS NULL AND p_days IS NULL
   WHEN 'expire_unprepared' THEN p_a IS NULL AND p_b IS NULL AND p_c IS NULL AND p_days IS NULL
   WHEN 'prepare_registration' THEN p_a IS NOT NULL AND p_b IS NOT NULL AND p_c IS NOT NULL AND p_days IS NULL
   WHEN 'record_registration' THEN p_a IS NOT NULL AND p_b IS NOT NULL AND p_c IS NOT NULL AND p_days IS NULL
   WHEN 'record_revocation' THEN p_a IS NOT NULL AND p_b IS NOT NULL AND p_c IS NOT NULL AND p_days IS NULL
   WHEN 'complete' THEN p_a IS NOT NULL AND p_b IS NOT NULL AND p_c IS NOT NULL AND p_days IS NULL
   WHEN 'security_status' THEN p_a IS NOT NULL AND p_b IS NULL AND p_c IS NULL AND p_days IS NULL
   WHEN 'security_reset' THEN p_a IS NOT NULL AND p_b IS NULL AND p_c IS NULL AND p_days IS NULL
   WHEN 'replace_code' THEN p_a IS NOT NULL AND p_b IS NOT NULL AND p_c IS NULL AND p_days IS NULL
   WHEN 'reset' THEN p_a IS NULL AND p_b IS NULL AND p_c IS NULL AND p_days IS NULL
   ELSE false END,false)
 THEN RAISE EXCEPTION 'root_recovery_forbidden' USING ERRCODE='42501'; END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_key_expiry FROM sabora.root_recovery_keys_candidate k
 WHERE k.key_id=p_key_id AND k.purpose='control' AND k.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'root_recovery_forbidden' USING ERRCODE='42501'; END IF;
 v_expected:=extensions.hmac(convert_to('sabora.root-recovery.v1'||chr(10)||p_key_id||chr(10)
  ||session_user::text||chr(10)||p_action||chr(10)||p_actor::text||chr(10)||p_request::text||chr(10)
  ||coalesce(p_a,'-')||chr(10)||coalesce(p_b,'-')||chr(10)||coalesce(p_c,'-')||chr(10)
  ||coalesce(p_days::text,'-')||chr(10)||p_issued::text||chr(10)||p_expires::text,'UTF8'),v_key,'sha256');
 v_given:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_given,v_i)); END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'root_recovery_forbidden' USING ERRCODE='42501'; END IF;
 -- Serialize initial configuration and every later transition on one ROOT.
 PERFORM pg_advisory_xact_lock(17302101,52426);
 v_now:=clock_timestamp();
 IF p_expires<=floor(extract(epoch FROM v_now)*1000) OR v_key_expiry<=v_now
  OR NOT EXISTS(SELECT 1 FROM sabora.root_recovery_keys_candidate k WHERE k.key_id=p_key_id
   AND k.purpose='control' AND k.hmac_key=v_key AND k.expires_at>v_now)
  OR NOT EXISTS(SELECT 1 FROM sabora.root_bootstrap_receipt r JOIN sabora.staff_members m
   ON m.user_id=r.root_user_id AND m.role='root' AND m.state='active'
   WHERE r.singleton AND r.root_user_id=p_actor)
  OR EXISTS(SELECT 1 FROM sabora.root_recovery_audit_candidate a WHERE a.request_id=p_request)
 THEN RAISE EXCEPTION 'root_recovery_forbidden' USING ERRCODE='42501'; END IF;
 SELECT r.credential_hash INTO v_genesis_hash FROM sabora.root_bootstrap_receipt r WHERE r.singleton AND r.root_user_id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'root_recovery_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM sabora.root_recovery_state_candidate t WHERE t.singleton FOR UPDATE;
 IF NOT FOUND THEN
  IF p_action IN ('security_status','backup_status') AND p_a=v_genesis_hash THEN RETURN QUERY SELECT 'unconfigured'::text,0::bigint,NULL::timestamptz; RETURN; END IF;
  IF p_action<>'configure' THEN RETURN QUERY SELECT 'denied'::text,0::bigint,NULL::timestamptz; RETURN; END IF;
  INSERT INTO sabora.root_recovery_state_candidate(root_user_id,email_hash,code_hash,interval_days)
   VALUES(p_actor,p_a,p_b,p_days);
  v_result:='configured';
 ELSE
  v_fails:=s.failures;v_block:=s.blocked_until;
  IF s.root_user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'root_recovery_forbidden' USING ERRCODE='42501'; END IF;
  v_result:='denied';
  IF p_action='expire_unprepared' THEN
   -- The trusted adapter MUST persist prepare_registration before any
   -- provider registration mutation. Only an unprepared expired operation
   -- can be released; an uncertain external effect stays fenced.
   IF s.registration_pending AND s.pending_registration_deadline<=v_now
    AND s.pending_credential_hash IS NULL THEN
    UPDATE sabora.root_recovery_state_candidate SET registration_pending=false,
     pending_operation_hash=NULL,pending_registration_deadline=NULL WHERE singleton;
    v_result:='registration_expired';
   ELSE
    RETURN QUERY SELECT CASE WHEN s.registration_pending THEN 'registration_pending' ELSE 'denied' END,v_fails,v_block;
    RETURN;
   END IF;
  ELSIF p_action IN ('security_status','backup_status','security_reset','replace_code','add_backup') AND
   (s.registration_pending OR NOT coalesce(p_a=coalesce(s.primary_credential_hash,v_genesis_hash) OR p_a=s.backup_credential_hash,false))
  THEN RETURN QUERY SELECT 'denied'::text,0::bigint,NULL::timestamptz; RETURN;
  ELSIF p_action='security_status' THEN RETURN QUERY SELECT 'configured'::text,s.failures,s.blocked_until; RETURN;
  ELSIF p_action='backup_status' THEN RETURN QUERY SELECT CASE WHEN s.backup_credential_hash IS NULL THEN 'backup_missing' ELSE 'backup_present' END,s.failures,s.blocked_until; RETURN;
  ELSIF p_action='replace_code' THEN
   IF p_b IS DISTINCT FROM s.code_hash THEN
    UPDATE sabora.root_recovery_state_candidate SET code_hash=p_b,challenge_hash=NULL,challenge_expires_at=NULL,
     grant_hash=NULL,grant_expires_at=NULL WHERE singleton;
    v_result:='code_replaced';
   END IF;
  ELSIF s.registration_pending THEN
   -- Only trusted internal provider reconciliation can advance these
   -- phases. A durable credential/ceremony binding precedes external
   -- registration. Positive registration and revocation evidence must
   -- refer to that same binding, never a difference between listings.
   IF p_action='prepare_registration' AND p_a=s.pending_operation_hash
    AND s.pending_registration_deadline>v_now AND s.pending_credential_hash IS NULL
    AND p_b IS DISTINCT FROM coalesce(s.primary_credential_hash,v_genesis_hash)
    AND p_b IS DISTINCT FROM s.backup_credential_hash AND p_b IS DISTINCT FROM v_genesis_hash
    AND NOT (p_b=ANY(s.retired_credential_hashes)) THEN
    UPDATE sabora.root_recovery_state_candidate SET pending_credential_hash=p_b,
     pending_ceremony_hash=p_c WHERE singleton;
    v_result:='registration_prepared';
   ELSIF p_action='record_registration' AND p_a=s.pending_operation_hash
    AND p_b=s.pending_credential_hash AND s.pending_ceremony_hash IS NOT NULL
    AND s.pending_registration_receipt_hash IS NULL THEN
    UPDATE sabora.root_recovery_state_candidate SET pending_registration_receipt_hash=p_c WHERE singleton;
    v_result:='registration_recorded';
   ELSIF p_action='record_revocation' AND p_a=s.pending_operation_hash
    AND p_b=s.pending_credential_hash AND s.pending_registration_receipt_hash IS NOT NULL
    AND s.pending_revocation_receipt_hash IS NULL THEN
    UPDATE sabora.root_recovery_state_candidate SET pending_revocation_receipt_hash=p_c WHERE singleton;
    v_result:='revocation_recorded';
   ELSIF p_action='complete' AND p_a=s.pending_operation_hash
    AND p_b=s.pending_credential_hash AND s.pending_registration_receipt_hash IS NOT NULL
    AND s.pending_revocation_receipt_hash IS NOT NULL
    AND p_b IS DISTINCT FROM coalesce(s.primary_credential_hash,v_genesis_hash)
    AND p_b IS DISTINCT FROM s.backup_credential_hash AND p_b IS DISTINCT FROM v_genesis_hash
    AND NOT (p_b=ANY(s.retired_credential_hashes))
    AND p_c IS DISTINCT FROM s.code_hash
    AND EXISTS(SELECT 1 FROM sabora.root_recovery_mail_contact_candidate
      WHERE singleton AND root_user_id=p_actor AND email_hash=s.email_hash) THEN
    -- The success notification and factor replacement commit together.
    -- No code, link or grant enters this notice. Invalidate outstanding
    -- recipient proofs and queued obsolete factor mail as well.
    v_notice_job:=gen_random_uuid();
    INSERT INTO sabora.root_recovery_mail_job_candidate
     (id,root_user_id,purpose,email_hash,recipient_envelope,expires_at,dispatch_until)
     SELECT v_notice_job,p_actor,'recovered',email_hash,recipient_envelope,
      v_now+interval '1 day',v_now+interval '1 hour'
     FROM sabora.root_recovery_mail_contact_candidate
     WHERE singleton AND root_user_id=p_actor AND email_hash=s.email_hash;
    DELETE FROM sabora.root_recovery_mail_pending_candidate WHERE singleton;
    UPDATE sabora.root_recovery_mail_job_candidate
     SET state='cancelled',recipient_envelope=NULL,token_envelope=NULL,finished_at=v_now
     WHERE root_user_id=p_actor AND state='queued' AND purpose IN ('verify','link','challenge');
    UPDATE sabora.root_recovery_state_candidate SET registration_pending=false,pending_operation_hash=NULL,
     pending_registration_deadline=NULL,
     pending_credential_hash=NULL,pending_ceremony_hash=NULL,pending_registration_receipt_hash=NULL,pending_revocation_receipt_hash=NULL,
     retired_credential_hashes=array_remove(s.retired_credential_hashes||ARRAY[coalesce(s.primary_credential_hash,v_genesis_hash),s.backup_credential_hash],NULL),
     primary_credential_hash=p_b,backup_credential_hash=NULL,code_hash=p_c,failures=0,blocked_until=NULL,
     link_hash=NULL,link_expires_at=NULL,pending_link_hash=NULL,pending_link_expires_at=NULL,
     challenge_hash=NULL,challenge_expires_at=NULL,grant_hash=NULL,grant_expires_at=NULL WHERE singleton;
    v_fails:=0;v_block:=NULL;v_result:='completed';
   ELSE v_result:='registration_pending'; END IF;
  ELSIF p_action='add_backup' THEN
   IF s.backup_credential_hash IS NULL AND p_b IS DISTINCT FROM coalesce(s.primary_credential_hash,v_genesis_hash)
    AND p_b IS DISTINCT FROM v_genesis_hash AND NOT (p_b=ANY(s.retired_credential_hashes)) THEN
    UPDATE sabora.root_recovery_state_candidate SET backup_credential_hash=p_b WHERE singleton;
    v_result:='backup_added';
   END IF;
  ELSIF p_action IN ('reset','security_reset') THEN
   UPDATE sabora.root_recovery_state_candidate SET failures=0,blocked_until=NULL,
    challenge_hash=NULL,challenge_expires_at=NULL,grant_hash=NULL,grant_expires_at=NULL WHERE singleton;
   v_fails:=0;v_block:=NULL;v_result:='reset';
  ELSIF p_action='prepare_link' THEN
   IF (s.pending_link_hash IS NULL OR s.pending_link_expires_at<=v_now)
     AND (s.link_hash IS NULL OR s.link_expires_at<=v_now+interval '1 day')
     AND p_a IS DISTINCT FROM s.link_hash AND p_a IS DISTINCT FROM s.pending_link_hash
   THEN
    UPDATE sabora.root_recovery_state_candidate SET pending_link_hash=p_a,
     pending_link_expires_at=v_now+make_interval(days=>s.interval_days) WHERE singleton;
    v_result:='link_prepared';
   END IF;
  ELSIF p_action='reject_link' THEN
   -- Only a trusted definitive non-delivery result may invoke this command.
   IF s.pending_link_hash=p_a THEN
    UPDATE sabora.root_recovery_state_candidate SET pending_link_hash=NULL,pending_link_expires_at=NULL WHERE singleton;
    v_result:='link_rejected';
   END IF;
  ELSIF p_action='confirm_link' THEN
   IF s.pending_link_hash=p_a AND s.pending_link_expires_at>v_now
    AND (s.grant_hash IS NULL OR s.grant_expires_at<=v_now)
   THEN
    UPDATE sabora.root_recovery_state_candidate SET link_hash=s.pending_link_hash,
     link_expires_at=s.pending_link_expires_at,pending_link_hash=NULL,pending_link_expires_at=NULL,
     challenge_hash=NULL,challenge_expires_at=NULL,grant_hash=NULL,grant_expires_at=NULL WHERE singleton;
    v_result:='link_confirmed';
   END IF;
  ELSIF p_action IN ('challenge','attempt','claim') AND s.blocked_until>v_now THEN
   v_result:='blocked';
  ELSIF p_action='challenge' THEN
   IF s.link_hash=p_a AND s.link_expires_at>v_now
    AND (s.challenge_hash IS NULL OR s.challenge_expires_at<=v_now)
    AND (s.grant_hash IS NULL OR s.grant_expires_at<=v_now)
   THEN
    UPDATE sabora.root_recovery_state_candidate SET challenge_hash=p_b,
     challenge_expires_at=least(v_now+interval '10 minutes',s.link_expires_at),
     grant_hash=NULL,grant_expires_at=NULL WHERE singleton;
    v_result:='challenge_created';
   END IF;
  ELSIF p_action='attempt' THEN
   IF s.link_expires_at>v_now AND s.challenge_hash=p_a AND s.challenge_expires_at>v_now
    AND (s.grant_hash IS NULL OR s.grant_expires_at<=v_now)
   THEN
    v_diff:=0;
    FOR v_i IN 0..31 LOOP
     v_diff:=v_diff | (get_byte(decode(s.code_hash,'hex'),v_i)#get_byte(decode(p_b,'hex'),v_i));
    END LOOP;
    IF v_diff=0 THEN
     UPDATE sabora.root_recovery_state_candidate SET grant_hash=p_c,
      grant_expires_at=v_now+interval '5 minutes',challenge_hash=NULL,challenge_expires_at=NULL WHERE singleton;
     v_result:='authorized';
    ELSE
     v_counted:=true;
     v_fails:=least(s.failures,9223372036854775806::bigint)+1;
     v_block:=CASE WHEN v_fails>=10 THEN v_now+interval '24 hours'
      WHEN v_fails=5 THEN v_now+interval '1 hour' WHEN v_fails=3 THEN v_now+interval '15 minutes'
      ELSE NULL END;
     UPDATE sabora.root_recovery_state_candidate SET failures=v_fails,blocked_until=v_block WHERE singleton;
     v_result:='denied';
    END IF;
   END IF;
  ELSIF p_action='claim' THEN
   IF s.grant_hash=p_a AND s.grant_expires_at>v_now THEN
    UPDATE sabora.root_recovery_state_candidate SET grant_hash=NULL,grant_expires_at=NULL,
     registration_pending=true,pending_operation_hash=p_a,pending_registration_deadline=s.grant_expires_at WHERE singleton;
    v_result:='claimed';
   END IF;
  END IF;
 END IF;
 INSERT INTO sabora.root_recovery_audit_candidate(request_id,root_user_id,action,outcome,failures,credential_evidence_hash,mail_job_id)
 VALUES(p_request,p_actor,p_action,CASE WHEN v_counted THEN 'code_mismatch' ELSE v_result END,v_fails,
  CASE WHEN v_result IN ('backup_added','registration_prepared','registration_recorded','revocation_recorded') THEN p_c ELSE NULL END,v_notice_job);
 RETURN QUERY SELECT v_result,v_fails,v_block;
END;
$recovery$;
ALTER FUNCTION sabora.root_recovery_transition_candidate(text,text,uuid,uuid,text,text,text,integer,bigint,bigint,text)
 OWNER TO sabora_root_recovery_fn_owner;
REVOKE ALL ON FUNCTION sabora.root_recovery_transition_candidate(text,text,uuid,uuid,text,text,text,integer,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated;

-- Read-only ROOT admission fence; callers still check membership.
CREATE FUNCTION sabora.root_recovery_access_candidate(
 p_key_id text,p_actor uuid,p_credential_hash text,p_issued bigint,p_expires bigint,p_signature text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $access$
DECLARE v_key bytea;v_expiry timestamptz;v_expected bytea;v_given bytea;v_diff integer:=0;v_i integer;
 v_genesis text;s sabora.root_recovery_state_candidate%ROWTYPE;
BEGIN
 IF session_user::text<>'sabora_root_recovery_login' OR p_actor IS NULL
  OR p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
  OR (p_credential_hash IS NOT NULL AND p_credential_hash !~ '^[0-9a-f]{64}$')
  OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$'
  OR p_issued IS NULL OR p_expires IS NULL OR p_expires::numeric-p_issued::numeric NOT BETWEEN 1 AND 30000
  OR p_issued::numeric>floor(extract(epoch FROM clock_timestamp())*1000)::numeric+5000
  OR p_expires<=floor(extract(epoch FROM clock_timestamp())*1000)
 THEN RAISE EXCEPTION 'root_recovery_access_forbidden' USING ERRCODE='42501'; END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_expiry FROM sabora.root_recovery_keys_candidate k
 WHERE k.key_id=p_key_id AND k.purpose='control' AND k.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'root_recovery_access_forbidden' USING ERRCODE='42501'; END IF;
 v_expected:=extensions.hmac(convert_to('sabora.root-recovery-access.v1'||chr(10)||p_key_id||chr(10)
  ||session_user::text||chr(10)||p_actor::text||chr(10)||coalesce(p_credential_hash,'-')||chr(10)
  ||p_issued::text||chr(10)||p_expires::text,'UTF8'),v_key,'sha256');
 v_given:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_given,v_i)); END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'root_recovery_access_forbidden' USING ERRCODE='42501'; END IF;
 -- Same lock as claim/complete; not a business mutation transaction fence.
 PERFORM pg_advisory_xact_lock(17302101,52426);
 IF p_expires<=floor(extract(epoch FROM clock_timestamp())*1000) OR v_expiry<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM sabora.root_recovery_keys_candidate k WHERE k.key_id=p_key_id
   AND k.purpose='control' AND k.hmac_key=v_key AND k.expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'root_recovery_access_forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sabora.staff_members m WHERE m.user_id=p_actor AND m.role='root') THEN RETURN true; END IF;
 SELECT r.credential_hash INTO v_genesis FROM sabora.root_bootstrap_receipt r WHERE r.singleton AND r.root_user_id=p_actor;
 IF NOT FOUND OR p_credential_hash IS NULL THEN RETURN false; END IF;
 SELECT * INTO s FROM sabora.root_recovery_state_candidate t WHERE t.singleton;
 IF NOT FOUND THEN RETURN p_credential_hash=v_genesis; END IF;
 RETURN coalesce(s.root_user_id=p_actor AND NOT s.registration_pending AND
  (p_credential_hash=coalesce(s.primary_credential_hash,v_genesis) OR p_credential_hash=s.backup_credential_hash),false);
END;
$access$;
ALTER FUNCTION sabora.root_recovery_access_candidate(text,uuid,text,bigint,bigint,text) OWNER TO sabora_root_recovery_fn_owner;
REVOKE ALL ON FUNCTION sabora.root_recovery_access_candidate(text,uuid,text,bigint,bigint,text) FROM PUBLIC,anon,authenticated;

-- Every successful governance or first-ADMIN mutation writes its audit row
-- in the same transaction. A stale ROOT proof rolls back the whole mutation.
-- Governance locks precede this lock; recovery never takes governance locks.
CREATE FUNCTION sabora.enforce_root_mutation_fence_candidate()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fence$
DECLARE proof jsonb; scope text; binding text; credential text; issued bigint; expires bigint;
 key_bytes bytea; key_expiry timestamptz; expected bytea; supplied bytea;
 mismatch integer:=0; i integer; genesis text; s sabora.root_recovery_state_candidate%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='staff_lifecycle_audit' THEN
  IF NEW.actor_kind<>'root' THEN RETURN NEW; END IF;
  scope:='first-admin';
 ELSE
  IF NOT EXISTS(SELECT 1 FROM sabora.staff_members m WHERE m.user_id=NEW.actor_user_id AND m.role='root') THEN
   RETURN NEW;
  END IF;
  scope:='ownership';
 END IF;
 binding:=NEW.correlation_id::text;
 proof:=nullif(current_setting('sabora.root_mutation_proof',true),'')::jsonb;
 IF jsonb_typeof(proof) IS DISTINCT FROM 'array' OR jsonb_array_length(proof)<>8
  OR proof->>1 IS DISTINCT FROM NEW.actor_user_id::text OR proof->>3 IS DISTINCT FROM scope
  OR proof->>4 IS DISTINCT FROM binding OR NOT coalesce(proof->>2 ~ '^[0-9a-f]{64}$',false)
  OR NOT coalesce(proof->>7 ~ '^[0-9a-f]{64}$',false) THEN
  RAISE EXCEPTION 'root_mutation_forbidden' USING ERRCODE='42501';
 END IF;
 credential:=proof->>2;issued:=(proof->>5)::bigint;expires:=(proof->>6)::bigint;
 SELECT k.hmac_key,k.expires_at INTO key_bytes,key_expiry FROM sabora.root_recovery_keys_candidate k
  WHERE k.key_id=proof->>0 AND k.purpose='control' AND k.expires_at>clock_timestamp();
 IF NOT FOUND OR issued IS NULL OR expires IS NULL OR expires::numeric-issued::numeric NOT BETWEEN 1 AND 15000
  OR issued::numeric>floor(extract(epoch FROM clock_timestamp())*1000)::numeric+5000 THEN
  RAISE EXCEPTION 'root_mutation_forbidden' USING ERRCODE='42501';
 END IF;
 expected:=extensions.hmac(convert_to(concat_ws(chr(10),'sabora.root-mutation.v1',proof->>0,
  NEW.actor_user_id::text,credential,scope,binding,issued::text,expires::text),'UTF8'),key_bytes,'sha256');
 supplied:=decode(proof->>7,'hex');
 FOR i IN 0..31 LOOP mismatch:=mismatch | (get_byte(expected,i)#get_byte(supplied,i)); END LOOP;
 IF mismatch<>0 THEN RAISE EXCEPTION 'root_mutation_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(17302101,52426);
 IF expires<=floor(extract(epoch FROM clock_timestamp())*1000) OR key_expiry<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM sabora.root_recovery_keys_candidate k WHERE k.key_id=proof->>0
   AND k.purpose='control' AND k.hmac_key=key_bytes AND k.expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'root_mutation_forbidden' USING ERRCODE='42501';
 END IF;
 SELECT r.credential_hash INTO genesis FROM sabora.root_bootstrap_receipt r
  WHERE r.singleton AND r.root_user_id=NEW.actor_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'root_mutation_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM sabora.root_recovery_state_candidate WHERE singleton;
 IF (NOT FOUND AND credential=genesis) OR
   coalesce(s.root_user_id=NEW.actor_user_id AND NOT s.registration_pending
    AND (credential=coalesce(s.primary_credential_hash,genesis) OR credential=s.backup_credential_hash),false)
 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'root_mutation_forbidden' USING ERRCODE='42501';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'root_mutation_forbidden' USING ERRCODE='42501';
END;
$fence$;
ALTER FUNCTION sabora.enforce_root_mutation_fence_candidate() OWNER TO sabora_root_recovery_fn_owner;
REVOKE ALL ON FUNCTION sabora.enforce_root_mutation_fence_candidate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER root_recovery_ownership_fence BEFORE INSERT ON sabora.admin_ownership_audit
 FOR EACH ROW EXECUTE FUNCTION sabora.enforce_root_mutation_fence_candidate();
CREATE TRIGGER root_recovery_first_admin_fence BEFORE INSERT ON sabora.staff_lifecycle_audit
 FOR EACH ROW EXECUTE FUNCTION sabora.enforce_root_mutation_fence_candidate();

-- Mail custody belongs to the existing recovery candidate, never a public
-- table or a new delivery service. The encrypted recipient survives restart;
-- token envelopes are erased when a send result is recorded.
CREATE TABLE sabora.root_recovery_mail_contact_candidate(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 root_user_id uuid NOT NULL UNIQUE REFERENCES sabora.staff_members(user_id),
 email_hash text NOT NULL CHECK(email_hash ~ '^[0-9a-f]{64}$'),
 recipient_envelope text NOT NULL CHECK(length(recipient_envelope) BETWEEN 32 AND 2048)
);
CREATE TABLE sabora.root_recovery_mail_pending_candidate(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 root_user_id uuid NOT NULL UNIQUE REFERENCES sabora.staff_members(user_id),
 email_hash text NOT NULL CHECK(email_hash ~ '^[0-9a-f]{64}$'),
 recipient_envelope text NOT NULL CHECK(length(recipient_envelope) BETWEEN 32 AND 2048),
 proof_hash text NOT NULL CHECK(proof_hash ~ '^[0-9a-f]{64}$'),
 interval_days integer NOT NULL CHECK(interval_days BETWEEN 1 AND 365),
 expires_at timestamptz NOT NULL
);
CREATE TABLE sabora.root_recovery_mail_job_candidate(
 id uuid PRIMARY KEY,root_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id),
 purpose text NOT NULL CHECK(purpose IN ('verify','link','challenge','notice','recovered')),
 email_hash text NOT NULL CHECK(email_hash ~ '^[0-9a-f]{64}$'),
 recipient_envelope text,
 token_hash text CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 token_envelope text,
 expires_at timestamptz NOT NULL,
 dispatch_until timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','dispatching','accepted','rejected','unknown','cancelled')),
 fence uuid,provider_id uuid,finished_at timestamptz,
 CHECK(dispatch_until<=expires_at),
 CHECK((purpose IN ('notice','recovered'))=(token_hash IS NULL)),
 CHECK((state IN ('queued','dispatching'))=(recipient_envelope IS NOT NULL)),
 CHECK((state IN ('queued','dispatching') AND purpose NOT IN ('notice','recovered'))=(token_envelope IS NOT NULL)),
 CHECK((state='accepted')=(provider_id IS NOT NULL)),
 CHECK((state IN ('dispatching','accepted','rejected','unknown'))=(fence IS NOT NULL))
);
ALTER TABLE sabora.root_recovery_mail_contact_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_recovery_mail_contact_candidate FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_recovery_mail_pending_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_recovery_mail_pending_candidate FORCE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_recovery_mail_job_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.root_recovery_mail_job_candidate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.root_recovery_mail_contact_candidate,sabora.root_recovery_mail_pending_candidate,
 sabora.root_recovery_mail_job_candidate FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON sabora.root_recovery_mail_contact_candidate TO sabora_root_recovery_fn_owner;
GRANT SELECT,INSERT,UPDATE,DELETE ON sabora.root_recovery_mail_pending_candidate TO sabora_root_recovery_fn_owner;
GRANT SELECT,INSERT,UPDATE ON sabora.root_recovery_mail_job_candidate TO sabora_root_recovery_fn_owner;
CREATE POLICY root_mail_contact ON sabora.root_recovery_mail_contact_candidate TO sabora_root_recovery_fn_owner USING(singleton) WITH CHECK(singleton);
CREATE POLICY root_mail_pending ON sabora.root_recovery_mail_pending_candidate TO sabora_root_recovery_fn_owner USING(singleton) WITH CHECK(singleton);
CREATE POLICY root_mail_job ON sabora.root_recovery_mail_job_candidate TO sabora_root_recovery_fn_owner USING(true) WITH CHECK(true);

CREATE FUNCTION sabora.root_recovery_mail_candidate(
 p_key_id text,p_actor uuid,p_request uuid,p_action text,p_payload text,p_issued bigint,p_expires bigint,p_signature text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $mail$
DECLARE v_key bytea;v_key_expiry timestamptz;v_now timestamptz;
 v_expected bytea;v_given bytea;v_diff integer:=0;v_i integer;
 v jsonb;v_result text:='denied';v_genesis text;v_hash text;v_job uuid;
 s sabora.root_recovery_state_candidate%ROWTYPE;
 c sabora.root_recovery_mail_contact_candidate%ROWTYPE;
 p sabora.root_recovery_mail_pending_candidate%ROWTYPE;
 j sabora.root_recovery_mail_job_candidate%ROWTYPE;
 v_fence uuid;v_provider uuid;v_until timestamptz;v_days integer;v_out jsonb;
BEGIN
 IF session_user::text IS DISTINCT FROM (CASE WHEN p_action IN ('stage','confirm','queue_challenge')
    THEN 'sabora_root_recovery_login' ELSE 'sabora_root_recovery_mail_login' END)
  OR p_actor IS NULL OR p_request IS NULL
  OR p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
  OR p_action IS NULL OR p_action NOT IN ('stage','confirm','queue_link','queue_challenge','list','claim','finish','promote')
  OR p_payload IS NULL OR octet_length(p_payload)>12000
  OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$'
  OR p_issued IS NULL OR p_expires IS NULL OR p_expires::numeric-p_issued::numeric NOT BETWEEN 1 AND 30000
  OR p_issued::numeric>floor(extract(epoch FROM clock_timestamp())*1000)::numeric+5000
  OR p_expires<=floor(extract(epoch FROM clock_timestamp())*1000)
 THEN RAISE EXCEPTION 'root_mail_forbidden' USING ERRCODE='42501'; END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_key_expiry FROM sabora.root_recovery_keys_candidate k
 WHERE k.key_id=p_key_id AND k.expires_at>clock_timestamp()
   AND k.purpose=CASE WHEN p_action IN ('stage','confirm','queue_challenge') THEN 'control' ELSE 'mail_worker' END;
 IF NOT FOUND THEN RAISE EXCEPTION 'root_mail_forbidden' USING ERRCODE='42501'; END IF;
 v_expected:=extensions.hmac(convert_to('sabora.root-recovery-mail.v1'||chr(10)||p_key_id||chr(10)
  ||session_user::text||chr(10)||p_actor::text||chr(10)||p_request::text||chr(10)||p_action||chr(10)
  ||p_payload||chr(10)||p_issued::text||chr(10)||p_expires::text,'UTF8'),v_key,'sha256');
 v_given:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_given,v_i)); END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'root_mail_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(17302101,52426);
 v_now:=clock_timestamp();
 IF p_expires<=floor(extract(epoch FROM v_now)*1000) OR v_key_expiry<=v_now
  OR NOT EXISTS(SELECT 1 FROM sabora.root_recovery_keys_candidate k WHERE k.key_id=p_key_id AND k.hmac_key=v_key AND k.expires_at>v_now
   AND k.purpose=CASE WHEN p_action IN ('stage','confirm','queue_challenge') THEN 'control' ELSE 'mail_worker' END)
  OR EXISTS(SELECT 1 FROM sabora.root_recovery_audit_candidate a WHERE a.request_id=p_request)
 THEN RAISE EXCEPTION 'root_mail_forbidden' USING ERRCODE='42501'; END IF;
 SELECT r.credential_hash INTO v_genesis FROM sabora.root_bootstrap_receipt r
 JOIN sabora.staff_members m ON m.user_id=r.root_user_id AND m.role='root' AND m.state='active'
 WHERE r.singleton AND r.root_user_id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'root_mail_forbidden' USING ERRCODE='42501'; END IF;
 v:=p_payload::jsonb;
 IF jsonb_typeof(v)<>'object' THEN RAISE EXCEPTION 'root_mail_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM sabora.root_recovery_state_candidate WHERE singleton;
 SELECT * INTO c FROM sabora.root_recovery_mail_contact_candidate WHERE singleton;
 -- Expired queued material can never be dispatched. Uncertain or accepted
 -- records are retained as metadata, never automatically retried.
 IF session_user::text='sabora_root_recovery_mail_login' THEN
  WITH expired AS (
   UPDATE sabora.root_recovery_mail_job_candidate
      SET state=CASE WHEN state='queued' THEN 'cancelled' ELSE 'unknown' END,
          recipient_envelope=NULL,token_envelope=NULL,finished_at=v_now
    WHERE root_user_id=p_actor AND state IN ('queued','dispatching') AND dispatch_until<=v_now
    RETURNING id,purpose,state
  )
  INSERT INTO sabora.root_recovery_audit_candidate(request_id,root_user_id,action,outcome,failures,mail_job_id)
   SELECT gen_random_uuid(),p_actor,'mail_expire_'||purpose,state,coalesce(s.failures,0),id FROM expired;
 END IF;
 DELETE FROM sabora.root_recovery_mail_pending_candidate WHERE expires_at<=v_now;
 SELECT * INTO p FROM sabora.root_recovery_mail_pending_candidate WHERE singleton;
 IF p_action IN ('stage','confirm') AND
  (coalesce(s.registration_pending,false) OR NOT coalesce((v->>'credential')=coalesce(s.primary_credential_hash,v_genesis)
   OR (v->>'credential')=s.backup_credential_hash,false))
 THEN RETURN jsonb_build_object('outcome','denied'); END IF;
 IF p_action='stage' THEN
  IF p.singleton IS NULL AND (s.grant_hash IS NULL OR s.grant_expires_at<=v_now)
   AND (v->>'emailHash') ~ '^[0-9a-f]{64}$' AND (v->>'proofHash') ~ '^[0-9a-f]{64}$'
   AND length(v->>'recipientEnvelope') BETWEEN 32 AND 2048 AND length(v->>'tokenEnvelope') BETWEEN 32 AND 2048
   AND (v->>'days')::integer BETWEEN 1 AND 365
  THEN
   v_job:=(v->>'jobId')::uuid;v_days:=(v->>'days')::integer;v_until:=v_now+interval '10 minutes';
   INSERT INTO sabora.root_recovery_mail_pending_candidate(root_user_id,email_hash,recipient_envelope,proof_hash,interval_days,expires_at)
   VALUES(p_actor,v->>'emailHash',v->>'recipientEnvelope',v->>'proofHash',v_days,v_until);
   INSERT INTO sabora.root_recovery_mail_job_candidate(id,root_user_id,purpose,email_hash,recipient_envelope,token_hash,token_envelope,expires_at,dispatch_until)
   VALUES(v_job,p_actor,'verify',v->>'emailHash',v->>'recipientEnvelope',v->>'proofHash',v->>'tokenEnvelope',v_until,v_until);
   v_result:='verification_queued';
  END IF;
 ELSIF p_action='confirm' THEN
  IF p.root_user_id=p_actor AND p.expires_at>v_now AND p.proof_hash=v->>'proofHash'
   AND (s.grant_hash IS NULL OR s.grant_expires_at<=v_now)
   AND (v->>'linkHash') ~ '^[0-9a-f]{64}$' AND length(v->>'linkEnvelope') BETWEEN 32 AND 2048
   AND ((s.singleton IS NULL AND (v->>'codeHash') ~ '^[0-9a-f]{64}$')
      OR (s.singleton IS NOT NULL AND v->>'codeHash' IS NULL))
  THEN
   v_job:=(v->>'jobId')::uuid;v_until:=v_now+make_interval(days=>p.interval_days);
   -- Notify old recipient atomically, without any code or recovery link.
   IF c.singleton AND c.email_hash<>p.email_hash THEN
    INSERT INTO sabora.root_recovery_mail_job_candidate(id,root_user_id,purpose,email_hash,recipient_envelope,expires_at,dispatch_until)
    VALUES((v->>'noticeId')::uuid,p_actor,'notice',c.email_hash,c.recipient_envelope,v_now+interval '1 day',v_now+interval '1 hour');
   END IF;
   UPDATE sabora.root_recovery_mail_job_candidate SET state='cancelled',recipient_envelope=NULL,token_envelope=NULL,finished_at=v_now
    WHERE state='queued' AND purpose IN ('verify','link','challenge');
   INSERT INTO sabora.root_recovery_mail_contact_candidate(root_user_id,email_hash,recipient_envelope)
    VALUES(p_actor,p.email_hash,p.recipient_envelope)
    ON CONFLICT(singleton) DO UPDATE SET email_hash=EXCLUDED.email_hash,recipient_envelope=EXCLUDED.recipient_envelope;
   IF s.singleton IS NULL THEN
    INSERT INTO sabora.root_recovery_state_candidate(root_user_id,email_hash,code_hash,interval_days,pending_link_hash,pending_link_expires_at)
    VALUES(p_actor,p.email_hash,v->>'codeHash',p.interval_days,v->>'linkHash',v_until);
   ELSE
    UPDATE sabora.root_recovery_state_candidate SET email_hash=p.email_hash,interval_days=p.interval_days,
     link_hash=CASE WHEN s.email_hash=p.email_hash THEN s.link_hash ELSE NULL END,
     link_expires_at=CASE WHEN s.email_hash=p.email_hash THEN s.link_expires_at ELSE NULL END,
     pending_link_hash=v->>'linkHash',pending_link_expires_at=v_until,
     challenge_hash=NULL,challenge_expires_at=NULL,grant_hash=NULL,grant_expires_at=NULL WHERE singleton;
   END IF;
   INSERT INTO sabora.root_recovery_mail_job_candidate(id,root_user_id,purpose,email_hash,recipient_envelope,token_hash,token_envelope,expires_at,dispatch_until)
    VALUES(v_job,p_actor,'link',p.email_hash,p.recipient_envelope,v->>'linkHash',v->>'linkEnvelope',v_until,v_now+interval '10 minutes');
   DELETE FROM sabora.root_recovery_mail_pending_candidate WHERE singleton;
   v_result:=CASE WHEN s.singleton IS NULL THEN 'configured' ELSE 'email_changed' END;
  END IF;
 ELSIF p_action='queue_link' THEN
  IF c.root_user_id=p_actor AND c.email_hash=s.email_hash AND NOT s.registration_pending
   AND (s.link_hash IS NULL OR s.link_expires_at<=v_now+interval '1 hour')
   AND (s.pending_link_hash IS NULL OR s.pending_link_expires_at<=v_now OR EXISTS(
    SELECT 1 FROM sabora.root_recovery_mail_job_candidate old
     WHERE old.root_user_id=p_actor AND old.purpose='link' AND old.token_hash=s.pending_link_hash
       AND old.state IN ('unknown','cancelled') AND old.finished_at<=v_now-interval '15 minutes'))
   AND NOT EXISTS(SELECT 1 FROM sabora.root_recovery_mail_job_candidate old
    WHERE old.root_user_id=p_actor AND old.purpose='link' AND old.state='rejected'
      AND old.finished_at>v_now-interval '15 minutes')
   AND (s.grant_hash IS NULL OR s.grant_expires_at<=v_now)
   AND (v->>'tokenHash') ~ '^[0-9a-f]{64}$' AND length(v->>'tokenEnvelope') BETWEEN 32 AND 2048
   AND v->>'tokenHash' IS DISTINCT FROM s.link_hash AND v->>'tokenHash' IS DISTINCT FROM s.pending_link_hash
  THEN
   v_job:=(v->>'jobId')::uuid;v_until:=v_now+make_interval(days=>s.interval_days);
   UPDATE sabora.root_recovery_state_candidate SET pending_link_hash=v->>'tokenHash',pending_link_expires_at=v_until WHERE singleton;
   INSERT INTO sabora.root_recovery_mail_job_candidate(id,root_user_id,purpose,email_hash,recipient_envelope,token_hash,token_envelope,expires_at,dispatch_until)
    VALUES(v_job,p_actor,'link',c.email_hash,c.recipient_envelope,v->>'tokenHash',v->>'tokenEnvelope',v_until,v_now+interval '10 minutes');
   v_result:='link_queued';
  END IF;
  IF v_result='denied' THEN RETURN jsonb_build_object('outcome','denied'); END IF;
 ELSIF p_action='queue_challenge' THEN
  IF c.root_user_id=p_actor AND c.email_hash=s.email_hash AND NOT s.registration_pending
   AND (s.blocked_until IS NULL OR s.blocked_until<=v_now)
   AND s.link_hash=v->>'linkHash' AND s.link_expires_at>v_now
   AND (s.challenge_hash IS NULL OR s.challenge_expires_at<=v_now)
   AND (s.grant_hash IS NULL OR s.grant_expires_at<=v_now)
   AND (v->>'tokenHash') ~ '^[0-9a-f]{64}$' AND length(v->>'tokenEnvelope') BETWEEN 32 AND 2048
  THEN
   v_job:=(v->>'jobId')::uuid;v_until:=least(v_now+interval '10 minutes',s.link_expires_at);
   UPDATE sabora.root_recovery_state_candidate SET challenge_hash=v->>'tokenHash',challenge_expires_at=v_until,
    grant_hash=NULL,grant_expires_at=NULL WHERE singleton;
   INSERT INTO sabora.root_recovery_mail_job_candidate(id,root_user_id,purpose,email_hash,recipient_envelope,token_hash,token_envelope,expires_at,dispatch_until)
    VALUES(v_job,p_actor,'challenge',c.email_hash,c.recipient_envelope,v->>'tokenHash',v->>'tokenEnvelope',v_until,v_until);
   v_result:='challenge_queued';
  END IF;
 ELSIF p_action='list' THEN
  RETURN jsonb_build_object('outcome','listed','jobs',coalesce((SELECT jsonb_agg(x.id) FROM
   (SELECT id FROM sabora.root_recovery_mail_job_candidate WHERE root_user_id=p_actor AND
    (state='queued' OR (state='accepted' AND purpose='link' AND token_hash=s.pending_link_hash))
    AND expires_at>v_now ORDER BY dispatch_until,id LIMIT 20) x),'[]'::jsonb));
 ELSIF p_action IN ('claim','finish','promote') THEN
  SELECT * INTO j FROM sabora.root_recovery_mail_job_candidate WHERE id=(v->>'jobId')::uuid AND root_user_id=p_actor;
  IF FOUND THEN
   IF p_action='claim' AND j.state='queued' THEN
    IF j.dispatch_until>v_now AND (j.purpose IN ('notice','recovered') OR
     (NOT coalesce(s.registration_pending,false) AND
     ((j.purpose='verify' AND p.proof_hash=j.token_hash AND p.email_hash=j.email_hash)
      OR (j.purpose='link' AND s.pending_link_hash=j.token_hash AND c.email_hash=j.email_hash)
      OR (j.purpose='challenge' AND s.challenge_hash=j.token_hash AND c.email_hash=j.email_hash))))
    THEN
     v_fence:=gen_random_uuid();
     UPDATE sabora.root_recovery_mail_job_candidate SET state='dispatching',fence=v_fence WHERE id=j.id;
     INSERT INTO sabora.root_recovery_audit_candidate(request_id,root_user_id,action,outcome,failures,mail_job_id)
      VALUES(p_request,p_actor,'mail_claim','claimed',coalesce(s.failures,0),j.id);
     RETURN jsonb_build_object('outcome','claimed','jobId',j.id,'fence',v_fence,'purpose',j.purpose,
      'emailHash',j.email_hash,'recipientEnvelope',j.recipient_envelope,'tokenHash',j.token_hash,'tokenEnvelope',j.token_envelope);
    ELSE
     UPDATE sabora.root_recovery_mail_job_candidate SET state='cancelled',recipient_envelope=NULL,token_envelope=NULL,finished_at=v_now WHERE id=j.id;
     v_result:='cancelled';
    END IF;
   ELSIF p_action='finish' AND j.state='dispatching' AND j.fence=(v->>'fence')::uuid
    AND v->>'result' IN ('accepted','rejected','unknown')
    AND ((v->>'result'='accepted')=(v->>'providerId' IS NOT NULL)) THEN
    v_provider:=(v->>'providerId')::uuid;
    UPDATE sabora.root_recovery_mail_job_candidate SET state=v->>'result',provider_id=v_provider,
     recipient_envelope=NULL,token_envelope=NULL,finished_at=v_now WHERE id=j.id;
    IF v->>'result'='rejected' AND j.purpose='link' AND s.pending_link_hash=j.token_hash THEN
     UPDATE sabora.root_recovery_state_candidate SET pending_link_hash=NULL,pending_link_expires_at=NULL WHERE singleton;
    END IF;
    IF v->>'result'='rejected' AND j.purpose='challenge' AND s.challenge_hash=j.token_hash THEN
     UPDATE sabora.root_recovery_state_candidate SET challenge_hash=NULL,challenge_expires_at=NULL WHERE singleton;
    END IF;
    v_result:=v->>'result';
   ELSIF p_action='promote' AND j.state='accepted' AND j.purpose='link' AND j.expires_at>v_now
    AND NOT s.registration_pending AND s.pending_link_hash=j.token_hash AND s.email_hash=j.email_hash
    AND (s.grant_hash IS NULL OR s.grant_expires_at<=v_now) THEN
    UPDATE sabora.root_recovery_state_candidate SET link_hash=s.pending_link_hash,link_expires_at=s.pending_link_expires_at,
     pending_link_hash=NULL,pending_link_expires_at=NULL,challenge_hash=NULL,challenge_expires_at=NULL,
     grant_hash=NULL,grant_expires_at=NULL WHERE singleton;
    v_result:='link_confirmed';
   END IF;
  END IF;
 END IF;
 INSERT INTO sabora.root_recovery_audit_candidate(request_id,root_user_id,action,outcome,failures,mail_job_id)
  VALUES(p_request,p_actor,'mail_'||p_action,v_result,coalesce(s.failures,0),coalesce(j.id,v_job));
 RETURN jsonb_build_object('outcome',v_result);
END;
$mail$;
ALTER FUNCTION sabora.root_recovery_mail_candidate(text,uuid,uuid,text,text,bigint,bigint,text) OWNER TO sabora_root_recovery_fn_owner;
REVOKE ALL ON FUNCTION sabora.root_recovery_mail_candidate(text,uuid,uuid,text,text,bigint,bigint,text) FROM PUBLIC,anon,authenticated;

-- Read-only classification; not an authorization to send mail or mutate
-- membership. The subsequent writer must resolve and recheck under locks.
GRANT SELECT(id,invitee_email_hash,auth_user_id,requested_role,state)
 ON sabora.staff_enrollments TO sabora_root_recovery_fn_owner;
GRANT SELECT(singleton,owner_user_id) ON sabora.admin_write_ownership TO sabora_root_recovery_fn_owner;
CREATE POLICY staff_recovery_classify_enrollment ON sabora.staff_enrollments FOR SELECT
 TO sabora_root_recovery_fn_owner USING(true);
CREATE POLICY staff_recovery_classify_owner ON sabora.admin_write_ownership FOR SELECT
 TO sabora_root_recovery_fn_owner USING(singleton);
CREATE POLICY staff_recovery_classify_members ON sabora.staff_members FOR SELECT
 TO sabora_root_recovery_fn_owner USING(role IN ('admin','waiter','kitchen'));

CREATE FUNCTION sabora.classify_staff_invitation_candidate(
 p_key_id text,p_actor uuid,p_credential text,p_email_hash text,p_enrollment uuid,
 p_issued bigint,p_expires bigint,p_signature text
) RETURNS TABLE(purpose text,enrollment_id uuid,enrollment_state text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $classify$
DECLARE v_key bytea;v_expiry timestamptz;v_expected bytea;v_given bytea;v_diff integer:=0;v_i integer;
 v_role text;v_owner uuid;v_genesis text;s sabora.root_recovery_state_candidate%ROWTYPE;
 e record;v_member record;
BEGIN
 IF session_user::text IS DISTINCT FROM 'sabora_root_recovery_login' OR p_actor IS NULL
 OR p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
 OR (p_credential IS NOT NULL AND p_credential !~ '^[0-9a-f]{64}$')
 OR (p_email_hash IS NOT NULL AND p_email_hash !~ '^[0-9a-f]{64}$')
 OR ((p_email_hash IS NULL)=(p_enrollment IS NULL))
 OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$'
 OR p_issued IS NULL OR p_expires IS NULL OR p_expires::numeric-p_issued::numeric NOT BETWEEN 1 AND 15000
 OR p_issued::numeric>floor(extract(epoch FROM clock_timestamp())*1000)::numeric+5000
 OR p_expires<=floor(extract(epoch FROM clock_timestamp())*1000)
 THEN RAISE EXCEPTION 'staff_invitation_classify_forbidden' USING ERRCODE='42501'; END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_expiry FROM sabora.root_recovery_keys_candidate k
 WHERE k.key_id=p_key_id AND k.purpose='control' AND k.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'staff_invitation_classify_forbidden' USING ERRCODE='42501'; END IF;
 v_expected:=extensions.hmac(convert_to(concat_ws(chr(10),'sabora.staff-invitation-classify.v1',p_key_id,
 session_user::text,p_actor::text,coalesce(p_credential,'-'),coalesce(p_email_hash,'-'),
 coalesce(p_enrollment::text,'-'),p_issued::text,p_expires::text),'UTF8'),v_key,'sha256');
 v_given:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_given,v_i)); END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'staff_invitation_classify_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(17302101,52426);
 IF p_expires<=floor(extract(epoch FROM clock_timestamp())*1000) OR v_expiry<=clock_timestamp()
 OR NOT EXISTS(SELECT 1 FROM sabora.root_recovery_keys_candidate k WHERE k.key_id=p_key_id
  AND k.purpose='control' AND k.hmac_key=v_key AND k.expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'staff_invitation_classify_forbidden' USING ERRCODE='42501'; END IF;
 SELECT m.role,o.owner_user_id INTO v_role,v_owner FROM sabora.staff_members m
 CROSS JOIN sabora.admin_write_ownership o WHERE m.user_id=p_actor AND m.state='active' AND o.singleton;
 IF v_role='root' THEN
  SELECT r.credential_hash INTO v_genesis FROM sabora.root_bootstrap_receipt r WHERE r.singleton AND r.root_user_id=p_actor;
  IF NOT FOUND OR p_credential IS NULL THEN RAISE EXCEPTION 'staff_invitation_classify_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM sabora.root_recovery_state_candidate WHERE singleton;
  IF NOT FOUND THEN
   IF p_credential IS DISTINCT FROM v_genesis THEN RAISE EXCEPTION 'staff_invitation_classify_forbidden' USING ERRCODE='42501'; END IF;
  ELSIF NOT coalesce(s.root_user_id=p_actor AND NOT s.registration_pending
   AND (p_credential=coalesce(s.primary_credential_hash,v_genesis) OR p_credential=s.backup_credential_hash),false)
  THEN RAISE EXCEPTION 'staff_invitation_classify_forbidden' USING ERRCODE='42501'; END IF;
 ELSIF v_role IS DISTINCT FROM 'admin' OR v_owner IS DISTINCT FROM p_actor THEN
  RAISE EXCEPTION 'staff_invitation_classify_forbidden' USING ERRCODE='42501';
 END IF;
 SELECT x.id,x.auth_user_id,x.requested_role,x.state INTO e FROM sabora.staff_enrollments x
 WHERE (p_enrollment IS NOT NULL AND x.id=p_enrollment)
 OR (p_email_hash IS NOT NULL AND x.invitee_email_hash=decode(p_email_hash,'hex'));
 IF NOT FOUND THEN
  IF v_role='admin' AND p_email_hash IS NOT NULL THEN RETURN QUERY SELECT 'new'::text,NULL::uuid,NULL::text; RETURN; END IF;
  RAISE EXCEPTION 'staff_invitation_classify_forbidden' USING ERRCODE='42501';
 END IF;
 IF e.state='invited' AND e.auth_user_id IS NULL AND v_role='admin' THEN
  RETURN QUERY SELECT 'resend'::text,e.id,e.state; RETURN;
 END IF;
 IF e.state IN ('active','suspended') AND e.auth_user_id IS NOT NULL AND e.auth_user_id<>p_actor
 AND e.requested_role IN ('admin','waiter','kitchen') THEN
  SELECT m.role,m.state INTO v_member FROM sabora.staff_members m WHERE m.user_id=e.auth_user_id;
  IF FOUND AND v_member.role=e.requested_role AND v_member.state=e.state THEN
   RETURN QUERY SELECT 'recover'::text,e.id,e.state; RETURN;
  END IF;
 END IF;
 -- Accepted/registered are incomplete original enrollments, not recoveries.
 -- Revoked is terminal. ROOT cannot use this capability to invite or resume an alta.
 IF v_role='admin' AND e.state IN ('accepted','registered') THEN
  RETURN QUERY SELECT 'incomplete'::text,e.id,e.state; RETURN;
 END IF;
 RAISE EXCEPTION 'staff_invitation_classify_forbidden' USING ERRCODE='42501';
END;
$classify$;
ALTER FUNCTION sabora.classify_staff_invitation_candidate(text,uuid,text,text,uuid,bigint,bigint,text)
 OWNER TO sabora_root_recovery_fn_owner;
REVOKE ALL ON FUNCTION sabora.classify_staff_invitation_candidate(text,uuid,text,text,uuid,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated;


-- Durable authorization only. No token, provider request, membership
-- mutation or outbox job is generated until the recovery delivery and
-- credential-admission boundaries are connected. Versions are monotonic.
CREATE TABLE sabora.staff_recovery_intent_candidate(
 request_id uuid PRIMARY KEY,
 enrollment_id uuid NOT NULL REFERENCES sabora.staff_enrollments(id) ON DELETE RESTRICT,
 subject_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id) ON DELETE RESTRICT,
 actor_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0),
 authorizer_credential_hash text CHECK(authorizer_credential_hash ~ '^[0-9a-f]{64}$'),
 subject_role text NOT NULL CHECK(subject_role IN ('admin','waiter','kitchen')),
 subject_state text NOT NULL CHECK(subject_state IN ('active','suspended')),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at>issued_at),
 CHECK(actor_user_id<>subject_user_id),
 UNIQUE(enrollment_id,version)
);
ALTER TABLE sabora.staff_recovery_intent_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_recovery_intent_candidate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.staff_recovery_intent_candidate FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON sabora.staff_recovery_intent_candidate TO sabora_root_recovery_fn_owner;
CREATE POLICY staff_recovery_intent_read ON sabora.staff_recovery_intent_candidate FOR SELECT
 TO sabora_root_recovery_fn_owner USING(true);
CREATE POLICY staff_recovery_intent_insert ON sabora.staff_recovery_intent_candidate FOR INSERT
 TO sabora_root_recovery_fn_owner WITH CHECK(true);
CREATE TRIGGER staff_recovery_intent_immutable BEFORE UPDATE OR DELETE ON sabora.staff_recovery_intent_candidate
 FOR EACH ROW EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();
CREATE TRIGGER staff_recovery_intent_no_truncate BEFORE TRUNCATE ON sabora.staff_recovery_intent_candidate
 FOR EACH STATEMENT EXECUTE FUNCTION sabora.reject_staff_lifecycle_history_mutation();

-- FOR UPDATE takes row locks compatible with the existing lifecycle order.
-- PostgreSQL requires UPDATE privilege to take these locks; the dedicated
-- owner's UPDATE RLS policies forbid writing any resulting row.
GRANT UPDATE(owner_user_id) ON sabora.admin_write_ownership TO sabora_root_recovery_fn_owner;
GRANT UPDATE(state) ON sabora.staff_enrollments,sabora.staff_members TO sabora_root_recovery_fn_owner;
CREATE POLICY staff_recovery_owner_lock ON sabora.admin_write_ownership FOR UPDATE
 TO sabora_root_recovery_fn_owner USING(singleton) WITH CHECK(false);
CREATE POLICY staff_recovery_enrollment_lock ON sabora.staff_enrollments FOR UPDATE
 TO sabora_root_recovery_fn_owner USING(true) WITH CHECK(false);
CREATE POLICY staff_recovery_member_lock ON sabora.staff_members FOR UPDATE
 TO sabora_root_recovery_fn_owner USING(true) WITH CHECK(false);

CREATE FUNCTION sabora.authorize_staff_recovery_intent_candidate(
 p_key_id text,p_actor uuid,p_credential text,p_enrollment uuid,p_request uuid,p_seconds integer,
 p_issued bigint,p_expires bigint,p_signature text
) RETURNS TABLE(intent_id uuid,enrollment_id uuid,intent_version integer,expires_at timestamptz,repeated boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $intent$
DECLARE v_key bytea;v_expiry timestamptz;v_expected bytea;v_given bytea;v_diff integer:=0;v_i integer;
 v_now timestamptz;v_class record;v_sig text;v_version integer;
 e record; prior sabora.staff_recovery_intent_candidate%ROWTYPE;
BEGIN
 IF session_user::text IS DISTINCT FROM 'sabora_root_recovery_login' OR p_actor IS NULL
 OR p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
 OR (p_credential IS NOT NULL AND p_credential !~ '^[0-9a-f]{64}$')
 OR p_enrollment IS NULL OR p_request IS NULL OR p_seconds IS NULL OR p_seconds NOT BETWEEN 60 AND 86400
 OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$'
 OR p_issued IS NULL OR p_expires IS NULL OR p_expires::numeric-p_issued::numeric NOT BETWEEN 1 AND 15000
 OR p_issued::numeric>floor(extract(epoch FROM clock_timestamp())*1000)::numeric+5000
 OR p_expires<=floor(extract(epoch FROM clock_timestamp())*1000)
 THEN RAISE EXCEPTION 'staff_recovery_intent_forbidden' USING ERRCODE='42501'; END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_expiry FROM sabora.root_recovery_keys_candidate k
 WHERE k.key_id=p_key_id AND k.purpose='control' AND k.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'staff_recovery_intent_forbidden' USING ERRCODE='42501'; END IF;
 v_expected:=extensions.hmac(convert_to(concat_ws(chr(10),'sabora.staff-recovery-intent.v1',p_key_id,
 session_user::text,p_actor::text,coalesce(p_credential,'-'),p_enrollment::text,p_request::text,
 p_seconds::text,p_issued::text,p_expires::text),'UTF8'),v_key,'sha256');
 v_given:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_given,v_i)); END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'staff_recovery_intent_forbidden' USING ERRCODE='42501'; END IF;
 -- Existing ownership/lifecycle mutations serialize on this singleton.
 PERFORM 1 FROM sabora.admin_write_ownership o WHERE o.singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'staff_recovery_intent_forbidden' USING ERRCODE='42501'; END IF;
 SELECT x.id,x.auth_user_id,x.requested_role,x.state INTO e FROM sabora.staff_enrollments x
 WHERE x.id=p_enrollment FOR UPDATE;
 IF NOT FOUND OR e.auth_user_id IS NULL THEN RAISE EXCEPTION 'staff_recovery_intent_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM sabora.staff_members m WHERE m.user_id IN (p_actor,e.auth_user_id)
 ORDER BY m.user_id FOR UPDATE;
 -- Reuse the classifier's current authority and ROOT credential fence
 -- while holding the business locks. No stale preview authorizes a write.
 v_sig:=encode(extensions.hmac(convert_to(concat_ws(chr(10),'sabora.staff-invitation-classify.v1',p_key_id,
 session_user::text,p_actor::text,coalesce(p_credential,'-'),'-',p_enrollment::text,
 p_issued::text,p_expires::text),'UTF8'),v_key,'sha256'),'hex');
 SELECT * INTO STRICT v_class FROM sabora.classify_staff_invitation_candidate(
 p_key_id,p_actor,p_credential,NULL,p_enrollment,p_issued,p_expires,v_sig);
 v_now:=clock_timestamp();
 IF v_class.purpose IS DISTINCT FROM 'recover' OR v_class.enrollment_id IS DISTINCT FROM p_enrollment
 OR v_expiry<=v_now OR p_expires<=floor(extract(epoch FROM v_now)*1000)
 THEN RAISE EXCEPTION 'staff_recovery_intent_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM sabora.staff_recovery_intent_candidate i WHERE i.request_id=p_request;
 SELECT coalesce(max(i.version),0) INTO v_version FROM sabora.staff_recovery_intent_candidate i
 WHERE i.enrollment_id=p_enrollment;
 IF prior.request_id IS NOT NULL THEN
  IF prior.actor_user_id IS DISTINCT FROM p_actor OR prior.enrollment_id IS DISTINCT FROM p_enrollment
   OR prior.subject_user_id IS DISTINCT FROM e.auth_user_id OR prior.subject_role IS DISTINCT FROM e.requested_role
   OR prior.authorizer_credential_hash IS DISTINCT FROM p_credential
   OR prior.subject_state IS DISTINCT FROM e.state OR prior.expires_at-prior.issued_at<>make_interval(secs=>p_seconds)
   OR prior.version<>v_version OR prior.expires_at<=v_now THEN
   RAISE EXCEPTION 'staff_recovery_intent_conflict' USING ERRCODE='40001';
  END IF;
  RETURN QUERY SELECT prior.request_id,prior.enrollment_id,prior.version,prior.expires_at,true;RETURN;
 END IF;
 INSERT INTO sabora.staff_recovery_intent_candidate(request_id,enrollment_id,subject_user_id,actor_user_id,
 version,authorizer_credential_hash,subject_role,subject_state,issued_at,expires_at)
 VALUES(p_request,p_enrollment,e.auth_user_id,p_actor,v_version+1,p_credential,e.requested_role,e.state,v_now,
 v_now+make_interval(secs=>p_seconds))
 RETURNING * INTO prior;
 RETURN QUERY SELECT prior.request_id,prior.enrollment_id,prior.version,prior.expires_at,false;
END;
$intent$;
ALTER FUNCTION sabora.authorize_staff_recovery_intent_candidate(text,uuid,text,uuid,uuid,integer,bigint,bigint,text)
 OWNER TO sabora_root_recovery_fn_owner;
REVOKE ALL ON FUNCTION sabora.authorize_staff_recovery_intent_candidate(text,uuid,text,uuid,uuid,integer,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated;


-- Separate purpose from first enrollment; reuse existing recovery worker,
-- Resend transport and encrypted invitation envelope. No operational route.
CREATE TABLE sabora.staff_recovery_delivery_candidate(
 intent_id uuid PRIMARY KEY REFERENCES sabora.staff_recovery_intent_candidate(request_id) ON DELETE RESTRICT,
 token_hash text NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 envelope text CHECK(length(envelope) BETWEEN 32 AND 2048),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','dispatching','delivered','unknown','rejected','cancelled','consumed')),
 fence uuid,
 provider_id uuid UNIQUE,
 consumed_session uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((state IN ('queued','dispatching'))=(envelope IS NOT NULL)),
 CHECK((state IN ('delivered','consumed'))=(provider_id IS NOT NULL)),
 CHECK((state='consumed')=(consumed_session IS NOT NULL)),
 CHECK(state NOT IN ('dispatching','delivered','consumed','unknown','rejected') OR fence IS NOT NULL)
);
ALTER TABLE sabora.staff_recovery_delivery_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.staff_recovery_delivery_candidate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.staff_recovery_delivery_candidate FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE(state,envelope,fence,provider_id,consumed_session,updated_at)
 ON sabora.staff_recovery_delivery_candidate TO sabora_root_recovery_fn_owner;
CREATE POLICY staff_recovery_delivery_owner ON sabora.staff_recovery_delivery_candidate
 TO sabora_root_recovery_fn_owner USING(true) WITH CHECK(true);
GRANT SELECT(enrollment_id,email) ON sabora.staff_directory_contacts TO sabora_root_recovery_fn_owner;
CREATE POLICY staff_recovery_delivery_contact ON sabora.staff_directory_contacts FOR SELECT
 TO sabora_root_recovery_fn_owner USING(true);

CREATE FUNCTION sabora.staff_recovery_delivery_candidate(
 p_key_id text,p_action text,p_intent uuid,p_payload text,p_issued bigint,p_expires bigint,p_signature text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $delivery$
DECLARE v_key bytea;v_key_expiry timestamptz;v_expected bytea;v_given bytea;v_diff integer:=0;v_i integer;
 v jsonb;v_now timestamptz;v_role text;v_owner uuid;v_genesis text;v_current boolean;
 i sabora.staff_recovery_intent_candidate%ROWTYPE;d sabora.staff_recovery_delivery_candidate%ROWTYPE;
 e record;s sabora.root_recovery_state_candidate%ROWTYPE;v_recipient text;v_provider uuid;v_fence uuid;
BEGIN
 IF p_key_id IS NULL OR p_key_id !~ '^[A-Za-z0-9_-]{8,64}$'
 OR p_action IS NULL OR p_action NOT IN ('queue','list','claim','finish','consume')
 OR ((p_action='list')<>(p_intent IS NULL))
 OR session_user::text IS DISTINCT FROM (CASE WHEN p_action IN ('queue','consume')
  THEN 'sabora_root_recovery_login' ELSE 'sabora_root_recovery_mail_login' END)
 OR p_payload IS NULL OR octet_length(p_payload)>4096
 OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$'
 OR p_issued IS NULL OR p_expires IS NULL OR p_expires::numeric-p_issued::numeric NOT BETWEEN 1 AND 15000
 OR p_issued::numeric>floor(extract(epoch FROM clock_timestamp())*1000)::numeric+5000
 OR p_expires<=floor(extract(epoch FROM clock_timestamp())*1000)
 THEN RAISE EXCEPTION 'staff_recovery_delivery_forbidden' USING ERRCODE='42501'; END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_key_expiry FROM sabora.root_recovery_keys_candidate k
 WHERE k.key_id=p_key_id AND k.purpose=CASE WHEN p_action IN ('queue','consume') THEN 'control' ELSE 'mail_worker' END
 AND k.expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'staff_recovery_delivery_forbidden' USING ERRCODE='42501'; END IF;
 v_expected:=extensions.hmac(convert_to(concat_ws(chr(10),'sabora.staff-recovery-delivery.v1',p_key_id,
 session_user::text,p_action,coalesce(p_intent::text,'-'),p_payload,p_issued::text,p_expires::text),'UTF8'),v_key,'sha256');
 v_given:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i)#get_byte(v_given,v_i)); END LOOP;
 IF v_diff IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'staff_recovery_delivery_forbidden' USING ERRCODE='42501'; END IF;
 v:=p_payload::jsonb;
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'staff_recovery_delivery_forbidden' USING ERRCODE='42501'; END IF;
 IF p_action='list' THEN
  IF v<>'{}'::jsonb THEN RAISE EXCEPTION 'staff_recovery_delivery_forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('outcome','listed','jobs',coalesce((SELECT jsonb_agg(q.intent_id)
   FROM (SELECT x.intent_id FROM sabora.staff_recovery_delivery_candidate x
   JOIN sabora.staff_recovery_intent_candidate a ON a.request_id=x.intent_id
   WHERE x.state='queued' OR (x.state='dispatching' AND a.expires_at<=clock_timestamp())
   ORDER BY x.created_at,x.intent_id LIMIT 20) q),'[]'::jsonb));
 END IF;
 SELECT * INTO i FROM sabora.staff_recovery_intent_candidate a WHERE a.request_id=p_intent;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','denied'); END IF;
 -- Same order as authorization: ownership, enrollment, memberships, ROOT fence.
 SELECT o.owner_user_id INTO v_owner FROM sabora.admin_write_ownership o WHERE o.singleton FOR UPDATE;
 SELECT x.auth_user_id,x.requested_role,x.state,x.invitee_email_hash INTO e
 FROM sabora.staff_enrollments x WHERE x.id=i.enrollment_id FOR UPDATE;
 PERFORM 1 FROM sabora.staff_members m WHERE m.user_id IN(i.actor_user_id,i.subject_user_id)
 ORDER BY m.user_id FOR UPDATE;
 PERFORM pg_advisory_xact_lock(17302101,52426);
 v_now:=clock_timestamp();
 IF p_expires<=floor(extract(epoch FROM v_now)*1000) OR v_key_expiry<=v_now
 OR NOT EXISTS(SELECT 1 FROM sabora.root_recovery_keys_candidate k WHERE k.key_id=p_key_id
 AND k.hmac_key=v_key AND k.expires_at>v_now)
 THEN RAISE EXCEPTION 'staff_recovery_delivery_forbidden' USING ERRCODE='42501'; END IF;
 SELECT m.role INTO v_role FROM sabora.staff_members m WHERE m.user_id=i.actor_user_id AND m.state='active';
 v_current:=coalesce(i.expires_at>v_now AND e.auth_user_id=i.subject_user_id AND e.requested_role=i.subject_role
  AND e.state=i.subject_state AND EXISTS(SELECT 1 FROM sabora.staff_members m WHERE m.user_id=i.subject_user_id
    AND m.role=i.subject_role AND m.state=i.subject_state)
  AND NOT EXISTS(SELECT 1 FROM sabora.staff_recovery_intent_candidate a WHERE a.enrollment_id=i.enrollment_id AND a.version>i.version),false);
 IF v_role='root' THEN
  SELECT r.credential_hash INTO v_genesis FROM sabora.root_bootstrap_receipt r WHERE r.singleton AND r.root_user_id=i.actor_user_id;
  SELECT * INTO s FROM sabora.root_recovery_state_candidate WHERE singleton;
  v_current:=v_current AND coalesce(v_genesis IS NOT NULL AND NOT coalesce(s.registration_pending,false)
   AND (i.authorizer_credential_hash=coalesce(s.primary_credential_hash,v_genesis)
     OR i.authorizer_credential_hash=s.backup_credential_hash),false);
 ELSE
  v_current:=v_current AND coalesce(v_role='admin' AND v_owner=i.actor_user_id AND i.authorizer_credential_hash IS NULL,false);
 END IF;
 SELECT * INTO d FROM sabora.staff_recovery_delivery_candidate x WHERE x.intent_id=p_intent FOR UPDATE;
 IF p_action='queue' THEN
  IF NOT v_current OR v->>'actor' IS DISTINCT FROM i.actor_user_id::text
   OR NOT coalesce(v->>'tokenHash' ~ '^[0-9a-f]{64}$',false)
   OR NOT coalesce(length(v->>'envelope') BETWEEN 32 AND 2048,false)
   OR (SELECT count(*) FROM jsonb_object_keys(v))<>3 THEN RETURN jsonb_build_object('outcome','denied'); END IF;
  IF d.intent_id IS NOT NULL THEN RETURN jsonb_build_object('outcome','existing'); END IF;
  INSERT INTO sabora.staff_recovery_delivery_candidate(intent_id,token_hash,envelope)
  VALUES(p_intent,v->>'tokenHash',v->>'envelope');
  RETURN jsonb_build_object('outcome','queued');
 ELSIF p_action='claim' THEN
  IF v<>'{}'::jsonb THEN RAISE EXCEPTION 'staff_recovery_delivery_forbidden' USING ERRCODE='42501'; END IF;
  IF d.state='dispatching' AND i.expires_at<=v_now THEN
   UPDATE sabora.staff_recovery_delivery_candidate SET state='unknown',envelope=NULL,updated_at=v_now WHERE intent_id=p_intent;
   RETURN jsonb_build_object('outcome','unknown');
  END IF;
  IF d.state IS DISTINCT FROM 'queued' THEN RETURN jsonb_build_object('outcome','denied'); END IF;
  IF NOT v_current THEN
   UPDATE sabora.staff_recovery_delivery_candidate SET state='cancelled',envelope=NULL,updated_at=v_now WHERE intent_id=p_intent;
   RETURN jsonb_build_object('outcome','cancelled');
  END IF;
  SELECT c.email INTO v_recipient FROM sabora.staff_directory_contacts c WHERE c.enrollment_id=i.enrollment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','denied'); END IF;
  v_fence:=gen_random_uuid();
  UPDATE sabora.staff_recovery_delivery_candidate SET state='dispatching',fence=v_fence,updated_at=v_now WHERE intent_id=p_intent;
  RETURN jsonb_build_object('outcome','claimed','fence',v_fence,'enrollmentId',i.enrollment_id,
    'version',i.version,'recipient',v_recipient,'emailHash',encode(e.invitee_email_hash,'hex'),
    'tokenHash',d.token_hash,'envelope',d.envelope);
 ELSIF p_action='finish' THEN
  IF d.state IS DISTINCT FROM 'dispatching' OR d.fence::text IS DISTINCT FROM v->>'fence'
   OR NOT coalesce(v->>'result' IN ('accepted','unknown','rejected'),false)
   OR ((v->>'result'='accepted')<>(v->>'providerId' IS NOT NULL))
   OR (SELECT count(*) FROM jsonb_object_keys(v))<>3 THEN RETURN jsonb_build_object('outcome','denied'); END IF;
  v_provider:=(v->>'providerId')::uuid;
  UPDATE sabora.staff_recovery_delivery_candidate SET state=CASE WHEN v->>'result'='accepted' THEN 'delivered' ELSE v->>'result' END,
   provider_id=v_provider,envelope=NULL,updated_at=v_now WHERE intent_id=p_intent;
  RETURN jsonb_build_object('outcome',v->>'result');
 ELSIF p_action='consume' THEN
  -- Only the exact live, verified Auth UUID and email may consume the
  -- current token. This is a receipt, not an operational session or grant.
  IF NOT v_current OR d.state IS DISTINCT FROM 'delivered'
   OR v->>'subject' IS DISTINCT FROM i.subject_user_id::text
   OR v->>'emailHash' IS DISTINCT FROM encode(e.invitee_email_hash,'hex')
   OR v->>'tokenHash' IS DISTINCT FROM d.token_hash OR v->>'session' IS NULL
   OR (SELECT count(*) FROM jsonb_object_keys(v))<>4 THEN RETURN jsonb_build_object('outcome','denied'); END IF;
  UPDATE sabora.staff_recovery_delivery_candidate SET state='consumed',consumed_session=(v->>'session')::uuid,
   updated_at=v_now WHERE intent_id=p_intent;
  RETURN jsonb_build_object('outcome','consumed','enrollmentId',i.enrollment_id,'version',i.version);
 END IF;
 RETURN jsonb_build_object('outcome','denied');
END;
$delivery$;
ALTER FUNCTION sabora.staff_recovery_delivery_candidate(text,text,uuid,text,bigint,bigint,text)
 OWNER TO sabora_root_recovery_fn_owner;
REVOKE ALL ON FUNCTION sabora.staff_recovery_delivery_candidate(text,text,uuid,text,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated;

COMMIT;
