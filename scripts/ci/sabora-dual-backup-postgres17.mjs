// Disposable CI proof for the Sabora-only dual-backup path. It captures a
// migrated PG17 database directly into authenticated ciphertext, destroys the
// capture staging copy, and restores only from the off-site-class replica into
// a second networkless PG17 cluster. It is not an operational backup receipt.
import assert from 'node:assert/strict';
import {createHash,randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {Readable} from 'node:stream';
import {once} from 'node:events';
import {chmod,mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,join,resolve} from 'node:path';
import {buildMigrationAudit} from './migration-audit.mjs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {
 captureEncryptedBackupBundle,decryptBackupComponent,
 capturePreinstallBackup,verifyPreinstallBackup,PREINSTALL_SCHEMA,
 inspectEncryptedBackupBundle,replicateEncryptedBackupBundle,
} from '../ops/sabora-encrypted-backup-bundle.mjs';
import {openPostgresBackupSnapshot,readPreinstallState} from '../ops/sabora-postgres-snapshot.mjs';
import {rotateVerifiedVpsReplica,receiveVerifiedVpsReplica,inspectVpsRotationRecovery,
 inspectVpsPublishedPurge,finishInterruptedVpsPurge,inspectVpsRecoveryTransition,applyVpsRecoveryTransition} from '../ops/sabora-vps-backup-rotation.mjs';
