-- Execute actual statements as the NOLOGIN candidate reader in disposable PG17.
-- A NOLOGIN role can be exercised with SET LOCAL ROLE by the CI superuser;
-- this does not create a login, grant membership or activate a runtime route.
BEGIN;
INSERT INTO sabora.dining_tables
 (id,number,capacity,description,qr_token_hash,ordering_state)
 VALUES ('00000000-0000-4000-8000-000000009321',9321,4,'CI read only',
 decode(repeat('a1',32),'hex'),'closed');
SET LOCAL ROLE sabora_admin_tables_reader;
DO $reader$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM (
  SELECT id,number,capacity,description,ordering_state
   FROM sabora.dining_tables WHERE number=9321 ORDER BY number,id LIMIT 2
 ) allowed;
 IF n<>1 THEN RAISE EXCEPTION 'admin reader cannot read allowed row'; END IF;
 BEGIN
  PERFORM qr_token_hash FROM sabora.dining_tables WHERE number=9321;
  RAISE EXCEPTION 'admin reader exposed QR hash';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM 1 FROM sabora.staff_members LIMIT 1;
  RAISE EXCEPTION 'admin reader exposed staff';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM 1 FROM sabora.catalog_items LIMIT 1;
  RAISE EXCEPTION 'admin reader exposed catalog';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE sabora.dining_tables SET capacity=9 WHERE number=9321;
  RAISE EXCEPTION 'admin reader allowed update';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $reader$;
RESET ROLE;
ROLLBACK;
