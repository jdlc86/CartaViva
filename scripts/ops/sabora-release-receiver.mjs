// Verify and stage an immutable Sabora release, but NEVER actuate Docker.
// Only a separately reviewed, authorized Sabora-only host controller can act.
import {createHash} from 'node:crypto';
import {createWriteStream,readFileSync,lstatSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {once} from 'node:events';
import {verifyHostEnvelope,readProtectedFile,HOST_RELEASE_PATHS,
 verifyReleaseBundleManifest,authorizeHostOperation} from './sabora-release-host-agent.mjs';
import {RELEASE_WIRE_NAMES} from '../ci/sabora-release-transport.mjs';
const MAX=[768*1024*1024,768*1024*1024,262144,262144];
function stop(code){throw Error('sabora_receive_stop:'+code);}
class Cursor{
 constructor(source){this.source=source[Symbol.asyncIterator]();this.buffer=Buffer.alloc(0);}
 async ensure(){
  while(!this.buffer.length){
   const n=await this.source.next();
   if(n.done)stop('unexpected_eof');
   if(!Buffer.isBuffer(n.value))stop('nonbinary_input');
   this.buffer=n.value;
  }
 }
 async line(limit){
  let output=Buffer.alloc(0);
  for(;;){
   await this.ensure();
   const n=this.buffer.indexOf(10);
   const cut=n<0?this.buffer.length:n;
   if(output.length+cut>limit)stop('line_too_large');
   output=Buffer.concat([output,this.buffer.subarray(0,cut)]);
   this.buffer=this.buffer.subarray(cut+(n>=0?1:0));
   if(n>=0)return output.toString('utf8');
  }
 }
 async take(count,sink){
  const h=createHash('sha256');
  while(count>0){
   await this.ensure();
   const n=Math.min(count,this.buffer.length);
   const chunk=this.buffer.subarray(0,n);
   h.update(chunk);
   if(!sink.write(chunk))await once(sink,'drain');
   this.buffer=this.buffer.subarray(n);
   count-=n;
  }
  return h.digest('hex');
 }
 async size(){
  const chunks=[];
  let remaining=8;
  while(remaining>0){
   await this.ensure();
   const n=Math.min(remaining,this.buffer.length);
   chunks.push(this.buffer.subarray(0,n));
   this.buffer=this.buffer.subarray(n);
   remaining-=n;
  }
  const n=Buffer.concat(chunks).readBigUInt64BE();
  if(n>BigInt(Number.MAX_SAFE_INTEGER))stop('size_invalid');
  return Number(n);
 }
 async end(){
  if(this.buffer.length)stop('unexpected_trailing_bytes');
  if(!(await this.source.next()).done)stop('unexpected_trailing_bytes');
 }
}
function directorySafe(root){
 const st=lstatSync(root);
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077)!==0)
  stop('untrusted_stage_root');
}
function decode(v){
 if(typeof v!=='string'||!v||v.length>49152||!/^[A-Za-z0-9+/]+={0,2}$/.test(v))
  stop('invalid_header_base64');
 const b=Buffer.from(v,'base64');
 if(b.toString('base64')!==v)stop('invalid_header_base64');
 return b;
}
export async function receiveReleaseBundle(source,{command,publicKey,stageRoot,now=Date.now()}){
 directorySafe(stageRoot);
 const cursor=new Cursor(source);
 const line=await cursor.line(49152);
 let h;
 try{h=JSON.parse(line)}catch{stop('invalid_header_json');}
 if(!h||typeof h!=='object'||Array.isArray(h)||
   Object.keys(h).sort().join('|')!=='approvalB64|manifestB64|protocol|signatureB64'||
   h.protocol!=='sabora-release-wire/v1')stop('invalid_protocol');
 const receipt=verifyHostEnvelope(command,JSON.stringify({approvalB64:h.approvalB64,
  signatureB64:h.signatureB64}),publicKey,now);
 const manifestBytes=decode(h.manifestB64);
 let manifest;
 try{manifest=JSON.parse(manifestBytes.toString('utf8'));}catch{stop('invalid_manifest_json');}
 verifyReleaseBundleManifest(receipt,manifest,manifestBytes);
 const target=join(stageRoot,receipt.authorizationId);
 // mkdir fails closed if this authorization was staged or is being staged.
 // Only stage under a preprovisioned private Sabora directory; no arbitrary paths.
 try{mkdirSync(target,{mode:0o700});}catch(e){
  if(e?.code==='EEXIST')stop('stage_replayed_or_in_progress');
  throw e;
 }
 try{
  const names=['api.tar','web.tar','operational.yml','web.yml'];
  const expected=[manifest.images.api.archiveSha256,manifest.images.web.archiveSha256,
   manifest.compose.operational,manifest.compose.web];
  for(let i=0;i<names.length;i++){
   const size=await cursor.size();
   if(size<1||size>MAX[i])stop('frame_size_out_of_bounds');
   const dest=createWriteStream(join(target,names[i]),{flags:'wx',mode:0o600});
   const digest=await cursor.take(size,dest);
   dest.end();
   await once(dest,'finish');
   if(digest!==expected[i])stop('transferred_hash_mismatch:'+RELEASE_WIRE_NAMES[i]);
  }
  await cursor.end();
  writeFileSync(join(target,'manifest.json'),manifestBytes,{flag:'wx',mode:0o600});
  return {releaseSha:receipt.releaseSha,authorizationId:receipt.authorizationId,
   bundleManifestSha256:receipt.bundleManifestSha256,
   stage:'verified-only',authorizedToDeploy:false,
   location:target};
 }catch(e){
  rmSync(target,{recursive:true,force:true});
  throw e;
 }
}
// CLI is intentionally NOT provisionable as an execution service yet.
// The real host must verify six original material gate witnesses, network/egress,
// one-use operation ledger, prior deployment and health before an actuator exists.
const self=process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1];
if(self){
 try{
  const publicKey=readProtectedFile(HOST_RELEASE_PATHS.publicKey,0,65536).toString('utf8');
  const staged=await receiveReleaseBundle(process.stdin,{
   command:process.env.SSH_ORIGINAL_COMMAND,publicKey,
   stageRoot:HOST_RELEASE_PATHS.bundles
  });
  // A staging success cannot be mistaken for a deploy/rollback success.
  process.stderr.write('sabora_stage_verified_no_deploy:'+staged.bundleManifestSha256+'\n');
  authorizeHostOperation();
 }catch(e){
  process.stderr.write(String(e?.message||e).replace(/[^a-zA-Z0-9:_-]/g,'_')+'\n');
  process.exitCode=1;
 }
}
