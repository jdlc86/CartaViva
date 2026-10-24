#!/usr/bin/env bash
set -euo pipefail
# PostgreSQL 17 disposable CI container only. Independent sessions must
# serialize the exact advisory lock used by the confirmation read adapter.
container="${1:?isolated PostgreSQL container required}"
scope='["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","visit-ci","basket-ci","actor-ci","request-001"]'
key_sql="hashtextextended('$scope',0)"
# The first transaction holds its advisory lock while simulating an insert.
first_sql=$(cat <<SQL
BEGIN;
SELECT pg_advisory_xact_lock($key_sql);
SELECT pg_sleep(4);
COMMIT;
SQL
)
second_sql=$(cat <<SQL
BEGIN;
SET LOCAL lock_timeout='10s';
SELECT pg_advisory_xact_lock($key_sql);
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$first_sql" &
first_pid=$!
ready=0
for attempt in $(seq 1 70); do
 if ! kill -0 "$first_pid" 2>/dev/null; then break; fi
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(4)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then ready=1; break; fi
 sleep 0.05
done
if [[ "$ready" != 1 ]]; then
 wait "$first_pid" || true
 echo 'First confirmation did not acquire advisory transaction lock' >&2
 exit 1
fi
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$second_sql" &
second_pid=$!
blocked=0
for attempt in $(seq 1 60); do
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then blocked=1; break; fi
 sleep 0.05
done
wait "$first_pid"
wait "$second_pid"
if [[ "$blocked" != 1 ]]; then
 echo 'Second confirmation did not wait for scoped advisory transaction lock' >&2
 exit 1
fi
# Transaction locks are released after commit and do not persist as session locks.
docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
 "SELECT pg_try_advisory_xact_lock($key_sql)" | grep -qx t
echo 'PASS: concurrent confirmation requests serialize on scoped advisory lock'

# Reverse outcome: an aborted first confirmation must release the same
# transaction-scoped lock so a waiting retry can proceed without stale claims.
rollback_first_sql=$(cat <<SQL
BEGIN;
SELECT pg_advisory_xact_lock($key_sql);
SELECT pg_sleep(4);
ROLLBACK;
SQL
)
retry_after_rollback_sql=$(cat <<SQL
BEGIN;
SET LOCAL lock_timeout='10s';
SELECT pg_advisory_xact_lock($key_sql);
SELECT pg_try_advisory_xact_lock($key_sql);
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$rollback_first_sql" &
rollback_pid=$!
rollback_ready=0
for attempt in $(seq 1 70); do
 if ! kill -0 "$rollback_pid" 2>/dev/null; then break; fi
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(4)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then rollback_ready=1; break; fi
 sleep 0.05
done
if [[ "$rollback_ready" != 1 ]]; then
 wait "$rollback_pid" || true
 echo 'Aborted confirmation did not acquire advisory transaction lock' >&2
 exit 1
fi
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$retry_after_rollback_sql" &
retry_pid=$!
retry_blocked=0
for attempt in $(seq 1 60); do
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then retry_blocked=1; break; fi
 sleep 0.05
done
wait "$rollback_pid"
wait "$retry_pid"
if [[ "$retry_blocked" != 1 ]]; then
 echo 'Retry did not wait for aborted confirmation transaction lock' >&2
 exit 1
fi
docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
 "SELECT pg_try_advisory_xact_lock($key_sql)" | grep -qx t
echo 'PASS: aborted confirmation releases advisory lock for waiting retry'

# Distinct idempotency scopes must not serialize each other. This guards
# against accidentally replacing the scoped advisory lock with a global one.
different_scope='["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","visit-ci","basket-ci","actor-ci","request-002"]'
different_key_sql="hashtextextended('$different_scope',0)"
holder_sql=$(cat <<SQL
BEGIN;
SELECT pg_advisory_xact_lock($key_sql);
SELECT pg_sleep(3);
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$holder_sql" &
holder_pid=$!
ready=0
for attempt in $(seq 1 70); do
 if ! kill -0 "$holder_pid" 2>/dev/null; then break; fi
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then ready=1; break; fi
 sleep 0.05
done
if [[ "$ready" != 1 ]]; then
 wait "$holder_pid" || true
 echo 'Independent-scope holder did not acquire lock' >&2
 exit 1
fi
independent=$(docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
BEGIN;
SET LOCAL lock_timeout='1s';
SELECT pg_try_advisory_xact_lock($different_key_sql);
COMMIT;
SQL
)
# Confirm the holder is still active: otherwise try-lock could pass only
# because the first transaction had already committed.
if ! kill -0 "$holder_pid" 2>/dev/null; then
 echo 'Independent scope probe raced past the holder transaction' >&2
 wait "$holder_pid" || true
 exit 1
fi
wait "$holder_pid"
if [[ "$(printf '%s' "$independent" | tr -d '[:space:]')" != t ]]; then
 echo 'Independent idempotency scope unexpectedly blocked' >&2
 exit 1
fi
echo 'PASS: distinct request keys do not share the same advisory transaction lock'

# The request key alone must not become the global lock identity:
# the same key in another basket is an independent scope.
basket_scope='["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","visit-ci","basket-other","actor-ci","request-001"]'
basket_key_sql="hashtextextended('$basket_scope',0)"
basket_holder_sql=$(cat <<SQL
BEGIN;
SELECT pg_advisory_xact_lock($key_sql);
SELECT pg_sleep(3);
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$basket_holder_sql" &
basket_holder_pid=$!
basket_ready=0
for attempt in $(seq 1 70); do
 if ! kill -0 "$basket_holder_pid" 2>/dev/null; then break; fi
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then basket_ready=1; break; fi
 sleep 0.05
done
if [[ "$basket_ready" != 1 ]]; then
 wait "$basket_holder_pid" || true
 echo 'Basket-scope holder did not acquire lock' >&2
 exit 1
fi
basket_independent=$(docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
BEGIN;
SET LOCAL lock_timeout='1s';
SELECT pg_try_advisory_xact_lock($basket_key_sql);
COMMIT;
SQL
)
# Confirm the holder is still active: otherwise try-lock could pass only
# because the first transaction had already committed.
if ! kill -0 "$basket_holder_pid" 2>/dev/null; then
 echo 'Independent scope probe raced past the holder transaction' >&2
 wait "$basket_holder_pid" || true
 exit 1
fi
wait "$basket_holder_pid"
if [[ "$(printf '%s' "$basket_independent" | tr -d '[:space:]')" != t ]]; then
 echo 'Distinct basket with reused request key unexpectedly blocked' >&2
 exit 1
fi
echo 'PASS: reused request key in a different basket has an independent advisory lock'

# A distinct actor using the same basket and request key must also remain
# independent; the ledger's unique scope includes actor identity.
actor_scope='["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","visit-ci","basket-ci","actor-other","request-001"]'
actor_key_sql="hashtextextended('$actor_scope',0)"
actor_holder_sql=$(cat <<SQL
BEGIN;
SELECT pg_advisory_xact_lock($key_sql);
SELECT pg_sleep(3);
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$actor_holder_sql" &
actor_holder_pid=$!
actor_ready=0
for attempt in $(seq 1 70); do
 if ! kill -0 "$actor_holder_pid" 2>/dev/null; then break; fi
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then actor_ready=1; break; fi
 sleep 0.05
done
if [[ "$actor_ready" != 1 ]]; then
 wait "$actor_holder_pid" || true
 echo 'Actor-scope holder did not acquire lock' >&2
 exit 1
fi
actor_independent=$(docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
BEGIN;
SET LOCAL lock_timeout='1s';
SELECT pg_try_advisory_xact_lock($actor_key_sql);
COMMIT;
SQL
)
# Confirm the holder is still active: otherwise try-lock could pass only
# because the first transaction had already committed.
if ! kill -0 "$actor_holder_pid" 2>/dev/null; then
 echo 'Independent scope probe raced past the holder transaction' >&2
 wait "$actor_holder_pid" || true
 exit 1
fi
wait "$actor_holder_pid"
if [[ "$(printf '%s' "$actor_independent" | tr -d '[:space:]')" != t ]]; then
 echo 'Distinct actor with reused request key unexpectedly blocked' >&2
 exit 1
fi
echo 'PASS: distinct actors sharing basket and request key have independent advisory locks'

# Actor identity is part of the scope as well: a different participant in
# the same basket may legitimately reuse the client-generated request key.
actor_scope='["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","visit-ci","basket-ci","actor-other","request-001"]'
actor_key_sql="hashtextextended('$actor_scope',0)"
actor_holder_sql=$(cat <<SQL
BEGIN;
SELECT pg_advisory_xact_lock($key_sql);
SELECT pg_sleep(3);
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$actor_holder_sql" &
actor_holder_pid=$!
actor_ready=0
for attempt in $(seq 1 70); do
 if ! kill -0 "$actor_holder_pid" 2>/dev/null; then break; fi
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then actor_ready=1; break; fi
 sleep 0.05
done
if [[ "$actor_ready" != 1 ]]; then
 wait "$actor_holder_pid" || true
 echo 'Actor-scope holder did not acquire lock' >&2
 exit 1
fi
actor_independent=$(docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
BEGIN;
SET LOCAL lock_timeout='1s';
SELECT pg_try_advisory_xact_lock($actor_key_sql);
COMMIT;
SQL
)
wait "$actor_holder_pid"
if [[ "$(printf '%s' "$actor_independent" | tr -d '[:space:]')" != t ]]; then
 echo 'Distinct actor with reused request key unexpectedly blocked' >&2
 exit 1
fi
echo 'PASS: reused request key by another actor has an independent advisory lock'

# A different visit on the same physical table must not inherit the old
# visit's request-key lock after table turnover.
visit_scope='["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","visit-other","basket-ci","actor-ci","request-001"]'
visit_key_sql="hashtextextended('$visit_scope',0)"
visit_holder_sql=$(cat <<SQL
BEGIN;
SELECT pg_advisory_xact_lock($key_sql);
SELECT pg_sleep(3);
COMMIT;
SQL
)
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$visit_holder_sql" &
visit_holder_pid=$!
visit_ready=0
for attempt in $(seq 1 70); do
 if ! kill -0 "$visit_holder_pid" 2>/dev/null; then break; fi
 n=$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$n" == 1 ]]; then visit_ready=1; break; fi
 sleep 0.05
done
if [[ "$visit_ready" != 1 ]]; then
 wait "$visit_holder_pid" || true
 echo 'Visit-scope holder did not acquire lock' >&2
 exit 1
fi
visit_independent=$(docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
BEGIN;
SET LOCAL lock_timeout='1s';
SELECT pg_try_advisory_xact_lock($visit_key_sql);
COMMIT;
SQL
)
# Confirm the holder is still active: otherwise try-lock could pass only
# because the first transaction had already committed.
if ! kill -0 "$visit_holder_pid" 2>/dev/null; then
 echo 'Independent scope probe raced past the holder transaction' >&2
 wait "$visit_holder_pid" || true
 exit 1
fi
wait "$visit_holder_pid"
if [[ "$(printf '%s' "$visit_independent" | tr -d '[:space:]')" != t ]]; then
 echo 'Distinct visit with reused request key unexpectedly blocked' >&2
 exit 1
fi
echo 'PASS: request key reused by another visit has an independent advisory lock'
