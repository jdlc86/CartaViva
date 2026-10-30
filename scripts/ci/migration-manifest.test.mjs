import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildMigrationManifest} from './migration-manifest.mjs';

function fixture(files,fn){
 const root=mkdtempSync(join(tmpdir(),'sabora-manifest-'));
 mkdirSync(join(root,'supabase','migrations'),{recursive:true});
 try{
  for(const [name,sql] of Object.entries(files))
   writeFileSync(join(root,'supabase','migrations',name),sql);
  return fn(root);
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('migration manifest is sorted, deterministic and checksummed',()=>{
 fixture({'20261029000002_second.sql':'select 2;','20261029000001_first.sql':'select 1;'},root=>{
  const a=buildMigrationManifest(root),b=buildMigrationManifest(root);
  assert.deepEqual(a,b);
  assert.deepEqual(a.map(x=>x.version),['20261029000001','20261029000002']);
  assert.match(a[0].sha256,/^[a-f0-9]{64}$/);
  assert.equal(a[0].bytes,9);
 });
});
test('migration manifest rejects ambiguous or missing SQL versions',()=>{
 fixture({},root=>assert.throws(()=>buildMigrationManifest(root),/empty/));
 fixture({'20261029000001_first.sql':'select 1;','20261029000001_second.sql':'select 2;'},root=>
  assert.throws(()=>buildMigrationManifest(root),/duplicate_version/));
 fixture({'unexpected.sql':'select 1;'},root=>
  assert.throws(()=>buildMigrationManifest(root),/invalid_filename/));
});
