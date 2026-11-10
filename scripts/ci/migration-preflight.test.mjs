import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertDisposableMigrationTarget,buildMigrationPreflight} from './migration-preflight.mjs';

const env={GITHUB_ACTIONS:'true',RUNNER_TEMP:'/runner/temp',GITHUB_RUN_ID:'12345'};
const container='sabora-pg-single-ci-12345-678';

test('preflight binds SHA, ordered checksums and the exact network-isolated harness container',()=>{
 const root=mkdtempSync(join(tmpdir(),'sabora-preflight-'));
 try{
  mkdirSync(join(root,'supabase','migrations'),{recursive:true});
  writeFileSync(join(root,'supabase','migrations','20261029000001_one.sql'),'select 1;');
  const result=buildMigrationPreflight({root,env,container,repositorySha:'a'.repeat(40)});
  assert.equal(result.repositorySha,'a'.repeat(40));
  assert.deepEqual(result.target,{kind:'docker-container',network:'none',name:container});
  assert.equal(result.migrations.length,1);
  assert.match(result.migrations[0].sha256,/^[a-f0-9]{64}$/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('preflight rejects every non-harness destination before a connection can be attempted',()=>{
 assert.throws(()=>assertDisposableMigrationTarget({env:{...env,GITHUB_ACTIONS:'false'},container}),/harness_required/);
 assert.throws(()=>assertDisposableMigrationTarget({env,container:'sabora-pg-single-ci-999-678'}),/foreign_container/);
 assert.throws(()=>assertDisposableMigrationTarget({env,container:'postgres://example.invalid/db'}),/foreign_container/);
 assert.throws(()=>buildMigrationPreflight({root:'.',env,container,repositorySha:'HEAD'}),/invalid_repository_sha/);
});
