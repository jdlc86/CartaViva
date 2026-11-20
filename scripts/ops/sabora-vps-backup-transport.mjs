// Candidate OpenSSH sender: explicit endpoint, pinned host, fixed command,
// ciphertext streaming only. Remote endpoints require distinct signed
// installation activation; no automatic retry.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {lstat,realpath,open,readFile} from 'node:fs/promises';
import {isAbsolute,resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifiedNtfsAclDigest} from './sabora-ntfs-acl-verifier.mjs';
import {encodeVpsBackupStream} from './sabora-vps-backup-wire.mjs';
import {exactKeys,protectedBytes,sha256} from './sabora-release-protected-store.mjs';
import {verifyInstalledBackupActivation,sshEd25519Sha256} from './sabora-backup-installed-contract.mjs';
import {verifySignedDocument} from './sabora-release-evidence.mjs';
import {parseEncryptedBackupManifest} from './sabora-encrypted-backup-bundle.mjs';
export const BACKUP_RECEIVE_COMMAND='sabora-backup-receive-v1';
const stop=code=>{throw Error('sabora_backup_transport_stop:'+code);};
const sha=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
async function canonicalFilePath(path){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||/["\r\n\x00%~$]/.test(path)||
  await realpath(path)!==path)stop('local_file_path_invalid');
}
async function localFile(path,{privateFile=false}={}){
 await canonicalFilePath(path);
 const st=await lstat(path);
 if(!st.isFile()||st.isSymbolicLink()||st.size<1)stop('local_file_invalid');
 if(st.nlink!==1)stop('local_file_link_count_invalid');
 if(process.platform!=='win32'&&(privateFile?(st.mode&0o077)!==0:(st.mode&0o022)!==0))
  stop('local_file_permissions_invalid');
 return path;
}
// Windows may service system binaries through legitimate NTFS hard links.
// The exception is confined to the canonical native OpenSSH executable,
// never to a caller-selected binary or any key, pin or ciphertext file.
async function verifyWindowsNativeClient(path,expectedDigest){
 const native=join(process.env.SystemRoot??'C:\\Windows','System32','OpenSSH','ssh.exe');
 const canonical=await realpath(native);
 if(path!==canonical)stop('windows_client_path_invalid');
 await canonicalFilePath(path);
 const original=await lstat(native),before=await lstat(path);
 if(original.isSymbolicLink()||!original.isFile()||!before.isFile()||before.isSymbolicLink()||
  !Number.isInteger(before.nlink)||before.nlink<1||before.size<1||before.size>32*1024**2||
  original.dev!==before.dev||original.ino!==before.ino)stop('windows_client_file_invalid');
 const handle=await open(path,'r');
 try{
  const sameFile=st=>st.isFile()&&st.dev===before.dev&&st.ino===before.ino&&
   st.size===before.size&&st.nlink===before.nlink&&st.ctimeMs===before.ctimeMs&&st.mtimeMs===before.mtimeMs;
  if(!sameFile(await handle.stat()))stop('windows_client_changed');
  const bytes=await handle.readFile();
  if(bytes.length!==before.size||!sameFile(await handle.stat())||!sameFile(await lstat(path)))
   stop('windows_client_changed');
  if(createHash('sha256').update(bytes).digest('hex')!==expectedDigest)stop('windows_client_identity_invalid');
 }finally{await handle.close();}
}
// No user ssh_config, agent, proxy, forwarding, shell or password fallback.
// Windows uses the existing OS DACL verifier and exact expected observations
// for its disposable private directory, key and pinned known-hosts file. These
// expectations are caller-supplied laboratory inputs, not an approval dossier.
export async function backupLabSshArguments(endpoint){return backupSshArguments(endpoint,null);}
async function backupSshArguments(endpoint,installation){
 const windows=process.platform==='win32';
 const fields=['environment','host','port','user','sshBinary','identityFile','knownHostsFile',...(windows?['windowsAcl']:[])];
 if(!exactKeys(endpoint,fields)||
  (installation?(endpoint.environment!=='production'||endpoint.host!==installation.plan.transport.listenAddress||
   endpoint.port!==installation.plan.transport.port||endpoint.user!==installation.plan.account):
   (endpoint.environment!=='disposable-lab'||endpoint.host!=='127.0.0.1'))||
  !Number.isInteger(endpoint.port)||endpoint.port<1024||endpoint.port>65535||
  typeof endpoint.user!=='string'||!/^[a-z_][a-z0-9_-]{0,31}$/.test(endpoint.user))
  stop('endpoint_not_authorized');
 if(!windows){
  await localFile(endpoint.sshBinary);
  if(installation&&(process.platform!=='linux'||endpoint.sshBinary!==await realpath('/usr/bin/ssh')||
   sha256(protectedBytes(endpoint.sshBinary,{maxBytes:32*1024**2}))!==installation.activation.senderBinarySha256))
   stop('installed_sender_identity');
 }
 await localFile(endpoint.identityFile,{privateFile:true});
 const knownFile=await localFile(endpoint.knownHostsFile);
 if(windows){
  const expected=endpoint.windowsAcl;
  if(!exactKeys(expected,['directorySha256','identitySha256','knownHostsSha256','clientBinarySha256','knownHostsContentSha256'])||
   !Object.values(expected).every(sha)||dirname(endpoint.identityFile)!==dirname(knownFile))stop('windows_acl_receipt_required');
  if(installation&&expected.clientBinarySha256!==installation.activation.senderBinarySha256)stop('installed_sender_identity');
  await verifyWindowsNativeClient(endpoint.sshBinary,expected.clientBinarySha256);
  if((await lstat(knownFile)).size>16384)stop('windows_client_identity_invalid');
  if(createHash('sha256').update(await readFile(knownFile)).digest('hex')!==expected.knownHostsContentSha256)
   stop('windows_client_identity_invalid');
  if(verifiedNtfsAclDigest(dirname(knownFile))!==expected.directorySha256||
   verifiedNtfsAclDigest(endpoint.identityFile)!==expected.identitySha256||
   verifiedNtfsAclDigest(knownFile)!==expected.knownHostsSha256)stop('windows_acl_receipt_mismatch');
 }
 if(installation){
  if((await lstat(knownFile)).size>16384)stop('installed_host_pin');
  const prefix='['+endpoint.host+']:'+endpoint.port+' ';
  const pin=(await readFile(knownFile,'utf8')).replace(/\r?\n$/,'');
  if(!pin.startsWith(prefix)||sshEd25519Sha256(pin.slice(prefix.length))!==installation.plan.transport.hostKeySha256)
   stop('installed_host_pin');
 }
 const known=knownFile.replaceAll('\\','/');
 return ['-F','none','-T','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','IdentityAgent=none',
  '-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile="'+known+'"','-o','GlobalKnownHostsFile=none',
  '-o','UpdateHostKeys=no','-o','HostKeyAlgorithms=ssh-ed25519','-o','PasswordAuthentication=no',
  '-o','KbdInteractiveAuthentication=no','-o','NumberOfPasswordPrompts=0','-o','ClearAllForwardings=yes',
  '-o','ForwardAgent=no','-o','ForwardX11=no','-o','ProxyCommand=none','-o','ProxyJump=none',
  '-o','PermitLocalCommand=no','-o','ControlMaster=no','-o','ControlPath=none',
  '-o','ConnectTimeout=5','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3',
  '-i',endpoint.identityFile,'-p',String(endpoint.port),'-l',endpoint.user,endpoint.host];
}
// Native Windows OpenSSH uses Windows profile/system context in addition
// to the explicit SSH options. Preserve only the named OS variables; never
// inherit SSH_AUTH_SOCK, SSH_ASKPASS, HOME overrides, arbitrary PATH or Git
// configuration. This is a lab environment, not a signed installation.
export function backupLabSshEnvironment(){
 const env={LANG:'C'};
 for(const name of ['SystemRoot','WINDIR','TEMP','TMP'])if(process.env[name])env[name]=process.env[name];
 if(process.platform==='win32'){
  const root=process.env.SystemRoot??'C:\\Windows';
  env.SystemRoot=root;env.WINDIR=root;
  for(const name of ['USERPROFILE','USERNAME','USERDOMAIN','HOMEDRIVE','HOMEPATH',
   'PROGRAMDATA','ALLUSERSPROFILE','APPDATA','LOCALAPPDATA','COMPUTERNAME'])
   if(process.env[name])env[name]=process.env[name];
  env.Path=[join(root,'System32','OpenSSH'),join(root,'System32'),root].join(';');
 }
 return env;
}
// No raw remote diagnostics or filenames are exposed. Keep enough typed
// evidence to distinguish spawn, local encoder/pipe and SSH handshake faults
// without weakening the result-unknown contract (never retry automatically).
export function classifyBackupSshFailure({spawnFailed=false,wireCode='',stderr='',timedOut=false,aborted=false,exitCode=null,signal=null}={}){
 const reason=String(stderr).slice(0,4096);
 let category='ssh_exit_or_ack_invalid';
 if(timedOut)category='deadline';
 else if(aborted)category='cancelled';
 else if(spawnFailed)category='spawn_failed';
 else if(/getpwuid|getpwnam|unable to (get|resolve).*(user|profile)|no user exists|user profile|failed to get.*(sid|username)/i.test(reason))category='native_user_context';
 else if(/bad configuration option|unsupported option|unknown option|bad owner or permissions/i.test(reason))category='client_configuration';
 else if(/host key verification failed|remote host identification has changed/i.test(reason))category='host_identity';
 else if(/permission denied \(publickey/i.test(reason))category='authentication';
 else if(/connection refused|no route to host|network is unreachable|connect to host.*timed out/i.test(reason))category='tcp_connect';
 else if(/kex_exchange_identification|banner exchange|protocol mismatch|invalid format|connection (closed|reset) by/i.test(reason))category='handshake';
 else if(/^sabora_backup_wire_stop:/.test(wireCode))category='local_wire_rejected';
 else if(wireCode==='EPIPE'||wireCode==='ERR_STREAM_PREMATURE_CLOSE')category='pipe_closed';
 return Object.freeze({category,exitCode:Number.isInteger(exitCode)?exitCode:null,terminated:signal!==null});
}
function transferUnknown(detail){
 const error=Error('sabora_backup_transport_stop:transfer_outcome_unknown:'+detail.category);
 error.diagnostic=detail;
 throw error;
}
export async function sendVpsBackupOverSsh(request={}){
 return sendWithVerifiedArguments(request,await backupLabSshArguments(request.endpoint),null);
}
// This preflight makes no outbound connection. All production transport
// identities come from the two owner-signed documents, not caller overrides.
export async function prepareInstalledBackupTransfer({endpoint,sourceDirectory,proofBytes,planBytes,
 artifactBytes,activationBytes,ownerPublicKey}={}){
 const installation=verifyInstalledBackupActivation({planBytes,artifactBytes,activationBytes,ownerPublicKey});
 const args=await backupSshArguments(endpoint,installation);
 if(!Buffer.isBuffer(proofBytes)||proofBytes.length<1||proofBytes.length>262144)stop('installed_proof_size');
 if(!isAbsolute(sourceDirectory??'')||resolve(sourceDirectory)!==sourceDirectory||
  await realpath(sourceDirectory)!==sourceDirectory)stop('installed_source_path');
 const directory=await lstat(sourceDirectory);
 if(!directory.isDirectory()||directory.isSymbolicLink()||
  (process.platform!=='win32'&&(directory.mode&0o077)!==0))stop('installed_source_directory');
 const manifestFile=join(sourceDirectory,'manifest.json');
 await localFile(manifestFile,{privateFile:true});
 if((await lstat(manifestFile)).size>262144)stop('installed_manifest_size');
 const manifestBytes=await readFile(manifestFile),parsed=parseEncryptedBackupManifest(manifestBytes),manifest=parsed.value;
 const proof=verifySignedDocument(proofBytes,installation.plan.authorities.verificationPublicKey,'sabora-vps-rotation-proof/v1');
 const scope=installation.plan.storage,now=Date.now();
 const observed=Date.parse(proof.observedAt),expires=Date.parse(proof.validUntil);
 if(!exactKeys(proof,['schema','repository','project','environment','storageIdentitySha256','externalStorageIdentitySha256',
  'backupId','manifestSha256','previousManifestSha256','releaseSha','backupSchema','recoveredInventorySha256',
  'recoveryEvidenceSha256','recoveryKind','observedAt','validUntil'])||
  proof.repository!=='jdlc86/CartaViva'||proof.project!=='sabora'||proof.environment!=='production'||
  proof.storageIdentitySha256!==scope.storageIdentitySha256||proof.externalStorageIdentitySha256!==scope.externalStorageIdentitySha256||
  manifest.sourceSystemIdentifier!==scope.systemIdentifier||proof.backupId!==manifest.backupId||
  proof.releaseSha!==manifest.releaseSha||proof.releaseSha!==installation.checked.sourceSha||
  proof.backupSchema!==manifest.schema||proof.manifestSha256!==parsed.manifestSha256||
  proof.recoveredInventorySha256!==parsed.components.find(c=>c.name===(manifest.schema==='sabora-preinstall-backup/v1'?'initial-state':'inventory'))?.plaintextSha256||
  proof.recoveryKind!==(manifest.schema==='sabora-preinstall-backup/v1'?'authenticated-initial-state-and-recovery-drill':'external-pg17-restore')||
  !sha(proof.recoveryEvidenceSha256)||(proof.previousManifestSha256!==null&&!sha(proof.previousManifestSha256))||
  !Number.isFinite(observed)||!Number.isFinite(expires)||observed<Date.parse(manifest.createdAt)||observed>now||expires<=now||
  expires<=observed||manifestBytes.length+parsed.components.reduce((n,c)=>n+c.ciphertextBytes,0)>scope.maxBundleBytes)
  stop('installed_proof_scope');
 const deadline=Math.min(expires,Date.parse(installation.activation.validUntil));
 if(deadline-now<1000)stop('installed_activation_expired');
 return {args,installation,expected:{backupId:proof.backupId,manifestSha256:proof.manifestSha256,
  previousManifestSha256:proof.previousManifestSha256},deadline};
}
export async function sendInstalledVpsBackupOverSsh(request={}){
 const prepared=await prepareInstalledBackupTransfer(request);
 const timeoutMs=Math.min(request.timeoutMs??3600000,prepared.deadline-Date.now());
 if(timeoutMs<1000)stop('installed_activation_expired');
 return sendWithVerifiedArguments({...request,expected:prepared.expected,timeoutMs},prepared.args,prepared.installation);
}
async function sendWithVerifiedArguments({endpoint,sourceDirectory,proofBytes,expected,timeoutMs=3600000,signal}={},args,installation){
 if(!exactKeys(expected,['backupId','manifestSha256','previousManifestSha256'])||
  typeof expected.backupId!=='string'||!/^SABORA-BACKUP-[A-Z0-9-]{8,80}$/.test(expected.backupId)||
  !sha(expected.manifestSha256)||(expected.previousManifestSha256!==null&&!sha(expected.previousManifestSha256))||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>3600000)stop('expected_receipt_invalid');
 if(signal!==undefined&&!(signal instanceof AbortSignal))stop('invalid_abort_signal');
 if(signal?.aborted)stop('transfer_outcome_unknown');
 const env=backupLabSshEnvironment();
 const child=spawn(endpoint.sshBinary,[...args,BACKUP_RECEIVE_COMMAND],
  {stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true,env});
 const abort=new AbortController();let oversized=false,received=0,stderr='',timedOut=false;const chunks=[];
 const cancel=()=>{abort.abort();child.kill();};
 signal?.addEventListener('abort',cancel,{once:true});
 if(signal?.aborted)cancel();
 const timer=setTimeout(()=>{timedOut=true;cancel();},timeoutMs);
 const ended=once(child,'close');ended.catch(()=>{});
 child.stdout.on('data',chunk=>{
  received+=chunk.length;
  if(received>4096){oversized=true;abort.abort();child.kill();return;}
  chunks.push(chunk);
 });
 // Capture at most 4096 bytes for coarse classification only. Never
 // propagate raw stderr; it may contain installation details or paths.
 child.stderr.on('data',chunk=>{if(stderr.length<4096)stderr+=chunk.toString('utf8').slice(0,4096-stderr.length);});
 try{
  const sending=pipeline(Readable.from(encodeVpsBackupStream({sourceDirectory,proofBytes})),child.stdin,{signal:abort.signal});
  sending.catch(error=>{
   // An SSH process that has closed stdin may still be emitting its real
   // failure. Preserve that diagnostic and wait under the existing deadline.
   // Local encoder errors still terminate the process immediately.
   if(!['EPIPE','ERR_STREAM_PREMATURE_CLOSE','ECONNRESET'].includes(error?.code))child.kill();
  });
  const [sent,exit]=await Promise.allSettled([sending,ended]);
  if(sent.status!=='fulfilled'||exit.status!=='fulfilled'||exit.value[0]!==0||
   exit.value[1]!==null||oversized||abort.signal.aborted){
   const wireCode=sent.status==='rejected'?(sent.reason?.code??sent.reason?.message??''):'';
   transferUnknown(classifyBackupSshFailure({spawnFailed:exit.status==='rejected',
    wireCode,stderr,timedOut,aborted:!!signal?.aborted,exitCode:exit.status==='fulfilled'?exit.value[0]:null,
    signal:exit.status==='fulfilled'?exit.value[1]:null}));
  }
  let ack;try{ack=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{stop('transfer_outcome_unknown');}
  if(!exactKeys(ack,['schema','backupId','manifestSha256','previousManifestSha256','generations','operationalReceipt',
    ...(installation?['installationId','activationSha256']:[])])||
   ack.schema!==(installation?'sabora-vps-installed-rotation-result/v1':'sabora-vps-rotation-result/v1')||
   (installation&&(ack.installationId!==installation.activation.installationId||
    ack.activationSha256!==installation.activationSha256))||ack.backupId!==expected.backupId||
   ack.manifestSha256!==expected.manifestSha256||ack.previousManifestSha256!==expected.previousManifestSha256||
   ack.generations!==1||ack.operationalReceipt!==false)stop('transfer_outcome_unknown');
  return Object.freeze(ack);
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(child.exitCode===null&&child.signalCode===null)child.kill();}
}
