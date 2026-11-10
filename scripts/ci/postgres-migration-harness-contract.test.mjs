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
