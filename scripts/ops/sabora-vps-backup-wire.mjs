// Candidate ciphertext-only streaming protocol. No network listener, shell,
// production config, private key, or installation side effect in this module.
import {constants} from 'node:fs';
import {open,lstat,realpath,readdir,mkdir} from 'node:fs/promises';
import {join,dirname,isAbsolute,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {parseEncryptedBackupManifest,PREINSTALL_SCHEMA} from './sabora-encrypted-backup-bundle.mjs';

const MAGIC=Buffer.from('SABORA-BACKUP-WIRE/1\n');
const MAX_HEADER=262144,MAX_COMPONENT=1024**3,CHUNK=65536;
const stop=code=>{throw Error('sabora_backup_wire_stop:'+code);};
const same=(a,b)=>a.slice().sort().join('|')===b.slice().sort().join('|');
function frameSize(n){const length=Buffer.alloc(8);length.writeBigUInt64BE(BigInt(n));return length;}
function manifestHeader(bytes){
 const parsed=parseEncryptedBackupManifest(bytes);
 if(![PREINSTALL_SCHEMA,'sabora-logical-backup/v2'].includes(parsed.meta.schema)||
  parsed.components.some(item=>item.ciphertextBytes>MAX_COMPONENT))
  stop('unsupported_manifest_or_component_size');
 return parsed;
}
function proofShape(proofBytes){
 if(!Buffer.isBuffer(proofBytes)||proofBytes.length<1||proofBytes.length>MAX_HEADER)
  stop('invalid_proof_size');
}
async function sourceFile(path,max){
 const before=await lstat(path);
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||
  before.size<1||before.size>max||(before.mode&0o077)!==0||before.uid!==process.getuid())
  stop('unsafe_source_file');
 const fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{
  const st=await fd.stat();
  if(!st.isFile()||st.nlink!==1||st.dev!==before.dev||st.ino!==before.ino||
   st.size!==before.size||st.ctimeMs!==before.ctimeMs)
   stop('source_file_changed');
  return {fd,st};
 }catch(error){await fd.close();throw error;}
}
async function assertUnchanged(fd,st,bytes){
 const after=await fd.stat();
 if(bytes!==st.size||after.size!==st.size||after.ctimeMs!==st.ctimeMs||after.mtimeMs!==st.mtimeMs||
  after.nlink!==1)stop('source_file_changed');
}
// An async generator enables backpressure from the real pipe/SSH stdin.
// It never loads a data component into memory or emits an arbitrary filename.
export async function* encodeVpsBackupStream({sourceDirectory,proofBytes}={}){
 if(process.platform!=='linux')stop('linux_required');
 proofShape(proofBytes);
 if(!isAbsolute(sourceDirectory??'')||resolve(sourceDirectory)!==sourceDirectory||
  await realpath(sourceDirectory)!==sourceDirectory)stop('unsafe_source_directory');
 const dir=await lstat(sourceDirectory);
 if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0||dir.uid!==process.getuid())
  stop('unsafe_source_directory');
 const {fd:mf,st:ms}=await sourceFile(join(sourceDirectory,'manifest.json'),MAX_HEADER);
 let manifestBytes;
 try{manifestBytes=await mf.readFile();await assertUnchanged(mf,ms,manifestBytes.length);}
 finally{await mf.close();}
 const parsed=manifestHeader(manifestBytes);
 if(!same(await readdir(sourceDirectory),['manifest.json',...parsed.components.map(c=>c.filename)]))
  stop('source_inventory');
 yield MAGIC;yield frameSize(manifestBytes.length);yield manifestBytes;
 yield frameSize(proofBytes.length);yield proofBytes;
 for(const item of parsed.components){
  const {fd,st}=await sourceFile(join(sourceDirectory,item.filename),MAX_COMPONENT);
  try{
   if(st.size!==item.ciphertextBytes)stop('source_size_mismatch');
   yield frameSize(st.size);
   const hash=createHash('sha256');let total=0;
   for await(const chunk of fd.createReadStream({autoClose:false,highWaterMark:CHUNK})){
    total+=chunk.length;if(total>item.ciphertextBytes)stop('source_size_mismatch');
    hash.update(chunk);yield chunk;
   }
   await assertUnchanged(fd,st,total);
   if(hash.digest('hex')!==item.ciphertextSha256)stop('source_digest_mismatch');
  }finally{await fd.close();}
 }
}
export class BackupWireReader{
 constructor(source){
  if(!(source instanceof Readable)||source.destroyed)stop('readable_required');
  this.source=source;this.iterator=source[Symbol.asyncIterator]();
  this.pending=Buffer.alloc(0);this.ended=false;
  // Candidate transport policy: bounded header, idle interval, and total
  // transfer. A signed earlier expiry further shortens the deadline.
  this.started=performance.now();this.limitMs=3600000;this.expiry=Infinity;
 }
 setExpiry(expiry){
  if(!Number.isFinite(expiry)||expiry<=Date.now())stop('expired_proof');
  this.expiry=expiry;
 }
 remaining(){
  const remaining=Math.min(this.limitMs-(performance.now()-this.started),this.expiry-Date.now());
  if(remaining<=0)stop('transfer_expired');
  return remaining;
 }
 async refill(){
  while(!this.pending.length&&!this.ended){
   const remaining=this.remaining();
   let timer;
   try{
    const next=await Promise.race([this.iterator.next(),new Promise((_,reject)=>{
     timer=setTimeout(()=>reject(Error('sabora_backup_wire_stop:transfer_timeout')),Math.min(30000,remaining));
    })]);
    if(next.done){this.ended=true;break;}
    if(!Buffer.isBuffer(next.value))stop('nonbinary_input');
    this.pending=next.value;
   }finally{clearTimeout(timer);}
  }
 }
 async piece(max){
  this.remaining();await this.refill();
  if(this.ended)stop('truncated_frame');
  const n=Math.min(max,CHUNK,this.pending.length),part=this.pending.subarray(0,n);
  this.pending=this.pending.subarray(n);return part;
 }
 async exact(n){
  if(!Number.isSafeInteger(n)||n<1||n>MAX_HEADER)stop('invalid_header_length');
  const parts=[];let left=n;
  while(left){const part=await this.piece(left);parts.push(part);left-=part.length;}
  return Buffer.concat(parts,n);
 }
 async length(max){
  const len=(await this.exact(8)).readBigUInt64BE();
  if(len<1n||len>BigInt(max))stop('invalid_frame_length');
  return Number(len);
 }
 async header(){
  if(!(await this.exact(MAGIC.length)).equals(MAGIC))stop('protocol_mismatch');
  const manifestBytes=await this.exact(await this.length(MAX_HEADER));
  const parsed=manifestHeader(manifestBytes);
  const proofBytes=await this.exact(await this.length(MAX_HEADER));
  proofShape(proofBytes);return {manifestBytes,parsed,proofBytes};
 }
 async eof(){
  this.remaining();await this.refill();
  if(this.pending.length||!this.ended)stop('trailing_bytes');
 }
 close(){if(!this.ended&&!this.source.destroyed)this.source.destroy();}
}
async function writeAll(fd,bytes){
 let offset=0;
 while(offset<bytes.length){
  const {bytesWritten}=await fd.write(bytes,offset,bytes.length-offset,null);
  if(bytesWritten<1)stop('short_write');offset+=bytesWritten;
 }
}
async function syncDirectory(path){
 const fd=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{await fd.sync();}finally{await fd.close();}
}
async function writeNew(path,bytes){
 const fd=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await writeAll(fd,bytes);await fd.sync();}finally{await fd.close();}
}
// Called exclusively by the rotation transaction AFTER lock, scope, proof,
// predecessor and capacity checks. The slot name and file names are fixed.
export async function receiveBackupCandidate(reader,path,header){
 await mkdir(path,{recursive:false,mode:0o700});await syncDirectory(dirname(path));
 await writeNew(join(path,'manifest.json'),header.manifestBytes);
 for(const item of header.parsed.components){
  if(await reader.length(MAX_COMPONENT)!==item.ciphertextBytes)stop('component_length_mismatch');
  const fd=await open(join(path,item.filename),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{
   let left=item.ciphertextBytes;const hash=createHash('sha256');
   while(left){const part=await reader.piece(left);await writeAll(fd,part);hash.update(part);left-=part.length;}
   if(hash.digest('hex')!==item.ciphertextSha256)stop('component_digest_mismatch');
   await fd.sync();
  }finally{await fd.close();}
 }
 await reader.eof();await syncDirectory(path);
}
