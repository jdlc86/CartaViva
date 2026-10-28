#!/usr/bin/env bash
set -euo pipefail
# CI-only disposable PostgreSQL 17; never target Supabase, VPS or shared Docker.
if [[ "${GITHUB_ACTIONS:-}" != true || -z "${RUNNER_TEMP:-}" || -z "${GITHUB_RUN_ID:-}" ]]; then
  echo 'Refusing to run outside isolated GitHub Actions' >&2
  exit 1
fi
container="${1:?disposable PostgreSQL container required}"
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE ROLE sabora_operations_denied_ci LOGIN NOINHERIT NOBYPASSRLS
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD 'ci-disposable-operations-denial';
GRANT USAGE ON SCHEMA sabora TO sabora_operations_denied_ci;
SQL
run_login() {
  docker exec -i -e PGPASSWORD=ci-disposable-operations-denial "$container" \
    psql -X -Atq -v ON_ERROR_STOP=1 -h 127.0.0.1 \
    -U sabora_operations_denied_ci -d postgres "$@"
}
# The real authenticated login cannot access either ledger.
for statement in \
  'SELECT count(*) FROM sabora.order_line_events;' \
  'SELECT count(*) FROM sabora.order_line_transition_requests;' \
  "SELECT * FROM sabora.transition_order_line_authorized_candidate(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);" \
  "SELECT * FROM sabora.read_order_operations_board_authorized_candidate(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);" \
  "SELECT * FROM sabora.read_order_operations_history_authorized_candidate(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);"; do
  if printf '%s\n' "$statement" | run_login >/dev/null 2>&1; then
    echo "ERROR: restricted operations login unexpectedly executed: $statement" >&2
    exit 1
  fi
done
run_login <<'SQL' | grep -qx 'f|f|f'
SELECT rolsuper, rolbypassrls, rolinherit
FROM pg_catalog.pg_roles WHERE rolname = current_user;
SQL
echo 'Real PostgreSQL operations login denied direct ledger and RPC access.'
