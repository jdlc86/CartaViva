-- Exercise the actual candidate order-writer INSERT/UPDATE CTE on isolated PG17.
-- No runtime grants, no live connection. All fixture changes rolled back.
BEGIN;
INSERT INTO sabora.dining_tables(number,capacity,qr_token_hash,ordering_state)
 VALUES (930191,4,decode(repeat('91',32),'hex'),'open')
 RETURNING id AS table_id,session_id \gset
INSERT INTO sabora.catalog_items(draft) VALUES ('{}'::jsonb)
 RETURNING id AS item_id \gset
INSERT INTO sabora.catalog_displayed_quotes(
 table_id,session_id,visit_id,basket_id,actor_id,item_id,
 published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
VALUES (:'table_id',:'session_id','visit-writer','basket-writer','actor-writer',
 :'item_id',1,1000,0,1000,'{"schemaVersion":1,"totalCents":1000}'::jsonb,
 now()+interval '5 minutes')
 RETURNING id AS quote_id \gset

-- Match the writer's SELECT ... FOR UPDATE and INSERT ... CTE.
SELECT grouping_window_seconds AS window_seconds
 FROM sabora.dining_tables
 WHERE id=:'table_id' AND session_id=:'session_id'
 AND ordering_state='open'
 FOR UPDATE \gset
WITH instant AS (SELECT clock_timestamp() AS at),
 created AS (
  INSERT INTO sabora.orders
   (id,table_id,session_id,company,employee_number,
    customer_alias,customer_identifier,customer_visit_key,
    economic_snapshot,confirmed_at,grouping,items)
  SELECT gen_random_uuid(),:'table_id',:'session_id',NULL,NULL,
   'Cliente','SB-23456789ABCD','visit-writer',
   '{"schemaVersion":1,"totalCents":1000}'::jsonb,instant.at,
   'first',
   '[{"category":"starter","name":"Plato","quantity":1}]'::jsonb
  FROM instant
  RETURNING id,grouping,confirmed_at
 ), updated AS (
  UPDATE sabora.dining_tables t SET first_confirmed_at=created.confirmed_at
   FROM created WHERE t.id=:'table_id' AND created.grouping='first'
  RETURNING t.id
 )
SELECT created.id AS first_order_id,created.grouping AS first_grouping
 FROM created LEFT JOIN updated ON true \gset

SELECT 1 / CASE WHEN :'first_grouping'='first'
 AND (SELECT first_confirmed_at IS NOT NULL FROM sabora.dining_tables
      WHERE id=:'table_id')
 AND (SELECT count(*) FROM sabora.order_lines WHERE order_id=:'first_order_id')=1
 THEN 1 ELSE 0 END AS first_order_verified;

-- Subsequent orders within the five-minute window must group.
WITH instant AS (SELECT clock_timestamp() AS at),
 created AS (
  INSERT INTO sabora.orders
   (id,table_id,session_id,company,employee_number,
    customer_alias,customer_identifier,customer_visit_key,
    economic_snapshot,confirmed_at,grouping,items)
  SELECT gen_random_uuid(),:'table_id',:'session_id',NULL,NULL,
   'Cliente','SB-23456789ABCD','visit-writer',
   '{"schemaVersion":1,"totalCents":1000}'::jsonb,instant.at,
   CASE WHEN t.first_confirmed_at IS NULL THEN 'first'
    WHEN instant.at<t.first_confirmed_at+
     make_interval(secs=>t.grouping_window_seconds)
    THEN 'grouped' ELSE 'late' END,
   '[{"category":"starter","name":"Plato","quantity":1}]'::jsonb
  FROM instant CROSS JOIN sabora.dining_tables t WHERE t.id=:'table_id'
  RETURNING id,grouping,confirmed_at
 ), updated AS (
  UPDATE sabora.dining_tables t SET first_confirmed_at=created.confirmed_at
   FROM created WHERE t.id=:'table_id' AND created.grouping='first'
  RETURNING t.id
 )
SELECT created.id AS grouped_order_id,created.grouping AS grouped_grouping
 FROM created LEFT JOIN updated ON true \gset
SELECT 1 / CASE WHEN :'grouped_grouping'='grouped'
 AND (SELECT count(*) FROM sabora.order_lines WHERE order_id=:'grouped_order_id')=1
 THEN 1 ELSE 0 END AS grouped_order_verified;

-- Ledger failure must roll back the newly created order and kitchen line.
SAVEPOINT before_failed_confirmation;
INSERT INTO sabora.orders
 (table_id,session_id,company,employee_number,customer_alias,
  customer_identifier,customer_visit_key,economic_snapshot,
  confirmed_at,grouping,items)
VALUES (:'table_id',:'session_id',NULL,NULL,'Cliente','SB-23456789ABCD',
 'visit-writer','{"schemaVersion":1,"totalCents":1000}'::jsonb,
 clock_timestamp(),'grouped',
 '[{"category":"starter","name":"Plato","quantity":1}]'::jsonb)
RETURNING id AS failed_order_id \gset
ROLLBACK TO SAVEPOINT before_failed_confirmation;
SELECT 1 / CASE WHEN
 NOT EXISTS(SELECT 1 FROM sabora.orders WHERE id=:'failed_order_id')
 AND NOT EXISTS(SELECT 1 FROM sabora.order_lines WHERE order_id=:'failed_order_id')
 THEN 1 ELSE 0 END AS failed_order_rollback_verified;
ROLLBACK;
