-- Validate versioned restricted RPC migration in disposable PostgreSQL 17.
BEGIN;
DO $checks$
BEGIN
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
  WHERE oid='sabora.customer_sessions'::regclass) THEN
  RAISE EXCEPTION 'session RLS disabled';
 END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
  WHERE oid='sabora.customer_profiles'::regclass) THEN
  RAISE EXCEPTION 'profile RLS disabled';
 END IF;
 IF (SELECT rolbypassrls FROM pg_roles WHERE rolname='sabora_customer_session_runtime')
 OR (SELECT rolbypassrls FROM pg_roles WHERE rolname='sabora_customer_session_fn_owner') THEN
  RAISE EXCEPTION 'session role bypasses RLS';
 END IF;
 IF has_table_privilege('sabora_customer_session_runtime','sabora.customer_sessions','SELECT')
 OR has_table_privilege('sabora_customer_session_runtime','sabora.customer_profiles','SELECT')
 OR has_table_privilege('sabora_customer_session_runtime','sabora.customer_sessions','UPDATE')
 OR pg_has_role('sabora_customer_session_runtime','sabora_customer_session_fn_owner','MEMBER') THEN
  RAISE EXCEPTION 'runtime has forbidden privilege';
 END IF;
 IF NOT has_function_privilege('sabora_customer_session_runtime','sabora.verify_customer_session_hash(bytea)','EXECUTE')
 OR NOT has_function_privilege('sabora_customer_session_runtime','sabora.revoke_customer_session_hash(bytea)','EXECUTE') THEN
  RAISE EXCEPTION 'missing RPC capability';
 END IF;
 IF has_function_privilege('anon','sabora.verify_customer_session_hash(bytea)','EXECUTE')
 OR has_function_privilege('authenticated','sabora.revoke_customer_session_hash(bytea)','EXECUTE')
 OR has_function_privilege('sabora_admin_writer','sabora.verify_customer_session_hash(bytea)','EXECUTE') THEN
  RAISE EXCEPTION 'browser or admin acquired session RPC';
 END IF;
END $checks$;
INSERT INTO sabora.customer_profiles(public_id,alias)
VALUES('SB-TTTTTTTTTTTT','RPC migration CI');
INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
SELECT id,decode(repeat('d6',32),'hex'),now()+interval '1 day'
FROM sabora.customer_profiles WHERE public_id='SB-TTTTTTTTTTTT';
SET LOCAL ROLE sabora_customer_session_runtime;
DO $checks$
DECLARE h bytea:=decode(repeat('d6',32),'hex'); n integer;
BEGIN
 SELECT count(*) INTO n FROM sabora.verify_customer_session_hash(h);
 IF n<>1 THEN RAISE EXCEPTION 'valid session not found'; END IF;
 IF NOT sabora.revoke_customer_session_hash(h) THEN RAISE EXCEPTION 'revocation failed'; END IF;
 IF sabora.revoke_customer_session_hash(h) THEN RAISE EXCEPTION 'duplicate revocation accepted'; END IF;
 SELECT count(*) INTO n FROM sabora.verify_customer_session_hash(h);
 IF n<>0 THEN RAISE EXCEPTION 'revoked session authenticated'; END IF;
 BEGIN
  PERFORM count(*) FROM sabora.customer_sessions;
  RAISE EXCEPTION 'direct table access accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $checks$;
RESET ROLE;
ROLLBACK;
