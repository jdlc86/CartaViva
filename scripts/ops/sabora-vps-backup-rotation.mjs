// Candidate rotation transaction. No production entry point, provisioning,
// network listener, signer, scheduler or key custody is installed by this module.
// Callers must provide independently approved scope and verifier public key.
// The only destructive operation is unlinking the exact, inventoried previous
// bundle AFTER durable promotion and a second verification of the new one.
import {constants} from 'node:fs';
import {lstat,realpath,readdir,readFile,open,rename,unlink,rmdir,statfs} from 'node:fs/promises';
import {join,dirname,resolve,parse,relative,isAbsolute} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {replicateEncryptedBackupBundle,inspectEncryptedBackupBundle,parseEncryptedBackupManifest,PREINSTALL_SCHEMA}
 from './sabora-encrypted-backup-bundle.mjs';
import {verifySignedDocument,authorityFingerprint} from './sabora-release-evidence.mjs';
import {exactKeys} from './sabora-release-protected-store.mjs';
import {BackupWireReader,receiveBackupCandidate} from './sabora-vps-backup-wire.mjs';
const stop=code=>{throw Error('sabora_rotation_stop:'+code);};
const HEX=/^[0-9a-f]{64}$/;
const hash=v=>typeof v==='string'&&HEX.test(v)&&!/^0+$/.test(v);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>a.slice().sort().join('|')===b.slice().sort().join('|');
const ID=/^SABORA-BACKUP-[A-Z0-9-]{8,80}$/;
const SCHEMA='sabora-vps-rotation-proof/v1';
const V2='sabora-logical-backup/v2';
const INTENT='sabora-vps-rotation-intent/v1';
const MAX_INTENT=2*1024*1024;
const names=type=>type===PREINSTALL_SCHEMA?['manifest.json','initial-state.aesgcm']:
 ['manifest.json','roles-memberships.aesgcm','schema.aesgcm','data.aesgcm','inventory.aesgcm'];
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function directory(path,{uid,lab,privateDirectory=true}){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||await realpath(path)!==path)
  stop('noncanonical_path');
 for(let current=path;;current=dirname(current)){
  const st=await lstat(current);
  // A sticky system temp directory may be used only by test fixtures. The
  // private test directory and every non-sticky parent remain protected.
  const stickyTemp=lab&&current!==path&&st.uid===0&&(st.mode&0o1000)!==0;
  if(!st.isDirectory()||st.isSymbolicLink()||![0,uid].includes(st.uid)||
   ((st.mode&0o022)!==0&&!stickyTemp))stop('unsafe_directory_chain');
  if(current===path&&(st.uid!==uid||(privateDirectory&&(st.mode&0o077)!==0)))stop('nonprivate_directory');
  if(current===parse(current).root)break;
 }
}
async function file(path,uid,max=1024**3){
 const st=await lstat(path);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==uid||
    (st.mode&0o077)!==0||st.size<1||st.size>max)stop('unsafe_file');
 return st;
}
async function syncDir(path){
 const fd=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{await fd.sync();}finally{await fd.close();}
}
async function exclusive(path,obj){
 const fd=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await fd.writeFile(JSON.stringify(obj)+'\n');await fd.sync();}finally{await fd.close();}
 await syncDir(dirname(path));
}
async function hashFile(path,uid,max){
 const before=await file(path,uid,max);
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const st=await fd.stat();
  if(before.dev!==st.dev||before.ino!==st.ino||before.ctimeMs!==st.ctimeMs)stop('file_changed');
  const digest=createHash('sha256');let bytes=0;
  for await(const chunk of fd.createReadStream({autoClose:false})){bytes+=chunk.length;digest.update(chunk);}
  const after=await fd.stat();
  if(bytes!==st.size||after.size!==st.size||after.ctimeMs!==st.ctimeMs||after.mtimeMs!==st.mtimeMs)
   stop('file_changed');
  return {sha256:digest.digest('hex'),bytes,stat:st};
 }finally{await fd.close();}
}
async function bundle(path,ctx){
 await directory(path,ctx);
 const manifestPath=join(path,'manifest.json');
 const manifestFile=await hashFile(manifestPath,ctx.uid,262144);
 const manifestBytes=await readFile(manifestPath);
 if(sha(manifestBytes)!==manifestFile.sha256)stop('manifest_changed');
 const manifest=JSON.parse(manifestBytes.toString('utf8'));
 if(![PREINSTALL_SCHEMA,V2].includes(manifest.schema)||manifest.repository!=='jdlc86/CartaViva'||
    manifest.sourceProjectRef!=='byhvmumqivmunkmomhup'||manifest.sourceDatabase!=='postgres'||
    manifest.sourceSystemIdentifier!==ctx.systemIdentifier||!ID.test(manifest.backupId)||
    !same(await readdir(path),names(manifest.schema)))stop('bundle_scope_or_inventory');
 // Reject special files and links in the exact closed inventory before the
 // legacy inspector opens component paths. In particular, do not open a
 // FIFO or a symlink to a file outside the backup while calculating hashes.
 for(const name of names(manifest.schema))await file(join(path,name),ctx.uid,name==='manifest.json'?262144:1024**3);
 const inspected=await inspectEncryptedBackupBundle(path);
 if(inspected.manifestSha256!==manifestFile.sha256||inspected.backupId!==manifest.backupId)
  stop('manifest_changed');
 const inventory={ 'manifest.json':manifestFile };
 let bytes=manifestFile.bytes;
 for(const item of manifest.components){
  const result=await hashFile(join(path,item.filename),ctx.uid);
  if(result.sha256!==item.ciphertextSha256||result.bytes!==item.ciphertextBytes)stop('ciphertext_mismatch');
  inventory[item.filename]=result;bytes+=result.bytes;
 }
 if(!same(Object.keys(inventory),names(manifest.schema)))stop('bundle_inventory');
 const target=manifest.components.find(c=>c.name===(manifest.schema===PREINSTALL_SCHEMA?'initial-state':'inventory'));
 return {manifest,manifestBytes,manifestSha256:manifestFile.sha256,bytes,inventory,
  inventorySha256:target.plaintextSha256};
}
function proof(bytes,ctx,current,candidate,{active=false}={}){
 const doc=verifySignedDocument(bytes,ctx.verifierPublicKey,SCHEMA);
 if(!exactKeys(doc,['schema','repository','project','environment','storageIdentitySha256',
  'externalStorageIdentitySha256','backupId','manifestSha256','previousManifestSha256',
  'releaseSha','backupSchema','recoveredInventorySha256','recoveryEvidenceSha256','recoveryKind','observedAt','validUntil'])||
  doc.repository!=='jdlc86/CartaViva'||doc.project!=='sabora'||doc.environment!==ctx.environment||
  doc.storageIdentitySha256!==ctx.storageIdentitySha256||
  doc.externalStorageIdentitySha256!==ctx.externalStorageIdentitySha256||
  doc.backupId!==candidate.manifest.backupId||doc.manifestSha256!==candidate.manifestSha256||
  doc.releaseSha!==candidate.manifest.releaseSha||doc.backupSchema!==candidate.manifest.schema||
  doc.recoveredInventorySha256!==candidate.inventorySha256||!hash(doc.recoveryEvidenceSha256)||
  doc.recoveryKind!==(candidate.manifest.schema===PREINSTALL_SCHEMA?'authenticated-initial-state-and-recovery-drill':'external-pg17-restore')||
  (!active&&doc.previousManifestSha256!==(current?.manifestSha256??null)))
  stop('proof_scope_mismatch');
 const observed=Date.parse(doc.observedAt),expires=Date.parse(doc.validUntil),created=Date.parse(candidate.manifest.createdAt);
 if(!Number.isFinite(observed)||!Number.isFinite(expires)||!Number.isFinite(created)||
  observed<created||observed>Date.now()||expires<=observed||(!active&&expires<=Date.now()))
  stop('proof_time_invalid');
 if(doc.previousManifestSha256!==null&&!hash(doc.previousManifestSha256))stop('proof_predecessor_invalid');
 return doc;
}
async function readState(path,ctx,current){
 await file(path,ctx.uid,262144);
 const state=JSON.parse(await readFile(path,'utf8'));
 if(!exactKeys(state,['schema','manifestSha256','proof'])||state.schema!=='sabora-vps-rotation-state/v1'||
  state.manifestSha256!==current.manifestSha256)stop('state_mismatch');
 proof(Buffer.from(JSON.stringify(state.proof)),ctx,null,current,{active:true});
 return state;
}
async function syncBundle(path,inspection,ctx){
 for(const name of Object.keys(inspection.inventory)){
  const fd=await open(join(path,name),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const stat=await fd.stat(),expected=inspection.inventory[name].stat;
   if(stat.dev!==expected.dev||stat.ino!==expected.ino||stat.ctimeMs!==expected.ctimeMs)stop('file_changed');
   await fd.sync();
  }finally{await fd.close();}
 }
 await syncDir(path);
}
async function purgePrevious(path,expected,ctx){
 const old=await bundle(path,ctx);
 if(old.manifestSha256!==expected.manifestSha256)stop('previous_changed');
 // No recursive removal (or globs) of any path. An unexpected object or link
 // blocks the transaction. A crash here leaves a durable lock for recovery.
 for(const name of Object.keys(old.inventory)){
  const p=join(path,name),st=await file(p,ctx.uid),prior=old.inventory[name].stat;
  if(st.dev!==prior.dev||st.ino!==prior.ino||st.ctimeMs!==prior.ctimeMs)stop('previous_changed');
  await unlink(p);
 }
 await syncDir(path);await rmdir(path);await syncDir(dirname(path));
}
// Local and streaming inputs share one lock, proof and promotion transaction.
export async function rotateVerifiedVpsReplica({root,sourceDirectory,scope,proofBytes}={}){
 return rotate({root,sourceDirectory,scope,proofBytes,reader:null});
}
export async function receiveVerifiedVpsReplica({root,source,scope}={}){
 const reader=new BackupWireReader(source);
 try{return await rotate({root,scope,reader});}finally{reader.close();}
}
async function rotationContext(root,scope){
 if(process.platform!=='linux'||typeof process.geteuid!=='function'||!scope||
  !['production','disposable-lab'].includes(scope.environment)||
  !hash(scope.storageIdentitySha256)||!hash(scope.externalStorageIdentitySha256)||
  scope.storageIdentitySha256===scope.externalStorageIdentitySha256||
  !/^[0-9]{10,20}$/.test(scope.systemIdentifier??'')||
  !Number.isSafeInteger(scope.quotaBytes)||!Number.isSafeInteger(scope.reserveBytes)||
  scope.reserveBytes<1048576||scope.quotaBytes<=scope.reserveBytes)stop('invalid_scope');
 const uid=process.geteuid(),lab=scope.environment==='disposable-lab';
 authorityFingerprint(scope.verifierPublicKey);
 // No installed production caller exists. The production directory and
 // authority are deliberately constrained; changing them needs review.
 if(!lab&&(uid!==0||root!=='/srv/sabora/backups'))stop('unapproved_production_root');
 const ctx={...scope,uid,lab};
 await directory(root,ctx);
 return ctx;
}
async function rotate({root,sourceDirectory,scope,proofBytes,reader}){
 const ctx=await rotationContext(root,scope);
 if(!reader&&(!Buffer.isBuffer(proofBytes)||proofBytes.length<1||proofBytes.length>262144))stop('invalid_proof');
 if(!reader){
  await directory(sourceDirectory,ctx);
  const relation=(a,b)=>{const p=relative(a,b);return p===''||(p!=='..'&&!p.startsWith('../')&&!isAbsolute(p));};
  if(relation(root,sourceDirectory)||relation(sourceDirectory,root))stop('source_overlaps_cache');
 }
 const lock=join(root,'rotation.lock'),currentPath=join(root,'current'),candidatePath=join(root,'candidate'),
  previousPath=join(root,'previous'),statePath=join(root,'state.json');
 try{await exclusive(lock,{schema:'sabora-vps-rotation-lock/v1',pid:process.pid});}
 catch(e){if(e.code==='EEXIST')stop('locked_or_interrupted');throw e;}
 let mutation=false,completed=false;
 try{
  const hasCurrent=await exists(currentPath),expected=hasCurrent?['rotation.lock','current','state.json']:['rotation.lock'];
  if(!same(await readdir(root),expected))stop('unreconciled_state');
  const current=hasCurrent?await bundle(currentPath,ctx):null;
  const previousState=current?await readState(statePath,ctx,current):null;
  let source,header;
  if(reader){
   header=await reader.header();
   const {parsed,manifestBytes}=header,manifest=parsed.value;
   if(manifest.sourceSystemIdentifier!==ctx.systemIdentifier)stop('bundle_scope_or_inventory');
   const inventory=parsed.components.find(c=>c.name===(manifest.schema===PREINSTALL_SCHEMA?'initial-state':'inventory'));
   source={manifest,manifestBytes,manifestSha256:parsed.manifestSha256,
    bytes:manifestBytes.length+parsed.components.reduce((n,c)=>n+c.ciphertextBytes,0),
    inventorySha256:inventory.plaintextSha256};
   proofBytes=header.proofBytes;
  }else source=await bundle(sourceDirectory,ctx);
  const signed=proof(proofBytes,ctx,current,source);
  if(reader)reader.setExpiry(Date.parse(signed.validUntil));
  if(current&&(source.manifest.backupId===current.manifest.backupId||
      source.manifestSha256===current.manifestSha256||
      Date.parse(source.manifest.createdAt)<Date.parse(current.manifest.createdAt)||
      (current.manifest.schema===V2&&source.manifest.schema===PREINSTALL_SCHEMA)))stop('stale_or_regressive_backup');
  if(current?.manifest.schema===PREINSTALL_SCHEMA&&source.manifest.schema===V2&&
   source.manifest.migrationTreeSha256!==current.manifest.plannedMigrationTreeSha256)
   stop('initial_recovery_plan_not_fulfilled');
  const needed=source.bytes+scope.reserveBytes;
  const total=(current?.bytes??0)+needed;
  const space=await statfs(root,{bigint:true});
  if(!Number.isSafeInteger(total)||total>scope.quotaBytes||space.bavail*space.bsize<BigInt(needed))
   stop('insufficient_reserved_capacity');
  // Persist both signed choices and exact manifest bytes before candidate
  // creation. Recovery can identify even a partially purged previous slot.
  // Replacing the existing lock is atomic: another writer never sees a gap.
  const intent={schema:INTENT,pid:process.pid,
   previous:current?{manifestB64:current.manifestBytes.toString('base64'),proof:previousState.proof}:null,
   next:{manifestB64:source.manifestBytes.toString('base64'),proof:JSON.parse(proofBytes.toString('utf8'))}};
  if(Buffer.byteLength(JSON.stringify(intent)+'\n')>MAX_INTENT)stop('intent_too_large');
  mutation=true;
  const intentTemp=join(root,'.intent-'+randomBytes(16).toString('hex'));
  await exclusive(intentTemp,intent);await rename(intentTemp,lock);await syncDir(root);
  if(reader)await receiveBackupCandidate(reader,candidatePath,header);
  else await replicateEncryptedBackupBundle({sourceDirectory,destinationDirectory:candidatePath,
   destinationClass:'vps-encrypted-cache'});
  const candidate=await bundle(candidatePath,ctx);
  if(candidate.manifestSha256!==source.manifestSha256||candidate.bytes!==source.bytes)
   stop('replica_mismatch');
  proof(proofBytes,ctx,current,candidate);
  await syncBundle(candidatePath,candidate,ctx);
  if(current){
   const live=await bundle(currentPath,ctx);
   if(live.manifestSha256!==current.manifestSha256)stop('current_changed');
   await rename(currentPath,previousPath);await syncDir(root);
  }
  await rename(candidatePath,currentPath);await syncDir(root);
  const promoted=await bundle(currentPath,ctx);
  proof(proofBytes,ctx,current,promoted);
  const partial=join(root,'.state-'+randomBytes(16).toString('hex'));
  await exclusive(partial,{schema:'sabora-vps-rotation-state/v1',manifestSha256:promoted.manifestSha256,
   proof:JSON.parse(proofBytes.toString('utf8'))});
  await rename(partial,statePath);await syncDir(root);
  const confirmed=await bundle(currentPath,ctx);
  await readState(statePath,ctx,confirmed);
  proof(proofBytes,ctx,current,confirmed);
  if(current)await purgePrevious(previousPath,current,ctx);
  if(!same(await readdir(root),['rotation.lock','current','state.json']))stop('unexpected_final_state');
  completed=true;
  return Object.freeze({schema:'sabora-vps-rotation-result/v1',backupId:signed.backupId,
   manifestSha256:confirmed.manifestSha256,previousManifestSha256:signed.previousManifestSha256,
   generations:1,operationalReceipt:false});
 }finally{
  // A crash, failed copy or post-promotion failure must never be retried
  // blindly. Leave the lock and all evidence for explicit reconciliation.
  if(!mutation||completed){await unlink(lock);await syncDir(root);}
 }
}


