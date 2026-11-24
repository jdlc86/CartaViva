import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {validateTransport,checkSnapshot,assertRunner,assertCustodian,DIRECT_HOST} from '../scripts/ci/sabora-s46-dba-readonly.mjs';
const repo=resolve(fileURLToPath(new URL('..',import.meta.url)));
const hash=s=>createHash('sha256').update(s).digest('hex');
const id='1234567890123456789';
const expectedSystemIdSha256=hash(id);
const names=['project_schemas','project_roles','project_memberships','project_relations','project_routines',
 'project_types','project_triggers','project_policies','project_event_triggers','project_default_acls'];
const candidate=()=>({database:'postgres',session_user:'postgres',effective_user:'postgres',postgres_major:17,system_identifier:id,
 ssl_active:true,ssl_version:'TLSv1.3',pgcrypto_version:'1.3',ledger_exists:false,core_exists:false,
 observed_at:new Date().toISOString(),...Object.fromEntries(names.map(x=>[x,[]]))});
const cert=Buffer.from('-----BEGIN CERTIFICATE-----\nZml4dHVyZQ==\n-----END CERTIFICATE-----\n').toString('base64');
test('DBA observation: exact PG17 identity, encrypted verified connection, absence, unsigned evidence',()=>{
 const s=candidate(),r=checkSnapshot(s,{expectedSystemIdSha256});
 assert.equal(r.operationalGo,false);assert.equal(r.migrationExecutionAuthorized,false);
 assert.equal(r.dbaSigned,false);assert.equal(r.originalCatalogCustodied,false);
 assert.equal(r.ddlConcurrencyExcluded,false);assert.equal(r.sslMode,'verify-full');
 assert.match(r.catalogSha256,/^[a-f0-9]{64}$/);
 assert.equal(r.sourceSystemIdSha256,expectedSystemIdSha256);
});
test('DBA fail closed: prior project roles/tables/functions, snapshots, ledger, alternate cluster, non-TLS',()=>{
 const cases=[
  s=>s.project_schemas.push('sabora'),s=>s.project_roles.push('sabora_x'),
  s=>s.project_memberships.push('sabora_a:sabora_b'),s=>s.project_relations.push('public.sabora_x'),
  s=>s.project_routines.push('public.sabora_fn'),s=>s.project_types.push('public.sabora_type'),
  s=>s.project_triggers.push('sabora_trigger'),s=>s.project_policies.push('sabora_policy'),
  s=>s.project_event_triggers.push('sabora_event'),s=>s.project_default_acls.push('r:sabora_owner'),
  s=>s.ledger_exists=true,s=>s.core_exists=true,s=>s.ssl_active=false,
  s=>s.ssl_version='TLSv1.1',s=>s.system_identifier='12345678901234567',
  s=>s.effective_user='foreign',s=>s.postgres_major=16,s=>s.database='other',s=>s.pgcrypto_version=null,
  s=>s.project_schemas='not-an-array',s=>s.observed_at='2020-01-01T00:00:00Z'
 ];
 for(const mutate of cases){const s=candidate();mutate(s);
  assert.throws(()=>checkSnapshot(s,{expectedSystemIdSha256}),/sabora_s46_stop:/);}
});
test('approved direct Supabase project only, no pooler, no missing CA/password/cluster pin',()=>{
 const options={host:DIRECT_HOST,user:'postgres',port:'5432',password:'fake-test-not-operational',
  caPemB64:cert,expectedSystemIdSha256};
 assert.equal(validateTransport(options).host,DIRECT_HOST);
 for(const patch of [{host:'db.fleetia.example'},{host:'eu-central-1.pooler.supabase.com'},
   {port:6543},{user:'postgres.other'},{password:''},{caPemB64:''},
   {expectedSystemIdSha256:'0'.repeat(64)}]){
  assert.throws(()=>validateTransport({...options,...patch}),/sabora_s46_stop:/);}
});
test('workflow and SQL cannot silently become migrator or weaker TLS flow',()=>{
 const workflow=readFileSync(join(repo,'.github/workflows/sabora-s46-dba-readonly.yml'),'utf8');
 const script=readFileSync(join(repo,'scripts/ci/sabora-s46-dba-readonly.mjs'),'utf8');
 const sql=readFileSync(join(repo,'scripts/ci/sabora-s46-dba-readonly.sql'),'utf8');
 assert.match(workflow,/workflow_dispatch:/);assert.doesNotMatch(workflow,/issues:|\bpush:|\bpull_request:|workflow_run:/);
 assert.doesNotMatch(workflow,/environment: sabora-dba-readonly|secrets\.|SABORA_S46_DB_PASSWORD|observe:/);
 assert.match(workflow,/github\.actor == github\.repository_owner/);
 assert.match(workflow,/sabora-release-governor\.mjs check-ci plan "\$GITHUB_SHA"/);
 assert.doesNotMatch(workflow,/windows-offline-signer/);
 assert.match(workflow,/sabora-s46-dba-readonly\.mjs plan/);
 assert.match(workflow,/test "\$SABORA_S46_RELEASE_SHA" = "\$GITHUB_SHA"/);
 assert.doesNotMatch(workflow,/requested='\$\{\{ inputs\.release_sha \}\}'/);
 assert.match(script,/PGSSLMODE:'verify-full'/);
 assert.match(script,/PGOPTIONS:'-c default_transaction_read_only=on/);
 assert.match(script,/PGSSLROOTCERT:ca/);assert.match(script,/Object\.hasOwn\(env,'GITHUB_ACTIONS'\)/);
 assert.match(script,/--porcelain','--untracked-files=all/);
 assert.match(script,/expectedSystemIdSha256/);
 assert.doesNotMatch(workflow,/SABORA_RELEASE_AGENT_READY|sabora-governed-deploy|SABORA_SSH_KEY_B64/);
 assert.match(sql,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
 assert.match(sql,/ROLLBACK;/);
 assert.doesNotMatch(sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n'),/\b(?:UPDATE|INSERT|DELETE|CREATE|ALTER|DROP|TRUNCATE|COPY|GRANT|REVOKE|CALL|DO)\b/i);
});
test('workflow cannot run for foreign repo/branch, changed current SHA or without exact runner',()=>{
 const sha='a'.repeat(40),args={githubActions:'true',repository:'jdlc86/CartaViva',ref:'refs/heads/main',sha,
 expectedSha:sha,runnerTemp:'/tmp/sabora-ci'};
 assert.equal(assertRunner(args),sha);
 for(const patch of [{repository:'jdlc86/GestionIntegral_Rutaa'},{ref:'refs/heads/dev'},
  {expectedSha:'b'.repeat(40)},{runnerTemp:''},{githubActions:'false'}]){
  assert.throws(()=>assertRunner({...args,...patch}),/sabora_s46_stop:/);}
});

test('custodian execution forbidden in Actions and requires private off-repo directory',()=>{
 const root=repo;
 assert.throws(()=>assertCustodian({env:{GITHUB_ACTIONS:'true',SABORA_S46_OPERATOR_APPROVAL:'explicit-one-time-readonly',SABORA_S46_OUTPUT_DIR:'/tmp'},root}),/sabora_s46_stop:/);
 assert.throws(()=>assertCustodian({env:{GITHUB_ACTIONS:'false',SABORA_S46_OPERATOR_APPROVAL:'',SABORA_S46_OUTPUT_DIR:'/tmp'},root}),/sabora_s46_stop:/);
 assert.throws(()=>assertCustodian({env:{GITHUB_ACTIONS:'false',SABORA_S46_OPERATOR_APPROVAL:'explicit-one-time-readonly',SABORA_S46_OUTPUT_DIR:root},root}),/sabora_s46_stop:/);
});
