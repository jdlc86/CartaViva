// Candidate OpenSSH sender: explicit endpoint, pinned host, fixed command,
// ciphertext streaming only. No production endpoint or automatic retry.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {lstat,realpath} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {encodeVpsBackupStream} from './sabora-vps-backup-wire.mjs';
import {exactKeys} from './sabora-release-protected-store.mjs';
export const BACKUP_RECEIVE_COMMAND='sabora-backup-receive-v1';
const stop=code=>{throw Error('sabora_backup_transport_stop:'+code);};
const sha=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
async function localFile(path,{privateFile=false}={}){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||/["\r\n\x00%~$]/.test(path)||
  await realpath(path)!==path)stop('local_file_path_invalid');
 const st=await lstat(path);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size<1||
  (process.platform!=='win32'&&(privateFile?(st.mode&0o077)!==0:(st.mode&0o022)!==0)))
  stop('local_file_invalid');
 return path;
}
// No user ssh_config, agent, proxy, forwarding, shell or password fallback.
// This lab API is not a provisioned Windows CLI; ACL/client binary custody
// and real endpoint authorization must be resolved separately.
export async function backupLabSshArguments(endpoint){
 if(!exactKeys(endpoint,['environment','host','port','user','sshBinary','identityFile','knownHostsFile'])||
  endpoint.environment!=='disposable-lab'||endpoint.host!=='127.0.0.1'||
  !Number.isInteger(endpoint.port)||endpoint.port<1024||endpoint.port>65535||
  typeof endpoint.user!=='string'||!/^[a-z_][a-z0-9_-]{0,31}$/.test(endpoint.user))
  stop('endpoint_not_authorized');
 await localFile(endpoint.sshBinary);
 await localFile(endpoint.identityFile,{privateFile:true});
 const known=(await localFile(endpoint.knownHostsFile)).replaceAll('\\','/');
 return ['-F','none','-T','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','IdentityAgent=none',
  '-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile="'+known+'"','-o','GlobalKnownHostsFile=none',
  '-o','UpdateHostKeys=no','-o','HostKeyAlgorithms=ssh-ed25519','-o','PasswordAuthentication=no',
  '-o','KbdInteractiveAuthentication=no','-o','NumberOfPasswordPrompts=0','-o','ClearAllForwardings=yes',
  '-o','ForwardAgent=no','-o','ForwardX11=no','-o','ProxyCommand=none','-o','ProxyJump=none',
  '-o','PermitLocalCommand=no','-o','ControlMaster=no','-o','ControlPath=none',
  '-o','ConnectTimeout=5','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3',
  '-i',endpoint.identityFile,'-p',String(endpoint.port),'-l',endpoint.user,endpoint.host];
}
export async function sendVpsBackupOverSsh({endpoint,sourceDirectory,proofBytes,expected,timeoutMs=3600000,signal}={}){
 const args=await backupLabSshArguments(endpoint);
 if(!exactKeys(expected,['backupId','manifestSha256','previousManifestSha256'])||
  typeof expected.backupId!=='string'||!/^SABORA-BACKUP-[A-Z0-9-]{8,80}$/.test(expected.backupId)||
  !sha(expected.manifestSha256)||(expected.previousManifestSha256!==null&&!sha(expected.previousManifestSha256))||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>3600000)stop('expected_receipt_invalid');
 if(signal!==undefined&&!(signal instanceof AbortSignal))stop('invalid_abort_signal');
 if(signal?.aborted)stop('transfer_outcome_unknown');
 const env={LANG:'C'};
 for(const name of ['SystemRoot','WINDIR','TEMP','TMP'])if(process.env[name])env[name]=process.env[name];
 const child=spawn(endpoint.sshBinary,[...args,BACKUP_RECEIVE_COMMAND],
  {stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true,env});
 const abort=new AbortController();let oversized=false,received=0;const chunks=[];
 const cancel=()=>{abort.abort();child.kill();};
 signal?.addEventListener('abort',cancel,{once:true});
 if(signal?.aborted)cancel();
 const timer=setTimeout(cancel,timeoutMs);
 const ended=once(child,'close');ended.catch(()=>{});
 child.stdout.on('data',chunk=>{
  received+=chunk.length;
  if(received>4096){oversized=true;abort.abort();child.kill();return;}
  chunks.push(chunk);
 });
 // Remote errors may contain installation details; don't echo raw output.
 child.stderr.resume();
 try{
  const sending=pipeline(Readable.from(encodeVpsBackupStream({sourceDirectory,proofBytes})),child.stdin,{signal:abort.signal});
  sending.catch(()=>child.kill());
  const [sent,exit]=await Promise.allSettled([sending,ended]);
  if(sent.status!=='fulfilled'||exit.status!=='fulfilled'||exit.value[0]!==0||
   exit.value[1]!==null||oversized||abort.signal.aborted)stop('transfer_outcome_unknown');
  let ack;try{ack=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{stop('transfer_outcome_unknown');}
  if(!exactKeys(ack,['schema','backupId','manifestSha256','previousManifestSha256','generations','operationalReceipt'])||
   ack.schema!=='sabora-vps-rotation-result/v1'||ack.backupId!==expected.backupId||
   ack.manifestSha256!==expected.manifestSha256||ack.previousManifestSha256!==expected.previousManifestSha256||
   ack.generations!==1||ack.operationalReceipt!==false)stop('transfer_outcome_unknown');
  return Object.freeze(ack);
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(child.exitCode===null&&child.signalCode===null)child.kill();}
}