// Read-only crash diagnosis. A report never releases a lock, promotes a slot
// or deletes a file. Even a coherent observation is not proof that a writer
// is absent or that a custodian attestation is materially true.
async function readObservation(path,ctx,max){
 const before=await hashFile(path,ctx.uid,max);
 const bytes=await readFile(path);
 if(bytes.length!==before.bytes||sha(bytes)!==before.sha256)stop('observation_changed');
 return {bytes,sha256:before.sha256};
}
function decodeIntentRecord(record,ctx){
 if(!exactKeys(record,['manifestB64','proof'])||typeof record.manifestB64!=='string'||
  record.manifestB64.length>349528)stop('intent_record_invalid');
 const bytes=Buffer.from(record.manifestB64,'base64');
 if(bytes.toString('base64')!==record.manifestB64)stop('intent_record_invalid');
 const parsed=parseEncryptedBackupManifest(bytes),manifest=parsed.value;
 if(![PREINSTALL_SCHEMA,V2].includes(manifest.schema)||manifest.sourceSystemIdentifier!==ctx.systemIdentifier||
  parsed.components.some(c=>c.ciphertextBytes>1024**3))stop('intent_scope_invalid');
 const inventory=parsed.components.find(c=>c.name===(manifest.schema===PREINSTALL_SCHEMA?'initial-state':'inventory'));
 const candidate={manifest,manifestSha256:parsed.manifestSha256,inventorySha256:inventory.plaintextSha256};
 const signed=proof(Buffer.from(JSON.stringify(record.proof)),ctx,null,candidate,{active:true});
 return {...candidate,signed,files:Object.fromEntries([
  ['manifest.json',{bytes:bytes.length,sha256:parsed.manifestSha256}],
  ...parsed.components.map(c=>[c.filename,{bytes:c.ciphertextBytes,sha256:c.ciphertextSha256}])
 ])};
}
async function observeSlot(path,ctx,expected){
 if(!await exists(path))return {status:'absent',manifestSha256:null};
 try{
  await directory(path,ctx);
  const entries=await readdir(path);
  if(!expected||entries.some(name=>!Object.hasOwn(expected.files,name)))return {status:'unverified',manifestSha256:null};
  for(const name of entries){
   const actual=await hashFile(join(path,name),ctx.uid,name==='manifest.json'?262144:1024**3);
   const declared=expected.files[name];
   if(actual.bytes!==declared.bytes||actual.sha256!==declared.sha256)
    return {status:'unverified',manifestSha256:null};
  }
  if(!same(entries,await readdir(path)))stop('observation_changed');
  return {status:same(entries,Object.keys(expected.files))?'complete':'verified-subset',
   manifestSha256:expected.manifestSha256};
 }catch{return {status:'unverified',manifestSha256:null};}
}
async function observeState(path,ctx,expected){
 if(!await exists(path))return false;
 try{
  const state=JSON.parse((await readObservation(path,ctx,262144)).bytes.toString('utf8'));
  if(!expected||!exactKeys(state,['schema','manifestSha256','proof'])||
   state.schema!=='sabora-vps-rotation-state/v1'||state.manifestSha256!==expected.manifestSha256)return false;
  proof(Buffer.from(JSON.stringify(state.proof)),ctx,null,expected,{active:true});
  return true;
 }catch{return false;}
}
export async function inspectVpsRotationRecovery({root,scope}={}){
 const ctx=await rotationContext(root,scope),lock=join(root,'rotation.lock'),statePath=join(root,'state.json');
 const base={schema:'sabora-vps-rotation-diagnosis/v1',writerExcluded:false,
  deletionAuthorized:false,automaticRecovery:false,operationalReceipt:false};
 const entries=(await readdir(root)).sort();
 if(!entries.includes('rotation.lock')){
  if(!entries.length)return {...base,phase:'empty',recoverableSlots:[],blocked:false};
  if(!same(entries,['current','state.json']))return {...base,phase:'unknown',recoverableSlots:[],blocked:true};
  try{
   const current=await bundle(join(root,'current'),ctx);
   await readState(statePath,ctx,current);
   if(!same(entries,await readdir(root)))stop('observation_changed');
   return {...base,phase:'stable',blocked:false,recoverableSlots:[{slot:'current',manifestSha256:current.manifestSha256}]};
  }catch{return {...base,phase:'unknown',recoverableSlots:[],blocked:true};}
 }
 // No intent is fabricated for a legacy lock or for a torn intent write.
 // Return a conservative classification if metadata is absent/corrupt.
 const unknown={...base,phase:'unknown',blocked:true,recoverableSlots:[]};
 try{
  const observed=await readObservation(lock,ctx,MAX_INTENT);
  const intent=JSON.parse(observed.bytes.toString('utf8'));
  if(!exactKeys(intent,['schema','pid','previous','next'])||intent.schema!==INTENT||
   !Number.isSafeInteger(intent.pid)||intent.pid<1||
   entries.some(n=>!['rotation.lock','current','candidate','previous','state.json'].includes(n)))
   return unknown;
  const previous=intent.previous===null?null:decodeIntentRecord(intent.previous,ctx);
  const next=decodeIntentRecord(intent.next,ctx);
  if(next.signed.previousManifestSha256!==(previous?.manifestSha256??null)||
   (previous&&(next.manifestSha256===previous.manifestSha256||
    next.manifest.backupId===previous.manifest.backupId||
    Date.parse(next.manifest.createdAt)<Date.parse(previous.manifest.createdAt)||
    (previous.manifest.schema===V2&&next.manifest.schema===PREINSTALL_SCHEMA)||
    (previous.manifest.schema===PREINSTALL_SCHEMA&&next.manifest.schema===V2&&
     previous.manifest.plannedMigrationTreeSha256!==next.manifest.migrationTreeSha256))))
   return unknown;
  const oldCurrent=previous?await observeSlot(join(root,'current'),ctx,previous):{status:'unverified'};
  const newCurrent=await observeSlot(join(root,'current'),ctx,next);
  const candidate=await observeSlot(join(root,'candidate'),ctx,next);
  const oldSlot=await observeSlot(join(root,'previous'),ctx,previous);
  const priorState=previous?await observeState(statePath,ctx,previous):!await exists(statePath);
  const nextState=await observeState(statePath,ctx,next);
  const recoverableSlots=[];
  if(oldCurrent.status==='complete')recoverableSlots.push({slot:'current',manifestSha256:previous.manifestSha256});
  if(newCurrent.status==='complete')recoverableSlots.push({slot:'current',manifestSha256:next.manifestSha256});
  if(oldSlot.status==='complete')recoverableSlots.push({slot:'previous',manifestSha256:previous.manifestSha256});
  if(candidate.status==='complete')recoverableSlots.push({slot:'candidate',manifestSha256:next.manifestSha256});
  let phase='unknown';
  if(previous&&oldCurrent.status==='complete'&&priorState&&oldSlot.status==='absent')phase='before-promotion';
  else if(!previous&&newCurrent.status==='absent'&&priorState&&oldSlot.status==='absent')phase='initial-receipt';
  else if(previous&&newCurrent.status==='absent'&&oldSlot.status==='complete'&&candidate.status==='complete'&&priorState)
   phase='between-renames';
  else if(newCurrent.status==='complete'&&candidate.status==='absent'){
   if(nextState&&(oldSlot.status==='complete'||oldSlot.status==='verified-subset'||oldSlot.status==='absent'))
    phase='state-published';
   else if(priorState&&(previous?oldSlot.status==='complete':oldSlot.status==='absent'))phase='promoted-unpublished';
  }
  const finalLock=await readObservation(lock,ctx,MAX_INTENT);
  if(finalLock.sha256!==observed.sha256||!same(entries,await readdir(root)))return unknown;
  return {...base,phase,blocked:true,lockSha256:observed.sha256,recoverableSlots,
   previousRemainder:oldSlot.status,
   previousManifestSha256:previous?.manifestSha256??null,nextManifestSha256:next.manifestSha256};
 }catch{return unknown;}
}
