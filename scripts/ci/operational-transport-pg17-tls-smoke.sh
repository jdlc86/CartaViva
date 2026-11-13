#!/usr/bin/env bash
# The only accepted target is the ephemeral PG17 container created by the
# enclosing GitHub Actions runner. No VPS/Supabase, no external transport.
set -euo pipefail
umask 077
if [[ "${GITHUB_ACTIONS:-}" != "true" || -z "${GITHUB_RUN_ID:-}" ||
      -z "${RUNNER_TEMP:-}" || "$#" -ne 1 ||
      ! "$1" =~ ^sabora-node-pg17-${GITHUB_RUN_ID}-[0-9]+$ ]]; then
 echo 'sabora_operational_transport_ci_harness_required' >&2; exit 1
fi
container="$1"
if [[ "${SABORA_CI_PG_URL:-}" != postgresql://postgres:sabora_ci_ephemeral_only@127.0.0.1:*/postgres ||
      -z "${SABORA_CI_PG_MODULE:-}" ]]; then
 echo 'sabora_operational_transport_unsafe_pg17_target' >&2; exit 1
fi
command -v openssl >/dev/null
command -v docker >/dev/null
temp="$(mktemp -d "$RUNNER_TEMP/sabora-tls-pg17.XXXXXXXX")"
cleanup(){ rm -rf -- "$temp"; }
trap cleanup EXIT
# The same self-signed disposable certificate has two exact SANs. Its private
# key stays only in the GitHub runner and the disposable PostgreSQL container.
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
 -keyout "$temp/server.key" -out "$temp/server.crt" \
 -subj '/CN=sabora-ci-only-transport' \
 -addext 'subjectAltName=DNS:db.project.supabase.co,DNS:project.supabase.co' \
 >/dev/null 2>&1
openssl x509 -in "$temp/server.crt" -noout -ext subjectAltName \
 | grep -F 'DNS:db.project.supabase.co' >/dev/null
openssl x509 -in "$temp/server.crt" -noout -ext subjectAltName \
 | grep -F 'DNS:project.supabase.co' >/dev/null
docker cp "$temp/server.key" "$container:/tmp/sabora-ci-postgres.key"
docker cp "$temp/server.crt" "$container:/tmp/sabora-ci-postgres.crt"
docker exec -u root "$container" sh -c 'chown postgres:postgres /tmp/sabora-ci-postgres.key /tmp/sabora-ci-postgres.crt && chmod 600 /tmp/sabora-ci-postgres.key && chmod 644 /tmp/sabora-ci-postgres.crt'
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -c "ALTER SYSTEM SET ssl_cert_file='/tmp/sabora-ci-postgres.crt'" >/dev/null
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -c "ALTER SYSTEM SET ssl_key_file='/tmp/sabora-ci-postgres.key'" >/dev/null
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -c 'ALTER SYSTEM SET ssl=on' >/dev/null
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
 -c 'SELECT pg_reload_conf()' >/dev/null
test "$(docker exec "$container" psql -X -U postgres -d postgres -Atqc 'SHOW ssl')" = on
export SABORA_CI_TLS_CERT="$temp/server.crt"
export SABORA_CI_TLS_KEY="$temp/server.key"
export NODE_EXTRA_CA_CERTS="$temp/server.crt"
node --test scripts/ci/operational-transport-pg17-tls.test.mjs
echo 'sabora_operational_pg17_tls_gateway_and_jwks_ok'
