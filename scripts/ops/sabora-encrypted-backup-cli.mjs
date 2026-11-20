#!/usr/bin/env node
// Narrow operator interface for the Sabora logical-backup bundle. This CLI
// never accepts a key, password, token or connection string in argv. Capture
// commands are executed directly (no shell) from a protected JSON plan.
import {constants as fsConstants} from 'node:fs';
import {lstat,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,dirname,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMigrationAudit} from '../ci/migration-audit.mjs';
import {
 captureEncryptedBackupBundle,decryptBackupComponent,
 capturePreinstallBackup,verifyPreinstallBackup,PREINSTALL_SCHEMA,
 inspectEncryptedBackupBundle,replicateEncryptedBackupBundle,
} from './sabora-encrypted-backup-bundle.mjs';

const stop=code=>Error('sabora_backup_cli_stop:'+code);
const HASH=/^[0-9a-f]{64}$/;
const COMPONENTS=['roles-memberships','schema','data','inventory'];
const SYSTEM=/^[0-9]{10,20}$/;
const PROJECT='byhvmumqivmunkmomhup';
const SOURCE_ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
export function currentAuditedMigrationTreeSha256(){
 const hash=createHash('sha256');
 for(const {name,sha256} of buildMigrationAudit(SOURCE_ROOT).migrations)
  hash.update(name).update('\0').update(sha256).update('\n');
 return hash.digest('hex');
}
// One direct verified connection: never inherit libpq options, service
// indirection, client certs or connection overrides from the operator shell.
const ALLOWED_PG_ENV=new Set(['PGHOST','PGPORT','PGSSLMODE','PGSSLROOTCERT',
 'PGUSER','PGPASSWORD','PGCONNECT_TIMEOUT','PGAPPNAME','PGCLIENTENCODING']);
// TLS hostname and independently approved cluster identity must BOTH match
// the live Postgres exporter; an operator-provided ref alone is not evidence.
export function validateCaptureSource(meta,env=process.env){
 if(meta?.schema!=='sabora-logical-backup/v2'||meta.sourceProjectRef!==PROJECT)
  throw stop('v2_snapshot_required');
 return validateVerifiedSource(env);
}
function validateVerifiedSource(env){
 if(env.PGHOST!=='db.'+PROJECT+'.supabase.co'||env.PGSSLMODE!=='verify-full'||
    !isAbsolute(env.PGSSLROOTCERT??'')||env.PGHOSTADDR||
    env.PGSERVICE||env.PGSERVICEFILE||
    (env.PGPORT!==undefined&&env.PGPORT!=='5432'))
  throw stop('supabase_verified_tls_identity_required');
 if(Object.keys(env).some(k=>/^pg/i.test(k)&&(k!==k.toUpperCase()||!ALLOWED_PG_ENV.has(k))))
  throw stop('unapproved_libpq_environment');
 if(!HASH.test(env.SABORA_BACKUP_APPROVED_CA_SHA256??''))
  throw stop('independent_tls_ca_pin_required');
 if(!SYSTEM.test(env.SABORA_BACKUP_APPROVED_SYSTEM_IDENTIFIER??''))
  throw stop('independent_cluster_identity_pin_required');
 return env.SABORA_BACKUP_APPROVED_SYSTEM_IDENTIFIER;
}

// The CA is not a secret, but its exact bytes must be independently pinned.
// libpq still validates server identity via PGSSLMODE=verify-full.
export async function verifyPinnedTlsRootCert(env=process.env){
 const path=env.PGSSLROOTCERT,expected=env.SABORA_BACKUP_APPROVED_CA_SHA256;
 if(!isAbsolute(path??'')||!HASH.test(expected??''))
  throw stop('independent_tls_ca_pin_required');
 let handle;
 try{
  const before=await lstat(path);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||
     before.size<32||before.size>1024*1024)throw stop('unsafe_tls_ca_file');
  handle=await open(path,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW??0));
  const after=await handle.stat();
  if(!after.isFile()||after.nlink!==1||after.size!==before.size||
     after.dev!==before.dev||after.ino!==before.ino)
   throw stop('unsafe_tls_ca_file');
  const contents=await handle.readFile();
  if(!contents.includes(Buffer.from('-----BEGIN CERTIFICATE-----'))||
    !contents.includes(Buffer.from('-----END CERTIFICATE-----'))||
    createHash('sha256').update(contents).digest('hex')!==expected)
   throw stop('tls_ca_pin_mismatch');
  return true;
 }catch(error){
  if(error?.message?.startsWith('sabora_backup_cli_stop:'))throw error;
  throw stop('unsafe_tls_ca_file');
 }finally{await handle?.close();}
}

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 Object.getPrototypeOf(value)===Object.prototype;

