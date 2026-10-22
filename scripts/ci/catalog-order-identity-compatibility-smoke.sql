-- Candidate identity bridge and kitchen projection smoke. Disposable PG17 only.
BEGIN;
DO $smoke$
DECLARE t uuid; s uuid; o uuid;
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
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
   WHERE oid='sabora.orders'::regclass) THEN
  RAISE EXCEPTION 'orders RLS protection missing';
 END IF;
END
$smoke$;
ROLLBACK;
