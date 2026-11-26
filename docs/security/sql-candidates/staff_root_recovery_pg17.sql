-- Candidate only: transactional ROOT recovery factor kernel.
-- No runtime login, provider invocation, session issuance or production migration.
BEGIN;
CREATE ROLE sabora_root_recovery_fn_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
 NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE TABLE sabora.root_recovery_keys_candidate(
 key_id text PRIMARY KEY CHECK(key_id ~ '^[A-Za-z0-9_-]{8,64}$'),
 hmac_key bytea NOT NULL CHECK(octet_length(hmac_key)=32),
 expires_at timestamptz NOT NULL
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
 primary_credential_hash text CHECK(primary_credential_hash ~ '^[0-9a-f]{64}$'),
 backup_credential_hash text CHECK(backup_credential_hash ~ '^[0-9a-f]{64}$'),
 retired_credential_hashes text[] NOT NULL DEFAULT ARRAY[]::text[],
 CHECK(registration_pending=(pending_operation_hash IS NOT NULL)),
 CHECK((link_hash IS NULL)=(link_expires_at IS NULL)),
 CHECK((pending_link_hash IS NULL)=(pending_link_expires_at IS NULL)),
 CHECK((challenge_hash IS NULL)=(challenge_expires_at IS NULL)),
 CHECK((grant_hash IS NULL)=(grant_expires_at IS NULL))
);
CREATE TABLE sabora.root_recovery_audit_candidate(
 request_id uuid PRIMARY KEY,root_user_id uuid NOT NULL REFERENCES sabora.staff_members(user_id),
 action text NOT NULL,outcome text NOT NULL,failures bigint NOT NULL,
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
GRANT SELECT(key_id,hmac_key,expires_at) ON sabora.root_recovery_keys_candidate TO sabora_root_recovery_fn_owner;
GRANT SELECT,INSERT,UPDATE ON sabora.root_recovery_state_candidate TO sabora_root_recovery_fn_owner;
GRANT SELECT(request_id),INSERT(request_id,root_user_id,action,outcome,failures)
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
 v_result text;v_fails bigint:=0;v_block timestamptz;v_genesis_hash text;
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
   WHEN 'add_backup' THEN p_a IS NOT NULL AND p_b IS NULL AND p_c IS NULL AND p_days IS NULL
   WHEN 'complete' THEN p_a IS NOT NULL AND p_b IS NOT NULL AND p_c IS NOT NULL AND p_days IS NULL
   WHEN 'reset' THEN p_a IS NULL AND p_b IS NULL AND p_c IS NULL AND p_days IS NULL
   ELSE false END,false)
 THEN RAISE EXCEPTION 'root_recovery_forbidden' USING ERRCODE='42501'; END IF;
 SELECT k.hmac_key,k.expires_at INTO v_key,v_key_expiry FROM sabora.root_recovery_keys_candidate k
 WHERE k.key_id=p_key_id AND k.expires_at>clock_timestamp();
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
   AND k.hmac_key=v_key AND k.expires_at>v_now)
  OR NOT EXISTS(SELECT 1 FROM sabora.root_bootstrap_receipt r JOIN sabora.staff_members m
   ON m.user_id=r.root_user_id AND m.role='root' AND m.state='active'
   WHERE r.singleton AND r.root_user_id=p_actor)
  OR EXISTS(SELECT 1 FROM sabora.root_recovery_audit_candidate a WHERE a.request_id=p_request)
 THEN RAISE EXCEPTION 'root_recovery_forbidden' USING ERRCODE='42501'; END IF;
 SELECT r.credential_hash INTO v_genesis_hash FROM sabora.root_bootstrap_receipt r WHERE r.singleton AND r.root_user_id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'root_recovery_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM sabora.root_recovery_state_candidate t WHERE t.singleton FOR UPDATE;
 IF NOT FOUND THEN
  IF p_action<>'configure' THEN RETURN QUERY SELECT 'denied'::text,0::bigint,NULL::timestamptz; RETURN; END IF;
  INSERT INTO sabora.root_recovery_state_candidate(root_user_id,email_hash,code_hash,interval_days)
   VALUES(p_actor,p_a,p_b,p_days);
  v_result:='configured';
 ELSE
  v_fails:=s.failures;v_block:=s.blocked_until;
  IF s.root_user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'root_recovery_forbidden' USING ERRCODE='42501'; END IF;
  v_result:='denied';
  IF s.registration_pending THEN
   -- Only trusted, verified provider reconciliation may issue complete.
   -- No HTTP endpoint exposes this command.
   IF p_action='complete' AND p_a=s.pending_operation_hash
    AND p_b IS DISTINCT FROM coalesce(s.primary_credential_hash,v_genesis_hash)
    AND p_b IS DISTINCT FROM s.backup_credential_hash AND p_b IS DISTINCT FROM v_genesis_hash
    AND NOT (p_b=ANY(s.retired_credential_hashes))
    AND p_c IS DISTINCT FROM s.code_hash THEN
    UPDATE sabora.root_recovery_state_candidate SET registration_pending=false,pending_operation_hash=NULL,
     retired_credential_hashes=array_remove(s.retired_credential_hashes||ARRAY[coalesce(s.primary_credential_hash,v_genesis_hash),s.backup_credential_hash],NULL),
     primary_credential_hash=p_b,backup_credential_hash=NULL,code_hash=p_c,failures=0,blocked_until=NULL,
     link_hash=NULL,link_expires_at=NULL,pending_link_hash=NULL,pending_link_expires_at=NULL,
     challenge_hash=NULL,challenge_expires_at=NULL,grant_hash=NULL,grant_expires_at=NULL WHERE singleton;
    v_fails:=0;v_block:=NULL;v_result:='completed';
   ELSE v_result:='registration_pending'; END IF;
  ELSIF p_action='add_backup' THEN
   IF s.backup_credential_hash IS NULL AND p_a IS DISTINCT FROM coalesce(s.primary_credential_hash,v_genesis_hash)
    AND p_a IS DISTINCT FROM v_genesis_hash AND NOT (p_a=ANY(s.retired_credential_hashes)) THEN
    UPDATE sabora.root_recovery_state_candidate SET backup_credential_hash=p_a WHERE singleton;
    v_result:='backup_added';
   END IF;
  ELSIF p_action='reset' THEN
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
     registration_pending=true,pending_operation_hash=p_a WHERE singleton;
    v_result:='claimed';
   END IF;
  END IF;
 END IF;
 INSERT INTO sabora.root_recovery_audit_candidate(request_id,root_user_id,action,outcome,failures)
 VALUES(p_request,p_actor,p_action,v_result,v_fails);
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
 WHERE k.key_id=p_key_id AND k.expires_at>clock_timestamp();
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
   AND k.hmac_key=v_key AND k.expires_at>clock_timestamp())
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
COMMIT;
