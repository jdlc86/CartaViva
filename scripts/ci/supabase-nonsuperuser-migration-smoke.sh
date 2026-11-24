#!/usr/bin/env bash
set -euo pipefail
# CV-005: full Sabora migration chain executed by a PG17 CREATEROLE role
# with the observed managed-DBA BYPASSRLS attribute but WITHOUT SUPERUSER,
# in a network-disabled, disposable Actions job.
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
CREATE ROLE service_role NOLOGIN;
CREATE ROLE cv005_ci_migration_operator LOGIN CREATEROLE INHERIT
  NOSUPERUSER BYPASSRLS NOREPLICATION;
CREATE ROLE cv005_ci_restricted_probe LOGIN NOINHERIT NOSUPERUSER
  NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
SQL
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "CREATE DATABASE $database OWNER $operator" >/dev/null
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" <<'SQL' >/dev/null
CREATE SCHEMA extensions AUTHORIZATION cv005_ci_migration_operator;
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
if [[ "$role_check" != 'expected|f|t|t|t' ]]; then
  echo "sabora_nonsuperuser_role_preflight_failed:${role_check:-empty}" >&2
  exit 1
fi
echo 'sabora_nonsuperuser_role_preflight_ok'

# The read-only first-install gate must accept the exact Option A fixture, reject
# a runtime identity, and notice even a ledger-only partial installation.
admission="$(docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" < scripts/ci/sabora-pg17-owner-admission.sql)"
[[ "$admission" == 'PREFLIGHT_ONLY:option_a_managed_dba_candidate' ]] || {
  echo "sabora_option_a_admission_failed:${admission:-empty}" >&2; exit 1;
}
restricted_admission="$(docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U cv005_ci_restricted_probe -d "$database" < scripts/ci/sabora-pg17-owner-admission.sql)"
[[ "$restricted_admission" == 'NO_GO:option_a_dba_attributes_required' ]] || {
  echo "sabora_runtime_admission_not_denied:${restricted_admission:-empty}" >&2; exit 1;
}
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U "$operator" -d "$database" <<'SQL'
CREATE SCHEMA sabora_migration_meta;
CREATE TABLE sabora_migration_meta.applied_migrations(version text PRIMARY KEY);
SQL
partial_admission="$(docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" < scripts/ci/sabora-pg17-owner-admission.sql)"
[[ "$partial_admission" == 'NO_GO:first_install_state_not_clean' ]] || {
  echo "sabora_partial_install_admission_not_denied:${partial_admission:-empty}" >&2; exit 1;
}
docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U "$operator" -d "$database" \
  -c 'DROP SCHEMA sabora_migration_meta CASCADE'
echo 'sabora_option_a_owner_admission_verified'

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

# Exercise the shared ledger definition with provider-style default grants.
# Keep the probe in one rolled-back transaction on the same disposable DB.
{
 printf '%s\n' 'BEGIN;' 'ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO service_role;' \
   'ALTER DEFAULT PRIVILEGES GRANT ALL ON SCHEMAS TO service_role;' \
   'ALTER DEFAULT PRIVILEGES GRANT ALL ON FUNCTIONS TO service_role;'
 node --input-type=module -e 'import {LEDGER_SQL} from "./scripts/ci/sabora-s46-atomic-migration.mjs"; process.stdout.write(LEDGER_SQL);'
 printf '%s\n' "SELECT has_schema_privilege('service_role','sabora_migration_meta','USAGE'), has_table_privilege('service_role','sabora_migration_meta.applied_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), has_function_privilege('service_role','sabora_migration_meta.reject_ledger_mutation()','EXECUTE');" 'ROLLBACK;'
} | docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U "$operator" -d "$database" \
 | grep -Fxq 'f|f|f'
echo 'sabora_s51_ledger_provider_default_acl_denied'

log="$RUNNER_TEMP/sabora-nonsuperuser-$GITHUB_RUN_ID-$.log"
count=0
expected_count="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | wc -l | tr -d '[:space:]')"
[[ "$expected_count" =~ ^[1-9][0-9]*$ ]] || {
  echo 'sabora_nonsuperuser_invalid_expected_chain' >&2; exit 1;
}
# Same single-session SQL generator as the candidate VPS executor, but the
# lab connects only to its own network-disabled Docker container.
docker exec "$container" psql -X -U postgres -d "$database" -v ON_ERROR_STOP=1 -c \
 "GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO $operator" >/dev/null
snapshot="$RUNNER_TEMP/s51-snapshot-$GITHUB_RUN_ID-$$.json"
sqlfile="$RUNNER_TEMP/s51-genesis-$GITHUB_RUN_ID-$$.sql"
docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U "$operator" -d "$database" \
 < scripts/ci/sabora-s46-dba-readonly.sql > "$snapshot"
