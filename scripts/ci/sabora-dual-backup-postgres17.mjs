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
import {buildMigrationAudit} from './migration-audit.mjs';
import {fileURLToPath} from 'node:url';
import {
 captureEncryptedBackupBundle,decryptBackupComponent,
 capturePreinstallBackup,verifyPreinstallBackup,PREINSTALL_SCHEMA,
 inspectEncryptedBackupBundle,replicateEncryptedBackupBundle,
} from '../ops/sabora-encrypted-backup-bundle.mjs';
import {openPostgresBackupSnapshot,readPreinstallState} from '../ops/sabora-postgres-snapshot.mjs';

const failure=code=>Error('sabora_dual_backup_ci_stop:'+code);
const here=resolve(fileURLToPath(new URL('.',import.meta.url)));
const root=resolve(here,'../..');
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
function sqlLiteral(value){return "'"+value.replaceAll("'","''")+"'";}
async function migrationInventory(){
 // Fail closed unless every SQL file is present in the independently
 // reviewed migration audit. The historical 99-migration baseline remains
 // mandatory; approved later migrations extend the exact audited inventory.
 const audited=buildMigrationAudit(root).migrations;
 if(audited.length<99)throw failure('historical_migration_baseline_missing');
 const rows=[],tree=createHash('sha256');
 for(const {name:filename,sha256:digest,version} of audited){
  const name=filename.slice(15,-4);
  tree.update(filename).update('\0').update(digest).update('\n');
  rows.push('('+[version,name,digest].map(sqlLiteral).join(',')+')');
 }
 return {treeSha256:tree.digest('hex'),rows,count:audited.length};
}
async function waitForPg(container){
 for(let attempt=0;attempt<60;attempt++){
  // The official image opens a temporary socket-only server during init and
  // then stops it. Require the final TCP listener to avoid restoring roles
  // into that transient postmaster.
  const probe=docker(['exec',container,'psql','-X','-h','127.0.0.1',
   '-U','postgres','-d','postgres','-Atqc','select 1'],
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
 // Exercise a real column ACL that pg_restore cannot be assumed to restore
 // after our explicit table REVOKE+GRANT reconciliation.
 psql(source,'postgres','grant select (user_id) on sabora.staff_members to sabora_staff_reader;');
 const sourceColumnAcl=psql(source,'postgres',`
  select attacl is not null from pg_attribute
  where attrelid='sabora.staff_members'::regclass and attname='user_id';`).stdout.trim();
 assert.equal(sourceColumnAcl,'t');
 const postgresVersion=psql(source,'postgres','show server_version;').stdout.trim();
 assert.match(postgresVersion,/^17\./);
 const systemIdentifier=psql(source,'postgres',
  'select (pg_control_system()).system_identifier::text;').stdout.trim();
 assert.match(systemIdentifier,/^[0-9]{10,20}$/);

 // Integration proof: a writer and a DDL migration commit AFTER the snapshot
 // was exported, while a new session imports that exact snapshot. The frozen
 // read must see the old row and absent table even when the live database
 // already sees the committed changes. This never touches another project.
 psql(source,'postgres',`
  CREATE TABLE public.sabora_snapshot_ci_probe(id integer PRIMARY KEY,marker text NOT NULL);
  INSERT INTO public.sabora_snapshot_ci_probe VALUES(1,'before');`);
 const exporterArgs=['exec','-i',source,'psql','-X','-qAt','-v','ON_ERROR_STOP=1',
  '-U','postgres','-d','postgres','-f','-'];
 await assert.rejects(openPostgresBackupSnapshot({
  command:'docker',args:exporterArgs,
  expectedSystemIdentifier:systemIdentifier==='1000000000000000000'?
   '2000000000000000000':'1000000000000000000'}),
  /sabora_snapshot_stop:source_identity_mismatch/);
 const proof=await openPostgresBackupSnapshot({command:'docker',args:exporterArgs,
  expectedSystemIdentifier:systemIdentifier});
 try{
  psql(source,'postgres',`
   UPDATE public.sabora_snapshot_ci_probe SET marker='after' WHERE id=1;
   CREATE TABLE public.sabora_snapshot_ci_ddl(id integer);
   CREATE TABLE sabora.sabora_snapshot_ci_acl_ddl(id integer);`);
  const frozen=psql(source,'postgres',`
   BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
   SET TRANSACTION SNAPSHOT '${proof.snapshotId}';
   SELECT (SELECT marker FROM public.sabora_snapshot_ci_probe WHERE id=1)
    || ':' || (SELECT count(*) FROM pg_class WHERE relname='sabora_snapshot_ci_ddl')::text
    || ':' || (SELECT count(*) FROM pg_class WHERE relname='sabora_snapshot_ci_acl_ddl')::text;
   COMMIT;`).stdout.trim();
  const live=psql(source,'postgres',`
   SELECT (SELECT marker FROM public.sabora_snapshot_ci_probe WHERE id=1)
    || ':' || (SELECT count(*) FROM pg_class WHERE relname='sabora_snapshot_ci_ddl')::text
    || ':' || (SELECT count(*) FROM pg_class WHERE relname='sabora_snapshot_ci_acl_ddl')::text;`).stdout.trim();
  assert.equal(frozen,'before:0:0','imported MVCC snapshot must resist writer and DDL');
  assert.equal(live,'after:1:1','concurrent writes really committed outside snapshot');
  const rolesSource=await readFile(rolesSql,'utf8');
  const snapshotRoles=psql(source,'postgres',
   "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"+
   "SET TRANSACTION SNAPSHOT '"+proof.snapshotId+"';\n"+
   rolesSource+"\nCOMMIT;").stdout;
  const liveRoles=psql(source,'postgres',rolesSource).stdout;
  assert.equal(snapshotRoles.includes('sabora_snapshot_ci_acl_ddl'),false);
  assert.equal(liveRoles.includes('sabora_snapshot_ci_acl_ddl'),true);
  await proof.close();
 }finally{
  proof.abort();
  psql(source,'postgres',`
   DROP TABLE IF EXISTS public.sabora_snapshot_ci_ddl;
   DROP TABLE IF EXISTS public.sabora_snapshot_ci_probe;
   DROP TABLE IF EXISTS sabora.sabora_snapshot_ci_acl_ddl;`);
 }

 await writeFile(keyPath,randomBytes(32).toString('hex')+'\n',{mode:0o600});
 await writeFile(wrongKeyPath,randomBytes(32).toString('hex')+'\n',{mode:0o600});
 await chmod(keyPath,0o600);await chmod(wrongKeyPath,0o600);
 // Verify the real applied_migrations ledger, not just a manifest copied
 // from the Git checkout. Wrong expected digest must fail before pg_dump.
 await assert.rejects(openPostgresBackupSnapshot({
  command:'docker',args:exporterArgs,
  expectedSystemIdentifier:systemIdentifier,
  expectedMigrationTreeSha256:'0'.repeat(64)}),
  /sabora_snapshot_stop:source_migration_ledger_mismatch/);
 const matchingLedger=await openPostgresBackupSnapshot({
  command:'docker',args:exporterArgs,
  expectedSystemIdentifier:systemIdentifier,
  expectedMigrationTreeSha256:migrations.treeSha256});
 assert.equal(matchingLedger.migrationTreeSha256,migrations.treeSha256);
 await matchingLedger.close();
 const captureStarted=process.hrtime.bigint();
 const result=await captureEncryptedBackupBundle({directory:capture,keyPath,metadata:{
  schema:'sabora-logical-backup/v2',backupId:'SABORA-BACKUP-CI-'+runId,
  repository:'jdlc86/CartaViva',releaseSha,sourceProjectRef:'byhvmumqivmunkmomhup',
  postgresMajor:17,postgresVersion,migrationTreeSha256:migrations.treeSha256,
  includedSchemas:['sabora','sabora_migration_meta'],
  excludedManagedSchemas:['auth','extensions','realtime','storage','supabase_functions','vault'],
  createdAt:new Date().toISOString(),custody:'key-outside-artifact-git-actions-vps',
 },snapshot:{exporter:{command:'docker',args:['exec','-i',source,'psql','-X','-qAt',
  '-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-']},
  expectedSystemIdentifier:systemIdentifier},components:[
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
 assert.equal(result.manifest.schema,'sabora-logical-backup/v2');
 assert.equal(result.manifest.sourceSystemIdentifier,systemIdentifier);
 assert.equal(result.manifest.sourceDatabase,'postgres');
 assert.match(result.manifest.snapshotId,/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9A-Fa-f]+$/);
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
 // Initial-state recovery drill on the same networkless restore target.
 psql(target,'postgres','CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;');
 const initialSystem=psql(target,'postgres','select (pg_control_system()).system_identifier::text;').stdout.trim();
 const initialExporter={command:'docker',args:['exec','-i',target,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-']};
 const initialInput={...initialExporter,expectedSystemIdentifier:initialSystem};
 const initialPlan={schema:PREINSTALL_SCHEMA,backupId:'SABORA-BACKUP-PREINSTALL-CI-'+runId,
  repository:'jdlc86/CartaViva',releaseSha,sourceProjectRef:'byhvmumqivmunkmomhup',
  plannedMigrationTreeSha256:migrations.treeSha256};
 const initialCapture=join(fixture,'preinstall-capture'),initialExternal=join(fixture,'preinstall-external'),
  initialReplica=join(fixture,'preinstall-replica');
 const initialRequest={directory:initialCapture,keyPath,metadata:initialPlan,exporter:initialExporter,
  expectedSystemIdentifier:initialSystem};
 const initialBaseline=await readPreinstallState(initialInput);
 const initialResult=await capturePreinstallBackup(initialRequest);
 assert.equal(initialResult.manifest.initialState,'no-sabora-objects');
 assert.equal('migrationTreeSha256' in initialResult.manifest,false);
 assert.equal(initialResult.manifest.plannedMigrationTreeSha256,migrations.treeSha256);
 assert.deepEqual((await readdir(initialCapture)).sort(),['initial-state.aesgcm','manifest.json']);
 const initialOffsite=await replicateEncryptedBackupBundle({sourceDirectory:initialCapture,destinationDirectory:initialExternal,destinationClass:'offsite'});
 const initialVps=await replicateEncryptedBackupBundle({sourceDirectory:initialCapture,destinationDirectory:initialReplica,destinationClass:'vps-encrypted-cache'});
 assert.equal(initialOffsite.manifestSha256,initialResult.manifestSha256);
 assert.equal(initialVps.manifestSha256,initialResult.manifestSha256);
 await rm(initialCapture,{recursive:true,force:true});
 const verifyInitial={bundleDirectory:initialExternal,keyPath,expectedReleaseSha:releaseSha,
  expectedMigrationTreeSha256:migrations.treeSha256};
 assert.equal((await verifyPreinstallBackup(verifyInitial)).initialStateVerified,true);
 assert.equal((await verifyPreinstallBackup(verifyInitial)).restoreValidated,false);
 await assert.rejects(verifyPreinstallBackup({...verifyInitial,keyPath:wrongKeyPath}),/authentication_failed/);
 await assert.rejects(verifyPreinstallBackup({...verifyInitial,expectedMigrationTreeSha256:'0'.repeat(64)}),/preinstall_scope_mismatch/);
 // Committed state plus an aborted transaction: never treat as initial.
 psql(target,'postgres',
  "CREATE ROLE sabora_preinstall_ci_owner NOLOGIN; CREATE SCHEMA sabora AUTHORIZATION sabora_preinstall_ci_owner; "+
  "CREATE SCHEMA sabora_migration_meta; CREATE TABLE sabora_migration_meta.applied_migrations(version text); "+
  "INSERT INTO sabora_migration_meta.applied_migrations VALUES ('fixture-committed'); "+
  "CREATE TABLE sabora.preinstall_ci_data(id integer); ALTER TABLE sabora.preinstall_ci_data OWNER TO sabora_preinstall_ci_owner; "+
  "INSERT INTO sabora.preinstall_ci_data VALUES(1);");
 const failedInstall=psql(target,'postgres','BEGIN; CREATE TABLE sabora.preinstall_ci_uncommitted(id integer); SELECT 1/0; COMMIT;', {allowFailure:true});
 assert.notEqual(failedInstall.status,0);
 assert.equal(psql(target,'postgres','SELECT count(*) FROM sabora.preinstall_ci_data;').stdout.trim(),'1');
 assert.equal(psql(target,'postgres',"SELECT to_regclass('sabora.preinstall_ci_uncommitted') IS NULL;").stdout.trim(),'t');
 await assert.rejects(capturePreinstallBackup(initialRequest),/preinstall_sabora_objects_present/);
 await assert.rejects(readFile(join(initialCapture,'manifest.json')));
 // Disposable fixture objects only; no operational DROP/reset path.
 psql(target,'postgres','BEGIN; DROP TABLE sabora.preinstall_ci_data; DROP TABLE sabora_migration_meta.applied_migrations; DROP SCHEMA sabora_migration_meta; DROP SCHEMA sabora; DROP ROLE sabora_preinstall_ci_owner; COMMIT;');
 assert.deepEqual(await readPreinstallState(initialInput),initialBaseline);
 psql(target,'postgres','CREATE ROLE sabora_preinstall_ci_orphan NOLOGIN;');
 await assert.rejects(capturePreinstallBackup(initialRequest),/preinstall_sabora_objects_present/);
 psql(target,'postgres','DROP ROLE sabora_preinstall_ci_orphan; CREATE TABLE public.sabora_preinstall_ci_orphan(id integer);');
 await assert.rejects(capturePreinstallBackup(initialRequest),/preinstall_sabora_objects_present/);
 psql(target,'postgres','DROP TABLE public.sabora_preinstall_ci_orphan;');
 assert.deepEqual(await readPreinstallState(initialInput),initialBaseline);
 assert.equal((await verifyPreinstallBackup(verifyInitial)).manifestSha256,initialResult.manifestSha256);
 const badInitial=join(initialReplica,'initial-state.aesgcm');
 const badBytes=await readFile(badInitial);badBytes[0]^=1;await writeFile(badInitial,badBytes);
 await assert.rejects(verifyPreinstallBackup({...verifyInitial,bundleDirectory:initialReplica}),/ciphertext_mismatch/);
 console.log('sabora_preinstall_pg17_recovery_drill_ok: external receipt authenticated; partial state rejected; exact fixture recovery checked; not operational evidence');
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
 const restoredColumnAcl=psql(target,'sabora_external_restore_ci',`
  select attacl is not null from pg_attribute
  where attrelid='sabora.staff_members'::regclass and attname='user_id';`).stdout.trim();
 assert.equal(restoredColumnAcl,'t','column ACL survives external encrypted restore');
 await rm(inventoryOut,{force:true});
 const ledgerCount=psql(target,'sabora_external_restore_ci',
  'select count(*) from sabora_migration_meta.applied_migrations where application_count=1;').stdout.trim();
 assert.equal(ledgerCount,String(migrations.count));
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
  migrations:migrations.count,captureMs,restoreMs,totalMs:elapsed(started),
  restoredFrom:'external-store-fixture',vpsReplicaUsedForRestore:false,
  plaintextPersistedInReplicas:false,operationalReceipt:false,
 }));
}finally{
 if(targetStarted)docker(['rm','-f','-v',target],{allowFailure:true});
 await rm(fixture,{recursive:true,force:true});
}
