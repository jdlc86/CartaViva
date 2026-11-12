#!/usr/bin/env bash
set -euo pipefail
# CV-005: full Sabora migration chain executed by a PG17 CREATEROLE role
# WITHOUT SUPERUSER/BYPASSRLS, in a network-disabled, disposable Actions job.
# This is not a live Supabase test and does not emulate its supautils hooks.
if [[ "$(printenv GITHUB_ACTIONS || true)" != true ||
      -z "$(printenv GITHUB_RUN_ID || true)" ||
      -z "$(printenv RUNNER_TEMP || true)" || "$#" -ne 0 ]]; then
  echo 'sabora_nonsuperuser_harness_required' >&2; exit 1
fi
for tool in node docker sha256sum; do command -v "$tool" >/dev/null; done
node scripts/ci/migration-audit.mjs >/dev/null
container="sabora-pg-role-ci-$GITHUB_RUN_ID-$$"
operator="sabora_ci_migration_operator"
database="sabora_ci_migration_compat"
cleanup(){ docker rm -f -v "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$container" --network none \
  -e POSTGRES_PASSWORD=sabora_ci_disposable_only postgres:17-alpine >/dev/null
[[ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$container")" == none ]] || {
  echo 'sabora_nonsuperuser_network_isolation_failed' >&2; exit 1;
}
ready=false
for attempt in $(seq 1 60); do
  # The official Postgres image first starts a *temporary* init server and
  # shuts it down. Avoid treating that transient socket as readiness.
  if docker logs "$container" 2>&1 | grep -q 'PostgreSQL init process complete' &&
     docker exec "$container" psql -X -U postgres -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'sabora_nonsuperuser_db_not_ready' >&2; exit 1; }

# Only fixture bootstrapping uses the container superuser: the application
# migration chain is run as the non-superuser role against its own database.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL' >/dev/null
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE sabora_ci_migration_operator LOGIN CREATEROLE INHERIT
  NOSUPERUSER NOBYPASSRLS NOREPLICATION;
SQL
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "CREATE DATABASE $database OWNER $operator" >/dev/null
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" <<'SQL' >/dev/null
CREATE SCHEMA extensions AUTHORIZATION sabora_ci_migration_operator;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
SQL
# Diagnose the fixture with public, boolean role attributes only. This must be
# the effective session role, not a SELECT about a separately created account.
# The evidence never includes passwords, URLs or operational identity names.
role_check="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" -Atqc \
  "SELECT CASE WHEN current_user = '$operator' THEN 'expected' ELSE 'unexpected' END,
          rolsuper, rolbypassrls, rolcreaterole, rolcanlogin
   FROM pg_roles WHERE rolname = current_user")"
if [[ "$role_check" != 'expected|f|f|t|t' ]]; then
  echo "sabora_nonsuperuser_role_preflight_failed:${role_check:-empty}" >&2
  exit 1
fi
echo 'sabora_nonsuperuser_role_preflight_ok'

# Feasibility gate: PG17 CREATEROLE automatically grants ADMIN membership
# on newly-created roles, while the signed order-owner migration rejects ANY
# such membership. A login with only CREATEROLE cannot revoke the bootstrap
# superuser's automatic grant. This is a mandatory NO-GO, not a flaky test.
docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" -c \
  'CREATE ROLE sabora_ci_membership_probe NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS' >/dev/null
auto_membership="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" -Atqc \
  "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
   WHERE r.rolname='sabora_ci_membership_probe'
     AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)")"
[[ "$auto_membership" == 1 ]] || {
  echo 'sabora_nonsuperuser_role_semantics_unexpected' >&2; exit 1;
}
# Determine, rather than assume, whether CREATEROLE can remove the
# bootstrap-issued automatic membership from its *own* disposable role.
# The attempt does not run against the provider or any real Sabora role.
# A positive result would still require separately verifying all ownership,
# schema/ACL checks and sealing before the installation can be accepted.
revoke_log="$RUNNER_TEMP/sabora-pg-role-self-revoke-$GITHUB_RUN_ID-$.log"
if docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
    -U "$operator" -d "$database" -c \
    "REVOKE sabora_ci_membership_probe FROM $operator" >"$revoke_log" 2>&1; then
  revoke_status=ok
else
  revoke_status=denied
fi
remaining_membership="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" -Atqc \
  "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
   WHERE r.rolname='sabora_ci_membership_probe'
     AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)")"
rm -f "$revoke_log"
if [[ "$revoke_status" == ok && "$remaining_membership" == 0 ]]; then
  echo 'sabora_nonsuperuser_self_revocation_observed'
else
  echo 'sabora_nonsuperuser_self_revocation_unavailable'
