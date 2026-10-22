-- Disposable PostgreSQL 17 only; never connect to operational Supabase.
-- A candidate order and confirmation must disappear together on rollback.
BEGIN;
INSERT INTO sabora.dining_tables(number,capacity,qr_token_hash)
 VALUES (930101,4,decode(repeat('93',32),'hex'))
 RETURNING id AS table_id,session_id \gset
INSERT INTO sabora.catalog_items(draft) VALUES ('{}'::jsonb)
 RETURNING id AS item_id \gset
INSERT INTO sabora.catalog_displayed_quotes(
 table_id,session_id,visit_id,basket_id,actor_id,item_id,
 published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
VALUES (:'table_id',:'session_id','visit-atomic','basket-atomic','actor-atomic',:'item_id',
 1,1000,0,1000,'{"schemaVersion":1,"totalCents":1000}'::jsonb,
 now()+interval '5 minutes')
 RETURNING id AS quote_id \gset
SAVEPOINT before_order;
INSERT INTO sabora.orders(
 table_id,session_id,company,employee_number,confirmed_at,grouping,items)
VALUES (:'table_id',:'session_id','CI','atomic',now(),'first',
 '[{"category":"main","name":"CI","quantity":1}]'::jsonb)
 RETURNING id AS rolled_order_id \gset
INSERT INTO sabora.catalog_confirmation_attempts(
 table_id,session_id,visit_id,basket_id,actor_id,item_id,
 request_key,request_fingerprint,quote_id,economic_evidence,order_id)
VALUES (:'table_id',:'session_id','visit-atomic','basket-atomic','actor-atomic',
 :'item_id','request-atomic','fingerprint-atomic',:'quote_id',
 '{"schemaVersion":1,"totalCents":1000}'::jsonb,:'rolled_order_id');
ROLLBACK TO SAVEPOINT before_order;
SELECT 1 / CASE WHEN
 NOT EXISTS (SELECT 1 FROM sabora.orders WHERE id=:'rolled_order_id')
 AND NOT EXISTS (SELECT 1 FROM sabora.order_lines WHERE order_id=:'rolled_order_id')
 AND NOT EXISTS (SELECT 1 FROM sabora.catalog_confirmation_attempts
  WHERE table_id=:'table_id' AND request_key='request-atomic')
 THEN 1 ELSE 0 END AS rollback_atomicity_verified;
-- Simulate a writer that inserted the order, then failed to persist the
-- confirmation because the quote belongs to a different item. PostgreSQL's
-- PL/pgSQL exception subtransaction must undo the earlier order INSERT.
DO $failed_writer$
DECLARE
 v_table uuid;
 v_session uuid;
 v_item uuid;
 v_quote uuid;
 v_other_item uuid;
 v_constraint text;
 v_order uuid;
 v_rejected boolean:=false;
BEGIN
 SELECT id,session_id INTO STRICT v_table,v_session
 FROM sabora.dining_tables WHERE number=930101;
 SELECT item_id, id INTO STRICT v_item,v_quote
 FROM sabora.catalog_displayed_quotes
 WHERE table_id=v_table AND visit_id='visit-atomic'
  AND actor_id='actor-atomic';
 INSERT INTO sabora.catalog_items(draft) VALUES ('{}'::jsonb)
 RETURNING id INTO v_other_item;
 BEGIN
  INSERT INTO sabora.orders(
   table_id,session_id,company,employee_number,confirmed_at,grouping,items)
  VALUES(v_table,v_session,'CI','failed-writer',now(),'first',
   '[{"category":"main","name":"CI","quantity":1}]'::jsonb)
  RETURNING id INTO v_order;
  INSERT INTO sabora.catalog_confirmation_attempts(
   table_id,session_id,visit_id,basket_id,actor_id,item_id,
   request_key,request_fingerprint,quote_id,economic_evidence,order_id)
  VALUES(v_table,v_session,'visit-atomic','basket-atomic','actor-atomic',
   v_other_item,
   'request-failed','fingerprint-failed',v_quote,
   '{"schemaVersion":1}'::jsonb,v_order);
  RAISE EXCEPTION 'invalid confirmation unexpectedly accepted';
 EXCEPTION WHEN foreign_key_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  IF v_constraint<>'catalog_confirmation_quote_scope' THEN
   RAISE EXCEPTION 'unexpected failed-writer FK: %',v_constraint;
  END IF;
  v_rejected:=true;
 END;
 IF NOT v_rejected THEN
  RAISE EXCEPTION 'expected quote scope rejection not observed';
 END IF;
 IF EXISTS(SELECT 1 FROM sabora.orders
  WHERE table_id=v_table AND employee_number='failed-writer') THEN
  RAISE EXCEPTION 'orphaned order survived confirmation FK failure';
 END IF;
 IF EXISTS(SELECT 1 FROM sabora.order_lines l
  JOIN sabora.orders o ON o.id=l.order_id
  WHERE o.table_id=v_table AND o.employee_number='failed-writer') THEN
  RAISE EXCEPTION 'orphaned kitchen projection survived confirmation FK failure';
 END IF;
 IF EXISTS(SELECT 1 FROM sabora.catalog_confirmation_attempts
  WHERE table_id=v_table AND request_key='request-failed') THEN
  RAISE EXCEPTION 'failed confirmation survived FK failure';
 END IF;
END $failed_writer$;
-- After rollback the same idempotency key can be committed with a new order.
INSERT INTO sabora.orders(
 table_id,session_id,company,employee_number,confirmed_at,grouping,items)
VALUES (:'table_id',:'session_id','CI','atomic',now(),'first',
 '[{"category":"main","name":"CI","quantity":1}]'::jsonb)
 RETURNING id AS committed_order_id \gset
INSERT INTO sabora.catalog_confirmation_attempts(
 table_id,session_id,visit_id,basket_id,actor_id,item_id,
 request_key,request_fingerprint,quote_id,economic_evidence,order_id)
VALUES (:'table_id',:'session_id','visit-atomic','basket-atomic','actor-atomic',
 :'item_id','request-atomic','fingerprint-atomic',:'quote_id',
 '{"schemaVersion":1,"totalCents":1000}'::jsonb,:'committed_order_id');
SELECT 1 / CASE WHEN
 (SELECT count(*) FROM sabora.catalog_confirmation_attempts
  WHERE table_id=:'table_id' AND request_key='request-atomic'
   AND order_id=:'committed_order_id')=1
 AND EXISTS (SELECT 1 FROM sabora.orders WHERE id=:'committed_order_id')
 AND (SELECT count(*) FROM sabora.order_lines WHERE order_id=:'committed_order_id')=1
 THEN 1 ELSE 0 END AS committed_pair_verified;
-- A retry with the same scope/key must fail atomically, not leave an
-- extra order or kitchen line if the unique ledger constraint rejects it.
DO $duplicate_confirmation$
DECLARE
 v_table uuid;
 v_session uuid;
 v_item uuid;
 v_quote uuid;
 v_existing_order uuid;
 v_duplicate_order uuid;
 v_constraint text;
 v_rejected boolean:=false;
 v_before_orders bigint;
 v_before_lines bigint;
BEGIN
 SELECT id,session_id INTO STRICT v_table,v_session
 FROM sabora.dining_tables WHERE number=930101;
 SELECT item_id,id INTO STRICT v_item,v_quote
 FROM sabora.catalog_displayed_quotes
 WHERE table_id=v_table AND visit_id='visit-atomic'
  AND actor_id='actor-atomic';
 SELECT order_id INTO STRICT v_existing_order
 FROM sabora.catalog_confirmation_attempts
 WHERE table_id=v_table AND request_key='request-atomic';
 SELECT count(*) INTO v_before_orders FROM sabora.orders WHERE table_id=v_table;
 SELECT count(*) INTO v_before_lines FROM sabora.order_lines l
 JOIN sabora.orders o ON o.id=l.order_id WHERE o.table_id=v_table;
 BEGIN
  INSERT INTO sabora.orders(
   table_id,session_id,company,employee_number,confirmed_at,grouping,items)
  VALUES(v_table,v_session,'CI','duplicate-attempt',now(),'grouped',
   '[{"category":"main","name":"CI","quantity":1}]'::jsonb)
  RETURNING id INTO v_duplicate_order;
  INSERT INTO sabora.catalog_confirmation_attempts(
   table_id,session_id,visit_id,basket_id,actor_id,item_id,
   request_key,request_fingerprint,quote_id,economic_evidence,order_id)
  VALUES(v_table,v_session,'visit-atomic','basket-atomic','actor-atomic',
   v_item,'request-atomic','fingerprint-atomic',v_quote,
   '{"schemaVersion":1,"totalCents":1000}'::jsonb,v_duplicate_order);
  RAISE EXCEPTION 'duplicate confirmation unexpectedly accepted';
 EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  IF v_constraint<>'catalog_confirmation_idempotency' THEN
   RAISE EXCEPTION 'unexpected duplicate constraint: %',v_constraint;
  END IF;
  v_rejected:=true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'duplicate key was not rejected'; END IF;
 IF (SELECT count(*) FROM sabora.orders WHERE table_id=v_table)<>v_before_orders
 OR (SELECT count(*) FROM sabora.order_lines l JOIN sabora.orders o
     ON o.id=l.order_id WHERE o.table_id=v_table)<>v_before_lines
 OR (SELECT count(*) FROM sabora.catalog_confirmation_attempts
     WHERE table_id=v_table AND request_key='request-atomic')<>1
 OR (SELECT order_id FROM sabora.catalog_confirmation_attempts
     WHERE table_id=v_table AND request_key='request-atomic')<>v_existing_order
 THEN RAISE EXCEPTION 'duplicate attempt leaked an order, kitchen line or ledger mutation'; END IF;
END $duplicate_confirmation$;
-- Identical request keys from distinct authorized actors or baskets must not
-- collide: the uniqueness boundary is the full six-column scope.
DO $scope_isolation$
DECLARE
 v_table uuid;
 v_session uuid;
 v_item uuid;
 v_quote uuid;
 v_order uuid;
 v_other_quote uuid;
 v_other_order uuid;
BEGIN
 SELECT id,session_id INTO STRICT v_table,v_session
 FROM sabora.dining_tables WHERE number=930101;
 SELECT item_id,id INTO STRICT v_item,v_quote
 FROM sabora.catalog_displayed_quotes
 WHERE table_id=v_table AND visit_id='visit-atomic'
  AND actor_id='actor-atomic';
 INSERT INTO sabora.catalog_displayed_quotes(
  table_id,session_id,visit_id,basket_id,actor_id,item_id,
  published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
 VALUES(v_table,v_session,'visit-atomic','basket-atomic','actor-other',v_item,
  1,1000,0,1000,'{"schemaVersion":1,"totalCents":1000}'::jsonb,
  now()+interval '5 minutes')
 RETURNING id INTO v_other_quote;
 INSERT INTO sabora.orders(
  table_id,session_id,company,employee_number,confirmed_at,grouping,items)
 VALUES(v_table,v_session,'CI','scope-isolation',now(),'grouped',
  '[{"category":"main","name":"CI","quantity":1}]'::jsonb)
 RETURNING id INTO v_other_order;
 INSERT INTO sabora.catalog_confirmation_attempts(
  table_id,session_id,visit_id,basket_id,actor_id,item_id,
  request_key,request_fingerprint,quote_id,economic_evidence,order_id)
 VALUES(v_table,v_session,'visit-atomic','basket-atomic','actor-other',
  v_item,'request-atomic','fingerprint-other',v_other_quote,
  '{"schemaVersion":1,"totalCents":1000}'::jsonb,v_other_order);
 IF (SELECT count(*) FROM sabora.catalog_confirmation_attempts
     WHERE table_id=v_table AND request_key='request-atomic')<>2
 OR (SELECT count(DISTINCT order_id) FROM sabora.catalog_confirmation_attempts
     WHERE table_id=v_table AND request_key='request-atomic')<>2
 OR (SELECT count(*) FROM sabora.order_lines WHERE order_id=v_other_order)<>1
 THEN RAISE EXCEPTION 'distinct actor scopes collided or lost kitchen projection'; END IF;
END $scope_isolation$;
-- The same actor may reuse a request key in a distinct basket, but
-- the quote and ledger must both remain scoped to that basket.
DO $basket_isolation$
DECLARE
 v_table uuid;
 v_session uuid;
 v_item uuid;
 v_quote uuid;
 v_order uuid;
BEGIN
 SELECT id,session_id INTO STRICT v_table,v_session
 FROM sabora.dining_tables WHERE number=930101;
 SELECT item_id INTO STRICT v_item
 FROM sabora.catalog_displayed_quotes
 WHERE table_id=v_table AND visit_id='visit-atomic'
  AND basket_id='basket-atomic' AND actor_id='actor-atomic';
 INSERT INTO sabora.catalog_displayed_quotes(
  table_id,session_id,visit_id,basket_id,actor_id,item_id,
  published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
 VALUES(v_table,v_session,'visit-atomic','basket-other','actor-atomic',v_item,
  1,1000,0,1000,'{"schemaVersion":1,"totalCents":1000}'::jsonb,
  now()+interval '5 minutes')
 RETURNING id INTO v_quote;
 INSERT INTO sabora.orders(
  table_id,session_id,company,employee_number,confirmed_at,grouping,items)
 VALUES(v_table,v_session,'CI','basket-isolation',now(),'grouped',
  '[{"category":"main","name":"CI","quantity":1}]'::jsonb)
 RETURNING id INTO v_order;
 INSERT INTO sabora.catalog_confirmation_attempts(
  table_id,session_id,visit_id,basket_id,actor_id,item_id,
  request_key,request_fingerprint,quote_id,economic_evidence,order_id)
 VALUES(v_table,v_session,'visit-atomic','basket-other','actor-atomic',
  v_item,'request-atomic','fingerprint-basket',v_quote,
  '{"schemaVersion":1,"totalCents":1000}'::jsonb,v_order);
 IF (SELECT count(*) FROM sabora.catalog_confirmation_attempts
     WHERE table_id=v_table AND request_key='request-atomic')<>3
 OR (SELECT count(DISTINCT order_id) FROM sabora.catalog_confirmation_attempts
     WHERE table_id=v_table AND request_key='request-atomic')<>3
 OR (SELECT count(*) FROM sabora.order_lines WHERE order_id=v_order)<>1
 THEN RAISE EXCEPTION 'distinct basket scopes collided or lost kitchen projection'; END IF;
END $basket_isolation$;
-- Neither a fabricated acceptance timestamp nor a missing acceptance timestamp
-- may be stored as evidence of a repricing decision.
DO $acceptance_integrity$
DECLARE
 v_table uuid;
 v_session uuid;
 v_item uuid;
 v_quote uuid;
 v_order uuid;
 v_constraint text;
 v_rejected int:=0;
BEGIN
 SELECT id,session_id INTO STRICT v_table,v_session
 FROM sabora.dining_tables WHERE number=930101;
 SELECT item_id,id INTO STRICT v_item,v_quote
 FROM sabora.catalog_displayed_quotes
 WHERE table_id=v_table AND visit_id='visit-atomic'
  AND actor_id='actor-atomic';
 SELECT id INTO STRICT v_order FROM sabora.orders
 WHERE table_id=v_table AND employee_number='atomic';
 FOR i IN 1..2 LOOP
  BEGIN
   INSERT INTO sabora.catalog_confirmation_attempts(
    table_id,session_id,visit_id,basket_id,actor_id,item_id,
    request_key,request_fingerprint,quote_id,economic_evidence,order_id,
    accepted_reprice,accepted_at)
   VALUES(v_table,v_session,'visit-atomic','basket-atomic','actor-atomic',
    v_item,'request-accept-'||i,'fingerprint-accept-'||i,v_quote,
    '{"schemaVersion":1}'::jsonb,v_order,
    i=1,CASE WHEN i=2 THEN now() ELSE NULL END);
   RAISE EXCEPTION 'inconsistent acceptance unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
   GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
   IF v_constraint<>'catalog_confirmation_acceptance_consistency' THEN
    RAISE EXCEPTION 'unexpected acceptance constraint: %',v_constraint;
   END IF;
   v_rejected:=v_rejected+1;
  END;
 END LOOP;
 IF v_rejected<>2 THEN RAISE EXCEPTION 'acceptance negative cases not exercised'; END IF;
END $acceptance_integrity$;
-- Fixture never persists beyond this test.
ROLLBACK;
