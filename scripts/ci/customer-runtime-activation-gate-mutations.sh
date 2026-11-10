#!/usr/bin/env bash
set -euo pipefail
# Mutation regressions for the dormant customer runtime activation boundary.
# Only the disposable, network-isolated PostgreSQL 17 container is permitted.
container="${1:?isolated postgres container name required}"
gate="scripts/ci/customer-runtime-activation-gate.sql"
run_rejection() {
 local label="$1" mutation="$2" expected="$3" output status
 set +e
 output="$(
  {
   printf 'BEGIN;\n%s\n' "$mutation"
   cat "$gate"
  } | docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres 2>&1
 )"
 status=$?
 set -e
 if [ "$status" -eq 0 ]; then
  printf 'Customer activation gate accepted unsafe mutation: %s\n%s\n' "$label" "$output" >&2
  exit 1
 fi
 if ! grep -Fq "$expected" <<<"$output"; then
  printf 'Customer activation gate rejected for unexpected reason: %s\n%s\n' "$label" "$output" >&2
  exit 1
 fi
 printf 'Customer activation gate rejected %s\n' "$label"
}
run_rejection "unexpected catalog runtime login" \
 'CREATE ROLE sabora_catalog_login LOGIN;' \
 'unapproved customer runtime login exists'
run_rejection "unexpected order runtime login" \
 'CREATE ROLE sabora_order_login LOGIN;' \
 'unapproved customer runtime login exists'
run_rejection "catalog reader can bypass RLS" \
 'ALTER ROLE sabora_catalog_reader BYPASSRLS;' \
 'catalog reader role attributes unsafe'
run_rejection "catalog reader gains inheritance" \
 'ALTER ROLE sabora_catalog_reader INHERIT;' \
 'catalog reader role attributes unsafe'
run_rejection "catalog reader gains role creation" \
 'ALTER ROLE sabora_catalog_reader CREATEROLE;' \
 'catalog reader role attributes unsafe'
run_rejection "catalog reader leaked to browser" \
 'GRANT sabora_catalog_reader TO authenticated;' \
 'catalog reader membership leaked'
run_rejection "catalog reader receives order insert" \
 'GRANT INSERT ON sabora.orders TO sabora_catalog_reader;' \
 'unapproved economic write privilege'
run_rejection "browser receives ledger read" \
 'GRANT SELECT ON sabora.catalog_confirmation_attempts TO anon;' \
 'unapproved economic write privilege'
run_rejection "browser receives quote deletion" \
 'GRANT DELETE ON sabora.catalog_displayed_quotes TO authenticated;' \
 'unapproved economic write privilege'
# The last check also proves that every mutation was rolled back.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$gate" >/dev/null
printf 'Customer runtime activation mutation regressions passed\n'
