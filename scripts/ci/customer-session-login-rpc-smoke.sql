-- Executed only through an authenticated disposable PostgreSQL LOGIN after SET ROLE.
-- The caller can execute exactly the session RPCs; never direct table SQL.
BEGIN;
SET LOCAL ROLE sabora_customer_session_runtime;
DO $checks$
DECLARE
  h bytea := decode(repeat('e7',32),'hex');
  n integer;
BEGIN
  IF (SELECT count(*) FROM sabora.verify_customer_session_hash(h))<>1 THEN
    RAISE EXCEPTION 'valid session missing via login RPC';
  END IF;
  IF NOT sabora.revoke_customer_session_hash(h) THEN
    RAISE EXCEPTION 'login RPC revoke did not succeed';
  END IF;
  IF sabora.revoke_customer_session_hash(h) THEN
    RAISE EXCEPTION 'login RPC revoked twice';
  END IF;
  SELECT count(*) INTO n FROM sabora.verify_customer_session_hash(h);
  IF n<>0 THEN RAISE EXCEPTION 'revoked session still verified'; END IF;
END $checks$;
COMMIT;