node --input-type=module -e '
 import {readFileSync} from "node:fs";
 import {buildGenesisSql} from "./scripts/ops/sabora-s46-genesis.mjs";
 process.stdout.write(buildGenesisSql(process.cwd(),JSON.parse(readFileSync(process.argv[1],"utf8"))));
 ' "$snapshot" > "$sqlfile"
# Wait for the real cooperative lock in another session, then prove the
# contender stops before creating any ledger. Keep both in the same fixture.
docker exec "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U "$operator" -d "$database" \
 -c 'SELECT pg_advisory_lock(513046,1); SELECT pg_sleep(6);' >/dev/null &
lock_pid=$!
held=false
for _ in $(seq 1 30); do
 if [[ "$(docker exec "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U "$operator" -d "$database" \
  -c "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=513046 AND objid=1 AND objsubid=2 AND granted)")" == t ]]; then
  held=true
  break
 fi
 sleep 0.1
done
[[ "$held" == true ]]
if docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U "$operator" -d "$database" < "$sqlfile" > "$log" 2>&1; then
 echo 'sabora_s51_concurrent_operation_not_denied' >&2
 exit 1
fi
grep -F 'sabora_genesis_concurrent' "$log" >/dev/null
test "$(docker exec "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U "$operator" -d "$database" \
 -c "SELECT to_regnamespace('sabora_migration_meta') IS NULL")" = t
wait "$lock_pid"
echo 'sabora_s51_concurrent_genesis_denied_before_ledger'
if ! docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 \
 -U "$operator" -d "$database" < "$sqlfile" > "$log" 2>&1; then
 echo 'sabora_nonsuperuser_migration_blocked:single-session' >&2
 grep -E 'ERROR:|FATAL:|permission denied' "$log" | tail -n 4 >&2 || true
 exit 1
fi
grep -Fx 'sabora_s51_genesis_catalog_ledger_verified' "$log" >/dev/null
node --input-type=module -e '
 import {readFileSync} from "node:fs";
 import {buildMigrationManifest} from "./scripts/ci/migration-manifest.mjs";
 import {verifyAppliedGenesisLedger} from "./scripts/ops/sabora-s46-genesis.mjs";
 process.stdout.write("sabora_s51_applied_ledger_sha256:"+verifyAppliedGenesisLedger(
   readFileSync(process.argv[1],"utf8"),buildMigrationManifest(process.cwd()))+"\n");
 ' "$log"
count="$(docker exec "$container" psql -X -U "$operator" -d "$database" -Atqc \
 'SELECT count(*) FROM sabora_migration_meta.applied_migrations')"
# Replay of the same genesis is denied by the live catalog guard, not by a
# malformed script or an invented offline result.
if docker exec -i "$container" psql -X -Atq -v ON_ERROR_STOP=1 \
 -U "$operator" -d "$database" < "$sqlfile" > "$log" 2>&1; then
 echo 'sabora_s51_genesis_replay_not_denied' >&2; exit 1
fi
grep -F 'sabora_genesis_catalog_drift' "$log" >/dev/null
rm -f "$snapshot" "$sqlfile"
echo 'sabora_s51_genesis_single_session_and_replay_verified'
[[ "$count" -eq "$expected_count" ]] || { echo "sabora_nonsuperuser_incomplete_chain:$count/$expected_count" >&2; exit 1; }

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
  "SELECT count(*) FROM pg_roles WHERE left(rolname,7)='sabora_' AND rolname <> current_user
  AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)")"
[[ "$unsafe_role_attrs" == 0 ]] || {
  echo 'sabora_nonsuperuser_sql_role_escalation' >&2; exit 1;
}
echo 'sabora_nonsuperuser_runtime_role_boundary_verified'

# No skipped RLS tables, no unexpected browser schema access or elevation.
test "$(docker exec "$container" psql -X -U "$operator" -d "$database" -Atqc \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='sabora' AND c.relkind='r'
     AND c.relrowsecurity AND c.relforcerowsecurity")" -eq 73 || {
  echo 'sabora_nonsuperuser_force_rls_mismatch' >&2; exit 1;
}
# Negative scope assertion, one boolean per condition; never print credentials.
# A successful migration chain is not security-approved if browser roles gain access or the DBA privileges drift from the expected fixture state.
scope_matrix="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U "$operator" -d "$database" -Atqc \
  "SELECT has_schema_privilege('anon','sabora','USAGE'),
          has_schema_privilege('authenticated','sabora','USAGE'),
          rolsuper,rolbypassrls
   FROM pg_roles WHERE rolname=current_user")"
if [[ "$scope_matrix" != 'f|f|f|t' ]]; then
  echo "sabora_nonsuperuser_privilege_boundary_failed:${scope_matrix:-empty}" >&2
  exit 1
