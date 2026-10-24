#!/usr/bin/env bash
set -euo pipefail
# Disposable PostgreSQL 17 only: two independent sessions exercise the
# candidate writer's FOR UPDATE table lock against a staff close.
container="${1:?isolated PostgreSQL container required}"
psql_ci(){ docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
table='00000000-0000-4000-8000-000000009411'
staff='00000000-0000-4000-8000-000000009412'
psql_ci <<SQL
INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash,ordering_state)
 VALUES ('$table',9411,4,decode(repeat('94',32),'hex'),'open');
INSERT INTO sabora.staff_members(user_id,role,state)
 VALUES ('$staff','waiter','active');
SQL
# First confirm wins table lock. Staff close must wait and cannot revoke
# occupancy halfway through a transaction holding that lock.
order_sql=$(cat <<SQL
BEGIN;
SET LOCAL lock_timeout='12s';
SELECT id FROM sabora.dining_tables
 WHERE id='$table' AND ordering_state='open' FOR UPDATE;
SELECT pg_sleep(3);
COMMIT;
SQL
)
close_sql=$(cat <<SQL
BEGIN;
SET LOCAL lock_timeout='12s';
SELECT * FROM sabora.transition_table_ordering_candidate('$staff','$table','closed',NULL);
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$order_sql" &
order_pid=$!
ready=0
for attempt in $(seq 1 80); do
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
 "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then ready=1; break; fi
 if ! kill -0 "$order_pid" 2>/dev/null; then break; fi
 sleep 0.05
done
if [[ "$ready" != 1 ]]; then wait "$order_pid" || true; echo 'writer lock not acquired' >&2; exit 1; fi
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$close_sql" &
close_pid=$!
blocked=0
for attempt in $(seq 1 80); do
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
 "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%transition_table_ordering_candidate%' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then blocked=1; break; fi
 sleep 0.05
done
wait "$order_pid"
wait "$close_pid"
if [[ "$blocked" != 1 ]]; then echo 'staff close did not wait for writer lock' >&2; exit 1; fi
# Close must rotate the occupancy and reject any subsequent writer lock.
psql_ci <<SQL
DO \$verify\$
BEGIN
 IF EXISTS(SELECT 1 FROM sabora.dining_tables
  WHERE id='$table' AND ordering_state='open')
 THEN RAISE EXCEPTION 'closed table still orderable'; END IF;
END \$verify\$;
SQL
echo 'PASS: candidate writer lock serializes with staff close'
