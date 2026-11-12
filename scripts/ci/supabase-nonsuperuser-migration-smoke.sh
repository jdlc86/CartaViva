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
operator="cv005_ci_migration_operator"
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
CREATE ROLE cv005_ci_migration_operator LOGIN CREATEROLE INHERIT
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
# Both branches are exercised on the same offline PG17 cluster before
# touching Sabora roles. No superuser is available through the Supabase
# project user's ordinary postgres connection.
restricted_admission="$(docker exec -i "$container" psql -X -v ON_ERROR_STOP=1  -U "$operator" -d "$database" -At < scripts/ci/sabora-pg17-owner-admission.sql)"
privileged_admission="$(docker exec -i "$container" psql -X -v ON_ERROR_STOP=1  -U postgres -d "$database" -At < scripts/ci/sabora-pg17-owner-admission.sql)"
[[ "$restricted_admission" == 'NO_GO:sealed_owner_privileged_provider_required' &&
   "$privileged_admission" == 'PREFLIGHT_ONLY:privileged_executor_not_approval' ]] || {
  echo 'sabora_nonsuperuser_admission_gate_inconsistent' >&2; exit 1;
}
echo 'sabora_nonsuperuser_owner_admission_boundary_verified'

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
# The bootstrap grant cannot be withdrawn by CREATEROLE. Prove the
# threat model: DBA can self-grant SET, ordinary runtime LOGIN cannot.
revoke_log="$RUNNER_TEMP/sabora-ci-revoke-$GITHUB_RUN_ID-$$.log"
if docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database"    -c "REVOKE sabora_ci_membership_probe FROM $operator" >"$revoke_log" 2>&1; then
  echo 'sabora_nonsuperuser_bootstrap_grant_revocation_unexpected' >&2; exit 1
fi
rm -f "$revoke_log"
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database"  -c 'CREATE ROLE cv005_ci_runtime_probe LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE' >/dev/null
if docker exec "$container" psql -X -v ON_ERROR_STOP=1   -U cv005_ci_runtime_probe -d "$database"   -c 'SET ROLE sabora_ci_membership_probe' >/dev/null 2>&1; then
 echo 'sabora_nonsuperuser_runtime_set_role_elevation' >&2; exit 1
fi
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database"  -c "GRANT sabora_ci_membership_probe TO $operator WITH SET TRUE, INHERIT FALSE" >/dev/null
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database"  -c 'BEGIN; SET ROLE sabora_ci_membership_probe; ROLLBACK;' >/dev/null
if docker exec "$container" psql -X -v ON_ERROR_STOP=1   -U cv005_ci_runtime_probe -d "$database"   -c 'SET ROLE sabora_ci_membership_probe' >/dev/null 2>&1; then
 echo 'sabora_nonsuperuser_runtime_inherited_admin_access' >&2; exit 1
fi
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database"  -c "REVOKE sabora_ci_membership_probe FROM $operator" >/dev/null
remaining_membership="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1  -U "$operator" -d "$database" -Atqc  "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
  WHERE r.rolname='sabora_ci_membership_probe'
    AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)
    AND m.admin_option AND NOT m.set_option AND NOT m.inherit_option")"
[[ "$remaining_membership" == 1 ]] || {
 echo 'sabora_nonsuperuser_admin_grant_cleanup_failed' >&2; exit 1
}
echo 'sabora_nonsuperuser_dba_self_grant_risk_and_runtime_denial_verified'
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
# NO-GO is the expected and PROVED RESULT, not a PostgreSQL execution error.
# The test succeeds only after the original normative guard rejects the DBA
# membership and accepts a superuser-created membership-free owner. It does
# NOT claim that any of the 99 SQL migrations is provider-installable.
if ! grep -Fq 'unsafe_sabora_order_operations_fn_owner_membership'   supabase/migrations/20261024190000_sabora_order_operation_actor_capability_candidate.sql; then
  echo 'sabora_nonsuperuser_sealed_owner_guard_removed' >&2
  exit 1
fi
echo 'sabora_nonsuperuser_provider_no_go_verified:automatic_createrole_membership_conflicts_with_sealed_owner'
echo 'sabora_provider_installation_not_authorized'
