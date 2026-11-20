// Offline custodian candidate: a single durable record with compare-and-set.
// No listener, no installation, no access to backup slots, no recovery
// invocation. The independent custodian must choose/pin its keys, identity,
// and state directory outside the VPS; the caller's request cannot select
// them. This Linux implementation is not an NTFS persistence claim.
import {constants,openSync,closeSync,fstatSync,lstatSync,realpathSync,readdirSync,
 readFileSync,writeFileSync,fsyncSync,renameSync,unlinkSync} from 'node:fs';
import {join,resolve,dirname,parse} from 'node:path';
import {createPrivateKey,createPublicKey,sign,randomBytes} from 'node:crypto';
import {sha256,exactKeys,syncDirectory} from './sabora-release-protected-store.mjs';
import {verifySignedDocument,authorityFingerprint} from './sabora-release-evidence.mjs';
import {validateRecoveryControlRecord,verifyExternalRecoveryCheckpoint} from './sabora-backup-recovery-checkpoint.mjs';
import {stableStringify} from '../ci/sabora-release-governor.mjs';
const stop=code=>{throw Error('sabora_backup_custodian_stop:'+code);};
const digest=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
const hashRecord=v=>sha256(Buffer.from(stableStringify(v)));
const identityFields=['installationId','hostIdentitySha256','storageIdentitySha256',
 'externalStorageIdentitySha256','controlStorageIdentitySha256','recoveryAuthoritySha256'];
