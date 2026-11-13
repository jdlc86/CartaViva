import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {lstat,mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,relative,resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildMigrationAudit} from './migration-audit.mjs';

const failure=()=>Error('encrypted_backup_artifact_failed');
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&
 keys.every(key=>Object.hasOwn(value,key));

async function boundedFile(path,maxBytes=1024*1024*1024){
 const info=await lstat(path);
 if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>maxBytes)throw failure();
 return info;
}

async function digest(path){
 const hash=createHash('sha256');let bytes=0;
 for await(const chunk of createReadStream(path)){bytes+=chunk.length;hash.update(chunk);}
 return {sha256:hash.digest('hex'),bytes};
}

async function mustNotExist(path){
 try{await lstat(path);throw failure();}catch(error){if(error?.code!=='ENOENT')throw error;}
}

async function readKey(path){
 await boundedFile(path,128);
 const raw=(await readFile(path,'utf8')).trim();
 if(!/^[a-f0-9]{64}$/i.test(raw))throw failure();
 return Buffer.from(raw,'hex');
}

function aad(manifest){
 return Buffer.from(JSON.stringify({schema:manifest.schema,algorithm:manifest.algorithm,
  databaseScope:manifest.databaseScope,postgresMajor:manifest.postgresMajor,
  migrationManifestSha256:manifest.migrationManifestSha256,
  sourceSha256:manifest.sourceSha256,sourceBytes:manifest.sourceBytes}), 'utf8');
}

export async function encryptBackupArtifact({source,encrypted,manifestPath,keyPath,rootPath}={}){
 let createdEncrypted=false,createdManifest=false;
 try{
  for(const path of [source,encrypted,manifestPath,keyPath])if(typeof path!=='string'||!isAbsolute(path))throw failure();
  if(new Set([source,encrypted,manifestPath,keyPath]).size!==4)throw failure();
  await mustNotExist(encrypted);await mustNotExist(manifestPath);
  await boundedFile(source);const key=await readKey(keyPath);
  const sourceDigest=await digest(source);
  const audit=buildMigrationAudit(resolve(rootPath));
  const manifest={schema:1,algorithm:'aes-256-gcm',databaseScope:'sabora_only',postgresMajor:17,
   migrationManifestSha256:audit.manifestSha256,sourceSha256:sourceDigest.sha256,
   sourceBytes:sourceDigest.bytes,ivHex:randomBytes(12).toString('hex'),tagHex:null,
   encryptedSha256:null,encryptedBytes:null,
   custody:'encrypted_artifact_and_key_must_use_separate_authorized_custodians'};
  const cipher=createCipheriv('aes-256-gcm',key,Buffer.from(manifest.ivHex,'hex'));
  cipher.setAAD(aad(manifest));
  await mkdir(dirname(encrypted),{recursive:true});
  await pipeline(createReadStream(source),cipher,createWriteStream(encrypted,{flags:'wx',mode:0o600}));
  createdEncrypted=true;
  manifest.tagHex=cipher.getAuthTag().toString('hex');
  const encryptedDigest=await digest(encrypted);
  manifest.encryptedSha256=encryptedDigest.sha256;manifest.encryptedBytes=encryptedDigest.bytes;
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  createdManifest=true;
  return Object.freeze({...manifest});
 }catch(error){
  await Promise.allSettled([
   ...(createdEncrypted?[encrypted]:[]),...(createdManifest?[manifestPath]:[]),
  ].map(path=>rm(path,{force:true})));
  throw failure();
 }
}

function validateManifest(value){
 const keys=['schema','algorithm','databaseScope','postgresMajor','migrationManifestSha256',
  'sourceSha256','sourceBytes','ivHex','tagHex','encryptedSha256','encryptedBytes','custody'];
 if(!exact(value,keys)||value.schema!==1||value.algorithm!=='aes-256-gcm'||
    value.databaseScope!=='sabora_only'||value.postgresMajor!==17||
    !/^[a-f0-9]{64}$/.test(value.migrationManifestSha256)||
    !/^[a-f0-9]{64}$/.test(value.sourceSha256)||
    !Number.isSafeInteger(value.sourceBytes)||value.sourceBytes<1||
    !/^[a-f0-9]{24}$/.test(value.ivHex)||!/^[a-f0-9]{32}$/.test(value.tagHex)||
    !/^[a-f0-9]{64}$/.test(value.encryptedSha256)||
    !Number.isSafeInteger(value.encryptedBytes)||value.encryptedBytes<1||
    value.custody!=='encrypted_artifact_and_key_must_use_separate_authorized_custodians')throw failure();
 return value;
}

export async function decryptBackupArtifact({encrypted,manifestPath,output,keyPath}={}){
 const temporary=output+'.partial';
 try{
  for(const path of [encrypted,manifestPath,output,keyPath])if(typeof path!=='string'||!isAbsolute(path))throw failure();
  if(new Set([encrypted,manifestPath,output,keyPath,temporary]).size!==5)throw failure();
  await mustNotExist(output);await mustNotExist(temporary);
  await boundedFile(encrypted);await boundedFile(manifestPath,65536);
  const manifest=validateManifest(JSON.parse(await readFile(manifestPath,'utf8')));
  const encryptedDigest=await digest(encrypted);
  if(encryptedDigest.sha256!==manifest.encryptedSha256||encryptedDigest.bytes!==manifest.encryptedBytes)throw failure();
  const key=await readKey(keyPath);
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(manifest.ivHex,'hex'));
  decipher.setAAD(aad(manifest));decipher.setAuthTag(Buffer.from(manifest.tagHex,'hex'));
  await pipeline(createReadStream(encrypted),decipher,createWriteStream(temporary,{flags:'wx',mode:0o600}));
  const restored=await digest(temporary);
  if(restored.sha256!==manifest.sourceSha256||restored.bytes!==manifest.sourceBytes)throw failure();
  await rename(temporary,output);return Object.freeze({sha256:restored.sha256,bytes:restored.bytes});
 }catch{
  await Promise.allSettled([temporary].filter(Boolean).map(path=>rm(path,{force:true})));
  throw failure();
 }
}

function underRunnerTemp(path,runnerTemp){
 if(!isAbsolute(path)||!isAbsolute(runnerTemp))return false;
 const child=relative(resolve(runnerTemp),resolve(path));
 return child!==''&&!child.startsWith('..')&&!isAbsolute(child);
}

const main=process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url;
if(main){
 try{
  const [operation,input,second,third]=process.argv.slice(2);
  const keyPath=process.env.SABORA_BACKUP_KEY_FILE,runnerTemp=process.env.RUNNER_TEMP;
  if(typeof runnerTemp!=='string'||typeof keyPath!=='string'||
     ![input,second,third,keyPath].every(path=>underRunnerTemp(path,runnerTemp)))throw failure();
  if(operation==='encrypt')await encryptBackupArtifact({source:input,encrypted:second,
   manifestPath:third,keyPath,rootPath:resolve(dirname(fileURLToPath(import.meta.url)),'..','..')});
  else if(operation==='decrypt')await decryptBackupArtifact({encrypted:input,manifestPath:second,
   output:third,keyPath});
  else throw failure();
  process.stdout.write(`encrypted_backup_artifact_${operation}_ok\n`);
 }catch{process.stderr.write('encrypted_backup_artifact_failed\n');process.exitCode=1;}
}
