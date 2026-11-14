// Disposable CI proof for the Sabora-only dual-backup path. It captures a
// migrated PG17 database directly into authenticated ciphertext, destroys the
// capture staging copy, and restores only from the off-site-class replica into
// a second networkless PG17 cluster. It is not an operational backup receipt.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chmod,mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 captureEncryptedBackupBundle,decryptBackupComponent,
 inspectEncryptedBackupBundle,replicateEncryptedBackupBundle,
} from '../ops/sabora-encrypted-backup-bundle.mjs';

const failure=code=>Error('sabora_dual_backup_ci_stop:'+code);
const here=resolve(fileURLToPath(new URL('.',import.meta.url)));
const root=resolve(here,'../..');
const migrationsDirectory=join(root,'supabase','migrations');
const rolesSql=join(here,'sabora-backup-roles.sql');
const inventorySql=join(here,'sabora-backup-inventory.sql');
const source=process.env.SABORA_CI_PG_CONTAINER??'';
const runId=process.env.GITHUB_RUN_ID??'';
const releaseSha=process.env.GITHUB_SHA??'';
if(process.env.GITHUB_ACTIONS!=='true'||!process.env.RUNNER_TEMP||!/^\d+$/.test(runId)||
 !new RegExp('^sabora-node-pg17-'+runId+'-[0-9]+$').test(source)||
 !/^[0-9a-f]{40}$/.test(releaseSha))throw failure('disposable_actions_context_required');

function docker(args,{input,allowFailure=false}={}){
 const result=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});
 if(!allowFailure&&(result.error||result.status!==0)){
  const detail=String(result.stderr??'').replace(/[^A-Za-z0-9_:. -]/g,'_').slice(0,800);
  throw failure('docker_command_failed:'+String(result.status??'spawn')+':'+detail);
 }
 return result;
}
function psql(container,database,sql,{allowFailure=false}={}){
 return docker(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1',
  '-U','postgres','-d',database,'-f','-'],{input:sql,allowFailure});
}
function sha256(value){return createHash('sha256').update(value).digest('hex');}
function sqlLiteral(value){return "'"+value.replaceAll("'","''")+"'";}
async function migrationInventory(){
 const names=(await readdir(migrationsDirectory)).filter(x=>/^\d{14}_[a-z0-9_]+\.sql$/.test(x)).sort();
 if(names.length!==99)throw failure('expected_99_migrations');
 const rows=[],tree=createHash('sha256');
 for(const filename of names){
  const content=await readFile(join(migrationsDirectory,filename));
  const digest=sha256(content),version=filename.slice(0,14),name=filename.slice(15,-4);
  tree.update(filename).update('\0').update(digest).update('\n');
  rows.push('('+[version,name,digest].map(sqlLiteral).join(',')+')');
 }
 return {treeSha256:tree.digest('hex'),rows};
}
async function waitForPg(container){
 for(let attempt=0;attempt<60;attempt++){
  const probe=docker(['exec',container,'psql','-X','-U','postgres','-d','postgres','-Atqc','select 1'],
   {allowFailure:true});
  if(probe.status===0&&probe.stdout.trim()==='1')return;
  await new Promise(accept=>setTimeout(accept,1000));
 }
 throw failure('restore_cluster_not_ready');
}
function elapsed(start){return Number((process.hrtime.bigint()-start)/1000000n);}

