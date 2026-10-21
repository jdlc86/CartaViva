-- Disposable PostgreSQL 17 candidate lifecycle checks, rolled back.
BEGIN;
DO $lifecycle$
DECLARE t uuid:='00000000-0000-4000-8000-000000008201';
 state text;
BEGIN
 INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash)
 VALUES(t,8201,4,decode(repeat('66',32),'hex'));
 SELECT ordering_state INTO state FROM sabora.dining_tables WHERE id=t;
 IF state<>'closed' THEN RAISE EXCEPTION 'table not closed by default'; END IF;
 UPDATE sabora.dining_tables SET ordering_state='open' WHERE id=t;
 IF NOT EXISTS(SELECT 1 FROM sabora.dining_tables WHERE id=t
  AND ordering_state='open' AND pause_until IS NULL)
 THEN RAISE EXCEPTION 'open state invalid'; END IF;
 UPDATE sabora.dining_tables SET ordering_state='paused',
  pause_until=now()+interval '10 minutes' WHERE id=t;
 IF NOT EXISTS(SELECT 1 FROM sabora.dining_tables WHERE id=t
  AND ordering_state='paused' AND pause_until>clock_timestamp())
 THEN RAISE EXCEPTION 'timed pause invalid'; END IF;
 BEGIN
  UPDATE sabora.dining_tables SET ordering_state='open' WHERE id=t;
  RAISE EXCEPTION 'open with pause deadline accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 UPDATE sabora.dining_tables SET ordering_state='closed',pause_until=NULL WHERE id=t;
 BEGIN
  UPDATE sabora.dining_tables SET ordering_state='other' WHERE id=t;
  RAISE EXCEPTION 'unknown table state accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $lifecycle$;
ROLLBACK;
