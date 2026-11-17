// Sabora-only streaming transport, exactly four fixed slots after a signed header.
// This is an artifact transfer protocol, never an authorization to invoke Docker.
import {createReadStream,lstatSync,readFileSync} from 'node:fs';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const RELEASE_WIRE_NAMES=Object.freeze(['api','web','compose_operational','compose_web']);
const MAX_BYTES=Object.freeze([768*1024*1024,768*1024*1024,262144,262144]);
function stop(code){throw Error('sabora_wire_stop:'+code);}
async function writePart(out,b){
 if(out.destroyed)stop('destination_closed');
 if(!out.write(b))await once(out,'drain');
}
export async function sendReleaseBundle(out,{approvalB64,signatureB64,manifestBytes,paths}){
 if(!Buffer.isBuffer(manifestBytes)||manifestBytes.length<10||manifestBytes.length>32768||
   !Array.isArray(paths)||paths.length!==4||
   ![approvalB64,signatureB64].every(v=>typeof v==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(v)))
  stop('invalid_sender_input');
 const sizes=paths.map((path,i)=>{
  const st=lstatSync(path);
  if(!st.isFile()||st.nlink!==1||st.size<1||st.size>MAX_BYTES[i])
   stop('invalid_source_file');
  return st.size;
 });
 const header=JSON.stringify({protocol:'sabora-release-wire/v1',approvalB64,signatureB64,
  manifestB64:manifestBytes.toString('base64')})+'\n';
 if(Buffer.byteLength(header)>49152)stop('header_too_large');
 await writePart(out,Buffer.from(header));
 for(let i=0;i<paths.length;i++){
  const length=Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(sizes[i]));
  await writePart(out,length);
  let actual=0;
  for await(const buf of createReadStream(paths[i],{highWaterMark:65536})){
   actual+=buf.length;
   if(actual>sizes[i])stop('changed_source_during_transfer');
   await writePart(out,buf);
  }
  if(actual!==sizes[i])stop('truncated_source_during_transfer');
 }
 out.end();
}
const self=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(self){
 try{
   const dir=process.argv[2];
  if(!dir||process.argv.length!==3)stop('expected_package_directory');
  const {join}=await import('node:path');
  const manifestBytes=readFileSync(join(dir,'manifest.json'));
  const approval=JSON.parse(Buffer.from(process.env.SABORA_APPROVAL_JSON_B64||'','base64').toString('utf8'));
  if(createHash('sha256').update(manifestBytes).digest('hex')!==approval.bundleManifestSha256)
   stop('signed_manifest_package_mismatch');
  await sendReleaseBundle(process.stdout,{
   approvalB64:process.env.SABORA_APPROVAL_JSON_B64,
   signatureB64:process.env.SABORA_APPROVAL_SIG_B64,
   manifestBytes,
   paths:['api.tar','web.tar','operational.yml','web.yml'].map(n=>join(dir,n))
  });
 }catch(err){
  process.stderr.write(String(err?.message||err).replace(/[^a-zA-Z0-9:_-]/g,'_')+'\n');
  process.exitCode=1;
 }
}
