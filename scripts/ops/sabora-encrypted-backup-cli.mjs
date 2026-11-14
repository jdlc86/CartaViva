#!/usr/bin/env node
// Narrow operator interface for the Sabora logical-backup bundle. This CLI
// never accepts a key, password, token or connection string in argv. Capture
// commands are executed directly (no shell) from a protected JSON plan.
import {constants as fsConstants} from 'node:fs';
import {lstat,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 captureEncryptedBackupBundle,decryptBackupComponent,
 inspectEncryptedBackupBundle,replicateEncryptedBackupBundle,
} from './sabora-encrypted-backup-bundle.mjs';

const stop=code=>Error('sabora_backup_cli_stop:'+code);
const HASH=/^[0-9a-f]{64}$/;
const COMPONENTS=['roles-memberships','schema','data','inventory'];
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
function includesPair(args,left,right){
 return args.some((value,index)=>value===left&&args[index+1]===right);
}
function rejectSharedArgs(args){
 if(args.length<1||args.length>100||args.some(value=>typeof value!=='string'||
  value.length<1||value.length>2048||value.includes('\0')))throw stop('invalid_postgres_args');
 const lower=args.map(value=>value.toLowerCase());
 if(lower.some(value=>/postgres(?:ql)?:\/\//.test(value)||
  /(?:^|[?;&])(?:password|passfile)=/.test(value)||/\b(?:password|passfile)\s*=/.test(value)||
  /^(?:--)?(?:password|passfile)(?:=|$)/.test(value)))throw stop('secret_or_dsn_argument');
 if(args.some(value=>value==='-o'||value.startsWith('-o')||value==='-L'||value.startsWith('-L'))||
  lower.some(value=>['--output','--log-file'].includes(value)||
   value.startsWith('--output=')||value.startsWith('--log-file=')))
  throw stop('plaintext_output_argument');
}
function validatePsql(spec,psql){
 if(spec.command!==psql||spec.mediaType!=='application/sql'&&spec.mediaType!=='text/plain'||
  !isAbsolute(spec.stdinPath??''))throw stop('psql_component_contract');
 rejectSharedArgs(spec.args);
 const lower=spec.args.map(value=>value.toLowerCase());
 if(!lower.includes('-x')||
  !(includesPair(spec.args,'-v','ON_ERROR_STOP=1')||
    lower.includes('--set=on_error_stop=1'))||
  !(includesPair(spec.args,'-f','-')||lower.includes('--file=-'))||
  lower.some((value,index)=>['-c','--command','-w','--password'].includes(value)||
   (['-f','--file'].includes(value)&&spec.args[index+1]!=='-')||
   value.startsWith('--command=')||(value.startsWith('--file=')&&value!=='--file=-')))
  throw stop('psql_arguments_not_fail_closed');
}
function validatePgDump(spec,pgDump,mode){
 if(spec.command!==pgDump||spec.mediaType!=='application/vnd.postgresql.custom'||
  spec.stdinPath!==undefined)throw stop('pg_dump_component_contract');
 rejectSharedArgs(spec.args);
 const lower=spec.args.map(value=>value.toLowerCase());
 const schemas=lower.filter(value=>value.startsWith('--schema='));
 const formats=spec.args.filter(value=>value.startsWith('-F')||
  value.toLowerCase().startsWith('--format='));
 if(formats.length!==1||!['-Fc','--format=custom'].includes(formats[0])||
  schemas.join('|')!=='--schema=sabora|--schema=sabora_migration_meta'||
  !lower.includes('--'+mode+'-only')||lower.includes('--schema-only')===lower.includes('--data-only')||
  spec.args.some(value=>value.startsWith('-f')||value.startsWith('-n')||value.startsWith('-N')||
   value.startsWith('-t')||value.startsWith('-T'))||
  lower.some(value=>value==='--file'||value.startsWith('--file=')||
   value==='--schema'||value==='--table'||value.startsWith('--exclude-')||
   value.startsWith('--table=')||value.startsWith('--table-and-children=')||
   value.startsWith('--section=')||value==='-a'||value==='-s'||value==='-b'||
   value==='--blobs'||value==='--large-objects'))
  throw stop('pg_dump_scope_or_output_argument');
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
 await Promise.all([verifyExecutable(binaries.psql),verifyExecutable(binaries.pgDump)]);
 for(const spec of value.components.filter(item=>item.stdinPath!==undefined)){
  const sql=(await protectedRead(spec.stdinPath,1024*1024)).toString('utf8');
  if(/^\s*\\/m.test(sql))throw stop('psql_meta_command_not_allowed');
  spec.stdinSha256=createHash('sha256').update(sql).digest('hex');
 }
 return value;
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
 if(operation==='capture'){
  const [requestPath,directory]=args(2),plan=await request(requestPath);
  const result=await captureEncryptedBackupBundle({directory,keyPath:keyPath(),
   metadata:plan.metadata,components:plan.components});
  return {operation,backupId:result.manifest.backupId,releaseSha:result.manifest.releaseSha,
   manifestSha256:result.manifestSha256,containsKey:false,containsPlaintext:false};
 }
 if(operation==='replicate-offsite'||operation==='replicate-vps-cache'){
  const [sourceDirectory,destinationDirectory]=args(2);
  return replicateEncryptedBackupBundle({sourceDirectory,destinationDirectory,
   destinationClass:operation==='replicate-offsite'?'offsite':'vps-encrypted-cache'});
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