fi
echo 'sabora_nonsuperuser_privilege_boundary_verified'
# Prove the runtime boundary with a distinct real LOGIN, not with the DBA.
runtime_attributes="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U cv005_ci_restricted_probe -d "$database" -Atqc \
  "SELECT rolsuper,rolbypassrls,rolcreaterole,rolcanlogin
   FROM pg_catalog.pg_roles WHERE rolname=current_user")"
[[ "$runtime_attributes" == 'f|f|f|t' ]] || {
  echo 'sabora_provider_runtime_attributes_unsafe' >&2; exit 1
}
if docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U cv005_ci_restricted_probe -d "$database" -c \
  'SET ROLE sabora_h6_fn_owner' >/dev/null 2>&1; then
  echo 'sabora_provider_runtime_owner_escalation' >&2; exit 1
fi
if docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U cv005_ci_restricted_probe -d "$database" -c \
  'SELECT * FROM sabora.orders LIMIT 1' >/dev/null 2>&1; then
  echo 'sabora_provider_runtime_direct_table_read' >&2; exit 1
fi
echo 'sabora_provider_restricted_runtime_denied'
rm -f "$log"
# All versions and checksums must agree with the exact source tree.
ledger_actual="$(docker exec "$container" psql -X -U "$operator" -d "$database" -Atqc \
 "SELECT name || ':' || sha256 FROM sabora_migration_meta.applied_migrations ORDER BY version")"
ledger_expected="$(node scripts/ci/migration-manifest.mjs | node -e \
 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>console.log(JSON.parse(s).migrations.map(x=>x.name+":"+x.sha256).join("\n")))')"
[[ "$ledger_actual" == "$ledger_expected" ]] || { echo 'sabora_s51_ledger_mismatch' >&2; exit 1; }
# Exercise a COMMIT-time deferred constraint failure after the shared builder
# inserts its ledger record. Neither DDL nor ledger row may survive.
probe="$RUNNER_TEMP/s51-commit-probe-$GITHUB_RUN_ID-$.sql"
node --input-type=module -e '
 import {renderAtomicMigration} from "./scripts/ci/sabora-s46-atomic-migration.mjs";
 import {createHash} from "node:crypto";
 const b=Buffer.from("BEGIN;\nCREATE TABLE sabora_migration_meta.s51_parent(id int PRIMARY KEY);\nCREATE TABLE sabora_migration_meta.s51_child(id int REFERENCES sabora_migration_meta.s51_parent(id) DEFERRABLE INITIALLY DEFERRED);\nINSERT INTO sabora_migration_meta.s51_child VALUES (1);\nCOMMIT;\n");
 process.stdout.write(renderAtomicMigration({name:"00000000000000_s51_atomic_probe.sql",version:"00000000000000",bytes:b.length,sha256:createHash("sha256").update(b).digest("hex")},b));
 ' > "$probe"
if docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" < "$probe" > "$log" 2>&1; then
 echo 'sabora_s51_commit_failure_not_rejected' >&2; exit 1
fi
grep -F 'violates foreign key constraint' "$log" >/dev/null
rm -f "$probe" "$log"
[[ "$(docker exec "$container" psql -X -U "$operator" -d "$database" -Atqc \
 "SELECT to_regclass('sabora_migration_meta.s51_child') IS NULL AND to_regclass('sabora_migration_meta.s51_parent') IS NULL AND NOT EXISTS (SELECT 1 FROM sabora_migration_meta.applied_migrations WHERE version='00000000000000')")" == t ]] || exit 1
if docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" -c \
 'TRUNCATE sabora_migration_meta.applied_migrations' >/dev/null 2>&1; then
 echo 'sabora_s51_ledger_truncate_not_rejected' >&2; exit 1
fi
# The relocated pre-COMMIT CV005 check must reject a genuine, unsafe
# membership change and roll back the ledger entry in the very same transaction.
probe="$RUNNER_TEMP/s51-membership-probe-$GITHUB_RUN_ID-$.sql"
node --input-type=module -e '
 import {renderAtomicMigration} from "./scripts/ci/sabora-s46-atomic-migration.mjs";
 import {createHash} from "node:crypto";
 const b=Buffer.from("BEGIN;\nGRANT sabora_h6_fn_owner TO cv005_ci_restricted_probe WITH SET TRUE, INHERIT TRUE;\nCOMMIT;\n");
 process.stdout.write(renderAtomicMigration({name:"00000000000001_s51_membership_probe.sql",version:"00000000000001",bytes:b.length,sha256:createHash("sha256").update(b).digest("hex")},b));
 ' > "$probe"
if docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" < "$probe" > "$log" 2>&1; then
 echo 'sabora_s51_membership_failure_not_rejected' >&2; exit 1