fi
# Exercise the actual sealed-owner validation block from the *versioned*
# migration, without editing or replaying it against any operational database.
# Negative: CREATEROLE-created owner has a bootstrap-issued membership.
# Positive control: fixture superuser-created owner has no membership, and
# the exact same guard succeeds. This proves role-provenance dependence;
# neither path certifies the complete 99-migration provider installation.
guard_sql="$RUNNER_TEMP/sabora-sealed-owner-guard-$GITHUB_RUN_ID-$.sql"
guard_log="$RUNNER_TEMP/sabora-sealed-owner-result-$GITHUB_RUN_ID-$.log"
awk '$0 == "DO $role$" {active=1} active {print} active && $0 == "$role$;" {exit}' \
  supabase/migrations/20261024190000_sabora_order_operation_actor_capability_candidate.sql \
  > "$guard_sql"
if ! grep -Fqx '$role$;' "$guard_sql"; then
  echo 'sabora_nonsuperuser_sealed_owner_guard_extract_failed' >&2; exit 1
fi
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" -c \
  'CREATE ROLE sabora_order_operations_fn_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION' >/dev/null
if docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" \
  < "$guard_sql" > "$guard_log" 2>&1; then
  echo 'sabora_nonsuperuser_sealed_owner_negative_guard_bypassed' >&2; exit 1
fi
if ! grep -Fq 'unsafe_sabora_order_operations_fn_owner_membership' "$guard_log"; then
  echo 'sabora_nonsuperuser_sealed_owner_negative_guard_unexpected' >&2; exit 1
fi
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" -c \
  'DROP ROLE sabora_order_operations_fn_owner' >/dev/null
# The privileged account is an off-line fixture only; the real Supabase
# 'postgres' role is NOT a superuser and cannot be treated as equivalent.
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" -c \
  'CREATE ROLE sabora_order_operations_fn_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION' >/dev/null
sealed_memberships="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" -Atqc \
  "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
   JOIN pg_roles member_role ON member_role.oid=m.member
   WHERE r.rolname='sabora_order_operations_fn_owner'
      OR member_role.rolname='sabora_order_operations_fn_owner'")"
[[ "$sealed_memberships" == 0 ]] || {
  echo 'sabora_nonsuperuser_preprovisioned_owner_not_sealed' >&2; exit 1
}
if ! docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" \
  < "$guard_sql" > "$guard_log" 2>&1; then
  echo 'sabora_nonsuperuser_sealed_owner_positive_guard_failed' >&2; exit 1
fi
rm -f "$guard_sql" "$guard_log"
echo 'sabora_nonsuperuser_sealed_owner_provenance_verified'
# This is still NO-GO for the *unchanged* migration because CREATE ROLE and
# the sealed-owner membership guard occur in the same versioned transaction.
if grep -q 'unsafe_sabora_order_operations_fn_owner_membership' \
    supabase/migrations/20261024190000_sabora_order_operation_actor_capability_candidate.sql; then
  echo 'sabora_nonsuperuser_provider_no_go:automatic_createrole_membership_conflicts_with_sealed_owner' >&2
  exit 1
fi
log="$RUNNER_TEMP/sabora-nonsuperuser-$GITHUB_RUN_ID-$.log"
count=0
while IFS= read -r name; do
  [[ "$name" =~ ^[0-9]{14}_[A-Za-z0-9_-]+\.sql$ ]] || {
    echo 'sabora_nonsuperuser_invalid_migration_name' >&2; exit 1;
  }
  if ! docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
      -U "$operator" -d "$database" < "supabase/migrations/$name" > "$log" 2>&1; then
    echo "sabora_nonsuperuser_migration_blocked:$name" >&2
    # The fixture contains no operational identities or credentials.
    grep -E 'ERROR:|FATAL:|permission denied' "$log" | tail -n 4 >&2 || true
    exit 1
  fi
  ((count+=1))
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort)
[[ "$count" -gt 1 ]] || { echo 'sabora_nonsuperuser_empty_chain' >&2; exit 1; }

# No skipped RLS tables, no unexpected browser schema access or elevation.
test "$(docker exec "$container" psql -X -U "$operator" -d "$database" -Atqc \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='sabora' AND c.relkind='r'
     AND c.relrowsecurity AND c.relforcerowsecurity")" -eq 69 || {
  echo 'sabora_nonsuperuser_force_rls_mismatch' >&2; exit 1;
}
test "$(docker exec "$container" psql -X -U "$operator" -d "$database" -Atqc \
  "SELECT NOT has_schema_privilege('anon','sabora','USAGE')
     AND NOT has_schema_privilege('authenticated','sabora','USAGE')
     AND (SELECT NOT rolsuper AND NOT rolbypassrls
       FROM pg_roles WHERE rolname=current_user)")" = t || {
  echo 'sabora_nonsuperuser_privilege_boundary_failed' >&2; exit 1;
}
rm -f "$log"
echo "sabora_nonsuperuser_pg17_migration_chain_ok:$count"
