// Offline recovery coordinator for the disposable dedicated receiver ONLY.
// Root controls authorization and the sequence. The exact child UID/GID
// observes and repairs ciphertext slots while holding the protected guard.
// Never reachable through SSH; no production activation or automatic retry.
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {readFile,lstat,readdir} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {connect} from 'node:net';
import {protectedBytes,trustedDirectory,exactKeys,sha256,acquireReleaseLock} from './sabora-release-protected-store.mjs';
import {verifySignedDocument,authorityFingerprint} from './sabora-release-evidence.mjs';
import {validateBackupPreparationManifest} from './sabora-backup-installation-plan.mjs';
import {validateRecoveryControlRecord,verifyExternalRecoveryCheckpoint} from './sabora-backup-recovery-checkpoint.mjs';
import {reserveLocalRecoveryCheckpoint} from './sabora-backup-checkpoint-custodian.mjs';
import {runCoordinatedLabRecoveryWorker} from './sabora-vps-backup-rotation.mjs';

const file=fileURLToPath(import.meta.url);
const base=resolve(dirname(file),'../../..');
const stop=code=>{throw Error('sabora_backup_recovery_coordinator_stop:'+code);};
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
const ops=['inspect-transition','inspect-purge','apply-transition','apply-purge'];
const maxDocument=262144;
function bytes(value){
 if(typeof value!=='string'||value.length<1||value.length>Math.ceil(maxDocument/3)*4||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(value))stop('document_encoding');
 const decoded=Buffer.from(value,'base64');
 if(decoded.length>maxDocument||decoded.toString('base64')!==value)stop('document_encoding');
 return decoded;
}
function local(bin,args){
 const r=spawnSync(bin,args,{encoding:'utf8',timeout:5000,maxBuffer:65536,
  env:{PATH:'/usr/bin:/bin',LANG:'C'}});
 if(r.error||r.signal)stop('local_probe_failed');
 return r;
}
async function assertOffline(config){
 // Check only the provisioned disposable account and signed loopback port.
 // The caller must stop its private listener first; never terminate a host
 // service or kill processes by username as part of recovery.
 for(const flag of ['-u','-U']){
  const r=local('/usr/bin/pgrep',[flag,String(config.uid)]);
  if(r.status!==1)stop('writer_not_quiescent');
 }
 const closed=await new Promise(resolve=>{
  const socket=connect(config.port,'127.0.0.1');
  const finish=ok=>{socket.destroy();resolve(ok);};
  socket.setTimeout(500,()=>finish(false));
  socket.once('connect',()=>finish(false));
  socket.once('error',error=>finish(error.code==='ECONNREFUSED'));
 });
 if(!closed)stop('listener_not_offline');
}
function loadConfig(){
 if(process.platform!=='linux'||process.getuid()!==0||process.geteuid()!==0||
  !/^\/var\/lib\/sabora-backup-ci-[0-9]+$/.test(base)||
  file!==join(base,'code/scripts/ops/sabora-backup-recovery-coordinator.mjs')||
  process.execPath!==join(base,'bin/node'))stop('disposable_root_only');
 trustedDirectory(base);
 const rootBytes=(p,maxBytes)=>protectedBytes(p,{uid:0,maxBytes});
 const owner=rootBytes(join(base,'owner-public.pem'),4096).toString('utf8');
 const config=verifySignedDocument(rootBytes(join(base,'scope.json'),262144),owner,'sabora-backup-governed-lab/v1');
 if(!exactKeys(config,['schema','repository','project','environment','sourceSha','artifactSha256','nodeSha256',
  'shellSha256','uid','gid','port','volume','cache','device','filesystemBytes','scope'])||
  config.repository!=='jdlc86/CartaViva'||config.project!=='sabora'||config.environment!=='disposable-lab'||
  !Number.isSafeInteger(config.uid)||config.uid<=0||!Number.isSafeInteger(config.gid)||config.gid<=0||
  !Number.isInteger(config.port)||config.port<1024||config.port>65535||
  config.volume!==join(base,'volume')||config.cache!==join(base,'volume/cache')||
  ![config.artifactSha256,config.nodeSha256,config.shellSha256].every(hex)||
  !exactKeys(config.scope,['environment','systemIdentifier','storageIdentitySha256','externalStorageIdentitySha256',
   'verifierPublicKey','recoveryPublicKey','quotaBytes','reserveBytes','maxBundleBytes','protectedGuard'])||
  config.scope.environment!=='disposable-lab'||config.scope.protectedGuard?.device!==config.device||
  new Set([owner,config.scope.verifierPublicKey,config.scope.recoveryPublicKey].map(authorityFingerprint)).size!==3)
  stop('scope');
 const code=join(base,'code'),artifact=rootBytes(join(code,'artifact.json'),262144);
 const manifest=validateBackupPreparationManifest(artifact);
 if(sha256(artifact)!==config.artifactSha256||manifest.sourceSha!==config.sourceSha)stop('artifact_identity');
 for(const [name,digest] of Object.entries(manifest.files))
  if(sha256(rootBytes(join(code,name),2*1024**2))!==digest)stop('artifact_content');
 if(sha256(rootBytes(process.execPath,160*1024**2))!==config.nodeSha256||
  sha256(rootBytes(join(base,'bin/receive'),1024**2))!==config.shellSha256)stop('runtime_identity');
 const account='sabora-bk-ci-'+base.match(/[0-9]+$/)[0];
 const passwd=local('/usr/bin/getent',['passwd',account]);
 const entry=passwd.stdout.trim().split(':');
 const groups=local('/usr/bin/id',['-G',account]);
 if(passwd.status!==0||entry.length!==7||entry[0]!==account||entry[2]!==String(config.uid)||
  entry[3]!==String(config.gid)||entry[5]!=='/nonexistent'||entry[6]!==join(base,'bin/receive')||
  groups.status!==0||groups.stdout.trim()!==String(config.gid))stop('account_identity');
 return config;
}
function validateRequest(request,scope){
 const inspect=request&&['inspect-transition','inspect-purge'].includes(request.operation);
 if(!exactKeys(request,inspect?['operation']:['operation','authorizationB64','externalProofB64'])||
  !ops.includes(request.operation))stop('request_contract');
 if(inspect)return {inspect,operation:request.operation};
 const authorizationBytes=bytes(request.authorizationB64),externalProofBytes=bytes(request.externalProofB64);
 const auth=verifySignedDocument(authorizationBytes,scope.recoveryPublicKey,
  request.operation==='apply-purge'?'sabora-vps-purge-authorization/v1':'sabora-vps-recovery-transition/v1');
 const proof=verifySignedDocument(externalProofBytes,scope.verifierPublicKey,'sabora-vps-rotation-proof/v1');
 for(const doc of [auth,proof]){
  if(doc.repository!=='jdlc86/CartaViva'||doc.project!=='sabora'||doc.environment!==scope.environment||
   doc.storageIdentitySha256!==scope.storageIdentitySha256||
   doc.externalStorageIdentitySha256!==scope.externalStorageIdentitySha256)stop('document_scope');
  const from=Date.parse(doc.observedAt),until=Date.parse(doc.validUntil),now=Date.now();
  if(!Number.isFinite(from)||!Number.isFinite(until)||from>now||until<=now||until<=from)stop('document_time');
 }
 if(auth.externalProofSha256!==sha256(externalProofBytes))stop('external_proof_identity');
 return {inspect,operation:request.operation,authorizationBytes,externalProofBytes,auth};
}
function runWorker(config,request,validated,fence){
 return new Promise((resolve,reject)=>{
  const child=spawn('/usr/bin/setpriv',['--reuid',String(config.uid),'--regid',String(config.gid),
   '--clear-groups','--no-new-privs','--',process.execPath,file,'--worker'],
   {cwd:base,env:{PATH:'/usr/bin:/bin',LANG:'C'},stdio:['ignore','ignore','ignore','ipc']});
  let result=null,consumed=false,failure=null,reservationTask=null;
  // Keep the fence held until the exact child exits, including on failure.
  // An expired or killed worker leaves a consumed authorization consumed.
  function fail(reason){
   if(!failure)failure=Error('sabora_backup_recovery_coordinator_stop:'+reason);
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  }
  const timer=setTimeout(()=>fail('worker_deadline'),120000);
  const hardTimer=setTimeout(()=>{
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  },122000);
  child.on('error',()=>fail('worker_spawn'));
  child.on('message',async message=>{
   if(failure)return;
   try{
    if(exactKeys(message,['type','expected'])&&message.type==='reserve'){
     if(validated.inspect||result||consumed||reservationTask)stop('unexpected_reservation');
     // The guard remains held by the worker; the outer controller lock
     // remains held until the asynchronous reservation settles, even if
     // the worker dies. Never deliver an ACK after a failed worker.
     reservationTask=Promise.resolve().then(()=>fence.reserve(message.expected,validated.authorizationBytes));
     const reservation=await reservationTask;
     if(failure||child.exitCode!==null||child.signalCode!==null)stop('reservation_delivery_unknown');
     consumed=true;
     child.send({type:'reserved',reservation},error=>{if(error)fail('reservation_delivery_unknown');});
    }else if(exactKeys(message,['type','result'])&&message.type==='result'&&!result){
     if(!validated.inspect&&!consumed)stop('reservation_missing');
     const expectedSchema={
      'inspect-transition':'sabora-vps-recovery-transition-subject/v1',
      'inspect-purge':'sabora-vps-published-purge-subject/v1',
      'apply-transition':'sabora-vps-recovery-transition-result/v1',
      'apply-purge':'sabora-vps-purge-reconciliation-result/v1'
     }[validated.operation];
     if(message.result?.schema!==expectedSchema||
      (validated.inspect?(message.result.sequence!==fence.sequence+1||message.result.deletionAuthorized!==false):
       message.result.operationalReceipt!==false))stop('worker_result');
     result=message.result;
    }else if(exactKeys(message,['type','reason'])&&message.type==='failure'&&
     typeof message.reason==='string'&&/^sabora_(rotation|backup_recovery_coordinator)_stop:[a-z_]+$/.test(message.reason)){
     failure=Error(message.reason);
    }else stop('worker_protocol');
   }catch(error){
    // Keep typed failures, not worker-supplied paths or data.
    const reason=String(error.message??'');
    if(/^sabora_(backup_recovery_fence|backup_recovery_coordinator|backup_custodian|backup_checkpoint|controller)_stop:[a-z_]+$/.test(reason))
     failure=Error(reason);
    fail('worker_protocol_or_reservation');
   }
  });
  child.once('close',async (status,signal)=>{
   clearTimeout(timer);clearTimeout(hardTimer);
   if(reservationTask)try{await reservationTask;}catch{fail('worker_protocol_or_reservation');}
   if(failure)return reject(failure);
   if(status!==0||signal!==null||!result)return reject(Error('sabora_backup_recovery_coordinator_stop:worker_outcome_unknown'));
   resolve(result);
  });
  try{
   child.send({type:'request',root:config.cache,scope:config.scope,sequence:fence.sequence,request},
    error=>{if(error)fail('request_delivery');});
  }catch{fail('request_delivery');}
 });
}
// This exchange is available ONLY in the root disposable coordinator. The
// unprivileged operator fixture holds signing keys outside the root process.
// No network, shell, paths or commands can be supplied over this channel.
async function withCheckpointFence(config,validated,exchange,operation){
 const directory=join(base,'checkpoint-control'),records=join(directory,'records');
 trustedDirectory(directory,{privateDirectory:true});trustedDirectory(records,{privateDirectory:true});
 for(const path of [directory,records]){
  const st=await lstat(path,{bigint:true});
  if(st.gid!==0n||(st.mode&0o7777n)!==0o700n||String(st.dev)===config.device)
   stop('recovery_control_identity');
 }
 const ownerPublicKey=protectedBytes(join(base,'owner-public.pem'),{maxBytes:4096}).toString('utf8');
 const signed=verifySignedDocument(protectedBytes(join(base,'checkpoint.json'),{maxBytes:262144}),
  ownerPublicKey,'sabora-backup-lab-checkpoint-config/v1');
 if(!exactKeys(signed,['schema','sourceSha','expected','checkpointPublicKey'])||signed.sourceSha!==config.sourceSha||
  signed.expected?.environment!=='disposable-lab'||
  signed.expected.storageIdentitySha256!==config.scope.storageIdentitySha256||
  signed.expected.externalStorageIdentitySha256!==config.scope.externalStorageIdentitySha256||
  signed.expected.recoveryAuthoritySha256!==authorityFingerprint(config.scope.recoveryPublicKey))
  stop('checkpoint_configuration');
 const localConfig={expected:signed.expected,ownerPublicKey,checkpointPublicKey:signed.checkpointPublicKey,
  recoveryPublicKey:config.scope.recoveryPublicKey,verificationPublicKey:config.scope.verifierPublicKey};
 const unlock=acquireReleaseLock(directory);
 try{
  if((await readdir(directory)).sort().join('|')!=='controller.lock|records'||
   (await readdir(records)).sort().join('|')!=='record.json')stop('checkpoint_unreconciled');
  const record=JSON.parse(protectedBytes(join(records,'record.json'),{maxBytes:8192,privateFile:true}).toString('utf8'));
  validateRecoveryControlRecord(record,localConfig.expected);
  if(!validated.inspect&&validated.auth.sequence!==record.sequence+1)stop('authorization_sequence');
  const observeExternal=challenge=>exchange({type:'observe',challenge});
  const challenge=randomBytes(32).toString('hex');
  verifyExternalRecoveryCheckpoint({...localConfig,record,challenge,checkpointBytes:await observeExternal(challenge)});
  let used=false;
  return await operation(Object.freeze({sequence:record.sequence,async reserve(subject,authorizationBytes){
   if(used||validated.inspect)stop('unexpected_reservation');
   used=true;
   const reservation=await reserveLocalRecoveryCheckpoint({directory:records,config:localConfig,subject,
    authorizationBytes,externalProofBytes:validated.externalProofBytes,observeExternal,
    advanceExternal:envelope=>exchange({type:'advance',payload:envelope.payload,
     authorizationB64:envelope.authorizationBytes.toString('base64'),externalProofB64:envelope.externalProofBytes.toString('base64')})});
   // Adapt the real reservation to the already closed worker IPC contract.
   // No worker is allowed to mutate until both durable records advanced.
   return Object.freeze({schema:'sabora-protected-recovery-reservation/v1',sequence:reservation.sequence,
    authorizationSha256:reservation.authorizationSha256,lockSha256:reservation.lockSha256,
    slotsChanged:false,operationalAuthorization:false});
  }}));
 }finally{unlock();}
}
async function coordinate(config,request,exchange){
 const validated=validateRequest(request,config.scope);
 await assertOffline(config);
 return withCheckpointFence(config,validated,exchange,async fence=>{
  await assertOffline(config);
  const result=await runWorker(config,request,validated,fence);
  await assertOffline(config);
  return Object.freeze({schema:'sabora-backup-offline-recovery-result/v1',result,operationalAuthorization:false});
 });
}
async function worker(){
 if(process.platform!=='linux'||process.getuid()===0||!process.connected||
  !/^\/var\/lib\/sabora-backup-ci-[0-9]+$/.test(base))stop('worker_context');
 const message=await new Promise((ok,no)=>{
  const timer=setTimeout(()=>no(Error('sabora_backup_recovery_coordinator_stop:request_timeout')),10000);
  process.once('message',value=>{clearTimeout(timer);ok(value);});
 });
 if(!exactKeys(message,['type','root','scope','sequence','request'])||message.type!=='request'||
  message.root!==join(base,'volume/cache'))stop('worker_request');
 const request=message.request;
 const validated=validateRequest(request,message.scope);
 const result=await runCoordinatedLabRecoveryWorker({root:message.root,scope:message.scope,sequence:message.sequence,
  operation:validated.operation,authorizationBytes:validated.authorizationBytes,externalProofBytes:validated.externalProofBytes});
 await new Promise((ok,no)=>process.send({type:'result',result},error=>error?no(error):ok()));
 process.disconnect();
}
async function runOfflineExchange(){
 // Gate before reading operator input. This is not an installed endpoint.
 const config=loadConfig();
 const lines=createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
 const iterator=lines[Symbol.asyncIterator]();
 async function readMessage(limit){
  let timer;
  try{
   const next=await Promise.race([iterator.next(),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('sabora_backup_recovery_coordinator_stop:exchange_timeout')),8000);
   })]);
   if(next.done||Buffer.byteLength(next.value)>limit)stop('exchange_message');
   return JSON.parse(next.value);
  }finally{clearTimeout(timer);}
 }
 try{
  const request=await readMessage(750000);
  const exchange=async prompt=>{
   process.stdout.write(JSON.stringify(prompt)+'\n');
   const reply=await readMessage(22000);
   if(!exactKeys(reply,['type','checkpointB64'])||reply.type!=='checkpoint')stop('exchange_reply');
   const response=bytes(reply.checkpointB64);
   if(response.length>16384)stop('exchange_reply');
   return response;
  };
  const result=await coordinate(config,request,exchange);
  process.stdout.write(JSON.stringify(result)+'\n');
 }finally{lines.close();process.stdin.destroy();}
}
if(process.argv[1]&&resolve(process.argv[1])===file){
 try{
  if(process.argv.length===3&&process.argv[2]==='--worker')await worker();
  else if(process.argv.length===2)await runOfflineExchange();
  else stop('arguments');
 }catch(error){
  const reason=/^sabora_(rotation|backup_recovery_fence|backup_recovery_coordinator|backup_custodian|backup_checkpoint|controller)_stop:[a-z_]+$/.test(String(error.message))
   ?error.message:'sabora_backup_recovery_coordinator_stop:rejected';
  if(process.connected&&process.getuid()!==0){
   const typed=/^sabora_(rotation|backup_recovery_coordinator)_stop:/.test(reason)?reason:'sabora_backup_recovery_coordinator_stop:worker_rejected';
   await new Promise(ok=>process.send({type:'failure',reason:typed},()=>ok()));
   if(process.connected)process.disconnect();
  }else process.stderr.write(reason+'\n');
  process.exitCode=1;
 }
}
