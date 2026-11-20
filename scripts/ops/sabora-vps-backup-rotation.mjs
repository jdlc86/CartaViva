// Candidate rotation transaction. No production entry point, provisioning,
// network listener, signer, scheduler or key custody is installed by this module.
// Callers must provide independently approved scope and verifier public key.
// The only destructive operation is unlinking the exact, inventoried previous
// bundle AFTER durable promotion and a second verification of the new one.
import {constants} from 'node:fs';
import {lstat,realpath,readdir,readFile,open,rename,unlink,rmdir,statfs} from 'node:fs/promises';
import {join,dirname,basename,resolve,parse,relative,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {replicateEncryptedBackupBundle,inspectEncryptedBackupBundle,parseEncryptedBackupManifest,PREINSTALL_SCHEMA}
 from './sabora-encrypted-backup-bundle.mjs';
import {verifySignedDocument,authorityFingerprint} from './sabora-release-evidence.mjs';
import {exactKeys,trustedDirectory} from './sabora-release-protected-store.mjs';
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
// A persistent inode, outside the rotated slots, carries an OS advisory
// lock. Never remove/replace it (doing so would split the exclusion domain).
// The flock child shares the parent's open-file description; the lock lives
// until that description closes, including process death. rotation.lock is
// still the durable transaction intent, NOT evidence of a live writer.
async function withRotationGuard(root,scope,operation){
 const ctx=await rotationContext(root,scope);
 const parent=dirname(root),guard=join(parent,'.'+basename(root)+'.rotation.guard');
 const fixed=ctx.protectedGuard;
 if(fixed){
  // A root-provisioned inode in a root-owned mount cannot be removed or
  // replaced by the backup account. flock(2) on a read-only fd is valid on
  // local Linux ext4. Never create this guard on demand.
  trustedDirectory(parent);
  const p=await lstat(parent,{bigint:true}),disk=await statfs(parent,{bigint:true});
  if(p.gid!==BigInt(process.getgid())||(p.mode&0o777n)!==0o750n||
   String(p.dev)!==fixed.device||disk.type!==0xef53n)stop('protected_guard_parent');
 }else await directory(parent,ctx);
 const fd=await open(guard,(fixed?constants.O_RDONLY:constants.O_RDWR|constants.O_CREAT)|
  constants.O_NOFOLLOW|constants.O_NONBLOCK,0o600);
 try{
  const opened=await fd.stat({bigint:true}),named=await lstat(guard,{bigint:true});
  if(!opened.isFile()||opened.uid!==BigInt(fixed?0:ctx.uid)||opened.nlink!==1n||
   (opened.mode&0o777n)!==(fixed?0o440n:0o600n)||opened.size!==0n||
   named.dev!==opened.dev||named.ino!==opened.ino||
   (fixed&&(opened.gid!==BigInt(process.getgid())||String(opened.dev)!==fixed.device||
    String(opened.ino)!==fixed.inode)))stop('unsafe_process_guard');
  const result=spawnSync('/usr/bin/flock',['-n','-E','75','3'],{
   stdio:['ignore','ignore','ignore',fd.fd],timeout:5000,env:{PATH:'/usr/bin:/bin',LANG:'C'}});
  if(result.status===75)stop('locked_or_interrupted');
  if(result.error||result.signal||result.status!==0)stop('process_guard_unavailable');
  const locked=await lstat(guard,{bigint:true});
  if(locked.dev!==opened.dev||locked.ino!==opened.ino||locked.nlink!==1n)stop('process_guard_changed');
  if(!fixed){await fd.sync();await syncDir(parent);}
  return await operation(ctx);
 }finally{await fd.close();}
}
// Local and streaming inputs share one lock, proof and promotion transaction.
export async function rotateVerifiedVpsReplica({root,sourceDirectory,scope,proofBytes}={}){
 return withRotationGuard(root,scope,ctx=>rotate({root,sourceDirectory,scope,proofBytes,reader:null,ctx}));
}
export async function receiveVerifiedVpsReplica({root,source,scope}={}){
 const reader=new BackupWireReader(source);
 try{return await withRotationGuard(root,scope,ctx=>rotate({root,scope,reader,ctx}));}finally{reader.close();}
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
 if(scope.protectedGuard!==undefined&&(!lab||uid===0||
  !/^\/var\/lib\/sabora-backup-ci-[0-9]+\/volume\/cache$/.test(root)||
  !exactKeys(scope.protectedGuard,['device','inode'])||
  ![scope.protectedGuard.device,scope.protectedGuard.inode].every(v=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v))))
  stop('protected_guard_scope');
 const ctx={...scope,uid,lab};
 await directory(root,ctx);
 return ctx;
}
async function rotate({root,sourceDirectory,scope,proofBytes,reader,ctx}){
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
  // A separately signed laboratory scope may cap each individual bundle.
  // This bound precedes candidate creation and leaves the old slot intact.
  if(scope.maxBundleBytes!==undefined&&(!Number.isSafeInteger(scope.maxBundleBytes)||
     scope.maxBundleBytes<1||source.bytes>scope.maxBundleBytes||(current?.bytes??0)>scope.maxBundleBytes))
   stop('bundle_budget_exceeded');
  const signed=proof(proofBytes,ctx,current,source);
  if(reader)reader.setExpiry(Date.parse(signed.validUntil));
  if(current&&(source.manifest.backupId===current.manifest.backupId||
      source.manifestSha256===current.manifestSha256||
      Date.parse(source.manifest.createdAt)<Date.parse(current.manifest.createdAt)||
      (current.manifest.schema===V2&&source.manifest.schema===PREINSTALL_SCHEMA)))stop('stale_or_regressive_backup');
  if(current?.manifest.schema===PREINSTALL_SCHEMA&&source.manifest.schema===V2&&
   source.manifest.migrationTreeSha256!==current.manifest.plannedMigrationTreeSha256)
   stop('initial_recovery_plan_not_fulfilled');
  // Persist both signed choices and exact manifest bytes before candidate
  // creation. Recovery can identify even a partially purged previous slot.
  // Replacing the existing lock is atomic: another writer never sees a gap.
  const intent={schema:INTENT,pid:process.pid,
   previous:current?{manifestB64:current.manifestBytes.toString('base64'),proof:previousState.proof}:null,
   next:{manifestB64:source.manifestBytes.toString('base64'),proof:JSON.parse(proofBytes.toString('utf8'))}};
  const intentBytes=Buffer.byteLength(JSON.stringify(intent)+'\n');
  if(intentBytes>MAX_INTENT)stop('intent_too_large');
  const nextStateBytes=Buffer.byteLength(JSON.stringify({schema:'sabora-vps-rotation-state/v1',
   manifestSha256:source.manifestSha256,proof:intent.next.proof})+'\n');
  if(nextStateBytes>262144)stop('state_too_large');
  // Reserve the transient intent and both state files as well as the two
  // ciphertext bundles; the filesystem's physical quota is a separate gate.
  const needed=source.bytes+scope.reserveBytes+intentBytes+nextStateBytes;
  const total=(current?.bytes??0)+(current?(await file(statePath,ctx.uid,262144)).size:0)+needed;
  const space=await statfs(root,{bigint:true});
  if(!Number.isSafeInteger(total)||total>scope.quotaBytes||space.bavail*space.bsize<BigInt(needed))
   stop('insufficient_reserved_capacity');
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

// Narrow, laboratory-only reconciliation candidate. The previous bundle may
// already be partially deleted. The signed intent is the inventory authority;
// never infer permission to unlink from names, the PID or an observation alone.
// No generic cleanup, lock reset, production entry point or automatic retry.
async function inspectPreviousRemainder(path,ctx,expected){
 if(!await exists(path))return {status:'absent',sha256:sha(JSON.stringify({status:'absent'})),items:[]};
 if(!expected)stop('unexpected_previous');
 await directory(path,ctx);
 const entries=(await readdir(path)).sort(),items=[];
 for(const name of entries){
  if(!Object.hasOwn(expected.files,name))stop('unexpected_previous_file');
  const declared=expected.files[name],actual=await hashFile(join(path,name),ctx.uid,name==='manifest.json'?262144:1024**3);
  if(actual.sha256!==declared.sha256||actual.bytes!==declared.bytes)stop('previous_changed');
  items.push({name,sha256:actual.sha256,bytes:actual.bytes,stat:actual.stat});
 }
 if(!same(entries,await readdir(path)))stop('previous_changed');
 const status=same(entries,Object.keys(expected.files))?'complete':'verified-subset';
 return {status,sha256:sha(JSON.stringify({status,files:items.map(({name,sha256,bytes})=>({name,sha256,bytes}))})),items};
}
// Bounded authorization consumption. A single durable counter lives outside
// the rotated slots under the same private parent and OS guard. A torn
// unpublished counter is UNKNOWN: never silently remove or reset it.
// No production provisioning/initialization is authorized by this candidate.
const recoverySequencePaths=root=>{
 const prefix=join(dirname(root),'.'+basename(root)+'.recovery-sequence');
 return {record:prefix+'.json',pending:prefix+'.pending'};
};
async function readRecoverySequence(root,ctx){
 // The dedicated writer may receive backups, but it cannot inspect or
 // consume recovery authorizations in the legacy writer-owned ledger.
 // A separate root-protected recovery controller is not installed yet.
 if(ctx.protectedGuard)stop('independent_recovery_controller_required');
 await directory(dirname(root),ctx);
 const {record,pending}=recoverySequencePaths(root);
 if(await exists(pending))stop('recovery_sequence_interrupted');
 if(!await exists(record))return 0;
 const value=JSON.parse((await readObservation(record,ctx,4096)).bytes.toString('utf8'));
 if(!exactKeys(value,['schema','storageIdentitySha256','externalStorageIdentitySha256',
  'sequence','authorizationSha256','lockSha256'])||value.schema!=='sabora-vps-recovery-sequence/v1'||
  value.storageIdentitySha256!==ctx.storageIdentitySha256||
  value.externalStorageIdentitySha256!==ctx.externalStorageIdentitySha256||
  !Number.isSafeInteger(value.sequence)||value.sequence<1||value.sequence>=Number.MAX_SAFE_INTEGER||
  !hash(value.authorizationSha256)||!hash(value.lockSha256))stop('recovery_sequence_invalid');
 return value.sequence;
}
async function consumeRecoverySequence(root,ctx,auth,authorizationBytes){
 if(auth.sequence!==1+await readRecoverySequence(root,ctx))stop('recovery_authorization_scope_mismatch');
 const {record,pending}=recoverySequencePaths(root);
 const value={schema:'sabora-vps-recovery-sequence/v1',storageIdentitySha256:ctx.storageIdentitySha256,
  externalStorageIdentitySha256:ctx.externalStorageIdentitySha256,sequence:auth.sequence,
  authorizationSha256:sha(authorizationBytes),lockSha256:auth.lockSha256};
 await exclusive(pending,value);await rename(pending,record);await syncDir(dirname(root));
 if(await readRecoverySequence(root,ctx)!==auth.sequence)stop('recovery_sequence_invalid');
}
async function publishedPurgeSubject(root,ctx){
 const lockPath=join(root,'rotation.lock'),statePath=join(root,'state.json'),currentPath=join(root,'current');
 const diagnosis=await inspectVpsRotationRecovery({root,scope:ctx});
 if(diagnosis.phase!=='state-published')stop('recovery_phase_not_supported');
 const lock=await readObservation(lockPath,ctx,MAX_INTENT);
 if(lock.sha256!==diagnosis.lockSha256)stop('observation_changed');
 const intent=JSON.parse(lock.bytes.toString('utf8'));
 const next=decodeIntentRecord(intent.next,ctx);
 const previous=intent.previous===null?null:decodeIntentRecord(intent.previous,ctx);
 if(next.signed.previousManifestSha256!==(previous?.manifestSha256??null))stop('intent_scope_invalid');
 const current=await bundle(currentPath,ctx),state=await readState(statePath,ctx,current);
 if(current.manifestSha256!==next.manifestSha256||
  JSON.stringify(state.proof)!==JSON.stringify(intent.next.proof))stop('recovery_state_mismatch');
 const remainder=await inspectPreviousRemainder(join(root,'previous'),ctx,previous);
 if((await readObservation(lockPath,ctx,MAX_INTENT)).sha256!==lock.sha256)stop('observation_changed');
 return {lock,next,previous,current,remainder};
}
export async function inspectVpsPublishedPurge({root,scope}={}){
 const ctx=await rotationContext(root,scope);
 const subject=await publishedPurgeSubject(root,ctx);
 return Object.freeze({schema:'sabora-vps-published-purge-subject/v1',writerExcluded:false,
  deletionAuthorized:false,lockSha256:subject.lock.sha256,
  currentManifestSha256:subject.next.manifestSha256,previousManifestSha256:subject.previous?.manifestSha256??null,
  previousRemainderSha256:subject.remainder.sha256,previousRemainder:subject.remainder.status,
  sequence:1+await readRecoverySequence(root,ctx)});
}
export async function finishInterruptedVpsPurge({root,scope,authorizationBytes,externalProofBytes}={}){
 // Keep the candidate unavailable to production even for a purportedly valid
 // signature until installed identities, custody, recovery policy and review exist.
 if(scope?.environment!=='disposable-lab')stop('production_reconciliation_not_enabled');
 for(const bytes of [authorizationBytes,externalProofBytes])
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>262144)stop('invalid_recovery_document');
 return withRotationGuard(root,scope,async ctx=>{
  if(authorityFingerprint(ctx.recoveryPublicKey)===authorityFingerprint(ctx.verifierPublicKey))
   stop('recovery_authority_not_independent');
  const subject=await publishedPurgeSubject(root,ctx);
  const auth=verifySignedDocument(authorizationBytes,ctx.recoveryPublicKey,'sabora-vps-purge-authorization/v1');
  if(!exactKeys(auth,['schema','repository','project','environment','action','storageIdentitySha256',
   'externalStorageIdentitySha256','lockSha256','currentManifestSha256','previousManifestSha256',
   'previousRemainderSha256','externalProofSha256','sequence','observedAt','validUntil'])||
   auth.repository!=='jdlc86/CartaViva'||auth.project!=='sabora'||auth.environment!==ctx.environment||
   auth.action!=='finish-published-purge'||
   auth.storageIdentitySha256!==ctx.storageIdentitySha256||auth.externalStorageIdentitySha256!==ctx.externalStorageIdentitySha256||
   auth.lockSha256!==subject.lock.sha256||auth.currentManifestSha256!==subject.next.manifestSha256||
   auth.previousManifestSha256!==(subject.previous?.manifestSha256??null)||
   auth.previousRemainderSha256!==subject.remainder.sha256||auth.externalProofSha256!==sha(externalProofBytes)||
   auth.sequence!==1+await readRecoverySequence(root,ctx))
   stop('recovery_authorization_scope_mismatch');
  const observed=Date.parse(auth.observedAt),expires=Date.parse(auth.validUntil);
  if(!Number.isFinite(observed)||!Number.isFinite(expires)||observed>Date.now()||
   expires<=Date.now()||expires<=observed||expires-observed>3600000)stop('recovery_authorization_time_invalid');
  const fresh=proof(externalProofBytes,ctx,subject.previous,subject.current);
  const until=Math.min(expires,Date.parse(fresh.validUntil));
  const checkTime=()=>{if(Date.now()>=until)stop('recovery_authorization_expired');};
  // Make the retained new bundle and published state durable again, even if
  // the original process died just after rename(stateTemp,state.json).
  const currentPath=join(root,'current'),statePath=join(root,'state.json'),previousPath=join(root,'previous');
  await syncBundle(currentPath,subject.current,ctx);
  const stateFd=await open(statePath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
   const st=await stateFd.stat();
   if(!st.isFile()||st.uid!==ctx.uid||st.nlink!==1||(st.mode&0o077)!==0)stop('unsafe_state');
   await stateFd.sync();
  }finally{await stateFd.close();}
  await syncDir(root);
  // Re-observe after fsync and before touching previous. No third slot,
  // temporary bundle or arbitrary path can enter the purge transaction.
  const ready=await publishedPurgeSubject(root,ctx);
  if(ready.lock.sha256!==subject.lock.sha256||ready.remainder.sha256!==subject.remainder.sha256||
   ready.current.manifestSha256!==subject.current.manifestSha256)stop('recovery_subject_changed');
  checkTime();
  await consumeRecoverySequence(root,ctx,auth,authorizationBytes);
  if(ready.remainder.status!=='absent'){
   for(const item of ready.remainder.items){
    checkTime();
    const p=join(previousPath,item.name),actual=await hashFile(p,ctx.uid,item.name==='manifest.json'?262144:1024**3);
    if(actual.sha256!==item.sha256||actual.bytes!==item.bytes||actual.stat.ino!==item.stat.ino||
     actual.stat.dev!==item.stat.dev||actual.stat.ctimeMs!==item.stat.ctimeMs)stop('previous_changed');
    await unlink(p);
   }
   await syncDir(previousPath);await rmdir(previousPath);await syncDir(root);
  }
  const confirmed=await bundle(currentPath,ctx);
  await readState(statePath,ctx,confirmed);
  if(confirmed.manifestSha256!==subject.next.manifestSha256||
   !same(await readdir(root),['current','state.json','rotation.lock'])||
   (await readObservation(join(root,'rotation.lock'),ctx,MAX_INTENT)).sha256!==subject.lock.sha256)
   stop('recovery_final_state_changed');
  checkTime();
  await unlink(join(root,'rotation.lock'));await syncDir(root);
  return Object.freeze({schema:'sabora-vps-purge-reconciliation-result/v1',
   currentManifestSha256:confirmed.manifestSha256,generations:1,operationalReceipt:false});
 });
}


