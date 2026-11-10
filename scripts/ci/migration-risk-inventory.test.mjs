import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrationRiskInventory} from './migration-risk-inventory.mjs';

function fixture(sqls,run){
 const root=mkdtempSync(join(tmpdir(),'sabora-p2-risk-'));
 try{
  const dir=join(root,'supabase','migrations');
  mkdirSync(dir,{recursive:true});
  sqls.forEach((sql,i)=>writeFileSync(join(dir,`2026102900000${i}_fixture.sql`),sql));
  run(root);
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('risk inventory flags dangerous SQL without certifying reversibility',()=>{
 fixture(['CREATE EXTENSION IF NOT EXISTS pgcrypto; ALTER TABLE sabora.orders ADD COLUMN marker text; REVOKE ALL ON sabora.orders FROM anon;','CREATE POLICY p ON sabora.orders USING (true); INSERT INTO sabora.orders VALUES (1);'],root=>{
  const entries=migrationRiskInventory(root);
  assert.equal(entries.length,2);
  assert.equal(entries[0].signals.extension,true);
  assert.equal(entries[0].signals.potentially_blocking_ddl,true);
  assert.equal(entries[0].signals.roles_or_grants,true);
  assert.equal(entries[1].signals.rls_or_policies,true);
  assert.equal(entries[1].signals.data_mutation,true);
  for(const entry of entries){
   assert.equal(entry.manual_review_required,true);
   assert.equal(entry.reversibility,'unverified');
   assert.match(entry.sha256,/^[a-f0-9]{64}$/);
  }
 });
});
test('risk inventory rejects duplicate versions via manifest',()=>{
 fixture(['SELECT 1;'],root=>{
  const dir=join(root,'supabase','migrations');
  writeFileSync(join(dir,'20261029000000_duplicate.sql'),'SELECT 2;');
  assert.throws(()=>migrationRiskInventory(root),/duplicate_version/);
 });
});
