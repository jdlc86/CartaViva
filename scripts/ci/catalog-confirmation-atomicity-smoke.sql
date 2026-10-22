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
 AND NOT EXISTS (SELECT 1 FROM sabora.catalog_confirmation_attempts
  WHERE table_id=:'table_id' AND request_key='request-atomic')
 THEN 1 ELSE 0 END AS rollback_atomicity_verified;
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
 THEN 1 ELSE 0 END AS committed_pair_verified;
-- Fixture never persists beyond this test.
ROLLBACK;
