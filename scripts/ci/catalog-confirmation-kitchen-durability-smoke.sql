-- Disposable PG17 only. Prove that a confirmed order's kitchen projection
-- is durable within the transaction, and that a failed confirmation leaves
-- neither an order nor an orphan kitchen line.
BEGIN;
INSERT INTO sabora.dining_tables(number,capacity,qr_token_hash,ordering_state)
 VALUES (930292,4,decode(repeat('a2',32),'hex'),'open')
 RETURNING id AS table_id,session_id \gset
INSERT INTO sabora.catalog_items(draft) VALUES ('{}'::jsonb)
 RETURNING id AS item_id \gset
INSERT INTO sabora.catalog_displayed_quotes(
 table_id,session_id,visit_id,basket_id,actor_id,item_id,
 published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
VALUES (:'table_id',:'session_id','visit-kitchen','basket-kitchen','actor-kitchen',
 :'item_id',1,1000,0,1000,'{"schemaVersion":1,"totalCents":1000}'::jsonb,
 clock_timestamp()+interval '5 minutes')
 RETURNING id AS quote_id \gset
-- One accepted order produces one kitchen line, and one economic ledger entry.
INSERT INTO sabora.orders(
 table_id,session_id,company,employee_number,customer_alias,
 customer_identifier,customer_visit_key,economic_snapshot,
 confirmed_at,grouping,items)
VALUES (:'table_id',:'session_id',NULL,NULL,'Cliente','SB-23456789ABCD',
 'visit-kitchen','{"schemaVersion":1,"totalCents":1000}'::jsonb,
 clock_timestamp(),'first',
 '[{"category":"main","name":"Plato confirmado","quantity":1}]'::jsonb)
 RETURNING id AS confirmed_order_id \gset
INSERT INTO sabora.catalog_confirmation_attempts(
 table_id,session_id,visit_id,basket_id,actor_id,item_id,
 request_key,request_fingerprint,quote_id,economic_evidence,order_id)
VALUES (:'table_id',:'session_id','visit-kitchen','basket-kitchen','actor-kitchen',
 :'item_id','kitchen-key-01','fingerprint-kitchen-01',:'quote_id',
 '{"schemaVersion":1,"totalCents":1000}'::jsonb,:'confirmed_order_id');
SELECT 1 / CASE WHEN
 (SELECT count(*) FROM sabora.orders WHERE id=:'confirmed_order_id')=1
 AND (SELECT count(*) FROM sabora.order_lines WHERE order_id=:'confirmed_order_id')=1
 AND (SELECT count(*) FROM sabora.catalog_confirmation_attempts
      WHERE order_id=:'confirmed_order_id')=1
 THEN 1 ELSE 0 END AS kitchen_projection_created;
-- An idempotent replay must return the existing order, not insert another.
SELECT order_id AS replayed_order_id
 FROM sabora.catalog_confirmation_attempts
 WHERE table_id=:'table_id' AND session_id=:'session_id'
 AND visit_id='visit-kitchen' AND basket_id='basket-kitchen'
 AND actor_id='actor-kitchen' AND request_key='kitchen-key-01'
 \gset
SELECT 1 / CASE WHEN :'replayed_order_id'=:'confirmed_order_id'
 AND (SELECT count(*) FROM sabora.order_lines WHERE order_id=:'confirmed_order_id')=1
 THEN 1 ELSE 0 END AS kitchen_replay_deduplicated;
-- Simulate a failed ledger insert in a subtransaction. The order trigger's
-- kitchen line must be rolled back along with the rejected duplicate order.
DO $failed$
DECLARE
 v_order uuid;
 v_table uuid;
 v_session uuid;
 v_item uuid;
 v_quote uuid;
 v_before_orders bigint;
 v_before_lines bigint;
 v_rejected boolean:=false;
BEGIN
 SELECT id,session_id INTO STRICT v_table,v_session FROM sabora.dining_tables WHERE number=930292;
 SELECT id,item_id INTO STRICT v_quote,v_item FROM sabora.catalog_displayed_quotes WHERE table_id=v_table AND visit_id='visit-kitchen';
 SELECT count(*) INTO v_before_orders FROM sabora.orders WHERE table_id=v_table;
 SELECT count(*) INTO v_before_lines FROM sabora.order_lines l
 JOIN sabora.orders o ON o.id=l.order_id WHERE o.table_id=v_table;
 BEGIN
  INSERT INTO sabora.orders(
   table_id,session_id,company,employee_number,customer_alias,
   customer_identifier,customer_visit_key,economic_snapshot,
   confirmed_at,grouping,items)
  VALUES (v_table,v_session,NULL,NULL,
   'Cliente','SB-23456789ABCD','visit-kitchen',
   '{"schemaVersion":1,"totalCents":1000}'::jsonb,clock_timestamp(),'grouped',
   '[{"category":"main","name":"Duplicado","quantity":1}]'::jsonb)
  RETURNING id INTO v_order;
  INSERT INTO sabora.catalog_confirmation_attempts(
   table_id,session_id,visit_id,basket_id,actor_id,item_id,
   request_key,request_fingerprint,quote_id,economic_evidence,order_id)
  VALUES (v_table,v_session,'visit-kitchen','basket-kitchen',
   'actor-kitchen',v_item,'kitchen-key-01','fingerprint-kitchen-01',
   v_quote,'{"schemaVersion":1,"totalCents":1000}'::jsonb,v_order);
 EXCEPTION WHEN unique_violation THEN
  v_rejected:=true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'duplicate confirmation accepted'; END IF;
 IF (SELECT count(*) FROM sabora.orders WHERE table_id=v_table)<>v_before_orders
 OR (SELECT count(*) FROM sabora.order_lines l
     JOIN sabora.orders o ON o.id=l.order_id
     WHERE o.table_id=v_table)<>v_before_lines
 THEN RAISE EXCEPTION 'duplicate confirmation leaked kitchen projection'; END IF;
END $failed$;
-- All fixture writes are rolled back; no runtime grants or provisioning.
ROLLBACK;