fi
grep -F 'sabora_s51_unsafe_membership' "$log" >/dev/null
[[ "$(docker exec "$container" psql -X -U "$operator" -d "$database" -Atqc \
 "SELECT NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname='sabora_h6_fn_owner') AND member=(SELECT oid FROM pg_roles WHERE rolname='cv005_ci_restricted_probe')) AND NOT EXISTS (SELECT 1 FROM sabora_migration_meta.applied_migrations WHERE version='00000000000001')")" == t ]] || exit 1
rm -f "$probe" "$log"
echo 'sabora_s51_membership_failure_rolled_back'
# Residual CREATE for a NOLOGIN owner is forbidden even when its memberships
# are clean. The same shared guard must abort it with its ledger row.
probe="$RUNNER_TEMP/s51-create-probe-$GITHUB_RUN_ID-$.sql"
node --input-type=module -e '
 import {renderAtomicMigration} from "./scripts/ci/sabora-s46-atomic-migration.mjs";
 import {createHash} from "node:crypto";
 const b=Buffer.from("BEGIN;\nGRANT CREATE ON SCHEMA sabora TO sabora_h6_fn_owner;\nCOMMIT;\n");
 process.stdout.write(renderAtomicMigration({name:"00000000000002_s51_create_probe.sql",version:"00000000000002",bytes:b.length,sha256:createHash("sha256").update(b).digest("hex")},b));
 ' > "$probe"
if docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U "$operator" -d "$database" < "$probe" > "$log" 2>&1; then
 echo 'sabora_s51_residual_create_not_rejected' >&2; exit 1
fi
grep -F 'sabora_s51_residual_schema_create' "$log" >/dev/null
[[ "$(docker exec "$container" psql -X -U "$operator" -d "$database" -Atqc \
 "SELECT NOT has_schema_privilege('sabora_h6_fn_owner','sabora','CREATE') AND NOT EXISTS (SELECT 1 FROM sabora_migration_meta.applied_migrations WHERE version='00000000000002')")" == t ]] || exit 1
rm -f "$probe" "$log"
echo 'sabora_s51_residual_create_rolled_back'
# Exercise the actual active staff preflight on the SAME PG17 database
# just installed by the non-superuser DBA, not a separate superuser fixture.
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U "$operator" -d "$database" <<'SQL'
CREATE ROLE sabora_ci_s51_staff_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT USAGE ON SCHEMA sabora TO sabora_ci_s51_staff_login;
GRANT SELECT(user_id,role,state) ON sabora.staff_members TO sabora_ci_s51_staff_login;
CREATE POLICY ci_s51_staff_reader ON sabora.staff_members FOR SELECT TO sabora_ci_s51_staff_login USING (true);
SQL
SABORA_CI_S51_CONTAINER="$container" SABORA_CI_S51_DB="$database" node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {preflightOrderTransitionStaffIdentity} from './apps/api/src/order-operations-identity-preflight.mjs';
const {SABORA_CI_S51_CONTAINER:c,SABORA_CI_S51_DB:d}=process.env;
const login='sabora_ci_s51_staff_login';
const sql=(user,q)=>execFileSync('docker',['exec',c,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',d,'-c',q],{encoding:'utf8'}).trim();
const pool={async connect(){return {async query(q){
 return {rows:[JSON.parse(sql(login,'SELECT row_to_json(result) FROM ('+q+') result'))]};
},release(){}}}};
const run=()=>preflightOrderTransitionStaffIdentity({pool,role:login});
assert.deepEqual(await run(),{role:login});
// Extra inbound grant, role inheritance and ability to assume an owner must
// never be legitimized by the CV005 automatic membership exception.
for(const [grant,revoke] of [
 ['GRANT '+login+' TO cv005_ci_restricted_probe WITH SET TRUE, INHERIT FALSE',
  'REVOKE '+login+' FROM cv005_ci_restricted_probe'],
 ['GRANT sabora_order_operations_fn_owner TO cv005_ci_restricted_probe WITH SET TRUE, INHERIT FALSE',
  'REVOKE sabora_order_operations_fn_owner FROM cv005_ci_restricted_probe'],
 ['GRANT sabora_catalog_reader TO '+login+' WITH SET TRUE, INHERIT FALSE',
  'REVOKE sabora_catalog_reader FROM '+login]
]){
 sql('postgres',grant);
 try{await assert.rejects(run(),/order_operations_sql_identity_rejected/);}
 finally{sql('postgres',revoke);}
 assert.deepEqual(await run(),{role:login});
}
assert.equal(sql(login,'SELECT count(*) FROM (SELECT user_id,role,state FROM sabora.staff_members) x'),'0');
console.log('sabora_s51_real_nonsuperuser_staff_runtime_preflight_verified');
JS
echo 'sabora_s51_nonsuperuser_atomic_ledger_verified'
echo "sabora_nonsuperuser_pg17_migration_chain_ok:$count"