// Separate, named recovery transitions. No path, shell command, generic
// deletion or phase choice is accepted from the signed document. A
// transition either preserves an authenticated bundle or refuses to change
// anything. Production remains unreachable.
const RECOVERY_ACTIONS=Object.freeze({
 'initial-receipt':'discard-verified-candidate',
 'before-promotion':'discard-verified-candidate',
 'between-renames':'restore-predecessor-name',
 'promoted-unpublished':'publish-promoted-state'
});
async function syncRecoveryState(path,ctx){
 const before=await file(path,ctx.uid,262144);
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const st=await fd.stat();
  if(st.dev!==before.dev||st.ino!==before.ino||st.ctimeMs!==before.ctimeMs)stop('recovery_state_changed');
  await fd.sync();
 }finally{await fd.close();}
}
async function transitionSubject(root,ctx){
 const lockPath=join(root,'rotation.lock'),statePath=join(root,'state.json');
 const diagnosis=await inspectVpsRotationRecovery({root,scope:ctx});
 const action=RECOVERY_ACTIONS[diagnosis.phase];
 if(!action)stop('recovery_phase_not_supported');
 const lock=await readObservation(lockPath,ctx,MAX_INTENT);
 if(lock.sha256!==diagnosis.lockSha256)stop('observation_changed');
 const intent=JSON.parse(lock.bytes.toString('utf8'));
 const next=decodeIntentRecord(intent.next,ctx);
 const previous=intent.previous===null?null:decodeIntentRecord(intent.previous,ctx);
 if(next.signed.previousManifestSha256!==(previous?.manifestSha256??null))stop('intent_scope_invalid');
 let keep=null,keepRecord,keepSlot=null,remainder,prior;
 const previousPath=join(root,'previous'),candidatePath=join(root,'candidate');
 if(diagnosis.phase==='between-renames'){
  keepSlot='previous';keepRecord=previous;
 }else if(diagnosis.phase==='before-promotion'){
  keepSlot='current';keepRecord=previous;
 }else if(diagnosis.phase==='promoted-unpublished'){
  keepSlot='current';keepRecord=next;
 }else keepRecord=next;
 if(keepSlot){
  keep=await bundle(join(root,keepSlot),ctx);
  if(keep.manifestSha256!==keepRecord?.manifestSha256)stop('recovery_state_mismatch');
 }
 if(previous){
  // Even when its directory is temporarily named previous, the published
  // predecessor state must be exactly the authenticated historical record.
  prior=await readObservation(statePath,ctx,262144);
  const state=JSON.parse(prior.bytes.toString('utf8'));
  if(!exactKeys(state,['schema','manifestSha256','proof'])||
   state.schema!=='sabora-vps-rotation-state/v1'||
   state.manifestSha256!==previous.manifestSha256||
   JSON.stringify(state.proof)!==JSON.stringify(intent.previous.proof))stop('recovery_state_mismatch');
 }else if(await exists(statePath))stop('recovery_state_mismatch');
 if(action==='publish-promoted-state'){
  remainder=await inspectPreviousRemainder(previousPath,ctx,previous);
  if(remainder.status!==(previous?'complete':'absent'))stop('recovery_previous_incomplete');
 }else{
  remainder=await inspectPreviousRemainder(candidatePath,ctx,next);
  if(action==='restore-predecessor-name'&&remainder.status!=='complete')stop('recovery_candidate_incomplete');
 }
 if((await readObservation(lockPath,ctx,MAX_INTENT)).sha256!==lock.sha256)stop('observation_changed');
 const identity={phase:diagnosis.phase,action,lockSha256:lock.sha256,
  previousManifestSha256:previous?.manifestSha256??null,nextManifestSha256:next.manifestSha256,
  retainedManifestSha256:keepRecord.manifestSha256,remainderSha256:remainder.sha256,
  priorStateSha256:prior?.sha256??null};
 return {identity,subjectSha256:sha(JSON.stringify(identity)),lock,intent,next,previous,
  keep,keepRecord,keepSlot,remainder,prior,action};
}
export async function inspectVpsRecoveryTransition({root,scope}={}){
 const ctx=await rotationContext(root,scope);
 const subject=await transitionSubject(root,ctx);
 return Object.freeze({schema:'sabora-vps-recovery-transition-subject/v1',
  ...subject.identity,subjectSha256:subject.subjectSha256,sequence:1+await readRecoverySequence(root,ctx),
  remainder:subject.remainder.status,writerExcluded:false,deletionAuthorized:false});
}
export async function applyVpsRecoveryTransition({root,scope,authorizationBytes,externalProofBytes}={}){
 if(scope?.environment!=='disposable-lab')stop('production_reconciliation_not_enabled');
 for(const bytes of [authorizationBytes,externalProofBytes])
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>262144)stop('invalid_recovery_document');
 return withRotationGuard(root,scope,async ctx=>{
  if(authorityFingerprint(ctx.recoveryPublicKey)===authorityFingerprint(ctx.verifierPublicKey))
   stop('recovery_authority_not_independent');
  const subject=await transitionSubject(root,ctx);
  const auth=verifySignedDocument(authorizationBytes,ctx.recoveryPublicKey,'sabora-vps-recovery-transition/v1');
  if(!exactKeys(auth,['schema','repository','project','environment','action','storageIdentitySha256',
   'externalStorageIdentitySha256','lockSha256','subjectSha256','externalProofSha256',
   'sequence','observedAt','validUntil'])||
   auth.repository!=='jdlc86/CartaViva'||auth.project!=='sabora'||auth.environment!==ctx.environment||
   auth.action!==subject.action||auth.storageIdentitySha256!==ctx.storageIdentitySha256||
   auth.externalStorageIdentitySha256!==ctx.externalStorageIdentitySha256||
   auth.lockSha256!==subject.lock.sha256||auth.subjectSha256!==subject.subjectSha256||
   auth.externalProofSha256!==sha(externalProofBytes)||auth.sequence!==1+await readRecoverySequence(root,ctx))
   stop('recovery_authorization_scope_mismatch');
  const observed=Date.parse(auth.observedAt),expires=Date.parse(auth.validUntil);
  if(!Number.isFinite(observed)||!Number.isFinite(expires)||observed>Date.now()||
   expires<=Date.now()||expires<=observed||expires-observed>3600000)stop('recovery_authorization_time_invalid');
  // Fresh proof of the generation that must remain independently
  // recoverable; for an initial discard only the external copy remains.
  const predecessor=subject.keepRecord.signed.previousManifestSha256;
  const fresh=proof(externalProofBytes,ctx,predecessor===null?null:{manifestSha256:predecessor},subject.keepRecord);
  const until=Math.min(expires,Date.parse(fresh.validUntil));
  const checkTime=()=>{if(Date.now()>=until)stop('recovery_authorization_expired');};
  const statePath=join(root,'state.json'),candidatePath=join(root,'candidate');
  const lockPath=join(root,'rotation.lock'),currentPath=join(root,'current'),previousPath=join(root,'previous');
  if(subject.keep)await syncBundle(join(root,subject.keepSlot),subject.keep,ctx);
  if(subject.prior)await syncRecoveryState(statePath,ctx);
  await syncDir(root);
  const ready=await transitionSubject(root,ctx);
  if(ready.subjectSha256!==subject.subjectSha256)stop('recovery_subject_changed');
  checkTime();
  await consumeRecoverySequence(root,ctx,auth,authorizationBytes);
  checkTime();
  if(ready.action==='restore-predecessor-name'){
   // A rename back to the published name restores the old usable bundle.
   // Leave the exact candidate and intent for a separately authorized discard.
   await rename(previousPath,currentPath);await syncDir(root);
   const after=await transitionSubject(root,ctx);
   if(after.identity.phase!=='before-promotion'||after.lock.sha256!==ready.lock.sha256||
    after.identity.retainedManifestSha256!==ready.identity.retainedManifestSha256)stop('recovery_final_state_changed');
   return Object.freeze({schema:'sabora-vps-recovery-transition-result/v1',action:ready.action,
    phase:'before-promotion',blocked:true,operationalReceipt:false});
  }
  if(ready.action==='publish-promoted-state'){
   const partial=join(root,'.state-'+randomBytes(16).toString('hex'));
   await exclusive(partial,{schema:'sabora-vps-rotation-state/v1',manifestSha256:ready.next.manifestSha256,
    proof:ready.intent.next.proof});
   checkTime();await rename(partial,statePath);await syncDir(root);
   const after=await publishedPurgeSubject(root,ctx);
   if(after.lock.sha256!==ready.lock.sha256||
    after.current.manifestSha256!==ready.next.manifestSha256)stop('recovery_final_state_changed');
   // Separate authorization required before deletion of previous.
   return Object.freeze({schema:'sabora-vps-recovery-transition-result/v1',action:ready.action,
    phase:'state-published',blocked:true,operationalReceipt:false});
  }
  // Discard only bytes still matching the signed candidate inventory.
  // A truncated or otherwise unverified component is not eligible.
  if(ready.remainder.status!=='absent'){
   for(const item of ready.remainder.items){
    checkTime();
    const p=join(candidatePath,item.name),actual=await hashFile(p,ctx.uid,item.name==='manifest.json'?262144:1024**3);
    if(actual.sha256!==item.sha256||actual.bytes!==item.bytes||actual.stat.ino!==item.stat.ino||
     actual.stat.dev!==item.stat.dev||actual.stat.ctimeMs!==item.stat.ctimeMs)stop('candidate_changed');
    await unlink(p);
   }
   await syncDir(candidatePath);await rmdir(candidatePath);await syncDir(root);
  }
  if(ready.previous){
   const retained=await bundle(currentPath,ctx);
   await readState(statePath,ctx,retained);
   if(retained.manifestSha256!==ready.previous.manifestSha256)stop('recovery_final_state_changed');
  }
  const finalEntries=ready.previous?['current','state.json','rotation.lock']:['rotation.lock'];
  if(!same(await readdir(root),finalEntries)||
   (await readObservation(lockPath,ctx,MAX_INTENT)).sha256!==ready.lock.sha256)stop('recovery_final_state_changed');
  checkTime();await unlink(lockPath);await syncDir(root);
  return Object.freeze({schema:'sabora-vps-recovery-transition-result/v1',action:ready.action,
   phase:ready.previous?'stable':'empty',blocked:false,operationalReceipt:false});
 });
}