const fixture=await mkdtemp(join(process.env.RUNNER_TEMP||tmpdir(),'sabora-dual-backup-'));
const capture=join(fixture,'encrypted-capture');
const offsite=join(fixture,'external-store-fixture');
const vpsCache=join(fixture,'vps-encrypted-cache-fixture');
const restoreWork=join(fixture,'restore-work');
const keyPath=join(fixture,'custodian.key');
const wrongKeyPath=join(fixture,'wrong-custodian.key');
const target='sabora-dual-backup-restore-'+runId+'-'+process.pid;
let targetStarted=false;
const started=process.hrtime.bigint();
try{
 const migrations=await migrationInventory();
 const recoveryAuthorityFixture=`
  do $sabora_provider_fixture$
  begin
   if exists(select 1 from pg_roles where rolname='cv005_recovery_provider_dba') then
    raise exception 'cv005_recovery_provider_dba_preexists';
   end if;
   execute 'create role cv005_recovery_provider_dba
    login createrole nosuperuser nocreatedb noreplication nobypassrls noinherit
    connection limit 2';
  end $sabora_provider_fixture$;
  grant sabora_h6_fn_owner to cv005_recovery_provider_dba
   with admin true, set false, inherit false;
 `;
 psql(source,'postgres',recoveryAuthorityFixture);
 const ledgerSql=`
  create schema sabora_migration_meta;
  revoke all on schema sabora_migration_meta from public,anon,authenticated;
  create table sabora_migration_meta.applied_migrations(
   version text primary key check(version ~ '^[0-9]{14}$'),
   name text not null unique,
   sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
   application_count integer not null default 1 check(application_count=1),
   applied_at timestamptz not null default clock_timestamp());
  revoke all on all tables in schema sabora_migration_meta from public,anon,authenticated;
  insert into sabora_migration_meta.applied_migrations(version,name,sha256) values
  ${migrations.rows.join(',\n')};
 `;
 psql(source,'postgres',ledgerSql);
 const postgresVersion=psql(source,'postgres','show server_version;').stdout.trim();
 assert.match(postgresVersion,/^17\./);
 await writeFile(keyPath,randomBytes(32).toString('hex')+'\n',{mode:0o600});
 await writeFile(wrongKeyPath,randomBytes(32).toString('hex')+'\n',{mode:0o600});
 await chmod(keyPath,0o600);await chmod(wrongKeyPath,0o600);
 const captureStarted=process.hrtime.bigint();
 const result=await captureEncryptedBackupBundle({directory:capture,keyPath,metadata:{
  schema:'sabora-logical-backup/v1',backupId:'SABORA-BACKUP-CI-'+runId,
  repository:'jdlc86/CartaViva',releaseSha,sourceProjectRef:'byhvmumqivmunkmomhup',
  postgresMajor:17,postgresVersion,migrationTreeSha256:migrations.treeSha256,
  includedSchemas:['sabora','sabora_migration_meta'],
  excludedManagedSchemas:['auth','extensions','realtime','storage','supabase_functions','vault'],
  createdAt:new Date().toISOString(),custody:'key-outside-artifact-git-actions-vps',
 },components:[
  {name:'roles-memberships',mediaType:'application/sql',command:'docker',
   args:['exec','-i',source,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],
   stdinPath:rolesSql},
  {name:'schema',mediaType:'application/vnd.postgresql.custom',command:'docker',
   args:['exec',source,'pg_dump','-U','postgres','-d','postgres','-Fc','--schema=sabora',
    '--schema=sabora_migration_meta','--schema-only']},
  {name:'data',mediaType:'application/vnd.postgresql.custom',command:'docker',
   args:['exec',source,'pg_dump','-U','postgres','-d','postgres','-Fc','--schema=sabora',
    '--schema=sabora_migration_meta','--data-only']},
  {name:'inventory',mediaType:'text/plain',command:'docker',
   args:['exec','-i',source,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],
   stdinPath:inventorySql},
 ]});
 const captureMs=elapsed(captureStarted);
 assert.equal((await inspectEncryptedBackupBundle(capture)).containsPlaintext,false);
 const externalReceipt=await replicateEncryptedBackupBundle({sourceDirectory:capture,
  destinationDirectory:offsite,destinationClass:'offsite'});
 const vpsReceipt=await replicateEncryptedBackupBundle({sourceDirectory:capture,
  destinationDirectory:vpsCache,destinationClass:'vps-encrypted-cache'});
 assert.equal(externalReceipt.manifestSha256,result.manifestSha256);
 assert.equal(vpsReceipt.manifestSha256,result.manifestSha256);
 assert.equal(externalReceipt.containsKey,false);assert.equal(vpsReceipt.containsPlaintext,false);
 for(const directory of [offsite,vpsCache]){
  assert.deepEqual((await readdir(directory)).sort(),[
   'data.aesgcm','inventory.aesgcm','manifest.json','roles-memberships.aesgcm','schema.aesgcm']);
 }
 // The capture staging replica is gone before restore; the VPS-class replica
 // is deliberately not consulted. Recovery has one source: external store.
 await rm(capture,{recursive:true,force:true});
 await mkdir(restoreWork,{mode:0o700});
 const rolesOut=join(restoreWork,'roles.sql'),schemaOut=join(restoreWork,'sabora-schema.dump');
 const dataOut=join(restoreWork,'sabora-data.dump');
 const inventoryOut=join(restoreWork,'source.inventory');
 await decryptBackupComponent({bundleDirectory:offsite,name:'roles-memberships',keyPath,outputPath:rolesOut});
 await decryptBackupComponent({bundleDirectory:offsite,name:'schema',keyPath,outputPath:schemaOut});
 await decryptBackupComponent({bundleDirectory:offsite,name:'data',keyPath,outputPath:dataOut});
 await decryptBackupComponent({bundleDirectory:offsite,name:'inventory',keyPath,outputPath:inventoryOut});
 const sourceInventory=await readFile(inventoryOut,'utf8');
 assert.match(await readFile(rolesOut,'utf8'),/^create role sabora_staff_reader /m);
 assert.match(sourceInventory,/^data:[0-9a-f]{32}$/m);
 const rolesPayload=await readFile(rolesOut,'utf8');
 const databasePrerequisiteMarker='-- sabora-database-prerequisites-v1\n';
 const databaseAclMarker='-- sabora-database-acl-reconciliation-v1\n';
 const databasePrerequisiteAt=rolesPayload.indexOf(databasePrerequisiteMarker);
 const databaseAclAt=rolesPayload.indexOf(databaseAclMarker);
 assert.ok(databasePrerequisiteAt>0);
 assert.ok(databaseAclAt>databasePrerequisiteAt);
 const globalRolesSql=rolesPayload.slice(0,databasePrerequisiteAt);
 const databasePrerequisiteSql=rolesPayload.slice(
  databasePrerequisiteAt+databasePrerequisiteMarker.length,databaseAclAt);
 const databaseAclSql=rolesPayload.slice(databaseAclAt+databaseAclMarker.length);
 assert.match(databasePrerequisiteSql,
  /^set role [^;]+; grant USAGE on schema extensions to sabora_[^;]+; reset role;$/m);
 assert.match(databaseAclSql,
  /^set role [^;]+; revoke all privileges on schema sabora /m);
 assert.match(databaseAclSql,
  /^set role [^;]+; grant (?:CREATE|USAGE) on schema sabora /m);
 assert.match(databaseAclSql,
  /^set role [^;]+; revoke all privileges on table sabora\./m);
 assert.match(databaseAclSql,
  /^set role [^;]+; grant [A-Z]+ on table sabora\./m);
 const restoreStarted=process.hrtime.bigint();
 docker(['run','-d','--name',target,'--network','none','-e','POSTGRES_PASSWORD=ci_only_not_a_secret',
  'postgres:17-alpine']);
 targetStarted=true;await waitForPg(target);
 psql(target,'postgres',globalRolesSql);
 docker(['exec',target,'createdb','-U','postgres','sabora_external_restore_ci']);
 psql(target,'sabora_external_restore_ci',
  'create schema extensions; create extension pgcrypto with schema extensions;');
 psql(target,'sabora_external_restore_ci',databasePrerequisiteSql);
 docker(['cp',schemaOut,target+':/tmp/sabora-schema.dump']);
 docker(['cp',dataOut,target+':/tmp/sabora-data.dump']);
 docker(['exec',target,'pg_restore','-U','postgres','-d','sabora_external_restore_ci',
  '--exit-on-error','/tmp/sabora-schema.dump']);
 docker(['exec',target,'pg_restore','-U','postgres','-d','sabora_external_restore_ci',
  '--exit-on-error','--disable-triggers','/tmp/sabora-data.dump']);
 psql(target,'sabora_external_restore_ci',databaseAclSql);
 docker(['exec',target,'rm','-f','/tmp/sabora-schema.dump','/tmp/sabora-data.dump']);
 await rm(rolesOut,{force:true});await rm(schemaOut,{force:true});await rm(dataOut,{force:true});
 const restoredInventory=psql(target,'sabora_external_restore_ci',await readFile(inventorySql,'utf8')).stdout;
 assert.equal(restoredInventory,sourceInventory);
 await rm(inventoryOut,{force:true});
 const ledgerCount=psql(target,'sabora_external_restore_ci',
  'select count(*) from sabora_migration_meta.applied_migrations where application_count=1;').stdout.trim();
 assert.equal(ledgerCount,'99');
 psql(target,'sabora_external_restore_ci',`create role sabora_backup_restore_probe login
  password 'ci_only_not_a_secret' nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  grant sabora_staff_reader to sabora_backup_restore_probe;`);
 const allowed=docker(['exec','-e','PGPASSWORD=ci_only_not_a_secret',target,'psql','-X','-qAt',
  '-h','127.0.0.1','-U','sabora_backup_restore_probe','-d','sabora_external_restore_ci','-c',
  'set role sabora_staff_reader; select count(*) >= 0 from sabora.staff_members;']);
 assert.equal(allowed.stdout.trim(),'t');
 const denied=docker(['exec','-e','PGPASSWORD=ci_only_not_a_secret',target,'psql','-X','-qAt',
  '-h','127.0.0.1','-U','sabora_backup_restore_probe','-d','sabora_external_restore_ci','-c',
  'set role postgres;'],{allowFailure:true});
 assert.notEqual(denied.status,0);
 const membership=psql(target,'sabora_external_restore_ci',`select
  membership.admin_option||'|'||membership.set_option||'|'||membership.inherit_option
  from pg_auth_members membership join pg_roles parent on parent.oid=membership.roleid
  join pg_roles member on member.oid=membership.member
  where parent.rolname='sabora_h6_fn_owner' and member.rolname='cv005_recovery_provider_dba';`).stdout.trim();
 assert.equal(membership,'true|false|false');
 const restoreMs=elapsed(restoreStarted);
 const encrypted=join(offsite,'data.aesgcm');
 const corrupt=Buffer.from(await readFile(encrypted));
 corrupt[Math.floor(corrupt.length/2)]^=0xff;await writeFile(encrypted,corrupt);
 const rejected=join(restoreWork,'corrupt-must-not-exist.dump');
 await assert.rejects(decryptBackupComponent({bundleDirectory:offsite,name:'data',keyPath,
  outputPath:rejected}),/sabora_backup_stop:ciphertext_mismatch/);
 await assert.rejects(readFile(rejected));
 const wrongKeyOutput=join(restoreWork,'wrong-key-must-not-exist.sql');
 await assert.rejects(decryptBackupComponent({bundleDirectory:vpsCache,name:'roles-memberships',
  keyPath:wrongKeyPath,outputPath:wrongKeyOutput}),/sabora_backup_stop:authentication_failed/);
 await assert.rejects(readFile(wrongKeyOutput));
 console.log('sabora_dual_backup_pg17_external_restore_ok:'+JSON.stringify({
  backupId:result.manifest.backupId,manifestSha256:result.manifestSha256,
  migrations:99,captureMs,restoreMs,totalMs:elapsed(started),
  restoredFrom:'external-store-fixture',vpsReplicaUsedForRestore:false,
  plaintextPersistedInReplicas:false,operationalReceipt:false,
 }));
}finally{
 if(targetStarted)docker(['rm','-f','-v',target],{allowFailure:true});
 await rm(fixture,{recursive:true,force:true});
}
