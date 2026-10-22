#!/usr/bin/env bash
set -euo pipefail
# Disposable PG17 only. Two independent first confirmations must serialize
# on the same table row and produce one first and one grouped order.
container="${1:?isolated PostgreSQL container required}"
table='00000000-0000-4000-8000-000000009461'
session='00000000-0000-4000-8000-000000009462'
first='00000000-0000-4000-8000-000000009463'
second='00000000-0000-4000-8000-000000009464'
psql_ci(){ docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_ci <<SQL
INSERT INTO sabora.dining_tables(id,session_id,number,capacity,qr_token_hash,ordering_state)
VALUES ('$table','$session',9461,4,decode(repeat('96',32),'hex'),'open');
SQL
# Match the candidate writer's lock + insert/update CTE on separate connections.
order_sql(){
 local id="$1" pause="$2"
 cat <<SQL
BEGIN;
SET LOCAL lock_timeout='12s';
SELECT first_confirmed_at,grouping_window_seconds
 FROM sabora.dining_tables WHERE id='$table' AND session_id='$session'
 AND ordering_state='open' FOR UPDATE;
SELECT pg_sleep($pause);
WITH instant AS (SELECT clock_timestamp() AS at),
 created AS (
  INSERT INTO sabora.orders
   (id,table_id,session_id,company,employee_number,customer_alias,
    customer_identifier,customer_visit_key,economic_snapshot,confirmed_at,grouping,items)
  SELECT '$id','$table','$session',NULL,NULL,'Cliente','SB-23456789ABCD',
   'visit-concurrent','{"schemaVersion":1,"totalCents":1000}'::jsonb,instant.at,
   CASE WHEN t.first_confirmed_at IS NULL THEN 'first'
    WHEN instant.at<t.first_confirmed_at+make_interval(secs=>t.grouping_window_seconds)
    THEN 'grouped' ELSE 'late' END,
   '[{"category":"starter","name":"Plato","quantity":1}]'::jsonb
  FROM instant CROSS JOIN sabora.dining_tables t WHERE t.id='$table'
  RETURNING id,grouping,confirmed_at
 ), updated AS (
  UPDATE sabora.dining_tables t SET first_confirmed_at=created.confirmed_at
  FROM created WHERE t.id='$table' AND created.grouping='first'
  RETURNING t.id
 )
SELECT created.id,created.grouping,(updated.id IS NOT NULL)
 FROM created LEFT JOIN updated ON true;
COMMIT;
SQL
}
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$(order_sql "$first" 3)" &
first_pid=$!
ready=0
for attempt in $(seq 1 80); do
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
 "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then ready=1; break; fi
 if ! kill -0 "$first_pid" 2>/dev/null; then break; fi
 sleep 0.05
done
if [[ "$ready" != 1 ]]; then wait "$first_pid" || true; echo 'first order did not acquire lock' >&2; exit 1; fi
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$(order_sql "$second" 0)" &
second_pid=$!
blocked=0
for attempt in $(seq 1 80); do
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
 "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%first_confirmed_at,grouping_window_seconds%' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then blocked=1; break; fi
 sleep 0.05
done
wait "$first_pid"
wait "$second_pid"
if [[ "$blocked" != 1 ]]; then echo 'second order did not wait for first lock' >&2; exit 1; fi
psql_ci <<SQL
DO \$verify\$
BEGIN
 IF (SELECT grouping FROM sabora.orders WHERE id='$first')<>'first'
 OR (SELECT grouping FROM sabora.orders WHERE id='$second')<>'grouped'
 OR (SELECT first_confirmed_at FROM sabora.dining_tables WHERE id='$table')
    IS DISTINCT FROM (SELECT confirmed_at FROM sabora.orders WHERE id='$first')
 OR (SELECT count(*) FROM sabora.order_lines WHERE order_id IN ('$first','$second'))<>2
 THEN RAISE EXCEPTION 'concurrent first/grouped invariant failed'; END IF;
END \$verify\$;
SQL
echo 'PASS: concurrent first orders serialize into first/grouped'
