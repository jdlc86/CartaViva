// Sabora-only logical backup bundle. Capture inputs are encrypted while they
// are streamed from PostgreSQL: no plaintext dump is written by this module.
// The key is intentionally external to every bundle and replica.
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {constants as fsConstants,createReadStream,createWriteStream} from 'node:fs';
import {copyFile,lstat,mkdir,open,readFile,readdir,rename,rm,writeFile} from 'node:fs/promises';
import {basename,isAbsolute,join,relative,resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {spawn} from 'node:child_process';
import {openPostgresBackupSnapshot,safePostgresChildEnv,readPreinstallState,validatePreinstallState}
 from './sabora-postgres-snapshot.mjs';

const failure=code=>Error('sabora_backup_stop:'+code);
const SHA=/^[0-9a-f]{40}$/;
const HASH=/^[0-9a-f]{64}$/;
const NAME=/^[a-z][a-z0-9-]{1,63}$/;
const FILE=/^[a-z][a-z0-9-]{1,63}\.aesgcm$/;
const META_KEYS=['backupId','createdAt','custody','excludedManagedSchemas','includedSchemas',
 'migrationTreeSha256','postgresMajor','postgresVersion','releaseSha','repository','schema',
 'sourceProjectRef'];
const V2_META_KEYS=[...META_KEYS,'snapshotId','sourceDatabase','sourceSystemIdentifier'].sort();
export const PREINSTALL_SCHEMA='sabora-preinstall-backup/v1';
const PREINSTALL_KEYS=[...V2_META_KEYS.filter(k=>k!=='migrationTreeSha256'),
 'plannedMigrationTreeSha256','initialState'].sort();
const manifestMetaKeys=schema=>schema===PREINSTALL_SCHEMA?PREINSTALL_KEYS:
 schema==='sabora-logical-backup/v2'?V2_META_KEYS:META_KEYS;
const namesFor=schema=>schema===PREINSTALL_SCHEMA?['initial-state']:['roles-memberships','schema','data','inventory'];
const COMPONENT_KEYS=['algorithm','ciphertextBytes','ciphertextSha256','filename','ivHex',
 'mediaType','name','plaintextBytes','plaintextSha256','tagHex'];

function plainObject(value){
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.getPrototypeOf(value)===Object.prototype;
}
async function absent(path){
 try{await lstat(path);throw failure('target_exists');}
 catch(error){if(error?.code!=='ENOENT')throw error;}
}
async function regular(path,max=1024*1024*1024){
 const st=await lstat(path);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size<1||st.size>max)
  throw failure('unsafe_file');
 return st;
}
async function keyBytes(path){
 if(typeof path!=='string'||!isAbsolute(path))throw failure('invalid_key_path');
 const st=await regular(path,128);
 // POSIX mode bits are not an ACL oracle on Windows. Linux/macOS captures
 // fail closed here; Windows operators must supply an independently audited
 // NTFS ACL receipt in the operational authorization dossier.
 if(process.platform!=='win32'&&(st.mode&0o077)!==0)throw failure('key_permissions');
 const value=(await readFile(path,'utf8')).trim();
 if(!/^[0-9a-f]{64}$/i.test(value))throw failure('invalid_key');
 return Buffer.from(value,'hex');
}
function metadata(value){
 if(!plainObject(value))throw failure('invalid_metadata');
 if(value.schema===PREINSTALL_SCHEMA){
  if(Object.keys(value).sort().join('|')!==PREINSTALL_KEYS.join('|')||
   !Array.isArray(value.includedSchemas)||value.includedSchemas.length!==0||
   value.initialState!=='no-sabora-objects'||!HASH.test(value.plannedMigrationTreeSha256??''))
   throw failure('invalid_preinstall_metadata');
  const {plannedMigrationTreeSha256,initialState,...shared}=value;
  metadata({...shared,schema:'sabora-logical-backup/v2',
   migrationTreeSha256:plannedMigrationTreeSha256,includedSchemas:['sabora','sabora_migration_meta']});
  return Object.freeze({...value,includedSchemas:[],excludedManagedSchemas:[...value.excludedManagedSchemas]});
 }
 const v2=value.schema==='sabora-logical-backup/v2';
 if(Object.keys(value).sort().join('|')!==(v2?V2_META_KEYS:META_KEYS).join('|')||
  !['sabora-logical-backup/v1','sabora-logical-backup/v2'].includes(value.schema)||
  (v2&&(!/^[0-9]{10,20}$/.test(value.sourceSystemIdentifier??'')||
   value.sourceDatabase!=='postgres'||
   !/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9A-Fa-f]+$/.test(value.snapshotId??'')))||
  !/^SABORA-BACKUP-[A-Z0-9-]{8,80}$/.test(value.backupId)||
  value.repository!=='jdlc86/CartaViva'||!SHA.test(value.releaseSha)||
  value.sourceProjectRef!=='byhvmumqivmunkmomhup'||value.postgresMajor!==17||
  typeof value.postgresVersion!=='string'||!/^17\./.test(value.postgresVersion)||
  !HASH.test(value.migrationTreeSha256)||
  !Array.isArray(value.includedSchemas)||value.includedSchemas.join('|')!=='sabora|sabora_migration_meta'||
  !Array.isArray(value.excludedManagedSchemas)||
  value.excludedManagedSchemas.join('|')!=='auth|extensions|realtime|storage|supabase_functions|vault'||
  !Number.isFinite(Date.parse(value.createdAt))||
  value.custody!=='key-outside-artifact-git-actions-vps')throw failure('invalid_metadata');
 return Object.freeze({...value,includedSchemas:[...value.includedSchemas],
  excludedManagedSchemas:[...value.excludedManagedSchemas]});
}
function aad(meta,name,mediaType){
 if(meta.schema===PREINSTALL_SCHEMA)
  return Buffer.from(JSON.stringify({metadata:Object.fromEntries(PREINSTALL_KEYS.map(k=>[k,meta[k]])),name,mediaType}));
 return Buffer.from(JSON.stringify({schema:meta.schema,backupId:meta.backupId,
  repository:meta.repository,releaseSha:meta.releaseSha,
  sourceProjectRef:meta.sourceProjectRef,postgresMajor:meta.postgresMajor,
  postgresVersion:meta.postgresVersion,migrationTreeSha256:meta.migrationTreeSha256,
  includedSchemas:meta.includedSchemas,excludedManagedSchemas:meta.excludedManagedSchemas,
  createdAt:meta.createdAt,custody:meta.custody,
  ...(meta.schema==='sabora-logical-backup/v2'?{
   sourceSystemIdentifier:meta.sourceSystemIdentifier,sourceDatabase:meta.sourceDatabase,
   snapshotId:meta.snapshotId}:{}),name,mediaType}));
}
function meter(){
 const hash=createHash('sha256');let bytes=0;
 const stream=new Transform({transform(chunk,_encoding,callback){
  bytes+=chunk.length;hash.update(chunk);callback(null,chunk);
 }});
 return {stream,result:()=>({bytes,sha256:hash.digest('hex')})};
}
async function fileDigest(path){
 const hash=createHash('sha256');let bytes=0;
 for await(const chunk of createReadStream(path)){bytes+=chunk.length;hash.update(chunk);}
 return {bytes,sha256:hash.digest('hex')};
}
function componentSpec(value){
 if(!plainObject(value)||!NAME.test(value.name)||typeof value.mediaType!=='string'||
  value.mediaType.length<3||value.mediaType.length>100||
  typeof value.command!=='string'||value.command.length<1||
  !Array.isArray(value.args)||value.args.some(x=>typeof x!=='string')||
  value.args.some(x=>/password|secret|token/i.test(x))||
  (value.stdinPath!==undefined&&
   (typeof value.stdinPath!=='string'||!isAbsolute(value.stdinPath)))||
  (value.stdinSha256!==undefined&&
   (value.stdinPath===undefined||typeof value.stdinSha256!=='string'||!HASH.test(value.stdinSha256))))
  throw failure('invalid_component');
 return value;
}
function stderrCollector(stream){
 let value='';
 stream.setEncoding('utf8');
 stream.on('data',chunk=>{if(value.length<8192)value+=chunk.slice(0,8192-value.length);});
 return ()=>value.replace(/[^A-Za-z0-9_:. -]/g,'_').slice(0,512);
}
async function encryptCommand({directory,key,meta,spec,snapshotId=null}){
 componentSpec(spec);
 const filename=spec.name+'.aesgcm',target=join(directory,filename);
 await absent(target);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(aad(meta,spec.name,spec.mediaType));
 const sourceMeter=meter();
 let stdinHandle,stdinBytes;
 if(spec.stdinPath!==undefined){
  stdinHandle=await open(spec.stdinPath,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW??0));
  const st=await stdinHandle.stat();
  if(!st.isFile()||st.nlink!==1||st.size<1||st.size>1024*1024){
   await stdinHandle.close();throw failure('unsafe_stdin_file');
  }
  stdinBytes=await stdinHandle.readFile();await stdinHandle.close();stdinHandle=undefined;
  if(spec.stdinSha256!==undefined&&
   createHash('sha256').update(stdinBytes).digest('hex')!==spec.stdinSha256)
   throw failure('stdin_changed_after_validation');
 }
 // The roles SQL reads pg_namespace/pg_class in addition to shared catalogs:
 // its database-scoped ACLs must use the same MVCC snapshot as pg_dump and
 // the inventory. Global role membership itself is verified by pre/post hash.
 if(snapshotId&&(spec.name.startsWith('inventory')||
    spec.name.startsWith('roles-memberships'))){
  const original=stdinBytes;
  stdinBytes=Buffer.concat([Buffer.from(
   "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;\n"+
   "SET TRANSACTION SNAPSHOT '"+snapshotId+"';\n"),
   original,Buffer.from("\nCOMMIT;\n")]);
  original.fill(0);
 }
 const childEnv=safePostgresChildEnv();
 const commandArgs=snapshotId&&['schema','data'].includes(spec.name)?
  [...spec.args,'--snapshot='+snapshotId]:spec.args;
 const child=spawn(spec.command,commandArgs,{env:childEnv,
  windowsHide:true,stdio:[spec.stdinPath===undefined?'ignore':'pipe','pipe','pipe']});
 const stderr=stderrCollector(child.stderr);
 let created=false;
 try{
  created=true;
  const input=spec.stdinPath===undefined?Promise.resolve():
   pipeline(Readable.from([stdinBytes]),child.stdin);
  const stream=pipeline(child.stdout,sourceMeter.stream,cipher,
   createWriteStream(target,{flags:'wx',mode:0o600}));
  const exit=new Promise((accept,reject)=>{
   child.once('error',reject);
   child.once('close',(code,signal)=>code===0?accept():reject(
    failure('capture_command_failed:'+String(code??signal??'unknown')+':'+stderr())));
  });
  await Promise.all([input,stream,exit]);
  const source=sourceMeter.result();
  if(source.bytes<1)throw failure('empty_component');
  const encrypted=await fileDigest(target);
  return Object.freeze({name:spec.name,filename,mediaType:spec.mediaType,
   algorithm:'aes-256-gcm',ivHex:iv.toString('hex'),
   tagHex:cipher.getAuthTag().toString('hex'),
   plaintextSha256:source.sha256,plaintextBytes:source.bytes,
   ciphertextSha256:encrypted.sha256,ciphertextBytes:encrypted.bytes});
 }catch(error){
  child.kill('SIGKILL');
  if(created)await rm(target,{force:true});
  throw error?.message?.startsWith('sabora_backup_stop:')?error:failure('capture_failed');
 }finally{
  await stdinHandle?.close();
  stdinBytes?.fill(0);
 }
}

