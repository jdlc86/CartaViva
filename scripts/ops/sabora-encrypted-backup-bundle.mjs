// Sabora-only logical backup bundle. Capture inputs are encrypted while they
// are streamed from PostgreSQL: no plaintext dump is written by this module.
// The key is intentionally external to every bundle and replica.
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {constants as fsConstants,createReadStream,createWriteStream} from 'node:fs';
import {copyFile,lstat,mkdir,open,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {basename,isAbsolute,join,relative,resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {spawn} from 'node:child_process';

const failure=code=>Error('sabora_backup_stop:'+code);
const SHA=/^[0-9a-f]{40}$/;
const HASH=/^[0-9a-f]{64}$/;
const NAME=/^[a-z][a-z0-9-]{1,63}$/;
const FILE=/^[a-z][a-z0-9-]{1,63}\.aesgcm$/;
const META_KEYS=['backupId','createdAt','custody','excludedManagedSchemas','includedSchemas',
 'migrationTreeSha256','postgresMajor','postgresVersion','releaseSha','repository','schema',
 'sourceProjectRef'];
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
 if(!plainObject(value)||Object.keys(value).sort().join('|')!==META_KEYS.join('|')||
  value.schema!=='sabora-logical-backup/v1'||
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
 return Buffer.from(JSON.stringify({schema:meta.schema,backupId:meta.backupId,
  repository:meta.repository,releaseSha:meta.releaseSha,
  sourceProjectRef:meta.sourceProjectRef,postgresMajor:meta.postgresMajor,
  postgresVersion:meta.postgresVersion,migrationTreeSha256:meta.migrationTreeSha256,
  includedSchemas:meta.includedSchemas,excludedManagedSchemas:meta.excludedManagedSchemas,
  createdAt:meta.createdAt,custody:meta.custody,name,mediaType}));
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
async function encryptCommand({directory,key,meta,spec}){
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
 const childEnv={...process.env};
 delete childEnv.SABORA_BACKUP_KEY_FILE;delete childEnv.SABORA_BACKUP_COMPONENT;
 const child=spawn(spec.command,spec.args,{env:childEnv,
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

export async function captureEncryptedBackupBundle({directory,keyPath,metadata:raw,components}={}){
 if(typeof directory!=='string'||!isAbsolute(directory)||!Array.isArray(components)||
  components.length!==4)throw failure('invalid_capture_request');
 await absent(directory);
 const meta=metadata(raw),key=await keyBytes(keyPath);
 const names=components.map(x=>componentSpec(x).name);
 if(names.join('|')!=='roles-memberships|schema|data|inventory'||new Set(names).size!==4)
  throw failure('component_set');
 await mkdir(directory,{recursive:false,mode:0o700});
 try{
  const captured=[];
  for(const spec of components)captured.push(await encryptCommand({directory,key,meta,spec}));
  const manifest={...meta,components:captured,
   artifactPolicy:'ciphertext-only-replicas; no keys or plaintext dumps'};
  const path=join(directory,'manifest.json');
  await writeFile(path,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  const digest=await fileDigest(path);
  return Object.freeze({directory,manifest:Object.freeze(manifest),manifestSha256:digest.sha256});
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}

function validatedManifest(value){
 if(!plainObject(value)||Object.keys(value).sort().join('|')!==
  [...META_KEYS,'artifactPolicy','components'].sort().join('|')||
  !Array.isArray(value.components)||value.components.length!==4||
  value.artifactPolicy!=='ciphertext-only-replicas; no keys or plaintext dumps')
  throw failure('invalid_manifest');
 const meta=metadata(Object.fromEntries(META_KEYS.map(key=>[key,value[key]])));
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
 if(names.join('|')!=='roles-memberships|schema|data|inventory'||new Set(names).size!==4)
  throw failure('manifest_component_set');
 return {meta,components:value.components};
}
async function loadManifest(directory){
 const path=join(directory,'manifest.json');
 await regular(path,262144);
 let value;try{value=JSON.parse(await readFile(path,'utf8'));}
 catch{throw failure('manifest_parse');}
 return {path,value,...validatedManifest(value)};
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
  }
  return Object.freeze({schema:'sabora-backup-replica-receipt/v1',
   backupId:source.meta.backupId,destinationClass,
   manifestSha256:(await fileDigest(join(destinationDirectory,'manifest.json'))).sha256,
   verifiedCiphertextFiles:source.components.length,containsKey:false,containsPlaintext:false});
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
  manifestSha256:(await fileDigest(bundle.path)).sha256});
}
