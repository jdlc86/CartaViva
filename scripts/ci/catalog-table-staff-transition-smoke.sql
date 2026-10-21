-- PostgreSQL 17 isolated: authorized transitions, denied kitchen/invited,
-- no-op rejection, pause expiry, occupancy separation, no grants.
BEGIN;
DO $smoke$
DECLARE
 t uuid:='00000000-0000-4000-8000-000000008401';
 w uuid:='00000000-0000-4000-8000-000000008402';
 k uuid:='00000000-0000-4000-8000-000000008403';
 i uuid:='00000000-0000-4000-8000-000000008404';
 old_session uuid; new_session uuid;
BEGIN
 INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash)
 VALUES(t,8401,4,decode(repeat('88',32),'hex'));
 INSERT INTO sabora.staff_members(user_id,role,state)
 VALUES(w,'waiter','active'),(k,'kitchen','active'),(i,'waiter','invited');
 BEGIN
  PERFORM * FROM sabora.transition_table_ordering_candidate(k,t,'open');
  RAISE EXCEPTION 'kitchen transition permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM * FROM sabora.transition_table_ordering_candidate(i,t,'open');
  RAISE EXCEPTION 'invited transition permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM * FROM sabora.transition_table_ordering_candidate(w,t,'paused');
  RAISE EXCEPTION 'paused closed table';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 PERFORM * FROM sabora.transition_table_ordering_candidate(w,t,'open');
 SELECT session_id INTO old_session FROM sabora.dining_tables WHERE id=t;
 BEGIN
  PERFORM * FROM sabora.transition_table_ordering_candidate(w,t,'open');
  RAISE EXCEPTION 'duplicate open accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  PERFORM * FROM sabora.transition_table_ordering_candidate(w,t,'paused',clock_timestamp()-interval '1 minute');
  RAISE EXCEPTION 'expired pause accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 PERFORM * FROM sabora.transition_table_ordering_candidate(w,t,'paused',clock_timestamp()+interval '5 minutes');
 PERFORM * FROM sabora.transition_table_ordering_candidate(w,t,'open');
 PERFORM * FROM sabora.transition_table_ordering_candidate(w,t,'closed');
 SELECT session_id INTO new_session FROM sabora.dining_tables WHERE id=t;
 IF new_session=old_session THEN RAISE EXCEPTION 'close failed to rotate occupancy'; END IF;
 PERFORM * FROM sabora.transition_table_ordering_candidate(w,t,'open');
 IF (SELECT session_id FROM sabora.dining_tables WHERE id=t)<>new_session
 THEN RAISE EXCEPTION 'reopen reused old session'; END IF;
END $smoke$;
DO $acl$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','sabora_admin_writer','sabora_catalog_reader'] LOOP
  IF has_function_privilege(r,
    'sabora.transition_table_ordering_candidate(uuid,uuid,text,timestamptz)','EXECUTE')
  THEN RAISE EXCEPTION 'table transition executable by %',r; END IF;
 END LOOP;
END $acl$;
ROLLBACK;