import {encodeVpsBackupStream} from '../ops/sabora-vps-backup-wire.mjs';
import {stableStringify} from './sabora-release-governor.mjs';
import {startBackupSshLab,withBoundedBackupVolume} from './sabora-vps-backup-ssh-lab.mjs';
import {exerciseGovernedBackupReceiver} from './sabora-backup-governed-receiver-lab.mjs';
import {exerciseInstalledBackupReceiver} from './sabora-backup-installed-receiver-lab.mjs';

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
// End-to-end positive transfers traverse a real pipe between separate Node
// processes. Neither side writes a transport spool. The sender only reads
// the external ciphertext bundle; the receiving transaction owns the slot.
async function rotateFromPipe({root:cache,sourceDirectory,scope,proofBytes}){
 const senderModule=pathToFileURL(join(root,'scripts/ops/sabora-vps-backup-wire.mjs')).href;
 const senderProgram=`
  import {Readable} from 'node:stream';
  import {pipeline} from 'node:stream/promises';
  let input='';for await(const chunk of process.stdin)input+=chunk;
  const {moduleUrl,sourceDirectory,proofB64}=JSON.parse(input);
  const {encodeVpsBackupStream}=await import(moduleUrl);
  await pipeline(Readable.from(encodeVpsBackupStream({sourceDirectory,proofBytes:Buffer.from(proofB64,'base64')})),process.stdout);
 `;
 const child=spawn(process.execPath,['--input-type=module','--eval',senderProgram],{stdio:['pipe','pipe','pipe']});
 let errorText='';child.stderr.on('data',chunk=>{if(errorText.length<2000)errorText+=chunk.toString().slice(0,2000-errorText.length);});
 child.stdin.on('error',()=>{});
 const ended=once(child,'close');ended.catch(()=>{});
 child.stdin.end(JSON.stringify({moduleUrl:senderModule,sourceDirectory,proofB64:proofBytes.toString('base64')}));
 try{
  const result=await receiveVerifiedVpsReplica({root:cache,source:child.stdout,scope});
  const [code,signal]=await ended;assert.equal(code,0,String(signal)+': '+errorText);
  return result;
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
}
const rotationAuthority=generateKeyPairSync('ed25519');
const reconciliationAuthority=generateKeyPairSync('ed25519');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function rotationScope(systemIdentifier){return {environment:'disposable-lab',systemIdentifier,
 storageIdentitySha256:digest('ci-only-vps-storage-'+runId),externalStorageIdentitySha256:digest('ci-only-external-storage-'+runId),
 verifierPublicKey:rotationAuthority.publicKey.export({format:'pem',type:'spki'}),
 recoveryPublicKey:reconciliationAuthority.publicKey.export({format:'pem',type:'spki'}),quotaBytes:4*1024**3,reserveBytes:1048576};}
function rotationProof(scope,result,previous,recoveryKind,recoveredInventorySha256,recoveryEvidenceSha256){
 const payload={schema:'sabora-vps-rotation-proof/v1',repository:'jdlc86/CartaViva',project:'sabora',environment:scope.environment,
  storageIdentitySha256:scope.storageIdentitySha256,externalStorageIdentitySha256:scope.externalStorageIdentitySha256,
  backupId:result.manifest.backupId,manifestSha256:result.manifestSha256,previousManifestSha256:previous,
  releaseSha:result.manifest.releaseSha,backupSchema:result.manifest.schema,recoveredInventorySha256,recoveryEvidenceSha256,recoveryKind,
  observedAt:new Date().toISOString(),validUntil:new Date(Date.now()+300000).toISOString()};
 return Buffer.from(JSON.stringify({payload,signature:sign(null,Buffer.from(stableStringify(payload)),rotationAuthority.privateKey).toString('base64')}));
}

function purgeAuthorization(scope,subject,externalProof,overrides={}){
 const payload={schema:'sabora-vps-purge-authorization/v1',repository:'jdlc86/CartaViva',project:'sabora',
  environment:scope.environment,action:'finish-published-purge',storageIdentitySha256:scope.storageIdentitySha256,
  externalStorageIdentitySha256:scope.externalStorageIdentitySha256,lockSha256:subject.lockSha256,
  currentManifestSha256:subject.currentManifestSha256,previousManifestSha256:subject.previousManifestSha256,
  previousRemainderSha256:subject.previousRemainderSha256,externalProofSha256:digest(externalProof),sequence:subject.sequence,
  observedAt:new Date().toISOString(),validUntil:new Date(Date.now()+300000).toISOString(),...overrides};
 return Buffer.from(JSON.stringify({payload,signature:sign(null,Buffer.from(stableStringify(payload)),reconciliationAuthority.privateKey).toString('base64')}));
}
function transitionAuthorization(scope,subject,externalProof,overrides={}){
 const payload={schema:'sabora-vps-recovery-transition/v1',repository:'jdlc86/CartaViva',project:'sabora',
  environment:scope.environment,action:subject.action,storageIdentitySha256:scope.storageIdentitySha256,
  externalStorageIdentitySha256:scope.externalStorageIdentitySha256,lockSha256:subject.lockSha256,
  subjectSha256:subject.subjectSha256,externalProofSha256:digest(externalProof),sequence:subject.sequence,
  observedAt:new Date().toISOString(),validUntil:new Date(Date.now()+300000).toISOString(),...overrides};
 return Buffer.from(JSON.stringify({payload,signature:sign(null,Buffer.from(stableStringify(payload)),reconciliationAuthority.privateKey).toString('base64')}));
}
const fixture=await mkdtemp(join(process.env.RUNNER_TEMP||tmpdir(),'sabora-dual-backup-'));
const capture=join(fixture,'encrypted-capture');
const offsite=join(fixture,'external-store-fixture');
const vpsCache=join(fixture,'vps-encrypted-cache-fixture');
const restoreWork=join(fixture,'restore-work');
const keyPath=join(fixture,'custodian.key');
const wrongKeyPath=join(fixture,'wrong-custodian.key');
const target='sabora-dual-backup-restore-'+runId+'-'+process.pid;
let targetStarted=false,rotationRestoreStarted=false,backupSsh;
const rotationRestoreTarget='sabora-rotation-restore-'+runId+'-'+process.pid;
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
 assert.equal(initialVps.backupSchema,PREINSTALL_SCHEMA);
 assert.equal((await inspectEncryptedBackupBundle(initialExternal)).backupSchema,PREINSTALL_SCHEMA);
 await rm(initialCapture,{recursive:true,force:true});
 const verifyInitial={bundleDirectory:initialExternal,keyPath,expectedReleaseSha:releaseSha,
  expectedMigrationTreeSha256:migrations.treeSha256,expectedSystemIdentifier:initialSystem,expectedBackupId:initialPlan.backupId};
 assert.equal((await verifyPreinstallBackup(verifyInitial)).initialStateVerified,true);
 assert.equal((await verifyPreinstallBackup(verifyInitial)).restoreValidated,false);
 await assert.rejects(verifyPreinstallBackup({...verifyInitial,keyPath:wrongKeyPath}),/authentication_failed/);
 await assert.rejects(verifyPreinstallBackup({...verifyInitial,expectedMigrationTreeSha256:'0'.repeat(64)}),/preinstall_scope_mismatch/);
 const wrongSystem=initialSystem==='1000000000000000000'?'2000000000000000000':'1000000000000000000';
 await assert.rejects(verifyPreinstallBackup({...verifyInitial,expectedSystemIdentifier:wrongSystem}),/preinstall_scope_mismatch/);
 await assert.rejects(verifyPreinstallBackup({...verifyInitial,expectedBackupId:'SABORA-BACKUP-OTHER-0001'}),/preinstall_scope_mismatch/);
 await assert.rejects(capturePreinstallBackup({...initialRequest,expectedSystemIdentifier:wrongSystem}),/preinstall_source_identity_or_prerequisite/);
 const initialManifestPath=join(initialExternal,'manifest.json');
 const initialManifestBytes=await readFile(initialManifestPath);
 const tamperedInitial=JSON.parse(initialManifestBytes.toString('utf8'));tamperedInitial.createdAt='2020-01-01T00:00:00.000Z';
 await writeFile(initialManifestPath,JSON.stringify(tamperedInitial)+'\n');
 await assert.rejects(verifyPreinstallBackup(verifyInitial),/authentication_failed/);
 await writeFile(initialManifestPath,initialManifestBytes);
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
 // Same PG17 initial-state source, two genuinely captured encrypted generations.
 // Only the ephemeral test key signs the assertions AFTER the external
 // verification and recovery drill above; no production authorization.
 const rotationRoot=join(fixture,'bounded-vps-initial-fixture');
 await mkdir(rotationRoot,{mode:0o700});
 const scope=rotationScope(initialSystem),kind='authenticated-initial-state-and-recovery-drill';
 const initialEvidence=digest(JSON.stringify({fixture:runId,initialBaseline,recovered:await readPreinstallState(initialInput)}));
 const firstProof=rotationProof(scope,initialResult,null,kind,initialResult.manifest.components[0].plaintextSha256,initialEvidence);
 const first=await rotateVerifiedVpsReplica({root:rotationRoot,sourceDirectory:initialExternal,scope,proofBytes:firstProof});
 assert.equal(first.generations,1);assert.equal(first.operationalReceipt,false);
 assert.deepEqual((await readdir(rotationRoot)).sort(),['current','state.json']);
 const secondPlan={...initialPlan,backupId:initialPlan.backupId+'-SECOND'};
 const second=await capturePreinstallBackup({...initialRequest,metadata:secondPlan});
 const secondExternal=join(fixture,'preinstall-external-second');
 await replicateEncryptedBackupBundle({sourceDirectory:initialCapture,destinationDirectory:secondExternal,destinationClass:'offsite'});
 await rm(initialCapture,{recursive:true,force:true});
 const secondAuth=await verifyPreinstallBackup({...verifyInitial,bundleDirectory:secondExternal,expectedBackupId:secondPlan.backupId});
 assert.equal(secondAuth.initialStateVerified,true);
 assert.equal(second.manifest.components[0].plaintextSha256,initialResult.manifest.components[0].plaintextSha256);
 assert.deepEqual(await readPreinstallState(initialInput),initialBaseline);
 const secondProof=rotationProof(scope,second,initialResult.manifestSha256,kind,second.manifest.components[0].plaintextSha256,initialEvidence);
 const requestRotation={root:rotationRoot,sourceDirectory:secondExternal,scope,proofBytes:secondProof};
 const assertPrior=async()=>{
  assert.equal((await inspectEncryptedBackupBundle(join(rotationRoot,'current'))).manifestSha256,initialResult.manifestSha256);
  assert.deepEqual((await readdir(rotationRoot)).sort(),['current','state.json']);
 };
 const invalid=JSON.parse(secondProof.toString('utf8'));invalid.signature=Buffer.alloc(64).toString('base64');
 await assert.rejects(rotateVerifiedVpsReplica({...requestRotation,proofBytes:Buffer.from(JSON.stringify(invalid))}),/document_signature_invalid/);
 await assertPrior();
 const wrongPrior=rotationProof(scope,second,null,kind,second.manifest.components[0].plaintextSha256,initialEvidence);
 await assert.rejects(rotateVerifiedVpsReplica({...requestRotation,proofBytes:wrongPrior}),/proof_scope_mismatch/);
 await assertPrior();
 await assert.rejects(rotateVerifiedVpsReplica({...requestRotation,scope:{...scope,quotaBytes:scope.reserveBytes+1}}),/insufficient_reserved_capacity/);
 await assertPrior();
 await assert.rejects(rotateVerifiedVpsReplica({...requestRotation,sourceDirectory:initialReplica}),/ciphertext_mismatch/);
 await assertPrior();
 // Interrupted transaction marker and unexplained second slot are not
 // automatically removed. Only the disposable test harness reconciles them.
 const interrupted=join(rotationRoot,'rotation.lock');
 await writeFile(interrupted,'fixture-crash\n',{mode:0o600,flag:'wx'});
 await assert.rejects(rotateVerifiedVpsReplica(requestRotation),/locked_or_interrupted/);
 await rm(interrupted);
 await assertPrior();
 await mkdir(join(rotationRoot,'previous'),{mode:0o700});
 await assert.rejects(rotateVerifiedVpsReplica(requestRotation),/unreconciled_state/);
 await rm(join(rotationRoot,'previous'),{recursive:true});
 await assertPrior();
 // Exercise actual process death, not a catchable thrown exception. Patch
 // filesystem exports only in a disposable child, never the implementation.
 const crashModule=pathToFileURL(join(root,'scripts/ops/sabora-vps-backup-rotation.mjs')).href;
 const crashProgram=`
  import fs from 'node:fs/promises';
  import {syncBuiltinESMExports} from 'node:module';
  import {join} from 'node:path';
  let input='';for await(const chunk of process.stdin)input+=chunk;
  const {root,sourceDirectory,scope,proofB64,phase,moduleUrl}=JSON.parse(input);
  if(process.env.GITHUB_ACTIONS!=='true'||scope.environment!=='disposable-lab'||
   !root.startsWith(process.env.RUNNER_TEMP+'/sabora-dual-backup-')||
   !/\\/crash-[a-z-]+$/.test(root))throw Error('fixture_scope');
  const kill=()=>process.kill(process.pid,'SIGKILL');
  const originalMkdir=fs.mkdir,originalRename=fs.rename,originalUnlink=fs.unlink;
  fs.mkdir=async(path,...args)=>{const result=await originalMkdir(path,...args);
   if(phase==='copy-started'&&path===join(root,'candidate'))kill();return result;};
  fs.rename=async(from,to,...args)=>{const result=await originalRename(from,to,...args);
   if((phase==='previous-moved'&&to===join(root,'previous'))||
    (phase==='candidate-promoted'&&to===join(root,'current'))||
    (phase==='state-published'&&to===join(root,'state.json')))kill();return result;};
  fs.unlink=async(path,...args)=>{const result=await originalUnlink(path,...args);
   if(phase==='purge-started'&&path.startsWith(join(root,'previous')+'/'))kill();return result;};
  syncBuiltinESMExports();
  const {rotateVerifiedVpsReplica}=await import(moduleUrl);
  await rotateVerifiedVpsReplica({root,sourceDirectory,scope,proofBytes:Buffer.from(proofB64,'base64')});
 `;
 for(const phase of ['copy-started','previous-moved','candidate-promoted','state-published','purge-started']){
  const crashRoot=join(fixture,'crash-'+phase);
  await mkdir(crashRoot,{mode:0o700});
  await rotateVerifiedVpsReplica({root:crashRoot,sourceDirectory:initialExternal,scope,proofBytes:firstProof});
  const death=spawnSync(process.execPath,['--input-type=module','--eval',crashProgram],{
   input:JSON.stringify({root:crashRoot,sourceDirectory:secondExternal,scope,proofB64:secondProof.toString('base64'),phase,moduleUrl:crashModule}),
   encoding:'utf8',timeout:30000});
  assert.equal(death.signal,'SIGKILL',phase+': '+String(death.stderr));
  assert.ok((await readdir(crashRoot)).includes('rotation.lock'));
  const entries=await readdir(crashRoot);
  assert.ok(entries.filter(x=>['current','candidate','previous'].includes(x)).length<=2);
  const oldPath=join(crashRoot,phase==='copy-started'?'current':'previous');
  if(phase!=='purge-started')assert.equal((await inspectEncryptedBackupBundle(oldPath)).manifestSha256,initialResult.manifestSha256);
  if(['state-published','purge-started'].includes(phase)){
   assert.equal((await inspectEncryptedBackupBundle(join(crashRoot,'current'))).manifestSha256,second.manifestSha256);
   assert.equal(JSON.parse(await readFile(join(crashRoot,'state.json'),'utf8')).manifestSha256,second.manifestSha256);
  }
  const diagnosis=await inspectVpsRotationRecovery({root:crashRoot,scope});
  const expectedPhase={'copy-started':'before-promotion','previous-moved':'between-renames',
   'candidate-promoted':'promoted-unpublished','state-published':'state-published','purge-started':'state-published'}[phase];
  assert.equal(diagnosis.phase,expectedPhase,JSON.stringify(diagnosis));
  assert.equal(diagnosis.blocked,true);assert.equal(diagnosis.writerExcluded,false);
  assert.equal(diagnosis.deletionAuthorized,false);assert.equal(diagnosis.automaticRecovery,false);
  assert.ok(diagnosis.recoverableSlots.some(slot=>slot.manifestSha256===(['candidate-promoted','state-published','purge-started'].includes(phase)?second.manifestSha256:initialResult.manifestSha256)));
  assert.equal(diagnosis.previousManifestSha256,initialResult.manifestSha256);
  assert.equal(diagnosis.nextManifestSha256,second.manifestSha256);
  if(phase==='purge-started')assert.equal(diagnosis.previousRemainder,'verified-subset');
  assert.deepEqual((await readdir(crashRoot)).sort(),entries.sort(),'diagnosis is read-only');
  const originalLock=await readFile(join(crashRoot,'rotation.lock'));
  const badIntent=JSON.parse(originalLock.toString('utf8'));
  badIntent.next.proof.signature=Buffer.alloc(64).toString('base64');
  await writeFile(join(crashRoot,'rotation.lock'),JSON.stringify(badIntent));
  const rejected=await inspectVpsRotationRecovery({root:crashRoot,scope});
  assert.equal(rejected.phase,'unknown');assert.equal(rejected.deletionAuthorized,false);
  assert.deepEqual(rejected.recoverableSlots,[]);
  await writeFile(join(crashRoot,'rotation.lock'),originalLock);
  await assert.rejects(rotateVerifiedVpsReplica({...requestRotation,root:crashRoot}),/locked_or_interrupted/);
  assert.deepEqual((await readdir(crashRoot)).sort(),entries.sort(),'retry cannot mutate interrupted rotation');
  assert.equal((await inspectEncryptedBackupBundle(initialExternal)).manifestSha256,initialResult.manifestSha256);
  console.log('sabora_vps_backup_rotation_sigkill_ok:'+phase);
  console.log('sabora_vps_backup_recovery_diagnosis_ok:'+phase);
  if(['copy-started','previous-moved','candidate-promoted'].includes(phase)){
   await assert.rejects(inspectVpsPublishedPurge({root:crashRoot,scope}),/recovery_phase_not_supported/);
   let subject=await inspectVpsRecoveryTransition({root:crashRoot,scope});
   assert.equal(subject.writerExcluded,false);assert.equal(subject.deletionAuthorized,false);
   if(phase==='copy-started'){
    const pending=join(fixture,'.'+basename(crashRoot)+'.recovery-sequence.pending');
    await writeFile(pending,'interrupted fixture-only counter write',{mode:0o600,flag:'wx'});
    await assert.rejects(inspectVpsRecoveryTransition({root:crashRoot,scope}),/recovery_sequence_interrupted/);
    assert.deepEqual((await readdir(crashRoot)).sort(),entries.sort());
    // Only the disposable harness may remove its fabricated interrupted counter.
    await rm(pending);
    console.log('sabora_vps_backup_recovery_sequence_interrupted_stop_ok');
   }
   const retained=phase==='candidate-promoted'?second:initialResult;
   const verified=rotationProof(scope,retained,phase==='candidate-promoted'?initialResult.manifestSha256:null,
    kind,retained.manifest.components[0].plaintextSha256,initialEvidence);
   const request=()=>({root:crashRoot,scope,externalProofBytes:verified,
    authorizationBytes:transitionAuthorization(scope,subject,verified)});
   await assert.rejects(applyVpsRecoveryTransition({...request(),scope:{...scope,environment:'production'}}),/production_reconciliation_not_enabled/);
   await assert.rejects(applyVpsRecoveryTransition({...request(),authorizationBytes:transitionAuthorization(scope,subject,verified,
    {subjectSha256:'f'.repeat(64)})}),/recovery_authorization_scope_mismatch/);
   await assert.rejects(applyVpsRecoveryTransition({...request(),authorizationBytes:transitionAuthorization(scope,subject,verified,
    {sequence:subject.sequence+1})}),/recovery_authorization_scope_mismatch/);
   if(phase==='previous-moved'){
    assert.equal(subject.action,'restore-predecessor-name');
    const original=request(),restored=await applyVpsRecoveryTransition(original);
    assert.equal(restored.phase,'before-promotion');assert.equal(restored.blocked,true);
    assert.equal((await inspectEncryptedBackupBundle(join(crashRoot,'current'))).manifestSha256,initialResult.manifestSha256);
    assert.equal((await inspectEncryptedBackupBundle(join(crashRoot,'candidate'))).manifestSha256,second.manifestSha256);
    await assert.rejects(applyVpsRecoveryTransition(original),/recovery_authorization_scope_mismatch/);
    const next=await inspectVpsRecoveryTransition({root:crashRoot,scope});
    assert.equal(next.sequence,subject.sequence+1);subject=next;
    console.log('sabora_vps_backup_transition_ok:restore-predecessor-name');
   }
   if(phase==='candidate-promoted'){
    assert.equal(subject.action,'publish-promoted-state');
    const original=request(),published=await applyVpsRecoveryTransition(original);
    assert.equal(published.phase,'state-published');assert.equal(published.blocked,true);
    assert.equal((await inspectEncryptedBackupBundle(join(crashRoot,'previous'))).manifestSha256,initialResult.manifestSha256);
    await assert.rejects(applyVpsRecoveryTransition(original),/recovery_phase_not_supported/);
    assert.equal((await inspectVpsPublishedPurge({root:crashRoot,scope})).sequence,subject.sequence+1);
    console.log('sabora_vps_backup_transition_ok:publish-promoted-state');
   }else{
    assert.equal(subject.action,'discard-verified-candidate');
    const extra=join(crashRoot,'candidate','unexpected-fixture');
    await writeFile(extra,'not part of signed intent',{mode:0o600,flag:'wx'});
    await assert.rejects(applyVpsRecoveryTransition(request()),/unexpected_previous_file/);
    await rm(extra);
    assert.equal((await inspectVpsRecoveryTransition({root:crashRoot,scope})).sequence,subject.sequence);
    const original=request(),discarded=await applyVpsRecoveryTransition(original);
    assert.equal(discarded.phase,'stable');assert.equal(discarded.blocked,false);
    assert.equal((await inspectEncryptedBackupBundle(join(crashRoot,'current'))).manifestSha256,initialResult.manifestSha256);
    assert.deepEqual((await readdir(crashRoot)).sort(),['current','state.json']);
    await assert.rejects(applyVpsRecoveryTransition(original),/recovery_phase_not_supported/);
    console.log('sabora_vps_backup_transition_ok:discard-verified-candidate:'+phase);
    continue;
   }
  }
  const reconcileEntries=await readdir(crashRoot);
  const subject=await inspectVpsPublishedPurge({root:crashRoot,scope});
  assert.equal(subject.writerExcluded,false);assert.equal(subject.deletionAuthorized,false);
  assert.equal(subject.previousRemainder,phase==='purge-started'?'verified-subset':'complete');
  const externalProof=rotationProof(scope,second,initialResult.manifestSha256,kind,
   second.manifest.components[0].plaintextSha256,initialEvidence);
  const authorized={root:crashRoot,scope,externalProofBytes:externalProof,
   authorizationBytes:purgeAuthorization(scope,subject,externalProof)};
  await assert.rejects(finishInterruptedVpsPurge({...authorized,scope:{...scope,environment:'production'}}),/production_reconciliation_not_enabled/);
  await assert.rejects(finishInterruptedVpsPurge({...authorized,scope:{...scope,recoveryPublicKey:scope.verifierPublicKey}}),/recovery_authority_not_independent/);
  await assert.rejects(finishInterruptedVpsPurge({...authorized,authorizationBytes:purgeAuthorization(scope,subject,externalProof,
   {previousRemainderSha256:'f'.repeat(64)})}),/recovery_authorization_scope_mismatch/);
  await assert.rejects(finishInterruptedVpsPurge({...authorized,authorizationBytes:purgeAuthorization(scope,subject,externalProof,
   {observedAt:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()-1000).toISOString()})}),/recovery_authorization_time_invalid/);
  const invalidExternal=Buffer.from(JSON.stringify({...JSON.parse(externalProof),signature:Buffer.alloc(64).toString('base64')}));
  await assert.rejects(finishInterruptedVpsPurge({...authorized,externalProofBytes:invalidExternal,
   authorizationBytes:purgeAuthorization(scope,subject,invalidExternal)}),/document_signature_invalid/);
  // A distinct process owns the same open-file description guard while
  // neither rotation nor signed reconciliation may enter its critical section.
  const guardPath=join(fixture,'.'+basename(crashRoot)+'.rotation.guard');
  const liveWriter=spawn(process.execPath,['--input-type=module','--eval',`
   import {open} from 'node:fs/promises';
   import {spawnSync} from 'node:child_process';
   const fd=await open(process.argv[1],'r+');
   const locked=spawnSync('/usr/bin/flock',['-n','-E','75','3'],{stdio:['ignore','ignore','ignore',fd.fd]});
   if(locked.status!==0)throw Error('fixture_guard_failed');
   process.stdout.write('ready\\n');
   process.stdin.resume();
  `,guardPath],{stdio:['pipe','pipe','pipe']});
  const ended=once(liveWriter,'close');
  try{
   const signal=AbortSignal.timeout(5000);
   const [ready]=await Promise.race([once(liveWriter.stdout,'data',{signal}),
    ended.then(()=>{throw Error('fixture_guard_exited_before_ready');})]);
   assert.equal(String(ready),'ready\n');
   await assert.rejects(finishInterruptedVpsPurge(authorized),/locked_or_interrupted/);
   await assert.rejects(rotateVerifiedVpsReplica({...requestRotation,root:crashRoot}),/locked_or_interrupted/);
  }finally{liveWriter.kill('SIGKILL');await ended;}
  assert.deepEqual((await readdir(crashRoot)).sort(),reconcileEntries.sort());
  assert.equal((await inspectVpsPublishedPurge({root:crashRoot,scope})).previousRemainderSha256,subject.previousRemainderSha256);
  const unexpected=join(crashRoot,'previous','unexpected-fixture');
  await writeFile(unexpected,'not part of manifest',{mode:0o600,flag:'wx'});
  await assert.rejects(finishInterruptedVpsPurge(authorized),/recovery_phase_not_supported|unexpected_previous_file/);
  await rm(unexpected);
  let finalAuthorization=authorized;
  if(phase==='state-published'){
   const repairCrashProgram=`
    import fs from 'node:fs/promises';
    import {syncBuiltinESMExports} from 'node:module';
    import {join} from 'node:path';
    let input='';for await(const chunk of process.stdin)input+=chunk;
    const {root,scope,moduleUrl,authorization,external,cutBefore}=JSON.parse(input);
    if(process.env.GITHUB_ACTIONS!=='true'||scope.environment!=='disposable-lab'||
     !root.startsWith(process.env.RUNNER_TEMP+'/sabora-dual-backup-')||
     !root.endsWith('/crash-state-published'))throw Error('fixture_scope');
    const original=fs.unlink;
    fs.unlink=async(path,...args)=>{
     const target=path.startsWith(join(root,'previous')+'/');
     if(target&&cutBefore)process.kill(process.pid,'SIGKILL');
     const result=await original(path,...args);
     if(target)process.kill(process.pid,'SIGKILL');
     return result;};
    syncBuiltinESMExports();
    const {finishInterruptedVpsPurge}=await import(moduleUrl);
    await finishInterruptedVpsPurge({root,scope,authorizationBytes:Buffer.from(authorization,'base64'),
     externalProofBytes:Buffer.from(external,'base64')});
   `;
   const killRepair=(request,cutBefore)=>spawnSync(process.execPath,['--input-type=module','--eval',repairCrashProgram],{
    input:JSON.stringify({root:crashRoot,scope,moduleUrl:crashModule,cutBefore,
     authorization:request.authorizationBytes.toString('base64'),external:externalProof.toString('base64')}),
    encoding:'utf8',timeout:30000});
   const before=killRepair(authorized,true);
   assert.equal(before.signal,'SIGKILL',String(before.stderr));
   const unchanged=await inspectVpsPublishedPurge({root:crashRoot,scope});
   assert.equal(unchanged.previousRemainderSha256,subject.previousRemainderSha256);
   assert.equal(unchanged.sequence,subject.sequence+1);
   await assert.rejects(finishInterruptedVpsPurge(authorized),/recovery_authorization_scope_mismatch/);
   console.log('sabora_vps_backup_authorization_consumed_before_mutation_ok');
   const renewed={...authorized,authorizationBytes:purgeAuthorization(scope,unchanged,externalProof)};
   const cut=killRepair(renewed,false);
   assert.equal(cut.signal,'SIGKILL',String(cut.stderr));
   const afterCut=await inspectVpsPublishedPurge({root:crashRoot,scope});
   assert.equal(afterCut.previousRemainder,'verified-subset');
   assert.notEqual(afterCut.previousRemainderSha256,subject.previousRemainderSha256);
   assert.equal(afterCut.sequence,unchanged.sequence+1);
   await assert.rejects(finishInterruptedVpsPurge(renewed),/recovery_authorization_scope_mismatch/);
   finalAuthorization={...authorized,authorizationBytes:purgeAuthorization(scope,afterCut,externalProof)};
   console.log('sabora_vps_backup_reconciliation_sigkill_ok');
  }
  const repaired=await finishInterruptedVpsPurge(finalAuthorization);
  assert.equal(repaired.operationalReceipt,false);assert.equal(repaired.generations,1);
  assert.equal(repaired.currentManifestSha256,second.manifestSha256);
  assert.deepEqual((await readdir(crashRoot)).sort(),['current','state.json']);
  assert.equal((await inspectVpsRotationRecovery({root:crashRoot,scope})).phase,'stable');
  await assert.rejects(finishInterruptedVpsPurge(authorized),/recovery_phase_not_supported/);
  assert.equal((await inspectEncryptedBackupBundle(initialExternal)).manifestSha256,initialResult.manifestSha256);
  console.log('sabora_vps_backup_published_purge_reconciled_ok:'+phase);
 }
 // An initial interrupted receipt has no VPS predecessor. Only the
 // authenticated external initial backup can justify discarding exact remnants.
 const initialCrashRoot=join(fixture,'crash-initial-receipt');await mkdir(initialCrashRoot,{mode:0o700});
 const initialDeath=spawnSync(process.execPath,['--input-type=module','--eval',crashProgram],{
  input:JSON.stringify({root:initialCrashRoot,sourceDirectory:initialExternal,scope,proofB64:firstProof.toString('base64'),
   phase:'copy-started',moduleUrl:crashModule}),encoding:'utf8',timeout:30000});
 assert.equal(initialDeath.signal,'SIGKILL',String(initialDeath.stderr));
 const initialSubject=await inspectVpsRecoveryTransition({root:initialCrashRoot,scope});
 assert.equal(initialSubject.phase,'initial-receipt');assert.equal(initialSubject.action,'discard-verified-candidate');
 const initialFresh=rotationProof(scope,initialResult,null,kind,initialResult.manifest.components[0].plaintextSha256,initialEvidence);
 const initialRecovered=await applyVpsRecoveryTransition({root:initialCrashRoot,scope,externalProofBytes:initialFresh,
  authorizationBytes:transitionAuthorization(scope,initialSubject,initialFresh)});
 assert.equal(initialRecovered.phase,'empty');assert.deepEqual(await readdir(initialCrashRoot),[]);
 assert.equal((await inspectEncryptedBackupBundle(initialExternal)).manifestSha256,initialResult.manifestSha256);
 console.log('sabora_vps_backup_transition_ok:initial-receipt');
 // Negative wire cases use the small initial-state bundle only; do not buffer
 // the large V2 payloads. The valid receive path streams via real child pipes.
 const wireParts=[];
 for await(const part of encodeVpsBackupStream({sourceDirectory:secondExternal,proofBytes:secondProof}))wireParts.push(part);
 const wire=Buffer.concat(wireParts),magicSize=wireParts[0].length;
 const brokenMagic=Buffer.from(wire);brokenMagic[0]^=1;
 const hugeHeader=Buffer.from(wire);hugeHeader.writeBigUInt64BE(262145n,magicSize);
 const hugeBody=Buffer.from(wire);
 const bodyLengthOffset=wireParts.slice(0,5).reduce((total,part)=>total+part.length,0);
 hugeBody.writeBigUInt64BE(1073741825n,bodyLengthOffset);
 const wrongBodySize=Buffer.from(wire);wrongBodySize.writeBigUInt64BE(1n,bodyLengthOffset);
 const wrongBodyDigest=Buffer.from(wire);wrongBodyDigest[wrongBodyDigest.length-1]^=1;
 const forgedParts=[];
 for await(const part of encodeVpsBackupStream({sourceDirectory:secondExternal,proofBytes:Buffer.from(JSON.stringify(invalid))}))forgedParts.push(part);
 const wrongPriorParts=[];
 for await(const part of encodeVpsBackupStream({sourceDirectory:secondExternal,proofBytes:wrongPrior}))wrongPriorParts.push(part);
 for(const [label,bytes,pattern,mutated,quota] of [
  ['magic',brokenMagic,/protocol_mismatch/,false],
  ['header-limit',hugeHeader,/invalid_frame_length/,false],
  ['header-truncated',wire.subarray(0,magicSize+4),/truncated_frame/,false],
  ['signature',Buffer.concat(forgedParts),/document_signature_invalid/,false],
  ['predecessor',Buffer.concat(wrongPriorParts),/proof_scope_mismatch/,false],
  ['capacity',wire,/insufficient_reserved_capacity/,false,scope.reserveBytes+1],
  ['body-limit',hugeBody,/invalid_frame_length/,true],
  ['body-length',wrongBodySize,/component_length_mismatch/,true],
  ['body-truncated',wire.subarray(0,wire.length-1),/truncated_frame/,true],
  ['digest',wrongBodyDigest,/component_digest_mismatch/,true],
  ['extra',Buffer.concat([wire,Buffer.from('x')]),/trailing_bytes/,true],
 ]){
  const negativeRoot=join(fixture,'wire-negative-'+label);await mkdir(negativeRoot,{mode:0o700});
  await rotateVerifiedVpsReplica({root:negativeRoot,sourceDirectory:initialExternal,scope,proofBytes:firstProof});
  // Fragmentation covers partial and multiple headers per underlying read.
  const chunks=(function*(){for(let i=0;i<bytes.length;i+=37)yield bytes.subarray(i,i+37);})();
  await assert.rejects(receiveVerifiedVpsReplica({root:negativeRoot,source:Readable.from(chunks),
   scope:quota?{...scope,quotaBytes:quota}:scope}),pattern);
  const entries=(await readdir(negativeRoot)).sort();
  assert.deepEqual(entries,mutated?['candidate','current','rotation.lock','state.json']:['current','state.json']);
  assert.equal((await inspectEncryptedBackupBundle(join(negativeRoot,'current'))).manifestSha256,initialResult.manifestSha256);
  if(mutated){
   const diagnosis=await inspectVpsRotationRecovery({root:negativeRoot,scope});
   assert.equal(diagnosis.phase,'before-promotion');assert.equal(diagnosis.deletionAuthorized,false);
   assert.ok(diagnosis.recoverableSlots.some(slot=>slot.slot==='current'&&slot.manifestSha256===initialResult.manifestSha256));
   await assert.rejects(receiveVerifiedVpsReplica({root:negativeRoot,source:Readable.from([wire]),scope}),/locked_or_interrupted/);
  }
  console.log('sabora_vps_backup_wire_negative_ok:'+label);
 }
 // An input stream failure is also a real transport interruption, not EOF
 // with a valid payload. Keep the preceding backup and lock.
 const cutRoot=join(fixture,'wire-cut');await mkdir(cutRoot,{mode:0o700});
 await rotateVerifiedVpsReplica({root:cutRoot,sourceDirectory:initialExternal,scope,proofBytes:firstProof});
 const cut=(async function*(){
  yield wire.subarray(0,wire.length-1);
  // Readable.from may prefetch. Synchronize with actual creation of the
  // candidate instead of racing an early throw against header consumption.
  let received=false;
  for(let attempt=0;attempt<500;attempt++){
   try{await readFile(join(cutRoot,'candidate','manifest.json'));received=true;break;}
   catch(error){if(error.code!=='ENOENT')throw error;}
   await new Promise(accept=>setTimeout(accept,10));
  }
  assert.ok(received,'candidate must exist before simulated pipe disconnect');
  throw Error('fixture_pipe_disconnected');
 })();
 await assert.rejects(receiveVerifiedVpsReplica({root:cutRoot,source:Readable.from(cut),scope}),/fixture_pipe_disconnected/);
 assert.deepEqual((await readdir(cutRoot)).sort(),['candidate','current','rotation.lock','state.json']);
 assert.equal((await inspectEncryptedBackupBundle(join(cutRoot,'current'))).manifestSha256,initialResult.manifestSha256);
 const pipeRoot=join(fixture,'wire-positive');await mkdir(pipeRoot,{mode:0o700});
 await rotateFromPipe({root:pipeRoot,sourceDirectory:initialExternal,scope,proofBytes:firstProof});
 const pipeResult=await rotateFromPipe({...requestRotation,root:pipeRoot});
 assert.equal(pipeResult.manifestSha256,second.manifestSha256);
 assert.deepEqual((await readdir(pipeRoot)).sort(),['current','state.json']);
 await assert.rejects(receiveVerifiedVpsReplica({root:pipeRoot,source:Readable.from([wire]),scope}),/proof_scope_mismatch/);
 assert.deepEqual((await readdir(pipeRoot)).sort(),['current','state.json']);
 const stableDiagnosis=await inspectVpsRotationRecovery({root:pipeRoot,scope});
 assert.equal(stableDiagnosis.phase,'stable');assert.equal(stableDiagnosis.blocked,false);
 assert.deepEqual(stableDiagnosis.recoverableSlots,[{slot:'current',manifestSha256:second.manifestSha256}]);
 assert.equal(stableDiagnosis.deletionAuthorized,false);
 console.log('sabora_vps_backup_wire_pipe_ok: two real initial captures, one retained generation, no spool or replay');
 // Exercise the same real initial captures and later V2 restores through a
 // separately scoped OpenSSH daemon. The existing local and pipe tests remain.
 backupSsh=await startBackupSshLab({fixture,scope,sourceSha:releaseSha,
  entryPath:join(root,'scripts/ops/sabora-vps-backup-lab-entry.mjs')});
 const firstTransport={sourceDirectory:initialExternal,proofBytes:firstProof,
  expected:{backupId:initialResult.manifest.backupId,manifestSha256:initialResult.manifestSha256,previousManifestSha256:null}};
 await backupSsh.proveInitialNegatives(firstTransport);
 await backupSsh.transfer(firstTransport);
 const secondTransport={sourceDirectory:secondExternal,proofBytes:secondProof,
  expected:{backupId:second.manifest.backupId,manifestSha256:second.manifestSha256,previousManifestSha256:initialResult.manifestSha256}};
 await backupSsh.loseAcknowledgement(secondTransport);
 await assert.rejects(backupSsh.send(secondTransport),/transfer_outcome_unknown/);
 assert.equal((await inspectEncryptedBackupBundle(join(backupSsh.root,'current'))).manifestSha256,second.manifestSha256);
 assert.deepEqual((await readdir(backupSsh.root)).sort(),['current','state.json']);
 console.log('sabora_vps_backup_ssh_initial_cycle_ok: two captures, pinned host and signed scope, no replay');
 // Reuse the same two real encrypted preinstall backups on a separately
 // bounded test disk and identity. Only this disposable volume is filled.
 await withBoundedBackupVolume({fixture,operation:async({volume,capacity,proveCapacity})=>{
  const boundedScope={...scope,storageIdentitySha256:digest('ci-only-bounded-vps-storage-'+runId),
   quotaBytes:16*1024**2};
  assert.ok(BigInt(boundedScope.quotaBytes)<capacity);
  const bounded=await startBackupSshLab({fixture:volume,scope:boundedScope,sourceSha:releaseSha,
   entryPath:join(root,'scripts/ops/sabora-vps-backup-lab-entry.mjs')});
  try{
   const firstBounded={...firstTransport,proofBytes:rotationProof(boundedScope,initialResult,null,kind,
    initialResult.manifest.components[0].plaintextSha256,initialEvidence)};
   const secondBounded={...secondTransport,proofBytes:rotationProof(boundedScope,second,initialResult.manifestSha256,kind,
    second.manifest.components[0].plaintextSha256,initialEvidence)};
   await bounded.transfer(firstBounded);
   await proveCapacity({root:bounded.root,request:secondBounded,send:bounded.send});
   // After capacity pressure is removed, admission can reach the data
   // frame. Kill the actual SSH process midway; no invalidated candidate
   // bytes are treated as safe to delete by production code.
   await bounded.disconnectMidBody(secondBounded);
   await assert.rejects(inspectVpsRecoveryTransition({root:bounded.root,scope:boundedScope}),/previous_changed/);
   assert.equal((await inspectEncryptedBackupBundle(initialExternal)).manifestSha256,initialResult.manifestSha256);
   assert.equal((await inspectEncryptedBackupBundle(secondExternal)).manifestSha256,second.manifestSha256);
  }finally{await bounded.close();}
  const governedScope={...boundedScope,storageIdentitySha256:digest('ci-only-governed-vps-storage-'+runId),
   maxBundleBytes:4*1024**2};
  await exerciseGovernedBackupReceiver({volume,scope:governedScope,repository:root,sourceSha:releaseSha,
   first:{...firstTransport,proofBytes:rotationProof(governedScope,initialResult,null,kind,
    initialResult.manifest.components[0].plaintextSha256,initialEvidence)},
   second:{...secondTransport,proofBytes:rotationProof(governedScope,second,initialResult.manifestSha256,kind,
    second.manifest.components[0].plaintextSha256,initialEvidence)}});
 }});
 console.log('sabora_backup_governed_disposable_resources_closed_ok');
 // Keep the interrupted disk evidence intact until its fixture is torn
 // down. A fresh bounded disk reuses the existing PG17 captures for the
 // ENOSPC case; no extra database capture/restore or recovery bypass.
 await withBoundedBackupVolume({fixture,operation:async({volume,capacity,exhaust})=>{
  const fullDiskScope={...scope,storageIdentitySha256:digest('ci-only-enospc-vps-storage-'+runId),
   quotaBytes:16*1024**2};
  assert.ok(BigInt(fullDiskScope.quotaBytes)<capacity);
  const bounded=await startBackupSshLab({fixture:volume,scope:fullDiskScope,sourceSha:releaseSha,
   entryPath:join(root,'scripts/ops/sabora-vps-backup-lab-entry.mjs')});
  try{
   const firstBounded={...firstTransport,proofBytes:rotationProof(fullDiskScope,initialResult,null,kind,
    initialResult.manifest.components[0].plaintextSha256,initialEvidence)};
   const secondBounded={...secondTransport,proofBytes:rotationProof(fullDiskScope,second,initialResult.manifestSha256,kind,
    second.manifest.components[0].plaintextSha256,initialEvidence)};
   await bounded.transfer(firstBounded);
   await exhaust({root:bounded.root,request:secondBounded,transfer:bounded.exhaustDuringBody});
   assert.equal((await inspectEncryptedBackupBundle(initialExternal)).manifestSha256,initialResult.manifestSha256);
   assert.equal((await inspectEncryptedBackupBundle(secondExternal)).manifestSha256,second.manifestSha256);
  }finally{await bounded.close();}
 }});
 console.log('sabora_vps_backup_bounded_disk_unmounted_ok');
 // Actual installed receiver and sender, with synthetic activation authorities
 // only on the hosted runner. Reuse the real verified initial captures, not
 // another database or a publicly reachable SSH service.
 await withBoundedBackupVolume({fixture,operation:async({volume,capacity})=>{
  const installedScope={...scope,environment:'production',
   storageIdentitySha256:digest('ci-only-installed-vps-storage-'+runId),quotaBytes:16*1024**2,maxBundleBytes:4*1024**2};
  assert.ok(BigInt(installedScope.quotaBytes)<capacity);
  await exerciseInstalledBackupReceiver({fixture,volume,scope:installedScope,repository:root,sourceSha:releaseSha,
   first:{...firstTransport,proofBytes:rotationProof(installedScope,initialResult,null,kind,
    initialResult.manifest.components[0].plaintextSha256,initialEvidence)},
   second:{...secondTransport,proofBytes:rotationProof(installedScope,second,initialResult.manifestSha256,kind,
    second.manifest.components[0].plaintextSha256,initialEvidence)}});
  assert.equal((await inspectEncryptedBackupBundle(initialExternal)).manifestSha256,initialResult.manifestSha256);
  assert.equal((await inspectEncryptedBackupBundle(secondExternal)).manifestSha256,second.manifestSha256);
 }});
 console.log('sabora_backup_installed_receiver_disposable_disk_unmounted_ok');
 const outcomes=await Promise.allSettled([rotateVerifiedVpsReplica(requestRotation),rotateVerifiedVpsReplica(requestRotation)]);
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(o=>o.status==='rejected').length,1);
 assert.deepEqual((await readdir(rotationRoot)).sort(),['current','state.json']);
 assert.equal((await inspectEncryptedBackupBundle(join(rotationRoot,'current'))).manifestSha256,second.manifestSha256);
 assert.equal((await inspectEncryptedBackupBundle(initialExternal)).manifestSha256,initialResult.manifestSha256,'offsite predecessor never purged by VPS rotation');
 await assert.rejects(rotateVerifiedVpsReplica(requestRotation),/proof_scope_mismatch/);
 console.log('sabora_vps_backup_rotation_preinstall_ok: two real captures, signed disposable recovery proofs, concurrency, corruption, quota, interrupted marker, predecessor preserved on rejection, one generation on success');

 psql(target,'postgres',globalRolesSql);
 // Install the already recovered image in the SAME initial-state cluster,
 // database postgres, so later captures prove actual pre/post transition.
 // The extensions schema and pgcrypto were prepared before the baseline.
 psql(target,'postgres',databasePrerequisiteSql);
 docker(['cp',schemaOut,target+':/tmp/sabora-schema.dump']);
 docker(['cp',dataOut,target+':/tmp/sabora-data.dump']);
 docker(['exec',target,'pg_restore','-U','postgres','-d','postgres',
  '--exit-on-error','/tmp/sabora-schema.dump']);
 docker(['exec',target,'pg_restore','-U','postgres','-d','postgres',
  '--exit-on-error','--disable-triggers','/tmp/sabora-data.dump']);
 psql(target,'postgres',databaseAclSql);
 docker(['exec',target,'rm','-f','/tmp/sabora-schema.dump','/tmp/sabora-data.dump']);
 await rm(rolesOut,{force:true});await rm(schemaOut,{force:true});await rm(dataOut,{force:true});
 const restoredInventory=psql(target,'postgres',await readFile(inventorySql,'utf8')).stdout;
 assert.equal(restoredInventory,sourceInventory);
 const restoredColumnAcl=psql(target,'postgres',`
  select attacl is not null from pg_attribute
  where attrelid='sabora.staff_members'::regclass and attname='user_id';`).stdout.trim();
 assert.equal(restoredColumnAcl,'t','column ACL survives external encrypted restore');
 await rm(inventoryOut,{force:true});
 const ledgerCount=psql(target,'postgres',
  'select count(*) from sabora_migration_meta.applied_migrations where application_count=1;').stdout.trim();
 assert.equal(ledgerCount,String(migrations.count));
 psql(target,'postgres',`create role sabora_backup_restore_probe login
  password 'ci_only_not_a_secret' nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  grant sabora_staff_reader to sabora_backup_restore_probe;`);
 const allowed=docker(['exec','-e','PGPASSWORD=ci_only_not_a_secret',target,'psql','-X','-qAt',
  '-h','127.0.0.1','-U','sabora_backup_restore_probe','-d','postgres','-c',
  'set role sabora_staff_reader; select count(*) >= 0 from sabora.staff_members;']);
 assert.equal(allowed.stdout.trim(),'t');
 const denied=docker(['exec','-e','PGPASSWORD=ci_only_not_a_secret',target,'psql','-X','-qAt',
  '-h','127.0.0.1','-U','sabora_backup_restore_probe','-d','postgres','-c',
  'set role postgres;'],{allowFailure:true});
 assert.notEqual(denied.status,0);
 const membership=psql(target,'postgres',`select
  membership.admin_option||'|'||membership.set_option||'|'||membership.inherit_option
  from pg_auth_members membership join pg_roles parent on parent.oid=membership.roleid
  join pg_roles member on member.oid=membership.member
  where parent.rolname='sabora_h6_fn_owner' and member.rolname='cv005_recovery_provider_dba';`).stdout.trim();
 assert.equal(membership,'true|false|false');
 const restoreMs=elapsed(restoreStarted);
 // The V2 promotion is tied to the inventory actually recovered above,
 // not simply to successful transfer or to a manifest supplied by the caller.
 const restoredRoot=join(fixture,'bounded-vps-v2-fixture');
 await mkdir(restoredRoot,{mode:0o700});
 const fullScope=rotationScope(systemIdentifier),restoredDigest=digest(restoredInventory);
 assert.equal(restoredDigest,result.manifest.components.find(x=>x.name==='inventory').plaintextSha256);
 const fullProof=rotationProof(fullScope,result,null,'external-pg17-restore',restoredDigest,
  digest(JSON.stringify({fixture:runId,restoredDigest,ledgerCount,membership,restoredColumnAcl})));
 const fullRotated=await rotateVerifiedVpsReplica({root:restoredRoot,sourceDirectory:offsite,scope:fullScope,proofBytes:fullProof});
 assert.equal(fullRotated.manifestSha256,result.manifestSha256);
 assert.equal(fullRotated.operationalReceipt,false);
 assert.deepEqual((await readdir(restoredRoot)).sort(),['current','state.json']);
 console.log('sabora_vps_backup_rotation_v2_ok: external PG17 restored inventory bound to signed disposable proof; no operational receipt');
 // The initial target is now fully restored and has the SAME system identifier
 // as the two preinstall bundles. Capture two fresh V2 generations from it,
 // independently restore each into a third networkless PG17 fixture, and
 // promote them over preinstall then V2 only after exact inventory equality.
 psql(target,'postgres','DROP ROLE sabora_backup_restore_probe;');
 assert.equal(psql(target,'postgres','select (pg_control_system()).system_identifier::text;').stdout.trim(),initialSystem);
 docker(['run','-d','--name',rotationRestoreTarget,'--network','none','-e','POSTGRES_PASSWORD=ci_only_not_a_secret','postgres:17-alpine']);
 rotationRestoreStarted=true;await waitForPg(rotationRestoreTarget);
 const postVersion=psql(target,'postgres','show server_version;').stdout.trim();
 const postArgs=['exec','-i',target,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'];
 let predecessor=second.manifestSha256,previousGlobal,previousRecovered,previousBackup;
 for(const generation of [1,2]){
  if(generation===2)psql(target,'postgres',"CREATE TABLE sabora.rotation_ci_probe(id integer PRIMARY KEY); INSERT INTO sabora.rotation_ci_probe VALUES(72);");
  const postCapture=join(fixture,'post-capture-'+generation),postExternal=join(fixture,'post-external-'+generation);
  const post=await captureEncryptedBackupBundle({directory:postCapture,keyPath,metadata:{
   schema:'sabora-logical-backup/v2',backupId:'SABORA-BACKUP-POST-CI-'+runId+'-'+generation,
   repository:'jdlc86/CartaViva',releaseSha,sourceProjectRef:'byhvmumqivmunkmomhup',
   postgresMajor:17,postgresVersion:postVersion,migrationTreeSha256:migrations.treeSha256,
   includedSchemas:['sabora','sabora_migration_meta'],
   excludedManagedSchemas:['auth','extensions','realtime','storage','supabase_functions','vault'],
   createdAt:new Date().toISOString(),custody:'key-outside-artifact-git-actions-vps',
  },snapshot:{exporter:{command:'docker',args:postArgs},expectedSystemIdentifier:initialSystem},components:[
   {name:'roles-memberships',mediaType:'application/sql',command:'docker',args:postArgs,stdinPath:rolesSql},
   {name:'schema',mediaType:'application/vnd.postgresql.custom',command:'docker',
    args:['exec',target,'pg_dump','-U','postgres','-d','postgres','-Fc','--schema=sabora','--schema=sabora_migration_meta','--schema-only']},
   {name:'data',mediaType:'application/vnd.postgresql.custom',command:'docker',
    args:['exec',target,'pg_dump','-U','postgres','-d','postgres','-Fc','--schema=sabora','--schema=sabora_migration_meta','--data-only']},
   {name:'inventory',mediaType:'text/plain',command:'docker',args:postArgs,stdinPath:inventorySql},
  ]});
  await replicateEncryptedBackupBundle({sourceDirectory:postCapture,destinationDirectory:postExternal,destinationClass:'offsite'});
  await rm(postCapture,{recursive:true,force:true});
  const work=join(fixture,'post-restore-'+generation);await mkdir(work,{mode:0o700});
  const outputs={ 'roles-memberships':join(work,'roles.sql'),schema:join(work,'schema.dump'),data:join(work,'data.dump'),inventory:join(work,'inventory.txt') };
  for(const [name,outputPath] of Object.entries(outputs))await decryptBackupComponent({bundleDirectory:postExternal,name,keyPath,outputPath});
  const sql=await readFile(outputs['roles-memberships'],'utf8'),preAt=sql.indexOf(databasePrerequisiteMarker),aclAt=sql.indexOf(databaseAclMarker);
  assert.ok(preAt>0&&aclAt>preAt);
  const global=sql.slice(0,preAt);
  if(generation===1){psql(rotationRestoreTarget,'postgres',global);previousGlobal=global;}
  else assert.equal(global,previousGlobal,'global role catalog unchanged between generations');
  const database='sabora_rotation_restore_'+generation;
  docker(['exec',rotationRestoreTarget,'createdb','-U','postgres',database]);
  psql(rotationRestoreTarget,database,'CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;');
  psql(rotationRestoreTarget,database,sql.slice(preAt+databasePrerequisiteMarker.length,aclAt));
  docker(['cp',outputs.schema,rotationRestoreTarget+':/tmp/sabora-rotation-schema.dump']);
  docker(['cp',outputs.data,rotationRestoreTarget+':/tmp/sabora-rotation-data.dump']);
  docker(['exec',rotationRestoreTarget,'pg_restore','-U','postgres','-d',database,'--exit-on-error','/tmp/sabora-rotation-schema.dump']);
  docker(['exec',rotationRestoreTarget,'pg_restore','-U','postgres','-d',database,'--exit-on-error','--disable-triggers','/tmp/sabora-rotation-data.dump']);
  psql(rotationRestoreTarget,database,sql.slice(aclAt+databaseAclMarker.length));
  docker(['exec',rotationRestoreTarget,'rm','-f','/tmp/sabora-rotation-schema.dump','/tmp/sabora-rotation-data.dump']);
  const recovered=psql(rotationRestoreTarget,database,await readFile(inventorySql,'utf8')).stdout;
  assert.equal(recovered,await readFile(outputs.inventory,'utf8'));
  const recoveredHash=digest(recovered);
  assert.equal(recoveredHash,post.manifest.components.find(x=>x.name==='inventory').plaintextSha256);
  assert.equal(psql(rotationRestoreTarget,database,'select count(*) from sabora_migration_meta.applied_migrations where application_count=1;').stdout.trim(),String(migrations.count));
  if(generation===2){assert.notEqual(recoveredHash,previousRecovered);assert.equal(psql(rotationRestoreTarget,database,'SELECT id FROM sabora.rotation_ci_probe;').stdout.trim(),'72');}
  await rm(work,{recursive:true,force:true});
  const verified=rotationProof(scope,post,predecessor,'external-pg17-restore',recoveredHash,
   digest(JSON.stringify({fixture:runId,generation,recoveredHash,externalDatabase:database})));
  const rotated=await backupSsh.transfer({sourceDirectory:postExternal,proofBytes:verified,
   expected:{backupId:post.manifest.backupId,manifestSha256:post.manifestSha256,previousManifestSha256:predecessor}});
  assert.equal(rotated.manifestSha256,post.manifestSha256);assert.equal(rotated.generations,1);
  assert.deepEqual((await readdir(backupSsh.root)).sort(),['current','state.json']);
  assert.equal((await inspectEncryptedBackupBundle(join(backupSsh.root,'current'))).manifestSha256,post.manifestSha256);
  if(previousBackup)assert.equal((await inspectEncryptedBackupBundle(previousBackup.path)).manifestSha256,previousBackup.digest);
  previousBackup={path:postExternal,digest:post.manifestSha256};previousRecovered=recoveredHash;predecessor=post.manifestSha256;
  assert.equal((await inspectEncryptedBackupBundle(secondExternal)).manifestSha256,second.manifestSha256);
  console.log('sabora_vps_backup_rotation_cycle_ok:'+(generation===1?'preinstall-to-v2':'v2-to-v2'));
  console.log('sabora_vps_backup_ssh_cycle_ok:'+(generation===1?'preinstall-to-v2':'v2-to-v2'));
 }
 const downgrade=rotationProof(scope,second,predecessor,kind,second.manifest.components[0].plaintextSha256,initialEvidence);
 await assert.rejects(rotateVerifiedVpsReplica({root:backupSsh.root,sourceDirectory:secondExternal,scope,proofBytes:downgrade}),/stale_or_regressive_backup/);
 await assert.rejects(backupSsh.send({sourceDirectory:secondExternal,proofBytes:downgrade,
  expected:{backupId:second.manifest.backupId,manifestSha256:second.manifestSha256,previousManifestSha256:predecessor}}),/transfer_outcome_unknown/);
 assert.equal((await inspectEncryptedBackupBundle(join(backupSsh.root,'current'))).manifestSha256,predecessor);
 await backupSsh.close();backupSsh=undefined;
 console.log('sabora_vps_backup_ssh_disposable_listener_closed_ok');

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
 try{if(backupSsh)await backupSsh.close();}finally{
 if(rotationRestoreStarted)docker(['rm','-f','-v',rotationRestoreTarget],{allowFailure:true});
 if(targetStarted)docker(['rm','-f','-v',target],{allowFailure:true});
 await rm(fixture,{recursive:true,force:true});
 }
}
