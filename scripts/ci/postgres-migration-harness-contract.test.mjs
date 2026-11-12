import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

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
 assert.match(providerCompat,/sabora_nonsuperuser_bootstrap_membership_confirmed/);
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
  assert.deepEqual(grants.slice().sort(),memberships.slice().sort(),name);
  assert.deepEqual(grants.slice().sort(),revokes.slice().sort(),name);
  assert.deepEqual(grants.slice().sort(),schemaRevokes.slice().sort(),name);
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

test('all 99 PG17 migration versions leave scoped owner grants inside BEGIN/COMMIT',()=>{
 const folder=new URL('../../supabase/migrations/',import.meta.url);
 const names=readdirSync(folder).filter(x=>/^\d{14}_[\w-]+\.sql$/.test(x)).sort();
 assert.equal(names.length,99,'exact audited chain');
 let ownerTransferVersions=0;
 for(const name of names){
  const sql=readFileSync(new URL(name,folder),'utf8');
  const owners=[...new Set([...sql.matchAll(/\bOWNER TO (sabora_\w+);/g)].map(x=>x[1]))];
  if(!owners.length)continue;
  ownerTransferVersions++;
  const begin=sql.indexOf('BEGIN;');
  const commit=sql.lastIndexOf('COMMIT;');
  assert.ok(begin>=0&&commit>begin,name+': one transaction');
  for(const owner of owners){
   const grant='GRANT CREATE ON SCHEMA sabora TO '+owner+';';
   const member='GRANT '+owner+' TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;';
   const roleRevoke='REVOKE '+owner+' FROM CURRENT_USER;';
   const createRevoke='REVOKE CREATE ON SCHEMA sabora FROM '+owner+';';
   const firstOwner=sql.indexOf('OWNER TO '+owner+';');
   const lastOwner=sql.lastIndexOf('OWNER TO '+owner+';');
   assert.ok(sql.indexOf(grant)>begin && sql.indexOf(grant)<firstOwner,name+': schema CREATE before owner');
   assert.ok(sql.indexOf(member)>begin && sql.indexOf(member)<firstOwner,name+': membership before owner');
   assert.ok(sql.indexOf(roleRevoke)>lastOwner && sql.indexOf(roleRevoke)<commit,name+': membership revoked');
   assert.ok(sql.indexOf(createRevoke)>lastOwner && sql.indexOf(createRevoke)<commit,name+': CREATE revoked');
  }
 }
 assert.ok(ownerTransferVersions>=50,'complete function owner transfer inventory');
});
test('all PG17 sealed owner guards allow at most bootstrap DBA membership',()=>{
 const folder=new URL('../../supabase/migrations/',import.meta.url);
 const gated=[
 '20261024190000_sabora_order_operation_actor_capability_candidate.sql',
 '20261025081318_staff_identity_lifecycle_candidate.sql',
 '20261027122858_sabora_h6_events_payments_operations_candidate.sql',
 '20261027225805_sabora_staff_display_id_candidate.sql',
 '20261028120000_sabora_staff_directory_read_candidate.sql'
 ];
 for(const name of gated){
  const sql=readFileSync(new URL(name,folder),'utf8');
  assert.match(sql,/grantor\.rolsuper/,name);
  assert.match(sql,/\.admin_option/,name);
  assert.match(sql,/NOT (?:membership|m)\.set_option/,name);
  assert.match(sql,/NOT (?:membership|m)\.inherit_option/,name);
  assert.match(sql,/current_user::text/,name);
 }
});
test('broad legacy SQL REVOKEs use a scoped temporary owner-membership fence',()=>{
 const folder=new URL('../../supabase/migrations/',import.meta.url);
 const gated=[
 '20261024190000_sabora_order_operation_actor_capability_candidate.sql',
 '20261025081318_staff_identity_lifecycle_candidate.sql',
 '20261027122858_sabora_h6_events_payments_operations_candidate.sql',
 '20261027225805_sabora_staff_display_id_candidate.sql',
 '20261028120000_sabora_staff_directory_read_candidate.sql',
 '20261109020000_sabora_waiter_calls_integral_candidate.sql'
 ];
 for(const name of gated){
  const sql=readFileSync(new URL(name,folder),'utf8');
  assert.ok(sql.includes('DO $cv005_scope$')&&sql.includes('DO $cv005_release$'),name);
  assert.ok(sql.indexOf('DO $cv005_scope$')<sql.indexOf('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora'),name);
  assert.ok(sql.indexOf('DO $cv005_release$')>sql.indexOf('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sabora'),name);
  assert.ok(sql.indexOf('DO $cv005_release$')<sql.lastIndexOf('COMMIT;'),name);
 }
});

test('all 52 provider-adapted versions preserve one transaction and restore installer owner roles',()=>{
 const folder=new URL('../../supabase/migrations/',import.meta.url);
 const files=readdirSync(folder).filter(x=>/^\d{14}_[\w-]+\.sql$/.test(x)).sort();
 assert.equal(files.length,99,'full chain inventory');
 let protectedCount=0;
 for (const name of files) {
  const sql=readFileSync(new URL(name,folder),'utf8');
  if (!sql.includes('DO $cv005_early_owner_scope$')) continue;
  protectedCount++;
  for (const part of [
   '$cv005_early_owner_release$;',
   'cv005_unsafe_existing_fn_owner',
   "left(r.rolname,7)='sabora_'",
   "right(r.rolname,9)='_fn_owner'",
   'GRANT %I TO CURRENT_USER WITH SET TRUE, INHERIT TRUE',
   'REVOKE %I FROM CURRENT_USER'
  ]) assert.ok(sql.includes(part),name+': missing '+part);
  assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1,name);
  assert.ok(sql.indexOf('BEGIN;')<sql.indexOf('DO $cv005_early_owner_scope$'),name);
  assert.ok(sql.indexOf('DO $cv005_early_owner_release$')<sql.lastIndexOf('COMMIT;'),name);
 }
 assert.equal(protectedCount,52,'all old candidate versions covered');
 assert.match(providerCompat,/sabora_nonsuperuser_postcommit_membership_leak/);
});
