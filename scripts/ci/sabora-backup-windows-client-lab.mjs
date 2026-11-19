// Disposable Windows client gate. Exercises the native executable, pinned
// inputs and actual binary wire generation; not a Windows-to-Linux restore.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash,createCipheriv,randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdtemp,realpath,readFile,writeFile,mkdir,rm,lstat,link,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {Readable} from 'node:stream';
import {verifiedNtfsAclDigest} from '../ops/sabora-ntfs-acl-verifier.mjs';
import {backupLabSshArguments,backupLabSshEnvironment,classifyBackupSshFailure,sendVpsBackupOverSsh} from '../ops/sabora-vps-backup-transport.mjs';
import {encodeVpsBackupStream,BackupWireReader} from '../ops/sabora-vps-backup-wire.mjs';
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Windows'||
 process.env.RUNNER_ENVIRONMENT!=='github-hosted'||!process.env.RUNNER_TEMP)throw Error('disposable_windows_context_required');
const sys=join(process.env.SystemRoot??'C:\\Windows','System32');
const ssh=await realpath(join(sys,'OpenSSH','ssh.exe'));
const keygen=await realpath(join(sys,'OpenSSH','ssh-keygen.exe'));
const ps=join(sys,'WindowsPowerShell','v1.0','powershell.exe');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=await realpath(await mkdtemp(join(process.env.RUNNER_TEMP,'sabora backup windows ')));
const client=join(root,'client key'),known=join(root,'known hosts'),bundle=join(root,'ciphertext fixture');
let listener;
const connections=new Set();
function run(executable,args,env=process.env){
 const r=spawnSync(executable,args,{encoding:'utf8',windowsHide:true,env,timeout:15000,maxBuffer:65536});
 assert.equal(r.error,undefined,'native fixture executable launch');
 assert.equal(r.status,0,'native fixture command failed');
 return r.stdout;
}
const prepare=`
$ErrorActionPreference='Stop'
$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
$paths=($env:SABORA_TEST_PATHS | ConvertFrom-Json)
foreach($path in $paths){
 $directory=[System.IO.Directory]::Exists($path)
 if($directory){$acl=[System.IO.Directory]::GetAccessControl($path)}
 else{$acl=[System.IO.File]::GetAccessControl($path)}
 $acl.SetAccessRuleProtection($true,$false)
 $acl.SetOwner($user)
 foreach($old in @($acl.GetAccessRules($true,$false,[System.Security.Principal.SecurityIdentifier]))){
  $acl.RemoveAccessRuleSpecific($old)
 }
 if($directory){
  $rule=[System.Security.AccessControl.FileSystemAccessRule]::new($user,
   [System.Security.AccessControl.FileSystemRights]::FullControl,
   [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
   [System.Security.AccessControl.PropagationFlags]::None,
   [System.Security.AccessControl.AccessControlType]::Allow)
  $acl.AddAccessRule($rule)
  [System.IO.Directory]::SetAccessControl($path,$acl)
 }else{
  $rule=[System.Security.AccessControl.FileSystemAccessRule]::new($user,
   [System.Security.AccessControl.FileSystemRights]::FullControl,
   [System.Security.AccessControl.AccessControlType]::Allow)
  $acl.AddAccessRule($rule)
  [System.IO.File]::SetAccessControl($path,$acl)
 }
}
`;
function protect(paths){run(ps,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(prepare,'utf16le').toString('base64')],
 {...process.env,SABORA_TEST_PATHS:JSON.stringify(paths)});}
