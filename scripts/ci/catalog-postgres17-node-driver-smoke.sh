#!/usr/bin/env bash
set -euo pipefail
# CI-only real node-postgres integration. Never target an existing DB or VPS.
if [[ -z "${GITHUB_ACTIONS:-}" || "${GITHUB_ACTIONS}" != true ]]; then
  echo 'Refusing to start: disposable GitHub Actions runner required' >&2
  exit 1
fi
for tool in docker node npm; do command -v "$tool" >/dev/null; done
# Fail fast before npm installation, Docker startup or SQL migrations.
# A syntax regression must not consume a full disposable PG17 run.
node --check scripts/ci/catalog-postgres17-driver-integration.test.mjs
tmp="$(mktemp -d)"
container="sabora-node-pg17-${GITHUB_RUN_ID:-ci}-$$"
cleanup() {
 docker rm -f -v "$container" >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
# pg is installed ONLY in a disposable harness, not in the runtime manifest.
# Pin an exact version; production dependency/lockfile gate remains separate.
npm install --prefix "$tmp" --no-save --ignore-scripts --no-audit --no-fund --package-lock=false pg@8.16.3 >/dev/null
docker run -d --name "$container" \
 --publish 127.0.0.1::5432 \
 -e POSTGRES_PASSWORD=sabora_ci_ephemeral_only postgres:17-alpine >/dev/null
# The Docker entrypoint starts a temporary socket-only PostgreSQL server before
# restarting the final TCP listener. Require TCP SQL readiness, not the socket.
ready=false
for attempt in $(seq 1 60); do
 if docker exec -e PGPASSWORD=sabora_ci_ephemeral_only "$container" psql -X -h 127.0.0.1 -U postgres -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
  ready=true
  break
 fi
 sleep 1
done
if [[ "$ready" != true ]]; then
 echo 'Disposable PostgreSQL 17 did not become SQL-ready' >&2
 docker logs "$container" >&2 || true
 exit 1
fi
docker exec -i -e PGPASSWORD=sabora_ci_ephemeral_only "$container" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
SQL
for migration in supabase/migrations/*.sql; do
 test -f "$migration"
 docker exec -i -e PGPASSWORD=sabora_ci_ephemeral_only "$container" psql -X -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration" >/dev/null
done
port="$(docker port "$container" 5432/tcp)"
[[ "$port" =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo "Unexpected bind: $port" >&2; exit 1; }
export SABORA_CI_PG_URL="postgresql://postgres:sabora_ci_ephemeral_only@$port/postgres"
export SABORA_CI_PG_MODULE="$tmp/node_modules/pg"
node --test scripts/ci/catalog-postgres17-driver-integration.test.mjs
