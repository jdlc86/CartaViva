#!/usr/bin/env bash
set -euo pipefail
# Two independent connections to the disposable network-isolated PG17.
# A confirmation's FOR SHARE profile lock must serialize profile updates.
container="${1:?disposable PostgreSQL container required}"
psql_ci(){ docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
profile='00000000-0000-4000-8000-000000009451'
psql_ci <<SQL
INSERT INTO sabora.customer_profiles(id,public_id,alias)
 VALUES ('$profile','SB-23456789ABCD','Antes');
SQL
reader_sql=$(cat <<SQL
BEGIN;
SET LOCAL lock_timeout='12s';
SELECT alias FROM sabora.customer_profiles WHERE id='$profile' FOR SHARE;
SELECT pg_sleep(3);
COMMIT;
SQL
)
editor_sql=$(cat <<SQL
BEGIN;
SET LOCAL lock_timeout='12s';
UPDATE sabora.customer_profiles SET alias='Despues',updated_at=clock_timestamp()
 WHERE id='$profile';
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$reader_sql" &
reader_pid=$!
ready=0
for attempt in $(seq 1 80); do
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then ready=1; break; fi
 if ! kill -0 "$reader_pid" 2>/dev/null; then break; fi
 sleep 0.05
done
if [[ "$ready" != 1 ]]; then wait "$reader_pid" || true; echo 'profile reader lock not acquired' >&2; exit 1; fi
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$editor_sql" &
editor_pid=$!
blocked=0
for attempt in $(seq 1 80); do
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%UPDATE sabora.customer_profiles%' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then blocked=1; break; fi
 if ! kill -0 "$editor_pid" 2>/dev/null; then break; fi
 sleep 0.05
done
wait "$reader_pid"
wait "$editor_pid"
if [[ "$blocked" != 1 ]]; then echo 'profile edit did not wait for confirmation lock' >&2; exit 1; fi
psql_ci <<SQL
DO \$verify\$
BEGIN
 IF (SELECT alias FROM sabora.customer_profiles WHERE id='$profile') <> 'Despues'
 THEN RAISE EXCEPTION 'profile edit not committed after reader'; END IF;
END \$verify\$;
SQL
echo 'PASS: locked customer identity serializes with profile edit'
