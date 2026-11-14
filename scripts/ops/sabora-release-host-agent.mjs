// Sabora-only host boundary. This is a verification component, not a Docker
// actuator. Installing it does not authorize any release or host mutation.
import {createHash,constants} from 'node:crypto';
import {openSync,closeSync,fstatSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {verifyReleaseAuthorization,EVIDENCE_KEYS,SABORA_RELEASE_SCOPE} from '../ci/sabora-release-governor.mjs';

const SHA40=/^[0-9a-f]{40}$/;
const SHA64=/^[0-9a-f]{64}$/;
const ID=/^[A-Z0-9-]{12,64}$/;
const TOKEN=/^[0-9]{1,20}$/;
const HEX_ID=/^sha256:[0-9a-f]{64}$/;
const BASE64=/^[A-Za-z0-9+/]+={0,2}$/;
export const HOST_RELEASE_PATHS=Object.freeze({
 publicKey:'/etc/sabora/release/owner-public.pem',
 evidence:'/var/lib/sabora-release/evidence',
 bundles:'/srv/sabora/release/bundles',
 ledger:'/var/lib/sabora-release/authorizations'
});
function stop(code){throw Error('sabora_host_release_stop:'+code);}
function keys(v,k){return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===k.slice().sort().join('|');}
function hash(v){return createHash('sha256').update(v).digest('hex');}
function decode64(v){
 if(typeof v!=='string'||!BASE64.test(v)||v.length>16384)stop('invalid_base64');
 const b=Buffer.from(v,'base64');
 if(!b.length||b.toString('base64')!==v)stop('invalid_base64');
 return b;
}
export function parseForcedReleaseCommand(command){
 if(typeof command!=='string'||command.length>300)stop('invalid_forced_command');
 const parts=command.split(' ');
 if(parts.length!==6||parts[0]!=='sabora-release-v1'||!['deploy','rollback'].includes(parts[1])||
   !SHA40.test(parts[2])||!ID.test(parts[3])||!SHA64.test(parts[4])||!TOKEN.test(parts[5]))
   stop('invalid_forced_command');
 return {operation:parts[1],releaseSha:parts[2],authorizationId:parts[3],
  authorizationSha256:parts[4],githubRunId:parts[5]};
}
export function verifyHostEnvelope(command,envelope,publicKeyPem,now=Date.now()){
 const expected=parseForcedReleaseCommand(command);
 if(typeof envelope!=='string'||envelope.length>16384)stop('invalid_envelope');
 let body;
 try{body=JSON.parse(envelope)}catch{stop('invalid_envelope');}
 if(!keys(body,['approvalB64','signatureB64']))stop('invalid_envelope_shape');
 const raw=decode64(body.approvalB64).toString('utf8');
 const signature=decode64(body.signatureB64).toString('base64');
 const receipt=verifyReleaseAuthorization(raw,signature,publicKeyPem,
  {operation:expected.operation,sha:expected.releaseSha},now);
 if(receipt.authorizationId!==expected.authorizationId||
   receipt.authorizationSha256!==expected.authorizationSha256)stop('command_approval_mismatch');
 return Object.freeze({...expected,evidence:receipt.evidence});
}
export function verifyHostEvidence(receipt,artifacts){
 if(!keys(artifacts,EVIDENCE_KEYS))stop('incomplete_evidence');
 const verified=[];
 for(const gate of EVIDENCE_KEYS){
  const value=artifacts[gate];
  if(!Buffer.isBuffer(value)&&typeof value!=='string')stop('invalid_evidence_file');
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(value,'utf8');
  if(bytes.length<50||bytes.length>1048576||hash(bytes)!==receipt.evidence[gate])
   stop('evidence_hash_mismatch:'+gate);
  let doc;
  try{doc=JSON.parse(bytes.toString('utf8'))}catch{stop('evidence_not_json:'+gate);}
  // Shape/scope protect against wrong-restaurant or placeholder artifacts.
  // These checks cannot independently prove a restore, SQL or firewall test.
  if(!keys(doc,['schema','gate','restaurant','status','observedAt','reference'])||
     doc.schema!=='sabora-release-evidence/v1'||doc.gate!==gate||
     doc.restaurant!=='sabora'||doc.status!=='verified'||
     typeof doc.reference!=='string'||doc.reference.length<12||
     !Number.isFinite(Date.parse(doc.observedAt)))stop('evidence_scope_invalid:'+gate);
  verified.push({gate,sha256:hash(bytes)});
 }
 return verified;
}
export function verifyReleaseBundle(receipt,manifest,files){
 if(!keys(manifest,['schema','repository','releaseSha','project','services','images','compose'])||
 manifest.schema!=='sabora-release-bundle/v1'||manifest.repository!=='jdlc86/CartaViva'||
 manifest.releaseSha!==receipt.releaseSha||manifest.project!=='sabora'||
 !Array.isArray(manifest.services)||manifest.services.join('|')!==SABORA_RELEASE_SCOPE.services.join('|')||
 !keys(manifest.images,['api','web'])||
 !keys(manifest.compose,['operational','web']))stop('invalid_release_bundle');
 const checks=[];
 for(const n of ['api','web']){
  const im=manifest.images[n];
  if(!keys(im,['tag','imageId','archiveSha256'])||
   im.tag!=='sabora-'+n+':'+receipt.releaseSha||
   !HEX_ID.test(im.imageId)||!SHA64.test(im.archiveSha256)||
   !Buffer.isBuffer(files?.[n])||hash(files[n])!==im.archiveSha256)
   stop('image_bundle_hash_or_scope:'+n);
  checks.push({name:n,imageId:im.imageId,sha256:im.archiveSha256});
 }
 for(const name of ['operational','web']){
  if(!SHA64.test(manifest.compose[name])||
   !Buffer.isBuffer(files?.['compose_'+name])||
   hash(files['compose_'+name])!==manifest.compose[name])stop('compose_hash_mismatch:'+name);
 }
 return Object.freeze({releaseSha:receipt.releaseSha,images:checks,
  compose:[manifest.compose.operational,manifest.compose.web],
  verifiedOnlyAsBytes:true,authorizedToDeploy:false});
}
// A no-follow, owner-locked reader. The caller must also protect all parent
// directories (root-owned and non-writable by unprivileged accounts).
export function readProtectedFile(path,ownerUid=0,maxBytes=1048576){
 let fd;
 try{
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  const st=fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||st.uid!==ownerUid||
    (st.mode&0o022)!==0||st.size>maxBytes||st.size===0)stop('untrusted_host_file');
  return readFileSync(fd);
 }finally{if(fd!==undefined)closeSync(fd);}
}
export function recordAuthorizationOnce(directory,receipt,details){
 if(!ID.test(receipt.authorizationId))stop('invalid_authorization_id');
 // Directory creation and ownership are the provisioning operator's task;
 // this routine never creates/modifies arbitrary project directories.
 const st=statSync(directory);
 if(!st.isDirectory()||(st.mode&0o022)!==0)stop('unsafe_ledger_directory');
 const file=join(directory,receipt.authorizationId+'.json');
 let fd;
 try{
  fd=openSync(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  writeFileSync(fd,JSON.stringify({schema:'sabora-release-receipt/v1',
   authorizationId:receipt.authorizationId,githubRunId:receipt.githubRunId,
   operation:receipt.operation,releaseSha:receipt.releaseSha,
   authorizationSha256:receipt.authorizationSha256,
   state:'consumed-before-operation',details})+'\n');
 }catch(error){
  if(error?.code==='EEXIST')stop('authorization_replay');
  throw error;
 }finally{if(fd!==undefined)closeSync(fd);}
 return file;
}
// A host must not run Docker merely because a receipt validates. Until a
// root-owned, independently reviewed actuator verifies network enforcement,
// image identities, readiness and rollback invariants, execution stays STOP.
export function authorizeHostOperation(){
 stop('actuator_not_provisioned_or_validated');
}
