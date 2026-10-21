-- PostgreSQL 17 disposable regression for restricted RPC edge cases.
BEGIN;
INSERT INTO sabora.customer_profiles(public_id,alias)
VALUES ('SB-QQQQQQQQQQQQ','RPC edge cases');
INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
SELECT id,decode(repeat('a1',32),'hex'),now()-interval '1 second'
FROM sabora.customer_profiles WHERE public_id='SB-QQQQQQQQQQQQ';
SET LOCAL ROLE sabora_customer_session_runtime;
DO $checks$
DECLARE
 unknown_hash bytea := decode(repeat('a2',32),'hex');
 expired_hash bytea := decode(repeat('a1',32),'hex');
 short_hash bytea := decode('aa','hex');
BEGIN
 IF EXISTS(SELECT 1 FROM sabora.verify_customer_session_hash(unknown_hash))
 OR EXISTS(SELECT 1 FROM sabora.verify_customer_session_hash(expired_hash))
 OR EXISTS(SELECT 1 FROM sabora.verify_customer_session_hash(short_hash)) THEN
  RAISE EXCEPTION 'unknown/expired/invalid token was verified';
 END IF;
 IF sabora.revoke_customer_session_hash(unknown_hash)
 OR sabora.revoke_customer_session_hash(expired_hash)
 OR sabora.revoke_customer_session_hash(short_hash) THEN
  RAISE EXCEPTION 'unknown/expired/invalid token was revoked';
 END IF;
 IF EXISTS(SELECT 1 FROM sabora.verify_customer_session_hash(NULL::bytea))
 OR sabora.revoke_customer_session_hash(NULL::bytea) IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'NULL hash not rejected safely';
 END IF;
END $checks$;
RESET ROLE;
ROLLBACK;
