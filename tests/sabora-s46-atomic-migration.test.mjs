import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {renderAtomicMigration,buildReviewedMigrationSql} from '../scripts/ci/sabora-s46-atomic-migration.mjs';
import {buildMigrationManifest} from '../scripts/ci/migration-manifest.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const entry=b=>({name:'20261124000000_probe.sql',version:'20261124000000',bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});
test('atomic S46 ledger genesis is inside first transaction and ledger insert precedes final commit',()=>{
 const b=Buffer.from('BEGIN;\nSELECT 1;\nCOMMIT;\n');
 const r=renderAtomicMigration(entry(b),b,{first:true});
 assert.ok(r.indexOf('CREATE SCHEMA')>r.indexOf('BEGIN;'));
 assert.ok(r.indexOf('INSERT INTO sabora_migration_meta.applied_migrations')<r.lastIndexOf('COMMIT;'));
 assert.match(r,/BEFORE UPDATE OR DELETE OR TRUNCATE/);
 assert.doesNotMatch(renderAtomicMigration(entry(b),b),/CREATE SCHEMA/);
});
test('reject changed bytes, bad names, injected psql meta commands and trailing SQL',()=>{
 const b=Buffer.from('BEGIN;\nSELECT 1;\nCOMMIT;\n');
 assert.throws(()=>renderAtomicMigration({...entry(b),sha256:'0'.repeat(64)},b));
 assert.throws(()=>renderAtomicMigration({...entry(b),name:'../x.sql'},b));
 for(const s of ['BEGIN;\nSELECT 1;\nCOMMIT;\nSELECT 2;','BEGIN;\n\\i file\nCOMMIT;\n','BEGIN;\nSET CONSTRAINTS ALL IMMEDIATE;\nCOMMIT;\n','SELECT 1;\nBEGIN;\nCOMMIT;\n']){
  const x=Buffer.from(s);assert.throws(()=>renderAtomicMigration(entry(x),x));
 }
});
test('full reviewed migration tree is transformed without changing source bytes',()=>{
 const entries=buildMigrationManifest(root),sql=buildReviewedMigrationSql(root);
 assert.equal((sql.match(/^INSERT INTO sabora_migration_meta\.applied_migrations\(version,name,sha256\)/gm)||[]).length,entries.length);
 for(const e of entries)assert.ok(sql.includes("'"+e.version+"','"+e.name+"','"+e.sha256+"'"),e.name);
 assert.equal((sql.match(/^CREATE SCHEMA sabora_migration_meta;$/gm)||[]).length,1);
 assert.equal((sql.match(/^DO \$s51_cv005\$/gm)||[]).length,entries.length*2,'CV005 before and after each COMMIT');
 const parts=sql.split(/^COMMIT;[ \t]*\r?$/gim);
 assert.equal(parts.length,entries.length+1);
 for(const part of parts.slice(1)){
  const guard=part.indexOf('DO $s51_cv005$');
  const nextBegin=part.search(/^BEGIN;[ \t]*\r?$/im);
  assert.ok(guard>=0 && (nextBegin<0 || guard<nextBegin),'postcommit guard before next migration');
 }
 assert.throws(()=>buildReviewedMigrationSql(root,'not-reviewed.sql'));
});