function directoryCheck(directory){
 if(process.platform!=='linux'||process.getuid()!==process.geteuid()||
  typeof directory!=='string'||resolve(directory)!==directory||realpathSync(directory)!==directory)
  stop('custody_directory');
 const uid=process.getuid();
 for(let p=directory;;p=dirname(p)){
  const s=lstatSync(p),leaf=p===directory;
  if(!s.isDirectory()||s.isSymbolicLink()||![0,uid].includes(s.uid)||
   (leaf?(s.uid!==uid||(s.mode&0o7777)!==0o700):
    ((s.mode&0o022)!==0&&!(s.uid===0&&(s.mode&0o1000)!==0))))
   stop('custody_directory');
  if(p===parse(p).root)break;
 }
}
function readRecord(directory,expected){
 const names=readdirSync(directory).sort();
 if(names.join('|')!=='custody.lock|record.json')stop('unreconciled_custody');
 const path=join(directory,'record.json'),before=lstatSync(path);
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.uid!==process.getuid()||st.nlink!==1||
   (st.mode&0o7777)!==0o600||st.size<1||st.size>8192||
   st.ino!==before.ino||st.dev!==before.dev)stop('custody_record_file');
  const bytes=readFileSync(fd),after=fstatSync(fd);
  if(bytes.length!==st.size||after.ctimeMs!==st.ctimeMs||after.mtimeMs!==st.mtimeMs||
   after.size!==st.size)stop('custody_record_changed');
  let record;try{record=JSON.parse(bytes.toString('utf8'));}catch{stop('custody_record_json');}
  validateRecoveryControlRecord(record,expected);
  return record;
 }finally{closeSync(fd);}
}
function writeExclusive(path,value){
 const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);}
 finally{closeSync(fd);}
 syncDirectory(dirname(path));
}
function keyContext(config){
 if(!exactKeys(config,['expected','checkpointPublicKey','checkpointPrivateKey',
  'ownerPublicKey','recoveryPublicKey','verificationPublicKey']))stop('custody_configuration');
 const publicKeys=[config.checkpointPublicKey,config.ownerPublicKey,config.recoveryPublicKey,config.verificationPublicKey];
 const fingerprints=publicKeys.map(authorityFingerprint);
 if(new Set(fingerprints).size!==4||fingerprints[2]!==config.expected?.recoveryAuthoritySha256)
  stop('custody_authorities');
 let key;
 try{key=config.checkpointPrivateKey?.type==='private'?config.checkpointPrivateKey:createPrivateKey(config.checkpointPrivateKey);}
 catch{stop('custody_signer');}
 if(key.asymmetricKeyType!=='ed25519'||
  sha256(createPublicKey(key).export({format:'der',type:'spki'}))!==fingerprints[0])
  stop('custody_signer');
 return key;
}
function bounded(bytes,max=262144){
 if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>max)stop('document_size');
}
function freshness(doc,maxMs,now=Date.now()){
 const start=Date.parse(doc.observedAt),end=Date.parse(doc.validUntil);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>now||end<=now||end<=start||
  end-start>maxMs)stop('document_time');
}
function sameScope(doc,expected){
 return doc.repository==='jdlc86/CartaViva'&&doc.project==='sabora'&&doc.environment==='production'&&
  doc.storageIdentitySha256===expected.storageIdentitySha256&&
  doc.externalStorageIdentitySha256===expected.externalStorageIdentitySha256;
}
function checkpoint(record,challenge,key,config){
 if(!digest(challenge))stop('challenge');
 const now=Date.now(),payload={...record,schema:'sabora-backup-external-checkpoint/v1',
  challenge,recordSha256:hashRecord(record),observedAt:new Date(now).toISOString(),
  validUntil:new Date(now+60000).toISOString()};
 const bytes=Buffer.from(JSON.stringify({payload,signature:sign(null,Buffer.from(stableStringify(payload)),key).toString('base64')}));
 // Self-check the exact signed response before releasing the lock.
 verifyExternalRecoveryCheckpoint({record,expected:config.expected,challenge,checkpointBytes:bytes,
  checkpointPublicKey:config.checkpointPublicKey,ownerPublicKey:config.ownerPublicKey,
  recoveryPublicKey:config.recoveryPublicKey,verificationPublicKey:config.verificationPublicKey,now});
 return bytes;
}
function transact(directory,config,operation){
 directoryCheck(directory);
 const key=keyContext(config),lock=join(directory,'custody.lock');
 try{writeExclusive(lock,{schema:'sabora-backup-custody-lock/v1',pid:process.pid});}
 catch(e){if(e.code==='EEXIST')stop('custody_locked_or_crashed');throw e;}
 let unsafe=false;
 try{
  const record=readRecord(directory,config.expected);
  const result=operation(record,key,()=>{unsafe=true;});
  unsafe=false;
  return result;
 }finally{
  // A failure during/after publication is unknown: preserve lock and any
  // pending record. No implicit reset or retry. Before publication ordinary
  // validation failures release the lock; unknown inventory remains STOP.
  if(!unsafe){unlinkSync(lock);syncDirectory(directory);}
 }
}
// Fresh observation, independent of the state the VPS claims to have.
export function observeExternalRecoveryCheckpoint({directory,config,challenge}={}){
 if(!digest(challenge))stop('challenge');
 return transact(directory,config,(record,key)=>checkpoint(record,challenge,key,config));
}
// Authorization and proof are the exact already signed recovery documents.
// The recovery authority additionally signs the CAS envelope to bind the
// installed identity, challenge, prior hash and exact signed authorization.
// Store is advanced BEFORE producing a signable success response.
export function advanceExternalRecoveryCheckpoint({directory,config,requestBytes,
 authorizationBytes,externalProofBytes}={}){
 bounded(requestBytes,16384);bounded(authorizationBytes);bounded(externalProofBytes);
 return transact(directory,config,(record,key,markMutation)=>{
  const expected=config.expected;
  const request=verifySignedDocument(requestBytes,config.recoveryPublicKey,'sabora-backup-checkpoint-advance/v1');
  if(!exactKeys(request,['schema','repository','project','environment',...identityFields,
   'challenge','previousRecordSha256','sequence','authorizationSha256','observedAt','validUntil'])||
   !sameScope(request,expected)||identityFields.some(k=>request[k]!==expected[k])||
   !digest(request.challenge)||request.previousRecordSha256!==hashRecord(record)||
   !Number.isSafeInteger(request.sequence)||request.sequence!==record.sequence+1||
   request.authorizationSha256!==sha256(authorizationBytes))stop('compare_and_set');
  freshness(request,120000);
  // The signed scope is not an observation of actual backup slots. That
  // remains a duty of the future offline recovery coordinator.
  let envelope;
  try{envelope=JSON.parse(authorizationBytes.toString('utf8'));}catch{stop('authorization');}
  const purge=envelope?.payload?.schema==='sabora-vps-purge-authorization/v1';
  const auth=verifySignedDocument(authorizationBytes,config.recoveryPublicKey,
   purge?'sabora-vps-purge-authorization/v1':'sabora-vps-recovery-transition/v1');
  const fields=purge?['currentManifestSha256','previousManifestSha256','previousRemainderSha256']:['subjectSha256'];
  if(!exactKeys(auth,['schema','repository','project','environment','action','storageIdentitySha256',
   'externalStorageIdentitySha256','lockSha256','externalProofSha256','sequence','observedAt','validUntil',...fields])||
   !sameScope(auth,expected)||auth.sequence!==request.sequence||
   !digest(auth.lockSha256)||auth.externalProofSha256!==sha256(externalProofBytes)||
   !(purge?auth.action==='finish-published-purge':
    ['discard-verified-candidate','restore-predecessor-name','publish-promoted-state'].includes(auth.action))||
   !fields.every(k=>k==='previousManifestSha256'&&auth[k]===null||digest(auth[k])))
   stop('authorization_scope');
  freshness(auth,3600000);
  const proof=verifySignedDocument(externalProofBytes,config.verificationPublicKey,'sabora-vps-rotation-proof/v1');
  if(!exactKeys(proof,['schema','repository','project','environment','storageIdentitySha256','externalStorageIdentitySha256',
   'backupId','manifestSha256','previousManifestSha256','releaseSha','backupSchema','recoveredInventorySha256',
   'recoveryEvidenceSha256','recoveryKind','observedAt','validUntil'])||!sameScope(proof,expected)||
   ![proof.manifestSha256,proof.recoveredInventorySha256,proof.recoveryEvidenceSha256].every(digest)||
   (proof.previousManifestSha256!==null&&!digest(proof.previousManifestSha256))||
   !/^SABORA-BACKUP-[A-Z0-9-]{8,80}$/.test(proof.backupId??'')||
   !/^[0-9a-f]{40}$/.test(proof.releaseSha??'')||
   !['sabora-preinstall-backup/v1','sabora-logical-backup/v2'].includes(proof.backupSchema)||
   proof.recoveryKind!==(proof.backupSchema==='sabora-preinstall-backup/v1'?
    'authenticated-initial-state-and-recovery-drill':'external-pg17-restore')||
   (purge&&proof.manifestSha256!==auth.currentManifestSha256))stop('external_proof_scope');
  freshness(proof,Number.MAX_SAFE_INTEGER);
  const next={...record,sequence:request.sequence,authorizationSha256:request.authorizationSha256,lockSha256:auth.lockSha256};
  validateRecoveryControlRecord(next,expected);
  // Expiry is checked again immediately before the first durable mutation.
  freshness(request,120000);freshness(auth,3600000);freshness(proof,Number.MAX_SAFE_INTEGER);
  markMutation();
  writeExclusive(join(directory,'record.pending'),next);
  renameSync(join(directory,'record.pending'),join(directory,'record.json'));syncDirectory(directory);
  const actual=readRecord(directory,expected);
  if(hashRecord(actual)!==hashRecord(next))stop('advance_not_confirmed');
  const response=checkpoint(actual,request.challenge,key,config);
  return Object.freeze({record:actual,checkpointBytes:response,
   externalAdvancePerformed:true,recoveryAuthorized:false,operationalAuthorization:false});
 });
}

