// Candidate local recovery authorization fence for the dedicated backup lab.
// No production entry, no slot mutation, no SSH command, no implicit reset.
// A future root-only recovery coordinator must establish writer exclusion,
// observe the actual subject under the same immutable guard, verify a fresh
// external restoration proof, then consume and perform one nominated action.
// This module only reserves a sequence; it is not such a coordinator.
import {lstatSync,readdirSync,renameSync,statfsSync} from 'node:fs';
import {join} from 'node:path';
import {trustedDirectory,protectedBytes,exactKeys,sha256,durableExclusive,
 syncDirectory,acquireReleaseLock} from './sabora-release-protected-store.mjs';
import {verifySignedDocument,authorityFingerprint} from './sabora-release-evidence.mjs';
const stop=code=>{throw Error('sabora_backup_recovery_fence_stop:'+code);};
const digest=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
const schema='sabora-protected-recovery-sequence/v1';
const common=['schema','repository','project','environment','action','storageIdentitySha256',
 'externalStorageIdentitySha256','lockSha256','externalProofSha256','sequence','observedAt','validUntil'];
function fenceContext(directory,scope){
 if(process.platform!=='linux'||process.getuid()!==0||process.geteuid()!==0||
  !/^\/var\/lib\/sabora-backup-ci-[0-9]+\/volume\/recovery$/.test(directory??'')||
  !scope||scope.environment!=='disposable-lab'||
  !digest(scope.storageIdentitySha256)||!digest(scope.externalStorageIdentitySha256)||
  scope.storageIdentitySha256===scope.externalStorageIdentitySha256)stop('disposable_root_only');
 trustedDirectory(directory,{privateDirectory:true});
 const st=lstatSync(directory,{bigint:true}),fs=statfsSync(directory,{bigint:true});
 if(st.gid!==0n||(st.mode&0o777n)!==0o700n||fs.type!==0xef53n||
  String(st.dev)!==scope.protectedGuard?.device)stop('recovery_storage_identity');
 const authoritySha256=authorityFingerprint(scope.recoveryPublicKey);
 if(authoritySha256===authorityFingerprint(scope.verifierPublicKey))stop('authority_alias');
 return {schema,repository:'jdlc86/CartaViva',project:'sabora',environment:scope.environment,
  storageIdentitySha256:scope.storageIdentitySha256,externalStorageIdentitySha256:scope.externalStorageIdentitySha256,
  authoritySha256};
}
function readRecord(directory,identity){
 // No missing record -> zero fallback. Provisioning establishes genesis;
 // a torn publication or unexplained object stops the entire fence.
 const names=readdirSync(directory).sort();
 if(JSON.stringify(names)!==JSON.stringify(['controller.lock','sequence.json']))stop('unreconciled_sequence');
 let value;try{value=JSON.parse(protectedBytes(join(directory,'sequence.json'),{maxBytes:4096,privateFile:true}).toString('utf8'));}
 catch{stop('sequence_unreadable');}
 if(!exactKeys(value,[...Object.keys(identity),'sequence','authorizationSha256','lockSha256'])||
  Object.keys(identity).some(k=>value[k]!==identity[k])||
  !Number.isSafeInteger(value.sequence)||value.sequence<0||value.sequence>=Number.MAX_SAFE_INTEGER||
  (value.sequence===0?(value.authorizationSha256!==null||value.lockSha256!==null):
   (!digest(value.authorizationSha256)||!digest(value.lockSha256))))stop('sequence_invalid');
 return value;
}
function reserveUnderLock(directory,scope,identity,previous,expected,authorizationBytes){
  if(!Buffer.isBuffer(authorizationBytes)||authorizationBytes.length<1||authorizationBytes.length>262144)stop('authorization_size');
  const purge=expected?.action==='finish-published-purge';
  // Existing signed recovery schemas, not a new permission format.
  const specific=purge?['currentManifestSha256','previousManifestSha256','previousRemainderSha256']:['subjectSha256'];
  if(!exactKeys(expected,['action','lockSha256','externalProofSha256',...specific])||
   !['finish-published-purge','discard-verified-candidate','restore-predecessor-name','publish-promoted-state'].includes(expected.action)||
   !['lockSha256','externalProofSha256',...specific].every(k=>k==='previousManifestSha256'&&expected[k]===null||digest(expected[k])))
   stop('subject_required');
  const auth=verifySignedDocument(authorizationBytes,scope.recoveryPublicKey,
   purge?'sabora-vps-purge-authorization/v1':'sabora-vps-recovery-transition/v1');
  if(!exactKeys(auth,[...common,...specific])||auth.repository!==identity.repository||auth.project!==identity.project||
   auth.environment!==identity.environment||auth.storageIdentitySha256!==identity.storageIdentitySha256||
   auth.externalStorageIdentitySha256!==identity.externalStorageIdentitySha256||
   Object.keys(expected).some(k=>auth[k]!==expected[k])||
   auth.sequence!==previous.sequence+1)stop('authorization_scope_or_sequence');
  const observed=Date.parse(auth.observedAt),expires=Date.parse(auth.validUntil),now=Date.now();
  if(!Number.isFinite(observed)||!Number.isFinite(expires)||observed>now||
   expires<=now||expires<=observed||expires-observed>3600000)stop('authorization_time');
  const next={...identity,sequence:auth.sequence,authorizationSha256:sha256(authorizationBytes),lockSha256:auth.lockSha256};
  durableExclusive(join(directory,'sequence.pending'),next);
  renameSync(join(directory,'sequence.pending'),join(directory,'sequence.json'));
  syncDirectory(directory);
  const confirmed=readRecord(directory,identity);
  if(confirmed.sequence!==next.sequence||confirmed.authorizationSha256!==next.authorizationSha256||
   confirmed.lockSha256!==next.lockSha256)stop('sequence_not_confirmed');
  return Object.freeze({schema:'sabora-protected-recovery-reservation/v1',sequence:confirmed.sequence,
   authorizationSha256:confirmed.authorizationSha256,lockSha256:confirmed.lockSha256,
   slotsChanged:false,operationalAuthorization:false});
}
// Preserve the isolated primitive used by the existing fence test.
export function reserveProtectedRecoverySequence({directory,scope,expected,authorizationBytes}={}){
 const identity=fenceContext(directory,scope),unlock=acquireReleaseLock(directory);
 try{return reserveUnderLock(directory,scope,identity,readRecord(directory,identity),expected,authorizationBytes);}
 finally{unlock();}
}
// Hold the root-only controller lock throughout observation, reservation,
// and completion of one controlled worker. No reset or retry on failure.
export async function withProtectedRecoveryFence({directory,scope}={},operation){
 const identity=fenceContext(directory,scope),unlock=acquireReleaseLock(directory);
 let used=false;
 try{
  const previous=readRecord(directory,identity);
  return await operation(Object.freeze({sequence:previous.sequence,
   reserve(expected,authorizationBytes){
    if(used)stop('coordinator_reservation_already_attempted');
    used=true;
    return reserveUnderLock(directory,scope,identity,previous,expected,authorizationBytes);
   }}));
 }finally{unlock();}
}
