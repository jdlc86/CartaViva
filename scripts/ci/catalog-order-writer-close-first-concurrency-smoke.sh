#!/usr/bin/env bash
set -euo pipefail
# Disposable network-isolated PostgreSQL 17: staff close wins the table lock.
# The order candidate must never acquire an orderable table row after close.
container="${1:?isolated PostgreSQL container required}"
psql_ci(){ docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
table='00000000-0000-4000-8000-000000009421'
staff='00000000-0000-4000-8000-000000009422'
psql_ci <<SQL
INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash,ordering_state)
 VALUES ('$table',9421,4,decode(repeat('95',32),'hex'),'open');
INSERT INTO sabora.staff_members(user_id,role,state)
 VALUES ('$staff','waiter','active');
SQL
close_sql=$(cat <<SQL
BEGIN;
SET LOCAL lock_timeout='12s';
SELECT * FROM sabora.transition_table_ordering_candidate('$staff','$table','closed',NULL);
SELECT pg_sleep(3);
COMMIT;
SQL
)
writer_sql=$(cat <<SQL
BEGIN;
SET LOCAL lock_timeout='12s';
DO \$verify\$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM (
  SELECT id FROM sabora.dining_tables
   WHERE id='$table' AND ordering_state='open' FOR UPDATE
 ) candidate;
 IF n<>0 THEN RAISE EXCEPTION 'writer accepted table after staff close'; END IF;
END \$verify\$;
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$close_sql" &
close_pid=$!
ready=0
for attempt in $(seq 1 80); do
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
 "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then ready=1; break; fi
 if ! kill -0 "$close_pid" 2>/dev/null; then break; fi
 sleep 0.05
done
if [[ "$ready" != 1 ]]; then wait "$close_pid" || true; echo 'staff close did not acquire lock' >&2; exit 1; fi
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$writer_sql" &
writer_pid=$!
blocked=0
for attempt in $(seq 1 80); do
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
 "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%writer accepted table after staff close%' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then blocked=1; break; fi
 sleep 0.05
done
wait "$close_pid"
wait "$writer_pid"
if [[ "$blocked" != 1 ]]; then echo 'writer did not wait for staff close lock' >&2; exit 1; fi
psql_ci <<SQL
DO \$verify\$
BEGIN
 IF EXISTS(SELECT 1 FROM sabora.dining_tables WHERE id='$table' AND ordering_state='open')
 THEN RAISE EXCEPTION 'staff close lost'; END IF;
END \$verify\$;
SQL
echo 'PASS: staff close first blocks writer, and closed table is not orderable'