export async function captureEncryptedBackupBundle({directory,keyPath,metadata:raw,components,
 snapshot=null}={}){
 if(typeof directory!=='string'||!isAbsolute(directory)||!Array.isArray(components)||
  components.length!==4)throw failure('invalid_capture_request');
 await absent(directory);
 const names=components.map(x=>componentSpec(x).name);
 if(names.join('|')!=='roles-memberships|schema|data|inventory'||new Set(names).size!==4)
  throw failure('component_set');
 if(raw?.schema===PREINSTALL_SCHEMA)throw failure('preinstall_requires_separate_capture');
 if((raw?.schema==='sabora-logical-backup/v2')!==Boolean(snapshot))
  throw failure('snapshot_required_for_v2');
 const key=await keyBytes(keyPath);
 let session,created=false,finished=false;
 try{
  if(snapshot){
   if(!snapshot.exporter||!snapshot.expectedSystemIdentifier)throw failure('snapshot_config_missing');
   session=await openPostgresBackupSnapshot({
    command:snapshot.exporter.command,args:snapshot.exporter.args,
    expectedSystemIdentifier:snapshot.expectedSystemIdentifier,expectedDatabase:'postgres',
    expectedMigrationTreeSha256:raw.migrationTreeSha256});
  }
  const meta=metadata(snapshot?{...raw,snapshotId:session.snapshotId,
   sourceSystemIdentifier:session.systemIdentifier,sourceDatabase:session.database}:raw);
  await mkdir(directory,{recursive:false,mode:0o700});created=true;
  const snapshotId=session?.snapshotId??null;
  const captured=[];
  captured.push(await encryptCommand({directory,key,meta,spec:components[0],snapshotId}));
  captured.push(await encryptCommand({directory,key,meta,spec:components[1],snapshotId}));
  if(session){
   // Catalog, global roles and non-MVCC sequence values must not drift
   // during the single synchronized MVCC capture.
   const probe=await encryptCommand({directory,key,meta,
    spec:{...components[3],name:'inventory-preview'},snapshotId});
   await rm(join(directory,probe.filename));
   captured.push(await encryptCommand({directory,key,meta,spec:components[2],snapshotId}));
   captured.push(await encryptCommand({directory,key,meta,spec:components[3],snapshotId}));
   if(probe.plaintextSha256!==captured[3].plaintextSha256||
      probe.plaintextBytes!==captured[3].plaintextBytes)
    throw failure('source_changed_during_capture');
   const rolesProbe=await encryptCommand({directory,key,meta,
    spec:{...components[0],name:'roles-memberships-verify'},snapshotId});
   await rm(join(directory,rolesProbe.filename));
   if(rolesProbe.plaintextSha256!==captured[0].plaintextSha256||
      rolesProbe.plaintextBytes!==captured[0].plaintextBytes)
    throw failure('roles_changed_during_capture');
   await session.close();finished=true;
  }else{
   captured.push(await encryptCommand({directory,key,meta,spec:components[2]}));
   captured.push(await encryptCommand({directory,key,meta,spec:components[3]}));
  }
  const manifest={...meta,components:captured,
   artifactPolicy:'ciphertext-only-replicas; no keys or plaintext dumps'};
  const manifestPath=join(directory,'manifest.json');
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  const digest=await fileDigest(manifestPath);
  return Object.freeze({directory,manifest:Object.freeze(manifest),manifestSha256:digest.sha256});
 }catch(error){
  if(session&&!finished)session.abort();
  if(created)await rm(directory,{recursive:true,force:true});
  throw error;
 }finally{key.fill(0);}
}

