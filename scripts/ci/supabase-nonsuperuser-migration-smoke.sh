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

# Verify actual PostgreSQL 17 bootstrap membership semantics in the
# disposable database. The admin's bootstrap grant cannot be removed by
# CREATEROLE; only a separate short-lived own grant may be revoked.
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" -c \
  'CREATE ROLE sabora_ci_membership_probe NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS' >/dev/null
baseline="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" -Atqc \
  "SELECT count(*) FROM pg_auth_members m
   JOIN pg_roles r ON r.oid=m.roleid
   JOIN pg_roles giver ON giver.oid=m.grantor
   WHERE r.rolname='sabora_ci_membership_probe'
     AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)
     AND giver.rolsuper AND m.admin_option
     AND NOT m.set_option AND NOT m.inherit_option")"
[[ "$baseline" == 1 ]] || {
  echo 'sabora_nonsuperuser_role_semantics_unexpected' >&2; exit 1;
}
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" -c \
  "REVOKE sabora_ci_membership_probe FROM $operator" >/dev/null 2>&1 || true
remaining="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" -Atqc \
  "SELECT count(*) FROM pg_auth_members m
   JOIN pg_roles r ON r.oid=m.roleid
   WHERE r.rolname='sabora_ci_membership_probe'
     AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)")"
[[ "$remaining" == 1 ]] || {
  echo 'sabora_nonsuperuser_bootstrap_grant_changed' >&2; exit 1;
}
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" -c \
  'DROP ROLE sabora_ci_membership_probe' >/dev/null
echo 'sabora_nonsuperuser_bootstrap_membership_confirmed'

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
  # This audit is run AFTER EACH COMMIT, not only after all 99 versions.
  # No migrator-issued membership or schema CREATE grant may survive a version.
  committed_unsafe_memberships="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
    -U "$operator" -d "$database" -Atqc \
    "SELECT count(*) FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles role ON role.oid=m.roleid
      JOIN pg_catalog.pg_roles member ON member.oid=m.member
      JOIN pg_catalog.pg_roles grantor ON grantor.oid=m.grantor
     WHERE (role.rolname LIKE 'sabora_%' OR member.rolname LIKE 'sabora_%')
       AND NOT (role.rolname LIKE 'sabora_%'
         AND member.rolname=current_user::text AND grantor.rolsuper
         AND m.admin_option AND NOT m.set_option AND NOT m.inherit_option)")"
  if [[ "$committed_unsafe_memberships" != 0 ]]; then
    echo "sabora_nonsuperuser_postcommit_membership_leak:$name" >&2; exit 1
  fi
  committed_owner_create="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
    -U "$operator" -d "$database" -Atqc \
    "SELECT count(*) FROM pg_catalog.pg_roles r
      WHERE r.rolname ~ '^sabora_[a-z0-9_]+_fn_owner -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort)
[[ "$count" -eq 99 ]] || { echo "sabora_nonsuperuser_incomplete_chain:$count" >&2; exit 1; }

# Exact provider-generated DBA membership is the ONLY tolerated membership
# on a Sabora role in this *candidate* contract. All migration-scoped SET/
# INHERIT grants must already have been removed by their originating SQL.
unsafe_memberships="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" -Atqc \
  "SELECT count(*) FROM pg_auth_members m
    JOIN pg_roles granted ON granted.oid=m.roleid
    JOIN pg_roles member ON member.oid=m.member
    JOIN pg_roles grantor ON grantor.oid=m.grantor
   WHERE (left(granted.rolname,7)='sabora_'
      OR left(member.rolname,7)='sabora_')
     AND NOT (left(granted.rolname,7)='sabora_'
      AND member.rolname=current_user::text
      AND grantor.rolsuper AND m.admin_option
      AND NOT m.set_option AND NOT m.inherit_option)")"
[[ "$unsafe_memberships" == 0 ]] || {
  echo 'sabora_nonsuperuser_runtime_role_membership_leak' >&2; exit 1;
}
unsafe_role_attrs="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" -Atqc \
  "SELECT count(*) FROM pg_roles WHERE left(rolname,7)='sabora_'
  AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)")"
[[ "$unsafe_role_attrs" == 0 ]] || {
  echo 'sabora_nonsuperuser_sql_role_escalation' >&2; exit 1;
}
echo 'sabora_nonsuperuser_runtime_role_boundary_verified'

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

       AND has_schema_privilege(r.oid,'sabora','CREATE')")"
  if [[ "$committed_owner_create" != 0 ]]; then
    echo "sabora_nonsuperuser_postcommit_owner_create_leak:$name" >&2; exit 1
  fi
  ((count+=1))
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort)
[[ "$count" -eq 99 ]] || { echo "sabora_nonsuperuser_incomplete_chain:$count" >&2; exit 1; }

# Exact provider-generated DBA membership is the ONLY tolerated membership
# on a Sabora role in this *candidate* contract. All migration-scoped SET/
# INHERIT grants must already have been removed by their originating SQL.
unsafe_memberships="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" -Atqc \
  "SELECT count(*) FROM pg_auth_members m
    JOIN pg_roles granted ON granted.oid=m.roleid
    JOIN pg_roles member ON member.oid=m.member
    JOIN pg_roles grantor ON grantor.oid=m.grantor
   WHERE (left(granted.rolname,7)='sabora_'
      OR left(member.rolname,7)='sabora_')
     AND NOT (left(granted.rolname,7)='sabora_'
      AND member.rolname=current_user::text
      AND grantor.rolsuper AND m.admin_option
      AND NOT m.set_option AND NOT m.inherit_option)")"
[[ "$unsafe_memberships" == 0 ]] || {
  echo 'sabora_nonsuperuser_runtime_role_membership_leak' >&2; exit 1;
}
unsafe_role_attrs="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" -Atqc \
  "SELECT count(*) FROM pg_roles WHERE left(rolname,7)='sabora_'
  AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)")"
[[ "$unsafe_role_attrs" == 0 ]] || {
  echo 'sabora_nonsuperuser_sql_role_escalation' >&2; exit 1;
}
echo 'sabora_nonsuperuser_runtime_role_boundary_verified'

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
