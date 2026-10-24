-- Candidate identity bridge and kitchen projection smoke. Disposable PG17 only.
BEGIN;
DO $smoke$
DECLARE t uuid; s uuid; o uuid; bad_alias text; bad_identifier text;
BEGIN
 INSERT INTO sabora.dining_tables(number,capacity,qr_token_hash,ordering_state)
 VALUES (987654,4,decode(repeat('ab',32),'hex'),'open')
 RETURNING id,session_id INTO t,s;

 INSERT INTO sabora.orders
 (table_id,session_id,company,employee_number,confirmed_at,grouping,items)
 VALUES (t,s,'Legacy','123',clock_timestamp(),'first',
 '[{"category":"starter","name":"Legacy","quantity":1}]'::jsonb)
 RETURNING id INTO o;
 IF (SELECT count(*) FROM sabora.order_lines WHERE order_id=o)<>1 THEN
  RAISE EXCEPTION 'legacy kitchen trigger broken';
 END IF;

 INSERT INTO sabora.orders
 (table_id,session_id,company,employee_number,customer_alias,
  customer_identifier,customer_visit_key,economic_snapshot,
  confirmed_at,grouping,items)
 VALUES (t,s,NULL,NULL,'Cliente','SB-23456789ABCD','visit_ci',
  '{"schemaVersion":1,"totalCents":900}'::jsonb,
  clock_timestamp(),'grouped',
  '[{"category":"starter","name":"Plato","quantity":2}]'::jsonb)
 RETURNING id INTO o;
 IF (SELECT count(*) FROM sabora.order_lines
     WHERE order_id=o AND category='starter' AND quantity=2)<>1 THEN
  RAISE EXCEPTION 'candidate kitchen trigger broken';
 END IF;
 BEGIN
  INSERT INTO sabora.orders
   (table_id,session_id,company,employee_number,customer_alias,
    customer_identifier,customer_visit_key,economic_snapshot,
    confirmed_at,grouping,items)
  VALUES (t,s,'Fabricated','123','Cliente','SB-23456789ABCD','visit_ci',
   '{"schemaVersion":1}'::jsonb,clock_timestamp(),'late',
   '[{"category":"starter","name":"Plato","quantity":1}]'::jsonb);
  RAISE EXCEPTION 'mixed identity accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 -- Candidate identity must obey the same alias and public-ID limits as profiles.
 FOREACH bad_alias IN ARRAY ARRAY[
  repeat('A',81),'   ','bad'||chr(10)||'control'
 ] LOOP
  BEGIN
   INSERT INTO sabora.orders
    (table_id,session_id,customer_alias,customer_identifier,
     customer_visit_key,economic_snapshot,confirmed_at,grouping,items)
   VALUES (t,s,bad_alias,'SB-23456789ABCD','visit_ci',
    '{"schemaVersion":1}'::jsonb,clock_timestamp(),'late',
    '[{"category":"starter","name":"Plato","quantity":1}]'::jsonb);
   RAISE EXCEPTION 'invalid alias accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
 END LOOP;
 FOREACH bad_identifier IN ARRAY ARRAY['SB-INVALID','SB-23456789ABCI','bad'] LOOP
  BEGIN
   INSERT INTO sabora.orders
    (table_id,session_id,customer_alias,customer_identifier,
     customer_visit_key,economic_snapshot,confirmed_at,grouping,items)
   VALUES (t,s,'Cliente',bad_identifier,'visit_ci',
    '{"schemaVersion":1}'::jsonb,clock_timestamp(),'late',
    '[{"category":"starter","name":"Plato","quantity":1}]'::jsonb);
   RAISE EXCEPTION 'invalid customer public ID accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
 END LOOP;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
   WHERE oid='sabora.orders'::regclass) THEN
  RAISE EXCEPTION 'orders RLS protection missing';
 END IF;
END
$smoke$;
ROLLBACK;