// Separate initial state format; no pg_dump of absent schemas or fake ledger.
export async function capturePreinstallBackup({directory,keyPath,metadata:raw,exporter,expectedSystemIdentifier}={}){
 if(!isAbsolute(directory??'')||!isAbsolute(keyPath??'')||
  resolve(directory)===resolve(keyPath)||contained(directory,keyPath)||
  !plainObject(raw)||Object.keys(raw).sort().join('|')!==
   'backupId|plannedMigrationTreeSha256|releaseSha|repository|schema|sourceProjectRef'||
  raw.schema!==PREINSTALL_SCHEMA||!HASH.test(raw.plannedMigrationTreeSha256??'')||
  !exporter||typeof exporter.command!=='string'||!Array.isArray(exporter.args))
  throw failure('invalid_preinstall_capture_request');
 await absent(directory);
 const key=await keyBytes(keyPath);
 let session,created=false,finished=false;
 try{
  const input={...exporter,expectedSystemIdentifier};
  const before=await readPreinstallState(input);
  session=await openPostgresBackupSnapshot({...input,expectedDatabase:'postgres'});
  const observed=await readPreinstallState({...input,snapshotId:session.snapshotId});
  if(JSON.stringify(before)!==JSON.stringify(observed))throw failure('preinstall_source_changed');
  await session.close();finished=true;
  const after=await readPreinstallState(input);
  if(JSON.stringify(after)!==JSON.stringify(observed))throw failure('preinstall_source_changed');
  const meta=metadata({...raw,postgresMajor:17,postgresVersion:observed.postgresVersion,
   includedSchemas:[],excludedManagedSchemas:['auth','extensions','realtime','storage','supabase_functions','vault'],
   createdAt:new Date().toISOString(),custody:'key-outside-artifact-git-actions-vps',
   initialState:'no-sabora-objects',snapshotId:session.snapshotId,
   sourceDatabase:session.database,sourceSystemIdentifier:session.systemIdentifier});
  const payload=Buffer.from(JSON.stringify(observed)+'\n');
  const iv=randomBytes(12),name='initial-state',mediaType='application/json';
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(aad(meta,name,mediaType));
  let encrypted,plainHash;
  try{
   plainHash=createHash('sha256').update(payload).digest('hex');
   encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);
  }finally{payload.fill(0);}
  await mkdir(directory,{recursive:false,mode:0o700});created=true;
  const filename=name+'.aesgcm';
  await writeFile(join(directory,filename),encrypted,{flag:'wx',mode:0o600});
  const hashes=await fileDigest(join(directory,filename));
  const manifest={...meta,components:[{name,filename,mediaType,algorithm:'aes-256-gcm',
   ivHex:iv.toString('hex'),tagHex:cipher.getAuthTag().toString('hex'),
   plaintextBytes:encrypted.length,plaintextSha256:plainHash,
   ciphertextBytes:hashes.bytes,ciphertextSha256:hashes.sha256}],
   artifactPolicy:'ciphertext-only-replicas; no keys or plaintext dumps'};
  const path=join(directory,'manifest.json');
  await writeFile(path,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return Object.freeze({directory,manifest:Object.freeze(manifest),manifestSha256:(await fileDigest(path)).sha256});
 }catch(error){
  if(session&&!finished)session.abort();
  if(created)await rm(directory,{recursive:true,force:true});
  throw error;
 }finally{key.fill(0);}
}

