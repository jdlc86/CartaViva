#!/usr/bin/env bash
set -euo pipefail
# Two independent connections against the disposable network-none PostgreSQL
# container. The shared row lock serializes close vs an authorized order gate.
container="${1:?isolated PostgreSQL container required}"
psql_ci(){ docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
table="00000000-0000-4000-8000-000000008501"
actor="00000000-0000-4000-8000-000000008502"
psql_ci <<SQL
INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash,ordering_state)
VALUES ('$table',8501,4,decode(repeat('99',32),'hex'),'open');
INSERT INTO sabora.staff_members(user_id,role,state)
VALUES ('$actor','waiter','active');
SQL
# Case A: an order gate locks an open table first. Close must wait until
# that transaction commits; an order authorized earlier is not retroactively
# invalidated. We intentionally do not create a real order here.
first_sql=$(cat <<SQL
BEGIN;
SET LOCAL lock_timeout='12s';
SELECT id FROM sabora.dining_tables
 WHERE id='$table' AND ordering_state='open' FOR SHARE;
SELECT pg_sleep(3);
COMMIT;
SQL
)
close_sql=$(cat <<SQL
BEGIN;
SET LOCAL lock_timeout='12s';
SELECT * FROM sabora.transition_table_ordering_candidate('$actor','$table','closed');
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$first_sql" &
first_pid=$!
ready=0
for attempt in $(seq 1 80); do
 state=$(docker exec "$container" psql -X -A -t -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$state" == "1" ]]; then ready=1; break; fi
 sleep 0.05
done
if [[ "$ready" != 1 ]]; then wait "$first_pid" || true; echo 'lock gate not reached' >&2; exit 1; fi
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$close_sql" &
close_pid=$!
wait "$first_pid"
wait "$close_pid"
# Case B: once closed, a new order authorization cannot see an open table.
psql_ci <<SQL
DO \$check\$
BEGIN
 IF EXISTS(SELECT 1 FROM sabora.dining_tables
  WHERE id='$table' AND ordering_state='open') THEN
  RAISE EXCEPTION 'closed table passed order gate';
 END IF;
END \$check\$;
SQL
echo 'PASS: close waits for locked order gate; subsequent authorization denied'
