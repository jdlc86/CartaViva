#!/usr/bin/env bash
set -euo pipefail
# Mutation tests of the negative activation gate on disposable PG17 only.
# Every mutation and gate run is inside one connection/transaction and is
# rolled back when psql exits after the gate rejects the mutation.
container="${1:?isolated postgres container name required}"
gate="scripts/ci/catalog-confirmation-activation-gate.sql"
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
  printf 'Gate incorrectly accepted mutation: %s\n%s\n' "$label" "$output" >&2
  exit 1
 fi
 if ! grep -Fq "$expected" <<<"$output"; then
  printf 'Gate rejected mutation for wrong reason: %s\n%s\n' "$label" "$output" >&2
  exit 1
 fi
 printf 'Gate rejected %s as expected\n' "$label"
}
run_rejection "orders INSERT grant" \
 'GRANT INSERT ON sabora.orders TO sabora_admin_writer;' \
 'candidate order/ledger privilege leaked'
run_rejection "ledger SELECT grant" \
 'GRANT SELECT ON sabora.catalog_confirmation_attempts TO sabora_staff_reader;' \
 'candidate order/ledger privilege leaked'
run_rejection "orders FORCE RLS removed" \
 'ALTER TABLE sabora.orders NO FORCE ROW LEVEL SECURITY;' \
 'candidate orders lost FORCE RLS'
run_rejection "orders identity constraint removed" \
 'ALTER TABLE sabora.orders DROP CONSTRAINT sabora_order_customer_alias_valid;' \
 'missing validated candidate order constraint'
run_rejection "ledger append-only trigger disabled" \
 'ALTER TABLE sabora.catalog_confirmation_attempts DISABLE TRIGGER catalog_confirmation_attempts_append_only;' \
 'economic ledger mutation guard missing or disabled'
run_rejection "legacy confirm_order EXECUTE grant" \
 'GRANT EXECUTE ON FUNCTION sabora.confirm_order(uuid,text,text,text,text,jsonb) TO authenticated;' \
 'legacy confirm_order callable by runtime'
run_rejection "ledger permissive RLS policy" \
 'CREATE POLICY candidate_bad_reader ON sabora.catalog_displayed_quotes FOR SELECT TO authenticated USING (true);' \
 'economic ledger unexpectedly has runtime policy'
# All mutations must have been rolled back by connection termination.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$gate" >/dev/null
printf 'Negative activation gate mutation regressions passed\n'