function validatedManifest(value){
 if(!plainObject(value)||Object.keys(value).sort().join('|')!==
  [...manifestMetaKeys(value.schema),
   'artifactPolicy','components'].sort().join('|')||
  !Array.isArray(value.components)||value.components.length!==namesFor(value.schema).length||
  value.artifactPolicy!=='ciphertext-only-replicas; no keys or plaintext dumps')
  throw failure('invalid_manifest');
 const meta=metadata(Object.fromEntries(manifestMetaKeys(value.schema)
   .map(key=>[key,value[key]])));
 const names=[];
 for(const item of value.components){
  if(!plainObject(item)||Object.keys(item).sort().join('|')!==COMPONENT_KEYS.join('|')||
   !NAME.test(item.name)||!FILE.test(item.filename)||
   item.filename!==item.name+'.aesgcm'||typeof item.mediaType!=='string'||
   item.algorithm!=='aes-256-gcm'||!/^[0-9a-f]{24}$/.test(item.ivHex)||
   !/^[0-9a-f]{32}$/.test(item.tagHex)||!HASH.test(item.plaintextSha256)||
   !HASH.test(item.ciphertextSha256)||!Number.isSafeInteger(item.plaintextBytes)||
   item.plaintextBytes<1||!Number.isSafeInteger(item.ciphertextBytes)||item.ciphertextBytes<1)
   throw failure('invalid_component_manifest');
  names.push(item.name);
 }
 if(names.join('|')!==namesFor(value.schema).join('|')||new Set(names).size!==names.length||
    (value.schema===PREINSTALL_SCHEMA&&(value.components[0].mediaType!=='application/json'||value.components[0].plaintextBytes>8192||value.components[0].ciphertextBytes>8192)))
  throw failure('manifest_component_set');
 return {meta,components:value.components};
}
// Shared manifest validation for directory backups and bounded wire headers.
// No file writes, no claim of ciphertext integrity or AES authentication.
export function parseEncryptedBackupManifest(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>262144)throw failure('manifest_size');
 let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{throw failure('manifest_parse');}
 return {value,manifestSha256:createHash('sha256').update(bytes).digest('hex'),...validatedManifest(value)};
}
async function loadManifest(directory){
 const path=join(directory,'manifest.json');
 await regular(path,262144);
 const bytes=await readFile(path);
 const parsed=parseEncryptedBackupManifest(bytes);
 if(parsed.meta.schema===PREINSTALL_SCHEMA){
  const entries=(await readdir(directory)).sort();
  if(entries.join('|')!=='initial-state.aesgcm|manifest.json')throw failure('preinstall_unexpected_files');
 }
 return {path,...parsed};
}
function contained(root,path){
 const rel=relative(resolve(root),resolve(path));
 return rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel);
}