// Local half of the offline recovery reservation protocol. A future
// installed coordinator must call this with the actual subject observed
// under the immutable rotation guard, its independently provisioned
// control directory and trusted public keys. No slot mutation or installed
// entry is exported here. The remote exchange receives no private key.
// A lost or rejected response after pending is durable is always STOP.
export async function reserveLocalRecoveryCheckpoint({directory,config,subject,
 authorizationBytes,externalProofBytes,observeExternal,advanceExternal}={}){
 directoryCheck(directory);
 if(!exactKeys(config,['expected','checkpointPublicKey','ownerPublicKey','recoveryPublicKey','verificationPublicKey'])||
  typeof observeExternal!=='function'||typeof advanceExternal!=='function')stop('local_exchange_configuration');
 // Own immutable snapshots of all request inputs used across awaits.
 // The adapter may return data, but cannot substitute the authority set
 // or the signed authorization after the local comparison.
 config=Object.freeze({...config,expected:Object.freeze({...config.expected})});
 const expected=config.expected;
 bounded(authorizationBytes);bounded(externalProofBytes);
 authorizationBytes=Buffer.from(authorizationBytes);externalProofBytes=Buffer.from(externalProofBytes);
 subject=Object.freeze({...subject});
 const purge=subject?.action==='finish-published-purge';
 const specific=purge?['currentManifestSha256','previousManifestSha256','previousRemainderSha256']:['subjectSha256'];
 if(!exactKeys(subject,['action','lockSha256','externalProofSha256',...specific])||
  !(purge||['discard-verified-candidate','restore-predecessor-name','publish-promoted-state'].includes(subject.action))||
  !['lockSha256','externalProofSha256',...specific].every(k=>k==='previousManifestSha256'&&subject[k]===null||digest(subject[k]))||
  subject.externalProofSha256!==sha256(externalProofBytes))stop('local_subject');
 const auth=verifySignedDocument(authorizationBytes,config.recoveryPublicKey,
  purge?'sabora-vps-purge-authorization/v1':'sabora-vps-recovery-transition/v1');
 if(!exactKeys(auth,['schema','repository','project','environment','storageIdentitySha256','externalStorageIdentitySha256',
  'sequence','observedAt','validUntil',...Object.keys(subject)])||
  !sameScope(auth,expected)||Object.keys(subject).some(k=>subject[k]!==auth[k]))stop('local_subject');
 const proof=verifySignedDocument(externalProofBytes,config.verificationPublicKey,'sabora-vps-rotation-proof/v1');
 if(!sameScope(proof,expected)||(purge&&proof.manifestSha256!==subject.currentManifestSha256))
  stop('local_external_proof');
 const checkTime=()=>{freshness(auth,3600000);freshness(proof,Number.MAX_SAFE_INTEGER);};
 checkTime();
 const lock=join(directory,'custody.lock'),pending=join(directory,'record.pending'),recordPath=join(directory,'record.json');
 try{writeExclusive(lock,{schema:'sabora-backup-local-checkpoint-lock/v1',pid:process.pid});}
 catch(e){if(e.code==='EEXIST')stop('local_checkpoint_locked_or_crashed');throw e;}
 let unknown=false;
 // Both challenges are born inside this invocation, never sourced from a
 // snapshot or caller; bound the in-memory exchange to the signed window.
 const exchange=async fn=>{
  const remaining=Math.min(60000,Date.parse(auth.validUntil)-Date.now(),Date.parse(proof.validUntil)-Date.now());
  if(!Number.isFinite(remaining)||remaining<=0)stop('local_exchange_expired');
  let timer;
  try{return await Promise.race([Promise.resolve().then(fn),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('sabora_backup_custodian_stop:local_exchange_timeout')),remaining);})]);}
  finally{clearTimeout(timer);}
 };
 const verify=(record,challenge,checkpointBytes)=>verifyExternalRecoveryCheckpoint({
  ...config,record,challenge,checkpointBytes});
 try{
  const previous=readRecord(directory,expected);
  if(auth.sequence!==previous.sequence+1)stop('local_authorization_sequence');
  const observationChallenge=randomBytes(32).toString('hex');
  verify(previous,observationChallenge,await exchange(()=>observeExternal(observationChallenge)));
  if(hashRecord(readRecord(directory,expected))!==hashRecord(previous))stop('local_record_changed');
  checkTime();
  const next={...previous,sequence:auth.sequence,authorizationSha256:sha256(authorizationBytes),lockSha256:auth.lockSha256};
  validateRecoveryControlRecord(next,expected);
  const challenge=randomBytes(32).toString('hex'),now=Date.now(),
   until=Math.min(now+60000,Date.parse(auth.validUntil),Date.parse(proof.validUntil));
  if(until<=now)stop('local_exchange_expired');
  const payload={schema:'sabora-backup-checkpoint-advance/v1',repository:'jdlc86/CartaViva',project:'sabora',
   environment:'production',...expected,challenge,previousRecordSha256:hashRecord(previous),
   sequence:next.sequence,authorizationSha256:next.authorizationSha256,
   observedAt:new Date(now).toISOString(),validUntil:new Date(until).toISOString()};
  // Persist the intended advance before asking the external authority to
  // consume anything. If the reply is lost we cannot safely infer failure.
  // Never discard this marker automatically, even on a remote rejection.
  unknown=true;
  writeExclusive(pending,{schema:'sabora-backup-local-checkpoint-pending/v1',
   previousRecordSha256:payload.previousRecordSha256,next,challenge});
  const response=await exchange(()=>advanceExternal({payload:Object.freeze(payload),
   authorizationBytes:Buffer.from(authorizationBytes),externalProofBytes:Buffer.from(externalProofBytes)}));
  verify(next,challenge,response);
  checkTime();
  if(Date.now()>=until)stop('local_exchange_expired');
  // Keep the pending transaction until the new local record itself has
  // reached durable storage. A crash anywhere before final fsync is STOP.
  const temporary=join(directory,'record.next');
  writeExclusive(temporary,next);
  renameSync(temporary,recordPath);syncDirectory(directory);
  unlinkSync(pending);syncDirectory(directory);
  const confirmed=readRecord(directory,expected);
  if(hashRecord(confirmed)!==hashRecord(next))stop('local_advance_not_confirmed');
  unknown=false;
  return Object.freeze({schema:'sabora-backup-local-checkpoint-reservation/v1',
   sequence:confirmed.sequence,authorizationSha256:confirmed.authorizationSha256,
   lockSha256:confirmed.lockSha256,checkpointSha256:sha256(response),
   slotsChanged:false,operationalAuthorization:false});
 }finally{
  if(!unknown){unlinkSync(lock);syncDirectory(directory);}
 }
}
