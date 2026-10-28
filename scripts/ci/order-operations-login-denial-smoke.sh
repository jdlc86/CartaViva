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
# Verify actual SQLSTATE 42501 (insufficient_privilege), not arbitrary errors
# such as missing function signatures, invalid parameters or connectivity.
run_login <<'SQL' | grep -qx '5'
DO $verify$
DECLARE
  denied integer := 0;
BEGIN
  BEGIN
    PERFORM count(*) FROM sabora.order_line_events;
    RAISE EXCEPTION 'unexpected events access';
  EXCEPTION WHEN insufficient_privilege THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM count(*) FROM sabora.order_line_transition_requests;
    RAISE EXCEPTION 'unexpected transition requests access';
  EXCEPTION WHEN insufficient_privilege THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM * FROM sabora.transition_order_line_authorized_candidate(
      NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'unexpected transition RPC access';
  EXCEPTION WHEN insufficient_privilege THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM * FROM sabora.read_order_operations_board_authorized_candidate(
      NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'unexpected board RPC access';
  EXCEPTION WHEN insufficient_privilege THEN denied := denied + 1;
  END;
  BEGIN
    PERFORM * FROM sabora.read_order_operations_history_authorized_candidate(
      NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'unexpected history RPC access';
  EXCEPTION WHEN insufficient_privilege THEN denied := denied + 1;
  END;
  IF denied <> 5 THEN
    RAISE EXCEPTION 'expected five SQL privilege denials, got %', denied;
  END IF;
END $verify$;
SELECT 5;
SQL
run_login <<'SQL' | grep -qx 'f|f|f'
SELECT rolsuper, rolbypassrls, rolinherit
FROM pg_catalog.pg_roles WHERE rolname = current_user;
SQL
echo 'Real PostgreSQL operations login denied direct ledger and RPC access.'
