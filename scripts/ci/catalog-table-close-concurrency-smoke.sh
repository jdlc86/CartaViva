#!/usr/bin/env bash
set -euo pipefail
# Disposable PostgreSQL 17 only. Two independent connections prove the table
# lock serializes a customer authorization read against staff close.
container="${1:?isolated PostgreSQL container required}"
psql_ci(){ docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
table=00000000-0000-4000-8000-000000009201
staff=00000000-0000-4000-8000-000000009202
psql_ci <<SQL
INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash,ordering_state)
VALUES ('$table',9201,4,decode(repeat('99',32),'hex'),'open');
INSERT INTO sabora.staff_members(user_id,role,state)
VALUES ('$staff','waiter','active');
SQL
# The customer transaction holds FOR SHARE on the table until it commits.
# A staff close needs FOR UPDATE and must wait for that transaction.
customer_sql=$(cat <<SQL
BEGIN;
SELECT id FROM sabora.dining_tables
 WHERE id='$table' AND ordering_state='open' FOR SHARE;
SELECT pg_sleep(3);
COMMIT;
SQL
)
staff_sql=$(cat <<SQL
BEGIN;
SET LOCAL lock_timeout='10s';
SELECT * FROM sabora.transition_table_ordering_candidate('$staff','$table','closed',NULL);
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$customer_sql" &
customer_pid=$!
ready=0
for attempt in $(seq 1 70); do
 if ! kill -0 "$customer_pid" 2>/dev/null; then break; fi
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then ready=1; break; fi
 sleep 0.05
done
if [[ "$ready" != 1 ]]; then
 wait "$customer_pid" || true
 echo 'Customer transaction did not acquire table share lock' >&2
 exit 1
fi
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$staff_sql" &
staff_pid=$!
# Confirm staff transaction is blocked by the customer-held table lock.
blocked=0
for attempt in $(seq 1 60); do
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%transition_table_ordering_candidate%' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then blocked=1; break; fi
 sleep 0.05
done
wait "$customer_pid"
wait "$staff_pid"
if [[ "$blocked" != 1 ]]; then
 echo 'Staff close did not demonstrate lock wait against customer transaction' >&2
 exit 1
fi
psql_ci <<SQL
DO \$verify\$
DECLARE state text; v_session uuid;
BEGIN
 SELECT ordering_state,session_id INTO state,v_session
 FROM sabora.dining_tables WHERE id='$table';
 IF state<>'closed' THEN RAISE EXCEPTION 'table close lost'; END IF;
 IF EXISTS(SELECT 1 FROM sabora.dining_tables
  WHERE id='$table' AND ordering_state='open')
 THEN RAISE EXCEPTION 'closed table still orderable'; END IF;
END \$verify\$;
SQL
echo 'PASS: customer table share lock serializes against staff close'
