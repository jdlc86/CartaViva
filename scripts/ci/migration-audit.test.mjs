import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {buildMigrationAudit,REVIEWED_MIGRATION_AUDIT,validateMigrationAudit} from './migration-audit.mjs';

test('reviewed audit covers every real migration with no unverified acceptance field',()=>{
 const audit=buildMigrationAudit(resolve('.'));
 assert.equal(audit.migrations.length,57);
 assert.match(audit.manifestSha256,/^[a-f0-9]{64}$/);
 for(const migration of audit.migrations){
  assert.equal(migration.reviewed,true);
  assert.equal(migration.postgres,'17');
  assert.notEqual(migration.reversibility,'unverified');
  assert.notEqual(migration.lockImpact,'unverified');
  assert.notEqual(migration.dataImpact,'unverified');
  assert.match(migration.sha256,/^[a-f0-9]{64}$/);
 }
});

test('audit fails closed when a migration lacks an individual review or a review is stale',()=>{
 const manifest=[{name:Object.keys(REVIEWED_MIGRATION_AUDIT)[0]}];
 assert.throws(()=>validateMigrationAudit(manifest,{}),/coverage_mismatch/);
 assert.throws(()=>validateMigrationAudit([],{stale:{reviewed:true}}),/coverage_mismatch/);
});
