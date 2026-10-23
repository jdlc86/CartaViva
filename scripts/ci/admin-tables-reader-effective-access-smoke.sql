-- Exercise actual PostgreSQL authorization, not only privilege metadata.
-- Run as migration-owner superuser inside the disposable PG17 CI container.
BEGIN;
INSERT INTO sabora.dining_tables(id,number,capacity,description,qr_token_hash,ordering_state)
 VALUES ('cafe0000-0000-4000-8000-000000009931',9931,4,'CI-only',
 decode(repeat('99',32),'hex'),'closed');
SET LOCAL ROLE sabora_admin_tables_reader;
DO $effective$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM sabora.dining_tables WHERE number=9931;
 IF n<>1 THEN RAISE EXCEPTION 'reader RLS did not return expected table'; END IF;
 BEGIN
  PERFORM qr_token_hash FROM sabora.dining_tables WHERE number=9931;
  RAISE EXCEPTION 'reader unexpectedly selected QR secret';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  EXECUTE 'UPDATE sabora.dining_tables SET capacity=5 WHERE number=9931';
  RAISE EXCEPTION 'reader unexpectedly updated a table';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM count(*) FROM sabora.staff_members;
  RAISE EXCEPTION 'reader unexpectedly selected staff';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $effective$;
RESET ROLE;
ROLLBACK;
