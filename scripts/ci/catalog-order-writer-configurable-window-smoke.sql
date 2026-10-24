-- Disposable PostgreSQL 17 only: execute the candidate order CTE against
-- real table constraints and kitchen triggers with a NONDEFAULT grouping window.
-- No live database, runtime grants, or persistent fixture rows.
BEGIN;
INSERT INTO sabora.dining_tables(number,capacity,qr_token_hash,ordering_state,
 grouping_window_seconds)
VALUES (930192,4,decode(repeat('92',32),'hex'),'open',60)
RETURNING id AS table_id,session_id \gset

-- The first order must establish the occupancy timestamp. Reject a fixture
-- that silently used the default 300-second window instead of the requested 60.
SELECT 1 / CASE WHEN grouping_window_seconds=60
 AND first_confirmed_at IS NULL AND ordering_state='open'
 THEN 1 ELSE 0 END AS configurable_window_fixture_verified
 FROM sabora.dining_tables WHERE id=:'table_id' AND session_id=:'session_id'
 FOR UPDATE;
WITH instant AS (SELECT clock_timestamp() AS at),
 created AS (
  INSERT INTO sabora.orders
   (id,table_id,session_id,company,employee_number,
    customer_alias,customer_identifier,customer_visit_key,
    economic_snapshot,confirmed_at,grouping,items)
  SELECT gen_random_uuid(),:'table_id',:'session_id',NULL,NULL,
   'Cliente','SB-23456789ABCD','visit-window',
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
SELECT created.id AS first_order_id,created.grouping AS first_grouping,
 (updated.id IS NOT NULL) AS first_timestamp_written
 FROM created LEFT JOIN updated ON true \gset
SELECT 1 / CASE WHEN :'first_grouping'='first' AND :'first_timestamp_written'='t'
 AND (SELECT first_confirmed_at=confirmed_at FROM sabora.dining_tables t
  CROSS JOIN sabora.orders o WHERE t.id=:'table_id' AND o.id=:'first_order_id')
 THEN 1 ELSE 0 END AS first_order_verified;

-- Put the first timestamp safely INSIDE the configured 60-second window.
UPDATE sabora.dining_tables
 SET first_confirmed_at=clock_timestamp()-interval '30 seconds'
 WHERE id=:'table_id';
SELECT first_confirmed_at AS previous_first,grouping_window_seconds AS window_seconds
 FROM sabora.dining_tables WHERE id=:'table_id' FOR UPDATE \gset
WITH instant AS (SELECT clock_timestamp() AS at),
 created AS (
  INSERT INTO sabora.orders
   (id,table_id,session_id,company,employee_number,
    customer_alias,customer_identifier,customer_visit_key,
    economic_snapshot,confirmed_at,grouping,items)
  SELECT gen_random_uuid(),:'table_id',:'session_id',NULL,NULL,
   'Cliente','SB-23456789ABCD','visit-window',
   '{"schemaVersion":1,"totalCents":1000}'::jsonb,instant.at,
   CASE WHEN :'previous_first'::timestamptz IS NULL THEN 'first'
    WHEN instant.at<:'previous_first'::timestamptz+
     make_interval(secs=>:'window_seconds'::integer)
    THEN 'grouped' ELSE 'late' END,
   '[{"category":"starter","name":"Plato","quantity":1}]'::jsonb
  FROM instant RETURNING id,grouping,confirmed_at
 ), updated AS (
  UPDATE sabora.dining_tables t SET first_confirmed_at=created.confirmed_at
  FROM created WHERE t.id=:'table_id' AND created.grouping='first'
  RETURNING t.id
 )
SELECT created.id AS grouped_order_id,created.grouping AS grouped_grouping,
 (updated.id IS NOT NULL) AS grouped_timestamp_written
 FROM created LEFT JOIN updated ON true \gset
SELECT 1 / CASE WHEN :'grouped_grouping'='grouped'
 AND :'grouped_timestamp_written'='f'
 AND (SELECT first_confirmed_at=:'previous_first'::timestamptz
  FROM sabora.dining_tables WHERE id=:'table_id')
 AND (SELECT count(*)=1 FROM sabora.order_lines WHERE order_id=:'grouped_order_id')
 THEN 1 ELSE 0 END AS grouped_window_verified;

-- Put the timestamp safely OUTSIDE the configured window (61 seconds).
UPDATE sabora.dining_tables
 SET first_confirmed_at=clock_timestamp()-interval '61 seconds'
 WHERE id=:'table_id';
SELECT first_confirmed_at AS previous_first,grouping_window_seconds AS window_seconds
 FROM sabora.dining_tables WHERE id=:'table_id' FOR UPDATE \gset
WITH instant AS (SELECT clock_timestamp() AS at),
 created AS (
  INSERT INTO sabora.orders
   (id,table_id,session_id,company,employee_number,
    customer_alias,customer_identifier,customer_visit_key,
    economic_snapshot,confirmed_at,grouping,items)
  SELECT gen_random_uuid(),:'table_id',:'session_id',NULL,NULL,
   'Cliente','SB-23456789ABCD','visit-window',
   '{"schemaVersion":1,"totalCents":1000}'::jsonb,instant.at,
   CASE WHEN :'previous_first'::timestamptz IS NULL THEN 'first'
    WHEN instant.at<:'previous_first'::timestamptz+
     make_interval(secs=>:'window_seconds'::integer)
    THEN 'grouped' ELSE 'late' END,
   '[{"category":"starter","name":"Plato","quantity":1}]'::jsonb
  FROM instant RETURNING id,grouping,confirmed_at
 ), updated AS (
  UPDATE sabora.dining_tables t SET first_confirmed_at=created.confirmed_at
  FROM created WHERE t.id=:'table_id' AND created.grouping='first'
  RETURNING t.id
 )
SELECT created.id AS late_order_id,created.grouping AS late_grouping,
 (updated.id IS NOT NULL) AS late_timestamp_written
 FROM created LEFT JOIN updated ON true \gset
SELECT 1 / CASE WHEN :'late_grouping'='late'
 AND :'late_timestamp_written'='f'
 AND (SELECT first_confirmed_at=:'previous_first'::timestamptz
  FROM sabora.dining_tables WHERE id=:'table_id')
 AND (SELECT count(*)=1 FROM sabora.order_lines WHERE order_id=:'late_order_id')
 THEN 1 ELSE 0 END AS late_window_verified;
ROLLBACK;

-- The rollback is part of the safety gate, not merely fixture cleanup.
-- psql variables survive the transaction, so assert no order, kitchen line
-- or table fixture remains after the disposable test completes.
SELECT 1 / CASE WHEN
 NOT EXISTS (SELECT 1 FROM sabora.dining_tables WHERE id=:'table_id')
 AND NOT EXISTS (SELECT 1 FROM sabora.orders
  WHERE id IN (:'first_order_id',:'grouped_order_id',:'late_order_id'))
 AND NOT EXISTS (SELECT 1 FROM sabora.order_lines
  WHERE order_id IN (:'first_order_id',:'grouped_order_id',:'late_order_id'))
 THEN 1 ELSE 0 END AS configurable_window_rollback_verified;