try{
 protect([root]);
 run(keygen,['-q','-t','ed25519','-N','','-f',client]);
 const host=join(root,'fixture host');
 run(keygen,['-q','-t','ed25519','-N','','-f',host]);
 let reached=0;
 // A real TCP loopback peer, deliberately not an authenticated SSH server.
 // It closes after an invalid protocol banner. No production addresses.
 listener=createServer(socket=>{
  reached++;connections.add(socket);socket.on('close',()=>connections.delete(socket));
  socket.on('error',()=>{});socket.end('fixture protocol rejection\r\n');
 });
 await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
 const port=listener.address().port;
 const pin=(await readFile(host+'.pub','utf8')).trim().split(' ').slice(0,2).join(' ');
 await writeFile(known,'[127.0.0.1]:'+port+' '+pin+'\n');
 protect([client,known]);
 const endpoint={environment:'disposable-lab',host:'127.0.0.1',port,user:'fixture',
  sshBinary:ssh,identityFile:await realpath(client),knownHostsFile:await realpath(known),
  windowsAcl:{directorySha256:verifiedNtfsAclDigest(root),identitySha256:verifiedNtfsAclDigest(client),
   knownHostsSha256:verifiedNtfsAclDigest(known),clientBinarySha256:digest(await readFile(ssh)),
   knownHostsContentSha256:digest(await readFile(known))}};
 const nativeStat=await lstat(ssh);
 // Bounded diagnostic: no path, SID, key, or identifying ACL emitted.
 console.log('sabora_backup_windows_native_file_observed:'+JSON.stringify({
  regular:nativeStat.isFile(),symbolic:nativeStat.isSymbolicLink(),links:nativeStat.nlink,
  sizeBytes:nativeStat.size}));
 const args=await backupLabSshArguments(endpoint);
 await assert.rejects(backupLabSshArguments({...endpoint,sshBinary:await realpath(keygen)}),/windows_client_path_invalid/);
 await assert.rejects(backupLabSshArguments({...endpoint,windowsAcl:{...endpoint.windowsAcl,
  clientBinarySha256:'f'.repeat(64)}}),/windows_client_identity_invalid/);
 // Hard links remain forbidden for both private identity and host pin,
 // even if their content/DACL match the expected observations exactly.
 for(const path of [client,known]){
  const alias=path+' alias';
  await link(path,alias);
  try{
   assert.equal((await lstat(path)).nlink,2);
   await assert.rejects(backupLabSshArguments(endpoint),/local_file_link_count_invalid/);
  }finally{await unlink(alias);}
 }
 console.log('sabora_backup_windows_native_path_hash_and_private_link_guards_ok');
 const env=backupLabSshEnvironment();
 assert.equal(env.USERPROFILE,process.env.USERPROFILE);
 assert.equal(env.SystemRoot,process.env.SystemRoot??'C:\\Windows');
 for(const name of ['SSH_AUTH_SOCK','SSH_ASKPASS','GIT_SSH_COMMAND','HOME'])assert.equal(env[name],undefined);
 // The same restricted environment is used for configuration, the native
 // diagnostic probe and the real sender. No fallback to a less safe client.
 const config=run(ssh,['-G',...args,'sabora-backup-receive-v1'],env);
 assert.match(config,/^hostname 127\.0\.0\.1\r?$/m);
 assert.match(config,/^batchmode yes\r?$/m);
 assert.match(config,/^identitiesonly yes\r?$/m);
 assert.match(config,/^stricthostkeychecking (yes|true)\r?$/m);
 assert.match(config,/^userknownhostsfile .*known hosts\r?$/m);
 await assert.rejects(backupLabSshArguments({...endpoint,windowsAcl:{...endpoint.windowsAcl,identitySha256:'f'.repeat(64)}}),/windows_acl_receipt_mismatch/);
 await writeFile(known,'changed fixture pin\n');
 await assert.rejects(backupLabSshArguments(endpoint),/windows_client_identity_invalid/);
 await writeFile(known,'[127.0.0.1]:'+port+' '+pin+'\n');protect([known]);
 // Actual inherited ACL rejected even when caller supplies a plausible digest.
 const inherited=join(root,'inherited key');
 await writeFile(inherited,await readFile(client));
 await assert.rejects(backupLabSshArguments({...endpoint,identityFile:await realpath(inherited)}),/sabora_ntfs_acl_stop:/);
 assert.equal(reached,0,'configuration and ACL failures never opened a TCP connection');
 const waitForPeer=async before=>{
  for(let i=0;i<40&&reached===before;i++)await delay(25);
  return reached>before;
 };
 // Targeted diagnostic for the previously failing native launch: hold
 // stdin open, use identical argv/env and do not invoke the wire encoder.
 // A protocol failure on this deliberately non-SSH peer is expected.
 const probe=spawn(ssh,[...args,'sabora-backup-receive-v1'],{
  stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false,env});
 let probeStderr='',probeTimedOut=false;
 probe.stdout.resume();probe.stdin.on('error',()=>{});
 probe.stderr.on('data',chunk=>{if(probeStderr.length<4096)probeStderr+=chunk.toString('utf8').slice(0,4096-probeStderr.length);});
 const probeEnd=once(probe,'close');probeEnd.catch(()=>{});
 const probeTimer=setTimeout(()=>{probeTimedOut=true;probe.kill();},10000);
 try{
  let result,spawnFailed=false;
  try{result=await probeEnd;}catch{spawnFailed=true;}
  const observed=await waitForPeer(0);
  const diagnostic=classifyBackupSshFailure({stderr:probeStderr,spawnFailed,timedOut:probeTimedOut,
   exitCode:result?.[0]??null,signal:result?.[1]??null});
  console.log('sabora_backup_windows_native_probe:'+JSON.stringify({...diagnostic,peerReached:observed}));
  assert.equal(observed,true,'native Windows client must reach peer independently of wire');
  assert.equal(spawnFailed,false);assert.equal(probeTimedOut,false);
  assert.equal(result[1],null);assert.notEqual(result[0],0);
 }finally{
  clearTimeout(probeTimer);probe.stdin.destroy();
  if(probe.exitCode===null&&probe.signalCode===null)probe.kill();
  await probeEnd.catch(()=>{});
 }
 // Build a disposable AES-GCM fixture; it is not a captured PG17 backup.
 // The production wire encoder and reader must preserve arbitrary binary bytes.
 await mkdir(bundle);
 const plain=Buffer.from(Array.from({length:512},(_,i)=>i%256));
 const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);key.fill(0);
 const manifest={schema:'sabora-preinstall-backup/v1',backupId:'SABORA-BACKUP-WINDOWS-LAB',
  repository:'jdlc86/CartaViva',releaseSha:'a'.repeat(40),sourceProjectRef:'byhvmumqivmunkmomhup',
  postgresMajor:17,postgresVersion:'17.1',plannedMigrationTreeSha256:'b'.repeat(64),
  includedSchemas:[],excludedManagedSchemas:['auth','extensions','realtime','storage','supabase_functions','vault'],
  createdAt:new Date().toISOString(),custody:'key-outside-artifact-git-actions-vps',sourceSystemIdentifier:'1234567890123456789',
  sourceDatabase:'postgres',snapshotId:'1-1-1',initialState:'no-sabora-objects',
  artifactPolicy:'ciphertext-only-replicas; no keys or plaintext dumps',
  components:[{algorithm:'aes-256-gcm',ciphertextBytes:encrypted.length,ciphertextSha256:digest(encrypted),
   filename:'initial-state.aesgcm',ivHex:iv.toString('hex'),mediaType:'application/json',name:'initial-state',
   plaintextBytes:plain.length,plaintextSha256:digest(plain),tagHex:cipher.getAuthTag().toString('hex')}]};
 const manifestBytes=Buffer.from(JSON.stringify(manifest));
 await writeFile(join(bundle,'manifest.json'),manifestBytes);
 await writeFile(join(bundle,'initial-state.aesgcm'),encrypted);
 const sourceDirectory=await realpath(bundle),proofBytes=Buffer.from('windows-wire-fixture-not-authorized');
 const input={sourceDirectory,proofBytes};
 const reader=new BackupWireReader(Readable.from(encodeVpsBackupStream(input)));
 try{
  const header=await reader.header();
  assert.deepEqual(header.manifestBytes,manifestBytes);assert.deepEqual(header.proofBytes,proofBytes);
  let left=await reader.length(1024**3);const chunks=[];
  assert.equal(left,encrypted.length);
  while(left){const bytes=await reader.piece(left);left-=bytes.length;chunks.push(bytes);}
  assert.deepEqual(Buffer.concat(chunks),encrypted);await reader.eof();
 }finally{reader.close();}
 // Verify actual native launch and failure mapping on non-SSH loopback peer.
 // No fabricated ACK or successful authentication claim.
 const beforeSend=reached;
 await assert.rejects(sendVpsBackupOverSsh({...input,endpoint,timeoutMs:10000,
  expected:{backupId:manifest.backupId,manifestSha256:digest(manifestBytes),previousManifestSha256:null}}),error=>{
   assert.match(error.message,/transfer_outcome_unknown/);
   console.log('sabora_backup_windows_sender_diagnostic:'+JSON.stringify(error.diagnostic??{category:'unclassified_ack'}));
   return true;
  });
 assert.equal(await waitForPeer(beforeSend),true,'actual Windows sender must reach loopback independently of probe');
 console.log('sabora_backup_windows_native_client_acl_wire_and_failure_ok');
}finally{
 for(const socket of connections)socket.destroy();
 if(listener)await new Promise(resolve=>listener.close(resolve));
 await rm(root,{recursive:true,force:true});
}
