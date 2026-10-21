#!/usr/bin/env bash
set -euo pipefail
# Only disposable PostgreSQL 17 CI container. No operational connections.
container="${1:?isolated CI container required}"
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/ci/customer-session-concurrency-fixture.sql
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# Two independent transactions contend for the same row. Exactly one UPDATE wins.
for n in 1 2; do
 (
  docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -At <<'SQL' > "$tmp/$n"
BEGIN;
SELECT pg_sleep(0.15);
WITH changed AS (
 UPDATE sabora.customer_sessions SET revoked_at=now()
 WHERE token_hash=decode(repeat('c4',32),'hex')
 AND revoked_at IS NULL AND expires_at>now()
 RETURNING id
)
SELECT count(*) FROM changed;
COMMIT;
SQL
 ) &
done
wait
for n in 1 2; do
 test "$(grep -E '^1$' "$tmp/$n" | wc -l)" -le 1
done
wins="$(cat "$tmp/1" "$tmp/2" | grep -E '^1$' | wc -l)"
test "$wins" -eq 1 || { echo "Expected exactly one successful revocation, got $wins" >&2; exit 1; }
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atqc "
SELECT count(*) FROM sabora.customer_sessions
WHERE token_hash=decode(repeat('c4',32),'hex') AND revoked_at IS NOT NULL" | grep -qx '1'