export async function replicateEncryptedBackupBundle({sourceDirectory,destinationDirectory,
 destinationClass}={}){
 if(!['offsite','vps-encrypted-cache'].includes(destinationClass)||
  !isAbsolute(sourceDirectory??'')||!isAbsolute(destinationDirectory??'')||
  resolve(sourceDirectory)===resolve(destinationDirectory))throw failure('invalid_replica_request');
 await absent(destinationDirectory);
 const source=await loadManifest(sourceDirectory);
 await mkdir(destinationDirectory,{recursive:false,mode:0o700});
 try{
  const files=['manifest.json',...source.components.map(x=>x.filename)];
  for(const name of files){
   if(basename(name)!==name)throw failure('invalid_replica_file');
   const from=join(sourceDirectory,name),to=join(destinationDirectory,name);
   await regular(from,name==='manifest.json'?262144:1024*1024*1024);
   await copyFile(from,to);
   const before=await fileDigest(from),after=await fileDigest(to);
   if(before.sha256!==after.sha256||before.bytes!==after.bytes)throw failure('replica_mismatch');
   const expected=source.components.find(x=>x.filename===name);
   if(name==='manifest.json'&&before.sha256!==source.manifestSha256)throw failure('manifest_changed');
   if(expected&&(before.sha256!==expected.ciphertextSha256||before.bytes!==expected.ciphertextBytes))
    throw failure('ciphertext_mismatch');
  }
  return Object.freeze({schema:'sabora-backup-replica-receipt/v1',
   backupId:source.meta.backupId,destinationClass,
   manifestSha256:(await fileDigest(join(destinationDirectory,'manifest.json'))).sha256,
   verifiedCiphertextFiles:source.components.length,containsKey:false,containsPlaintext:false,
   ...(source.meta.schema===PREINSTALL_SCHEMA?{backupSchema:PREINSTALL_SCHEMA,restoreValidated:false}:{})});
 }catch(error){await rm(destinationDirectory,{recursive:true,force:true});throw error;}
}

