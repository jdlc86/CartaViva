#!/usr/bin/env bash
set -euo pipefail
# CI-only real node-postgres integration. Never target an existing DB or VPS.
if [[ -z "${GITHUB_ACTIONS:-}" || "${GITHUB_ACTIONS}" != true ]]; then
  echo 'Refusing to start: disposable GitHub Actions runner required' >&2
  exit 1
fi
scope="${SABORA_PG17_TEST_SCOPE:-full}"
if [[ "$scope" != full && "$scope" != issue61 ]]; then
  echo 'Unsupported PG17 test scope' >&2
  exit 1
fi
issue61_target="${SABORA_PG17_ISSUE61_TARGET:-all}"
if [[ "$scope" = issue61 ]]; then
 if [[ "$issue61_target" != all && "$issue61_target" != h6 && "$issue61_target" != i49 ]]; then
  echo 'Unsupported Issue #61 test target' >&2
  exit 1
 fi
elif [[ "$issue61_target" != all ]]; then
 echo 'Issue #61 target requires focused scope' >&2
 exit 1
fi
export SABORA_PG17_TEST_SCOPE="$scope"
for tool in docker node npm; do command -v "$tool" >/dev/null; done
# Fail fast before npm installation, Docker startup or SQL migrations.
# A syntax regression must not consume a full disposable PG17 run.
node --check scripts/ci/catalog-postgres17-driver-integration.test.mjs
node --check scripts/ci/order-operations-postgres17-integration.test.mjs
node --check scripts/ci/order-operations-identity-postgres17.test.mjs
node --check scripts/ci/order-operations-read-postgres17.test.mjs
node --check scripts/ci/m3-management-postgres17.test.mjs
node --check scripts/ci/operational-transport-pg17-tls.test.mjs
node --check scripts/ci/admin-single-writer-postgres17.test.mjs
node --check scripts/ci/ownership-governance-postgres17.test.mjs
node --check scripts/ci/cv014-communications-postgres17.test.mjs
node --check scripts/ci/waiter-calls-postgres17.test.mjs
node --check scripts/ci/staff-lifecycle-postgres17.test.mjs
node --check scripts/ci/staff-root-bootstrap-postgres17.test.mjs
node --check scripts/ci/staff-display-id-postgres17.test.mjs
node --check scripts/ci/staff-directory-postgres17.test.mjs
node --check scripts/ci/staff-invitation-outbox-postgres17.test.mjs
node --check scripts/ci/customer-production-postgres17.test.mjs
node --check scripts/ci/h6-postgres17.test.mjs
node --check scripts/ci/table-change-root-postgres17.test.mjs
node --check scripts/ci/zero-cost-account-postgres17.test.mjs
node --check scripts/ci/sabora-dual-backup-postgres17.mjs
if [[ "$scope" = full ]]; then
  node --check scripts/ci/sabora-vps-backup-ssh-lab.mjs
  node --check scripts/ci/sabora-backup-governed-receiver-lab.mjs
  node --check scripts/ops/sabora-backup-governed-lab-entry.mjs
  node --check scripts/ops/sabora-backup-recovery-fence.mjs
  node --check scripts/ops/sabora-backup-recovery-coordinator.mjs
  node --check scripts/ops/sabora-backup-installed-contract.mjs
  node --check scripts/ops/sabora-backup-installed-receiver.mjs
  node --check scripts/ops/sabora-backup-installed-entry.mjs
  node --check scripts/ops/sabora-backup-installed-send.mjs
  node --check scripts/ops/sabora-backup-installation-stager.mjs
  node --check scripts/ops/sabora-backup-recovery-checkpoint.mjs
  node --check scripts/ops/sabora-vps-backup-transport.mjs
  node --check scripts/ops/sabora-vps-backup-lab-entry.mjs
  # The full suite already requires a disposable Linux Actions runner.
  # Ensure transport test tools before provisioning the fixture.
  if [[ "${RUNNER_OS:-}" != Linux ]]; then
    echo 'Full backup transport suite requires the disposable Linux runner' >&2
    exit 1
  fi
  if ! test -x /usr/sbin/sshd || ! test -x /usr/bin/ssh || ! test -x /usr/bin/ssh-keygen; then
    sudo -n apt-get update -qq
    sudo -n apt-get install -y --no-install-recommends openssh-server openssh-client
  fi
  for tool in /usr/sbin/mkfs.ext4 /usr/bin/mount /usr/bin/umount /usr/bin/fallocate /usr/bin/flock /usr/bin/cc /usr/sbin/useradd /usr/sbin/usermod /usr/sbin/userdel /usr/sbin/chpasswd /usr/bin/openssl /usr/bin/setpriv /usr/bin/pgrep /usr/bin/ps /usr/bin/timeout /usr/bin/cat; do
    test -x "$tool" || { echo 'Missing disposable volume tool' >&2; exit 1; }
  done
fi
tmp="$(mktemp -d)"
container="sabora-node-pg17-${GITHUB_RUN_ID:-ci}-$$"
if [[ "$scope" = issue61 && -z "${RUNNER_TEMP:-}" ]]; then
 if [[ "${OS:-}" == Windows_NT ]]; then
  RUNNER_TEMP="$(cygpath -w "$tmp")"
 else
  RUNNER_TEMP="$tmp"
 fi
 export RUNNER_TEMP
