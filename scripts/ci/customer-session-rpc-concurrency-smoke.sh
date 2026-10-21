#!/usr/bin/env bash
set -euo pipefail
# Disposable CI PostgreSQL 17 only. Tests SECURITY DEFINER RPC with restricted runtime.
container="${1:?isolated CI container required}"
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/ci/customer-session-rpc-concurrency-fixture.sql
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
pids=()
for n in 1 2; do
 (
  docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -At <<'SQL' > "$tmp/$n"
BEGIN;
SET LOCAL ROLE sabora_customer_session_ci;
SELECT pg_sleep(0.15);
SELECT sabora.ci_revoke_customer_session(decode(repeat('c5',32),'hex'));
COMMIT;
SQL
 ) &
 pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
for n in 1 2; do
 test "$(grep -Ec '^[tf]$' "$tmp/$n")" -eq 1 || { echo "Invalid RPC result for worker $n" >&2; exit 1; }
done
wins="$(cat "$tmp/1" "$tmp/2" | grep -Ec '^t$' || true)"
test "$wins" -eq 1 || { echo "Expected one successful RPC revocation, got $wins" >&2; exit 1; }
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atqc "
SELECT count(*) FROM sabora.customer_sessions
WHERE token_hash=decode(repeat('c5',32),'hex') AND revoked_at IS NOT NULL" | grep -qx '1'
