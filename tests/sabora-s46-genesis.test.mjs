import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {buildGenesisSql,assertSqlApproval,GENESIS_OK} from '../scripts/ops/sabora-s46-genesis.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('single-session genesis guard precedes any ledger DDL and has final exact check',()=>{
 const sql=buildGenesisSql(root,{observed_at:new Date().toISOString(),ledger_exists:false});
 assert.ok(sql.indexOf('pg_try_advisory_lock')<sql.indexOf('CREATE SCHEMA sabora_migration_meta'));
 assert.ok(sql.indexOf('sabora_genesis_catalog_drift')<sql.indexOf('CREATE SCHEMA sabora_migration_meta'));
 assert.match(sql,/sabora_genesis_ledger_mismatch/);
 assert.ok(sql.trim().endsWith("SELECT '"+GENESIS_OK+"';"));
 assert.match(sql,/sabora_s51_unsafe_membership/);
});
test('SQL admission requires exact approved digests, distinct authorization and bounded timeouts',()=>{
 const manifest={manifestSha256:'a'.repeat(64)},cat='b'.repeat(64),env={
  SABORA_S46_SQL_APPROVAL:'explicit-first-genesis-migration',SABORA_S46_DDL_EXCLUSION:'verified-by-authorized-operator',
  SABORA_S46_APPROVED_MIGRATION_MANIFEST_SHA256:manifest.manifestSha256,SABORA_S46_APPROVED_CATALOG_SHA256:cat,
  SABORA_S46_STATEMENT_TIMEOUT_MS:'60000',SABORA_S46_LOCK_TIMEOUT_MS:'5000',SABORA_S46_TOTAL_TIMEOUT_MS:'300000'};
 assert.deepEqual(assertSqlApproval(env,manifest,cat),{statement:60000,lock:5000,total:300000});
 for(const k of Object.keys(env))assert.throws(()=>assertSqlApproval({...env,[k]:''},manifest,cat));
 assert.throws(()=>assertSqlApproval({...env,SABORA_S46_APPROVED_CATALOG_SHA256:'c'.repeat(64)},manifest,cat));
 assert.throws(()=>assertSqlApproval({...env,SABORA_S46_LOCK_TIMEOUT_MS:'60001'},manifest,cat));
});
