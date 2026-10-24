-- Disposable PostgreSQL 17: close must revoke visits and change occupancy
-- session atomically; pause must preserve the active occupancy.
BEGIN;
DO $occupancy$
DECLARE t uuid:='00000000-0000-4000-8000-000000008301';
 c uuid:='00000000-0000-4000-8000-000000008302';
 old_session uuid;
 paused_session uuid;
 next_session uuid;
BEGIN
 INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash)
 VALUES(t,8301,4,decode(repeat('77',32),'hex'));
 INSERT INTO sabora.customer_profiles(id,public_id,alias)
 VALUES(c,'SB-HJKLMNPQRSTV','Occupancy fixture');
 UPDATE sabora.dining_tables SET ordering_state='open' WHERE id=t;
 SELECT session_id INTO old_session FROM sabora.dining_tables WHERE id=t;
 INSERT INTO sabora.customer_table_visits
  (table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
 VALUES(t,old_session,c,'visit-old','actor-old',1,clock_timestamp()+interval '15 minutes');
 UPDATE sabora.dining_tables SET ordering_state='paused',
  pause_until=clock_timestamp()+interval '10 minutes' WHERE id=t;
 SELECT session_id INTO paused_session FROM sabora.dining_tables WHERE id=t;
 IF paused_session IS DISTINCT FROM old_session
 THEN RAISE EXCEPTION 'pause changed occupancy'; END IF;
 UPDATE sabora.dining_tables SET ordering_state='closed',pause_until=NULL WHERE id=t;
 SELECT session_id INTO next_session FROM sabora.dining_tables WHERE id=t;
 IF next_session=old_session THEN RAISE EXCEPTION 'close reused occupancy session'; END IF;
 IF EXISTS(SELECT 1 FROM sabora.customer_table_visits
  WHERE table_id=t AND session_id=old_session AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'old visit still authorized'; END IF;
 UPDATE sabora.dining_tables SET ordering_state='open' WHERE id=t;
 IF (SELECT session_id FROM sabora.dining_tables WHERE id=t)<>next_session
 THEN RAISE EXCEPTION 'reopen rotated session unexpectedly'; END IF;
 IF EXISTS(SELECT 1 FROM sabora.customer_table_visits v
   JOIN sabora.dining_tables d ON d.id=v.table_id
   WHERE d.id=t AND v.session_id=d.session_id AND v.visit_key='visit-old')
 THEN RAISE EXCEPTION 'previous occupancy leaked into new visit'; END IF;
END $occupancy$;
ROLLBACK;