export async function decryptBackupComponent({bundleDirectory,name,keyPath,outputPath}={}){
 if(!isAbsolute(bundleDirectory??'')||!isAbsolute(outputPath??'')||!NAME.test(name??'')||
  resolve(outputPath)===resolve(bundleDirectory)||contained(bundleDirectory,outputPath))
  throw failure('invalid_restore_request');
 const partial=outputPath+'.partial';
 await absent(outputPath);await absent(partial);
 const bundle=await loadManifest(bundleDirectory),item=bundle.components.find(x=>x.name===name);
 if(!item)throw failure('component_missing');
 const encrypted=join(bundleDirectory,item.filename);
 await regular(encrypted);
 const encryptedDigest=await fileDigest(encrypted);
 if(encryptedDigest.sha256!==item.ciphertextSha256||encryptedDigest.bytes!==item.ciphertextBytes)
  throw failure('ciphertext_mismatch');
 const key=await keyBytes(keyPath),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(item.ivHex,'hex'));
 decipher.setAAD(aad(bundle.meta,item.name,item.mediaType));
 decipher.setAuthTag(Buffer.from(item.tagHex,'hex'));
 const outputMeter=meter();let created=false;
 try{
  created=true;
  await pipeline(createReadStream(encrypted),decipher,outputMeter.stream,
   createWriteStream(partial,{flags:'wx',mode:0o600}));
  const clear=outputMeter.result();
  if(clear.sha256!==item.plaintextSha256||clear.bytes!==item.plaintextBytes)
   throw failure('plaintext_mismatch');
  await rename(partial,outputPath);
  return Object.freeze({name,sha256:clear.sha256,bytes:clear.bytes});
 }catch(error){
  if(created)await rm(partial,{force:true});
  throw error?.message?.startsWith('sabora_backup_stop:')?error:failure('authentication_failed');
 }
}

