BEGIN;
DO $audit$
DECLARE t uuid:='00000000-0000-4000-8000-000000008601';
 s uuid; new_s uuid; n integer;
BEGIN
 INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash)
 VALUES(t,8601,4,decode(repeat('aa',32),'hex'));
 SELECT session_id INTO s FROM sabora.dining_tables WHERE id=t;
 UPDATE sabora.dining_tables SET ordering_state='open' WHERE id=t;
 UPDATE sabora.dining_tables SET ordering_state='paused',
  pause_until=clock_timestamp()+interval '5 minutes' WHERE id=t;
 UPDATE sabora.dining_tables SET ordering_state='closed',pause_until=NULL WHERE id=t;
 SELECT session_id INTO new_s FROM sabora.dining_tables WHERE id=t;
 SELECT count(*) INTO n FROM sabora.table_ordering_audit_candidate WHERE table_id=t;
 IF n<>3 THEN RAISE EXCEPTION 'expected three audit records, got %',n; END IF;
 IF NOT EXISTS(SELECT 1 FROM sabora.table_ordering_audit_candidate
  WHERE table_id=t AND old_state='paused' AND new_state='closed'
  AND old_session_id=s AND new_session_id=new_s AND new_session_id<>old_session_id)
 THEN RAISE EXCEPTION 'close audit lost occupancy boundary'; END IF;
 BEGIN
  UPDATE sabora.table_ordering_audit_candidate SET new_state='open' WHERE table_id=t;
  RAISE EXCEPTION 'audit update succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  DELETE FROM sabora.table_ordering_audit_candidate WHERE table_id=t;
  RAISE EXCEPTION 'audit delete succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $audit$;
DO $acl$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sabora_admin_writer','sabora_catalog_reader'] LOOP
  IF has_table_privilege(r,'sabora.table_ordering_audit_candidate','SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'audit table accessible to %',r; END IF;
 END LOOP;
END $acl$;
ROLLBACK;
