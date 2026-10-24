-- Disposable PostgreSQL 17 only. Roll back all fixtures.
BEGIN;
DO $visit$
DECLARE t uuid:='00000000-0000-4000-8000-000000008101';
 c uuid:='00000000-0000-4000-8000-000000008102';
 s uuid:='00000000-0000-4000-8000-000000008103';
BEGIN
 INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash,session_id)
 VALUES(t,8101,4,decode(repeat('55',32),'hex'),s);
 INSERT INTO sabora.customer_profiles(id,public_id,alias)
 VALUES(c,'SB-ABCDEFGHJKLM','Visit fixture');
 INSERT INTO sabora.customer_table_visits
  (table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
 VALUES(t,s,c,'visit-ci','actor-ci',1,now()+interval '15 minutes');
 IF (SELECT count(*) FROM sabora.customer_table_visits
  WHERE table_id=t AND session_id=s AND customer_id=c
  AND visit_key='visit-ci' AND actor_id='actor-ci')<>1
 THEN RAISE EXCEPTION 'visit scope not persisted'; END IF;
 BEGIN
  INSERT INTO sabora.customer_table_visits
   (table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
  VALUES(t,s,c,'visit-ci','actor-ci',1,now()+interval '15 minutes');
  RAISE EXCEPTION 'duplicate visit accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO sabora.customer_table_visits
   (table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
  VALUES(t,s,c,'bad visit','actor-ci',1,now()+interval '15 minutes');
  RAISE EXCEPTION 'malformed visit accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO sabora.customer_table_visits
   (table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
  VALUES(t,s,c,'visit-other','actor-ci',1,now()-interval '1 minute');
  RAISE EXCEPTION 'expired-at-creation visit accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $visit$;
ROLLBACK;