fi
cleanup() {
 docker rm -f -v "$container" >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
# The focused Issue #61 gate reuses the already pinned workspace driver to
# avoid a redundant registry download. Its test harness accepts only the exact
# apps/api pg@8.16.3 path. The complete CI gate retains its isolated install.
if [[ "$scope" = issue61 ]]; then
 workspace_pg="$(node -e "const {createRequire}=require('node:module');const {dirname,resolve}=require('node:path');const r=createRequire(resolve('apps/api/package.json'));const p=r.resolve('pg/package.json');const v=r(p).version;if(v!=='8.16.3')throw Error('unexpected_pg_version');process.stdout.write(dirname(p))")"
 module_path="$workspace_pg"
 export SABORA_CI_REUSE_WORKSPACE_PG=true
else
 npm install --prefix "$tmp" --no-save --ignore-scripts --no-audit --no-fund --package-lock=false pg@8.16.3 >/dev/null
 module_path="$tmp/node_modules/pg"
fi
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
if [[ "${OS:-}" == Windows_NT ]]; then
 module_path="$(cygpath -w "$module_path")"
fi
export SABORA_CI_PG_MODULE="$module_path"
if [[ "$scope" = issue61 ]]; then
 if [[ -z "${SABORA_CI_PLAYWRIGHT_MODULE:-}" ]]; then
  SABORA_CI_PLAYWRIGHT_MODULE="$(node -e "const {createRequire}=require('node:module');const {resolve}=require('node:path');const r=createRequire(resolve('apps/client/package.json'));process.stdout.write(r.resolve('@playwright/test'))")"
  export SABORA_CI_PLAYWRIGHT_MODULE
 fi
 if [[ "$issue61_target" != i49 ]]; then
  node --test scripts/ci/h6-postgres17.test.mjs
 fi
 if [[ "$issue61_target" != h6 ]]; then
  node --test --test-name-pattern \
   'PG17 B3 six isolated logins complete PWA customer A to waiter to economic B journey' \
   scripts/ci/table-change-root-postgres17.test.mjs
 fi
 exit 0
fi
# ROOT bootstrap requires empty staff tables and an irreversible receipt;
# clone the freshly migrated disposable DB before other suites seed identities.
docker exec -e PGPASSWORD=sabora_ci_ephemeral_only "$container" psql -X -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'CREATE DATABASE sabora_root_bootstrap_ci TEMPLATE postgres' >/dev/null
node --test scripts/ci/staff-root-bootstrap-postgres17.test.mjs
node --test scripts/ci/catalog-postgres17-driver-integration.test.mjs
node --test scripts/ci/order-operations-postgres17-integration.test.mjs
node --test scripts/ci/order-operations-identity-postgres17.test.mjs
node --test scripts/ci/m3-management-postgres17.test.mjs
# A complete transport-level rehearsal against this SAME throwaway PG17:
# TLS-issued test CA + real restricted LOGIN + two exact gateway destinations
# + HTTPS JWKS, with wrong-SNI and direct-SQL denial assertions.
# The runner-only sidecar connector redirects upstream sockets to loopback.
bash scripts/ci/operational-transport-pg17-tls-smoke.sh "$container"
# Browser-backed vertical E2E is isolated to this disposable PG17 container.
# The Chromium binary is installed only on the ephemeral Actions runner.
npm install --prefix "$tmp" --no-save --ignore-scripts --no-audit --no-fund --package-lock=false pg@8.16.3 playwright@1.56.1 >/dev/null
timeout --signal=TERM --kill-after=15s 180s "$tmp/node_modules/.bin/playwright" install chromium
export SABORA_CI_PLAYWRIGHT_MODULE="$tmp/node_modules/playwright/index.mjs"
# CV-014 end-to-end: restricted SQL login -> Fastify -> both real PWAs and SSE.
node --test scripts/ci/cv014-communications-postgres17.test.mjs
node --test scripts/ci/waiter-calls-postgres17.test.mjs
node --test scripts/ci/order-operations-read-postgres17.test.mjs
node --test scripts/ci/staff-display-id-postgres17.test.mjs
node --test scripts/ci/staff-directory-postgres17.test.mjs
node --test scripts/ci/staff-lifecycle-postgres17.test.mjs
node --test scripts/ci/staff-invitation-outbox-postgres17.test.mjs
node --test scripts/ci/customer-production-postgres17.test.mjs
node --test scripts/ci/h6-postgres17.test.mjs
node --test scripts/ci/table-change-root-postgres17.test.mjs
node --test scripts/ci/zero-cost-account-postgres17.test.mjs
# Last: root cannot be deleted under governance; disposable container is removed.
node --test scripts/ci/admin-single-writer-postgres17.test.mjs
node --test scripts/ci/ownership-governance-postgres17.test.mjs

# Verify restoration from the encrypted external replica of the same migrated PG17 source.
export SABORA_CI_PG_CONTAINER="$container"
node scripts/ci/sabora-dual-backup-postgres17.mjs