function protectedMode(stat){
 if(process.platform==='win32'){
  if(!HASH.test(process.env.SABORA_BACKUP_NTFS_ACL_RECEIPT_SHA256??''))
   throw stop('ntfs_acl_receipt_required');
  return;
 }
 if(typeof process.getuid!=='function'||stat.uid!==process.getuid()||(stat.mode&0o077)!==0)
  throw stop('request_owner_or_mode');
}
async function protectedRead(path,max){
 if(!isAbsolute(path??''))throw stop('absolute_protected_file_required');
 const before=await lstat(path);
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1)throw stop('unsafe_protected_file');
 const handle=await open(path,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW??0));
 try{
  const stat=await handle.stat();
  if(!stat.isFile()||stat.nlink!==1||stat.size<1||stat.size>max||
   (before.dev!==undefined&&stat.dev!==before.dev)||(before.ino!==undefined&&stat.ino!==before.ino))
   throw stop('unsafe_protected_file');
  protectedMode(stat);
  return await handle.readFile();
 }finally{await handle.close();}
}
function postgresBinaries(){
 const psql=process.env.SABORA_BACKUP_PSQL_BIN,pgDump=process.env.SABORA_BACKUP_PG_DUMP_BIN;
 if(!isAbsolute(psql??'')||!/^psql(?:\.exe)?$/i.test(basename(psql))||
  !isAbsolute(pgDump??'')||!/^pg_dump(?:\.exe)?$/i.test(basename(pgDump)))
  throw stop('absolute_postgres_binaries_required');
 return {psql,pgDump};
}
async function verifyExecutable(path){
 const stat=await lstat(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw stop('unsafe_postgres_binary');
 if(process.platform!=='win32'&&((stat.mode&0o022)!==0||
  ![0,process.getuid?.()].includes(stat.uid)))throw stop('unsafe_postgres_binary');
 if(process.platform!=='win32'){
  let directory=dirname(path);
  for(;;){
   const item=await lstat(directory);
   if(!item.isDirectory()||item.isSymbolicLink()||(item.mode&0o022)!==0||
    ![0,process.getuid()].includes(item.uid))throw stop('unsafe_postgres_binary_directory');
   const parent=dirname(directory);if(parent===directory)break;directory=parent;
  }
 }
}
// Exact PostgreSQL CLI shapes: no attached -Uother/-dotra/-cSQL/-f/path,
// no DSN/connection flags and no alternate stdout/output or schema scope.
const PSQL_ARGS=Object.freeze(['-X','-qAt','-v','ON_ERROR_STOP=1',
 '-U','postgres','-d','postgres','-f','-']);
function exactArgs(actual,expected){
 return Array.isArray(actual)&&actual.length===expected.length&&
  actual.every((value,index)=>value===expected[index]);
}
function validatePsql(spec,psql){
 if(spec.command!==psql||
    !['application/sql','text/plain'].includes(spec.mediaType)||
    !isAbsolute(spec.stdinPath??'')||!exactArgs(spec.args,PSQL_ARGS))
  throw stop('psql_component_contract');
}
function validatePgDump(spec,pgDump,mode){
 const expected=['-U','postgres','-d','postgres','-Fc',
  '--schema=sabora','--schema=sabora_migration_meta','--'+mode+'-only'];
 if(spec.command!==pgDump||
    spec.mediaType!=='application/vnd.postgresql.custom'||
    spec.stdinPath!==undefined||!exactArgs(spec.args,expected))
  throw stop('pg_dump_component_contract');
}

export function validateOperationalPlan(value,{psql,pgDump}=postgresBinaries()){
 if(!object(value)||Object.keys(value).sort().join('|')!=='components|metadata'||
  !Array.isArray(value.components)||value.components.length!==4)throw stop('request_shape');
 const names=value.components.map(item=>item?.name);
 if(names.join('|')!==COMPONENTS.join('|'))throw stop('component_set');
 for(const spec of value.components){
  if(!object(spec)||Object.keys(spec).sort().join('|')!==
   (['roles-memberships','inventory'].includes(spec.name)?'args|command|mediaType|name|stdinPath':'args|command|mediaType|name')||
   !Array.isArray(spec.args))throw stop('component_shape');
  if(['roles-memberships','inventory'].includes(spec.name))validatePsql(spec,psql);
  else validatePgDump(spec,pgDump,spec.name);
 }
 return value;
}

async function request(path){
 if(!isAbsolute(path??''))throw stop('absolute_request_required');
 const bytes=await protectedRead(path,1024*1024);
 let value;try{value=JSON.parse(bytes.toString('utf8'));}
 catch{throw stop('request_not_json');}
 const binaries=postgresBinaries();validateOperationalPlan(value,binaries);
  validateCaptureSource(value.metadata);
 if(value.metadata.migrationTreeSha256!==currentAuditedMigrationTreeSha256())
  throw stop('migration_tree_mismatch');
 await Promise.all([verifyExecutable(binaries.psql),verifyExecutable(binaries.pgDump),
  verifyPinnedTlsRootCert()]);
 for(const spec of value.components.filter(item=>item.stdinPath!==undefined)){
  const sql=(await protectedRead(spec.stdinPath,1024*1024)).toString('utf8');
  if(/^\s*\\/m.test(sql))throw stop('psql_meta_command_not_allowed');
  spec.stdinSha256=createHash('sha256').update(sql).digest('hex');
 }
 return value;
}
async function initialRequest(path){
 const bytes=await protectedRead(path,1024*1024);
 let plan;try{plan=JSON.parse(bytes.toString('utf8'));}catch{throw stop('request_not_json');}
 if(!object(plan)||Object.keys(plan).sort().join('|')!==
  'backupId|plannedMigrationTreeSha256|releaseSha|repository|schema|sourceProjectRef'||
  plan.schema!==PREINSTALL_SCHEMA||plan.sourceProjectRef!==PROJECT||
  plan.repository!=='jdlc86/CartaViva'||!/^SABORA-BACKUP-[A-Z0-9-]{8,80}$/.test(plan.backupId)||
  !/^[0-9a-f]{40}$/.test(plan.releaseSha)||
  plan.plannedMigrationTreeSha256!==currentAuditedMigrationTreeSha256())
  throw stop('preinstall_plan_scope_mismatch');
 const {execFileSync}=await import('node:child_process');
 const git=args=>execFileSync('git',args,{cwd:SOURCE_ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 if(git(['rev-parse','HEAD'])!==plan.releaseSha||git(['status','--porcelain','--untracked-files=no'])!=='')
  throw stop('preinstall_release_sha_mismatch_or_dirty_tree');
 return plan;
}
function keyPath(){
 const path=process.env.SABORA_BACKUP_KEY_FILE;
 if(!isAbsolute(path??''))throw stop('protected_key_env_required');
 return path;
}
function args(count){
 const values=process.argv.slice(3);
 if(values.length!==count||values.some(value=>!isAbsolute(value)))throw stop('absolute_arguments_required');
 return values;
}

export async function main(){
 const operation=process.argv[2];
 if(operation==='capture-preinstall'){
  const [requestPath,directory]=args(2),plan=await initialRequest(requestPath);
  const psql=process.env.SABORA_BACKUP_PSQL_BIN;
  if(!isAbsolute(psql??'')||!/^psql(?:\.exe)?$/i.test(basename(psql)))
   throw stop('absolute_postgres_binary_required');
  const pinnedSystem=validateVerifiedSource(process.env);
  await Promise.all([verifyExecutable(psql),verifyPinnedTlsRootCert()]);
  const key=keyPath();await protectedRead(key,128).then(bytes=>bytes.fill(0));
  const result=await capturePreinstallBackup({directory,keyPath:key,metadata:plan,
   exporter:{command:psql,args:PSQL_ARGS},expectedSystemIdentifier:pinnedSystem});
  return {operation,backupId:result.manifest.backupId,releaseSha:result.manifest.releaseSha,
   manifestSha256:result.manifestSha256,containsKey:false,containsPlaintext:false,restoreValidated:false};
 }
 if(operation==='verify-preinstall'){
  const [directory,requestPath]=args(2),plan=await initialRequest(requestPath);
  const key=keyPath();await protectedRead(key,128).then(bytes=>bytes.fill(0));
  return {operation,...await verifyPreinstallBackup({bundleDirectory:directory,keyPath:key,
   expectedReleaseSha:plan.releaseSha,expectedMigrationTreeSha256:plan.plannedMigrationTreeSha256,
   expectedSystemIdentifier:process.env.SABORA_BACKUP_APPROVED_SYSTEM_IDENTIFIER,expectedBackupId:plan.backupId})};
 }
 if(operation==='capture'){
  const [requestPath,directory]=args(2),plan=await request(requestPath);
  const result=await captureEncryptedBackupBundle({directory,keyPath:keyPath(),
   metadata:plan.metadata,components:plan.components,
   snapshot:{exporter:{command:plan.components[3].command,args:plan.components[3].args},
    expectedSystemIdentifier:validateCaptureSource(plan.metadata)}});
  return {operation,backupId:result.manifest.backupId,releaseSha:result.manifest.releaseSha,
   manifestSha256:result.manifestSha256,containsKey:false,containsPlaintext:false};
 }
 if(operation==='replicate-vps-cache')throw stop('remote_replica_requires_installed_sender');
 if(operation==='replicate-offsite'){
  const [sourceDirectory,destinationDirectory]=args(2);
  return replicateEncryptedBackupBundle({sourceDirectory,destinationDirectory,destinationClass:'offsite'});
 }
 if(operation==='inspect'){
  const [directory]=args(1);return {operation,...await inspectEncryptedBackupBundle(directory)};
 }
 if(operation==='decrypt-component'){
  const [bundleDirectory,outputPath]=args(2),name=process.env.SABORA_BACKUP_COMPONENT;
  if(!COMPONENTS.includes(name))throw stop('component_env_required');
  return {operation,...await decryptBackupComponent({bundleDirectory,name,keyPath:keyPath(),outputPath})};
 }
 throw stop('operation_not_allowed');
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{process.stdout.write(JSON.stringify(await main())+'\n');}
 catch(error){process.stderr.write(String(error?.message??error).replace(/[^A-Za-z0-9_:. -]/g,'_').slice(0,800)+'\n');process.exitCode=1;}
}