// Authenticated read of the initial-state receipt in memory. No SQL writes;
// a separate isolated recovery rehearsal is mandatory before installation.
export async function verifyPreinstallBackup({bundleDirectory,keyPath,expectedReleaseSha,expectedMigrationTreeSha256,
 expectedSystemIdentifier,expectedBackupId}={}){
 if(!isAbsolute(bundleDirectory??'')||!SHA.test(expectedReleaseSha??'')||
  !HASH.test(expectedMigrationTreeSha256??'')||! /^[0-9]{10,20}$/.test(expectedSystemIdentifier??'')||
  !/^SABORA-BACKUP-[A-Z0-9-]{8,80}$/.test(expectedBackupId??''))throw failure('invalid_preinstall_verify_request');
 const b=await loadManifest(bundleDirectory);
 if(b.meta.schema!==PREINSTALL_SCHEMA||b.meta.releaseSha!==expectedReleaseSha||
  b.meta.plannedMigrationTreeSha256!==expectedMigrationTreeSha256||b.meta.sourceSystemIdentifier!==expectedSystemIdentifier||
  b.meta.backupId!==expectedBackupId)throw failure('preinstall_scope_mismatch');
 const item=b.components[0],path=join(bundleDirectory,item.filename);
 await regular(path,8192);
 const encrypted=await readFile(path);
 if(encrypted.length!==item.ciphertextBytes||createHash('sha256').update(encrypted).digest('hex')!==item.ciphertextSha256)
  throw failure('ciphertext_mismatch');
 const key=await keyBytes(keyPath);
 let clear,decoded;
 try{
  const d=createDecipheriv('aes-256-gcm',key,Buffer.from(item.ivHex,'hex'));
  d.setAAD(aad(b.meta,item.name,item.mediaType));d.setAuthTag(Buffer.from(item.tagHex,'hex'));
  try{clear=Buffer.concat([d.update(encrypted),d.final()]);}catch{throw failure('authentication_failed');}
  if(clear.length!==item.plaintextBytes||createHash('sha256').update(clear).digest('hex')!==item.plaintextSha256)
   throw failure('plaintext_mismatch');
  try{decoded=JSON.parse(clear.toString('utf8'));}catch{throw failure('invalid_preinstall_payload');}
  const observed=validatePreinstallState(decoded,b.meta.sourceSystemIdentifier);
  if(observed.postgresVersion!==b.meta.postgresVersion)throw failure('preinstall_metadata_mismatch');
  return Object.freeze({schema:PREINSTALL_SCHEMA,backupId:b.meta.backupId,releaseSha:b.meta.releaseSha,
   manifestSha256:b.manifestSha256,plannedMigrationTreeSha256:b.meta.plannedMigrationTreeSha256,
   initialStateVerified:true,containsKey:false,containsPlaintext:false,restoreValidated:false});
 }finally{key.fill(0);clear?.fill(0);}
}

export async function inspectEncryptedBackupBundle(directory){
 if(!isAbsolute(directory??''))throw failure('invalid_bundle_path');
 const bundle=await loadManifest(directory);
 for(const item of bundle.components){
  const actual=await fileDigest(join(directory,item.filename));
  if(actual.sha256!==item.ciphertextSha256||actual.bytes!==item.ciphertextBytes)
   throw failure('ciphertext_mismatch');
 }
 return Object.freeze({backupId:bundle.meta.backupId,releaseSha:bundle.meta.releaseSha,
  components:bundle.components.length,containsKey:false,containsPlaintext:false,
  manifestSha256:bundle.manifestSha256,
  ...(bundle.meta.schema===PREINSTALL_SCHEMA?{backupSchema:PREINSTALL_SCHEMA,restoreValidated:false}:{})});
}
