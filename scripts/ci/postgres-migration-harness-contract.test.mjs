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

test('non-superuser Supabase compatibility harness is isolated and exercises the full ordered chain',()=>{
 for(const required of [
  'GITHUB_ACTIONS','GITHUB_RUN_ID','RUNNER_TEMP','--network none',
  'NOSUPERUSER NOBYPASSRLS NOREPLICATION','CREATEROLE',
  'node scripts/ci/migration-audit.mjs',
  "docker inspect -f '{{.HostConfig.NetworkMode}}'",
  'supabase/migrations/$name',
  'sabora_nonsuperuser_migration_blocked:$name',
  'sabora_nonsuperuser_force_rls_mismatch',
  'sabora_nonsuperuser_pg17_migration_chain_ok:',

  'sabora_ci_membership_probe',
  'sabora_nonsuperuser_runtime_role_boundary_verified',
  'sabora_nonsuperuser_bootstrap_membership_confirmed',
  'sabora_nonsuperuser_incomplete_chain:',




 ])assert.ok(providerCompat.includes(required),required);
 assert.match(providerCompat,/CREATE DATABASE \$database OWNER \$operator/);
 assert.match(providerCompat,/20261024190000_sabora_order_operation_actor_capability_candidate.sql/);
 assert.match(providerCompat,/unsafe_memberships/);
 assert.match(providerCompat,/unsafe_role_attrs/);
 assert.match(providerCompat,/docker exec -i "\$container" psql -X -v ON_ERROR_STOP=1/);
 assert.doesNotMatch(providerCompat,/DATABASE_URL|SUPABASE_DB_|--publish|--network host|docker (system|volume|network) prune/);
 assert.match(providerWorkflow,/Rehearse complete Sabora chain as non-superuser on disposable PG17/);
 assert.match(providerWorkflow,/bash scripts\/ci\/supabase-nonsuperuser-migration-smoke\.sh/);
 assert.doesNotMatch(providerWorkflow,/secrets\.|SUPABASE_DB_|DATABASE_URL/);
});

const PG17_OWNER_MIGRATIONS = [
 '20261021030000_sabora_customer_session_restricted_rpcs.sql',
 '20261021200000_sabora_catalog_reader.sql',
 '20261024190000_sabora_order_operation_actor_capability_candidate.sql',
 '20261027122858_sabora_h6_events_payments_operations_candidate.sql',
 '20261027190334_sabora_pickup_claim_cancel_candidate.sql',
 '20261027225805_sabora_staff_display_id_candidate.sql',
 '20261030190000_sabora_h6_table_change_request_decision_candidate.sql',
 '20261031020000_sabora_h6_decision_lock_order_fix_candidate.sql',
 '20261103020000_sabora_h6_live_economic_event_destination_candidate.sql',
 '20261104094055_sabora_h6_order_revision_correction_candidate.sql',
 '20261105150000_sabora_m3_management_candidate.sql',
 '20261107190000_sabora_m4_third_party_cash_provenance_candidate.sql',
 '20261107200000_sabora_m4_cash_tips_candidate.sql',
 '20261108070000_sabora_m5_communications_candidate.sql',
 '20261110232000_sabora_m3_effective_management_permissions_candidate.sql'
];
test('PG17 candidate owner transfers are scoped to the original migration transaction',()=>{
 for(const name of PG17_OWNER_MIGRATIONS) {
  const sql=readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
  const grants=[...sql.matchAll(/^GRANT CREATE ON SCHEMA sabora TO (sabora_\w+);$/gm)].map(x=>x[1]);
  const memberships=[...sql.matchAll(/^GRANT (sabora_\w+) TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;$/gm)].map(x=>x[1]);
  const revokes=[...sql.matchAll(/^REVOKE (sabora_\w+) FROM CURRENT_USER;$/gm)].map(x=>x[1]);
  const schemaRevokes=[...sql.matchAll(/^REVOKE CREATE ON SCHEMA sabora FROM (sabora_\w+);$/gm)].map(x=>x[1]);
  assert.ok(grants.length>0,name+': no scoped owner grants');
  assert.deepEqual(grants,memberships,name);
  assert.deepEqual(grants,revokes,name);
  assert.deepEqual(grants,schemaRevokes,name);
  assert.ok(sql.indexOf('BEGIN;')<sql.indexOf('GRANT CREATE ON SCHEMA sabora'),name);
  assert.ok(sql.lastIndexOf('COMMIT;')>sql.lastIndexOf('REVOKE CREATE ON SCHEMA sabora'),name);
  assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1,name);
 }
});
test('HMAC-bound owner retains negative policy for all runtime and unexpected members',()=>{
 const sql=readFileSync(new URL('../../supabase/migrations/20261024190000_sabora_order_operation_actor_capability_candidate.sql',import.meta.url),'utf8');
 for(const code of [
  'unsafe_sabora_order_operations_fn_owner_membership',
  'AND grantor.rolsuper AND membership.admin_option',
  'NOT membership.inherit_option AND NOT membership.set_option',
  'member.rolname = current_user::text',
 ])assert.ok(sql.includes(code),code);
});
