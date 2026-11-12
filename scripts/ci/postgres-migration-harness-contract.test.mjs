import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const smoke=readFileSync(new URL('./postgres-migration-smoke.sh',import.meta.url),'utf8');
const chain=readFileSync(new URL('./postgres-migration-chain-smoke.sh',import.meta.url),'utf8');
const recovery=readFileSync(new URL('./postgres-recovery-smoke.sh',import.meta.url),'utf8');

test('migration smoke invokes preflight, real-chain resume, transactional failure and clean recovery as commands',()=>{
 assert.doesNotMatch(smoke,/\\nbash scripts\/ci\/postgres-migration-failure-smoke/);
 for(const command of [
  'node scripts/ci/migration-preflight.mjs --container "$container"',
  'bash scripts/ci/postgres-migration-chain-smoke.sh "$container"',
 'bash scripts/ci/postgres-migration-failure-smoke.sh "$container"',
  'bash scripts/ci/postgres-recovery-smoke.sh "$container"'
 ])assert.ok(smoke.includes(command),`missing executable command: ${command}`);
 assert.ok(smoke.indexOf('node scripts/ci/migration-preflight.mjs')<smoke.indexOf('docker run -d --name "$container"'));
});

test('real-chain harness is checksum-ledgered and has no destination URL or bypass flag',()=>{
 assert.match(chain,/applied_migrations/);
 assert.match(chain,/sha256sum/);
 assert.match(chain,/return 75/);
 assert.doesNotMatch(chain,/--force|DATABASE_URL|SUPABASE/);
});

test('recovery uses a second offline PG17 cluster and a genuine restricted LOGIN',()=>{
 assert.match(recovery,/clean_container="sabora-pg-recovery-ci-/);
 assert.match(recovery,/docker run -d --name "\$clean_container" --network none/);
 assert.match(recovery,/create role sabora_p2_restore_probe login/);
 assert.match(recovery,/set role sabora_staff_reader/);
 assert.match(recovery,/clean_cluster_restore_set_role_escalation/);
 assert.doesNotMatch(recovery,/--no-owner|--no-acl|DATABASE_URL|SUPABASE/);
});

test('recovery exercises representative load, lock timeout, corrupt input and target recreation',()=>{
 assert.match(recovery,/P3_RECOVERY_ROWS=10000/);
 assert.match(recovery,/P3_LOCK_TIMEOUT_MS=500/);
 assert.match(recovery,/p3_recovery_load_fixture/);
 assert.match(recovery,/AccessExclusiveLock/);
 assert.match(recovery,/sabora-corrupt-recovery\.dump/);
 assert.match(recovery,/--section=pre-data/);
 assert.match(recovery,/interrupted_old_oid/);
 assert.match(recovery,/interrupted_new_oid/);
 assert.match(recovery,/sabora_p3_recovery_metrics/);
});

const providerCompat=readFileSync(new URL('./supabase-nonsuperuser-migration-smoke.sh',import.meta.url),'utf8');
const providerWorkflow=readFileSync(new URL('../../.github/workflows/supabase-nonsuperuser-compatibility.yml',import.meta.url),'utf8');

test('provider owner admission is read-only, fail-closed and never presented as activation',()=>{
 const sql=readFileSync(new URL('./sabora-pg17-owner-admission.sql',import.meta.url),'utf8');
 assert.match(sql,/SELECT CASE/);
 assert.match(sql,/NO_GO:sealed_owner_privileged_provider_required/);
 assert.match(sql,/NO_GO:first_install_state_not_clean/);
 assert.match(sql,/PREFLIGHT_ONLY:privileged_executor_not_approval/);
 assert.match(sql,/to_regnamespace\('sabora'\)/);
 assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:ROLE|TABLE|FUNCTION|SCHEMA|ON|INTO|FROM)\b/i);
 assert.match(providerCompat,/sabora_nonsuperuser_owner_admission_boundary_verified/);
});

test('disposable PG17 lab demonstrates safe NO-GO and tests the DBA self-grant threat',()=>{
 for(const required of [
  'GITHUB_ACTIONS','GITHUB_RUN_ID','RUNNER_TEMP','--network none',
  'NOSUPERUSER NOBYPASSRLS NOREPLICATION','CREATEROLE',
  'node scripts/ci/migration-audit.mjs',
  "docker inspect -f '{{.HostConfig.NetworkMode}}'",
  'sabora_ci_membership_probe',
  'cv005_ci_runtime_probe',
  'sabora_nonsuperuser_dba_self_grant_risk_and_runtime_denial_verified',
  'sabora_nonsuperuser_sealed_owner_provenance_verified',
  'sabora_nonsuperuser_sealed_owner_negative_guard_bypassed',
  'sabora_nonsuperuser_provider_no_go_verified:',
  'sabora_provider_installation_not_authorized'
 ])assert.ok(providerCompat.includes(required),required);
 assert.match(providerCompat,/CREATE DATABASE \$database OWNER \$operator/);
 assert.match(providerCompat,/20261024190000_sabora_order_operation_actor_capability_candidate.sql/);
 assert.match(providerCompat,/sealed_memberships/);
 assert.match(providerCompat,/docker exec -i "\$container" psql -X -v ON_ERROR_STOP=1/);
 assert.doesNotMatch(providerCompat,/sabora_nonsuperuser_pg17_migration_chain_ok:|sabora_nonsuperuser_provider_no_go:automatic_createrole/);
 assert.doesNotMatch(providerCompat,/DATABASE_URL|SUPABASE_DB_|--publish|--network host|docker (system|volume|network) prune/);
 assert.match(providerWorkflow,/Demonstrate sealed-owner NO-GO and DBA\/runtime separation on disposable PG17/);
 assert.match(providerWorkflow,/bash scripts\/ci\/supabase-nonsuperuser-migration-smoke\.sh/);
 assert.doesNotMatch(providerWorkflow,/secrets\.|SUPABASE_DB_|DATABASE_URL/);
});
