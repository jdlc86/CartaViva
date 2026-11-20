// Disposable Windows client gate. Exercises the native executable, pinned
// inputs and actual binary wire generation; not a Windows-to-Linux restore.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash,createCipheriv,randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdtemp,realpath,readFile,writeFile,mkdir,rm,lstat,link,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {Readable} from 'node:stream';
import {verifiedNtfsAclDigest} from '../ops/sabora-ntfs-acl-verifier.mjs';
import {backupLabSshArguments,backupLabSshEnvironment,classifyBackupSshFailure,sendVpsBackupOverSsh} from '../ops/sabora-vps-backup-transport.mjs';
import {encodeVpsBackupStream,BackupWireReader} from '../ops/sabora-vps-backup-wire.mjs';
import {buildBackupPreparationArtifact} from './sabora-backup-preparation-artifact.mjs';
import {BACKUP_INSTALL_PATHS as P,verifyBackupInstallationPlan} from '../ops/sabora-backup-installation-plan.mjs';
import {sshEd25519Sha256} from '../ops/sabora-backup-installed-contract.mjs';
import {stableStringify} from './sabora-release-governor.mjs';
import {fileURLToPath} from 'node:url';
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
 // Also execute the actual installed Windows CLI with a closed package
 // from the current Git commit and fresh signed, synthetic documents.
 // TEST-NET destination is never contacted: all send cases are deliberate
 // preflight denials. This is not an authenticated Linux exchange.
 const reachedBeforeInstalled=reached,sourceSha=process.env.GITHUB_SHA;
 assert.match(sourceSha,/^[0-9a-f]{40}$/);
 const artifactDirectory=join(root,'closed artifact');
 const artifact=buildBackupPreparationArtifact(artifactDirectory,sourceSha);
 const artifactBytes=await readFile(join(artifactDirectory,'artifact.json'));
 const owner=generateKeyPairSync('ed25519'),verifier=generateKeyPairSync('ed25519'),recovery=generateKeyPairSync('ed25519');
 const pub=k=>k.publicKey.export({format:'pem',type:'spki'});
 const signed=(payload,key=owner.privateKey)=>Buffer.from(JSON.stringify({payload,
  signature:sign(null,Buffer.from(stableStringify(payload)),key).toString('base64')}));
 const fixtureHash=value=>digest(Buffer.from('fixture-only-'+value));
 const clientPublic=(await readFile(client+'.pub','utf8')).trim().split(' ').slice(0,2).join(' ');
 const addr='192.0.2.17',installedPort=22239;
 const installedPin='['+addr+']:'+installedPort+' '+pin+'\n';
 await writeFile(known,installedPin);
 protect([root,client,known,bundle]);
 const installedManifest={...manifest,releaseSha:sourceSha};
 const installedManifestBytes=Buffer.from(JSON.stringify(installedManifest));
 const manifestPath=join(bundle,'manifest.json'),cipherPath=join(bundle,'initial-state.aesgcm');
 await writeFile(manifestPath,installedManifestBytes);
 protect([manifestPath,cipherPath]);
 const now=Date.now(),from=new Date(now-1000).toISOString(),until=new Date(now+240000).toISOString();
 const plan={schema:'sabora-backup-installation-plan/v1',repository:'jdlc86/CartaViva',project:'sabora',
  environment:'production-candidate',sourceSha,artifactSha256:artifact.artifactSha256,plannedAt:from,validUntil:until,
  account:P.account,paths:{config:P.config,volume:P.volume,cache:P.cache,recovery:P.recovery,guard:P.guard,control:P.control},
  transport:{listenAddress:addr,port:installedPort,clientAddress:'192.0.2.18',
   hostKeySha256:sshEd25519Sha256(pin),clientKeySha256:sshEd25519Sha256(clientPublic)},
  storage:{filesystem:'ext4',filesystemUuid:'136c8b67-21de-40f9-9137-ec67a541e76b',filesystemBytes:32*1024**2,
   quotaBytes:24*1024**2,reserveBytes:1024**2,maxBundleBytes:8*1024**2,metadataBudgetBytes:4*1024**2,
   storageIdentitySha256:fixtureHash('installed-vps'),externalStorageIdentitySha256:fixtureHash('external'),
   systemIdentifier:installedManifest.sourceSystemIdentifier},
  authorities:{verificationPublicKey:pub(verifier),recoveryPublicKey:pub(recovery)},
  runtime:{nodeSha256:fixtureHash('linux-node'),shellSha256:fixtureHash('linux-shell'),
   sshdSha256:fixtureHash('linux-sshd'),flockSha256:fixtureHash('linux-flock')}};
 const planBytes=signed(plan),checked=verifyBackupInstallationPlan({planBytes,artifactBytes,ownerPublicKey:pub(owner)});
 const activation={schema:'sabora-backup-receiver-activation/v1',repository:plan.repository,project:plan.project,
  environment:'production',operation:'receive-encrypted-only',sourceSha,artifactSha256:plan.artifactSha256,
  planSha256:checked.planSha256,configurationSha256:checked.configurationSha256,
  installationId:'SABORA-BACKUP-INSTALL-WINDOWS-CI',hostIdentitySha256:fixtureHash('linux-host'),
  uid:22017,gid:22017,device:'12345',guardInode:'54321',
  independentReviewSha256:fixtureHash('not-review'),isolationEvidenceSha256:fixtureHash('not-isolation'),
  senderBinarySha256:digest(await readFile(ssh)),authorizedAt:from,validUntil:until};
 const proof={schema:'sabora-vps-rotation-proof/v1',repository:plan.repository,project:plan.project,
  environment:'production',storageIdentitySha256:plan.storage.storageIdentitySha256,
  externalStorageIdentitySha256:plan.storage.externalStorageIdentitySha256,backupId:installedManifest.backupId,
  manifestSha256:digest(installedManifestBytes),previousManifestSha256:null,releaseSha:sourceSha,
  backupSchema:installedManifest.schema,recoveredInventorySha256:digest(plain),recoveryEvidenceSha256:fixtureHash('not-restore'),
  recoveryKind:'authenticated-initial-state-and-recovery-drill',observedAt:new Date(now).toISOString(),validUntil:until};
 const paths={ownerPublicKeyPath:join(root,'owner.pem'),planPath:join(root,'plan.json'),
  artifactPath:join(root,'artifact.json'),activationPath:join(root,'activation.json'),proofPath:join(root,'proof.json')};
 const validProof=signed(proof,verifier.privateKey),validActivation=signed(activation);
 for(const [path,bytes] of [[paths.ownerPublicKeyPath,pub(owner)],[paths.planPath,planBytes],
  [paths.artifactPath,artifactBytes],[paths.activationPath,validActivation],[paths.proofPath,validProof]])
  await writeFile(path,bytes,{flag:'wx'});
 const profilePath=join(root,'installed profile.json');
 const installedEndpoint={...endpoint,environment:'production',host:addr,port:installedPort,user:P.account,
  windowsAcl:{...endpoint.windowsAcl,directorySha256:verifiedNtfsAclDigest(root),
   identitySha256:verifiedNtfsAclDigest(client),knownHostsSha256:verifiedNtfsAclDigest(known),
   knownHostsContentSha256:digest(await readFile(known))}};
 const profileValue={schema:'sabora-installed-backup-sender-profile/v1',sourceDirectory,endpoint:installedEndpoint,...paths};
 await writeFile(profilePath,JSON.stringify(profileValue),{flag:'wx'});
 protect([...Object.values(paths),profilePath]);
 const cli=fileURLToPath(new URL('../ops/sabora-backup-installed-send.mjs',import.meta.url));
 function invoke(mode){
  const r=spawnSync(process.execPath,[cli,mode,profilePath],{encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:16384});
  assert.equal(r.error,undefined,'installed Windows CLI launch');
  assert.equal(r.signal,null);return r;
 }
 function deny(pattern){
  const r=invoke('send');
  assert.notEqual(r.status,0);assert.equal(r.stdout,'');assert.match(r.stderr,pattern);
 }
 const ready=invoke('preflight');
 assert.equal(ready.status,0,ready.stderr);
 assert.deepEqual(JSON.parse(ready.stdout),{schema:'sabora-backup-sender-preflight/v1',
  manifestSha256:proof.manifestSha256,installationId:activation.installationId,networkContacted:false,operationalReceipt:false});
 await writeFile(paths.activationPath,signed({...activation,senderBinarySha256:fixtureHash('wrong-windows-client')}));
 deny(/installed_sender_identity/);
 await writeFile(paths.activationPath,validActivation);
 await writeFile(paths.proofPath,signed({...proof,manifestSha256:fixtureHash('wrong-restore')},verifier.privateKey));
 deny(/installed_proof_scope/);
 await writeFile(paths.proofPath,validProof);
 // Wrong host pin with a recomputed ACL/content receipt still fails the
 // owner-signed endpoint pin, not merely the Windows observation digest.
 await writeFile(known,'['+addr+']:'+installedPort+' '+clientPublic+'\n');
 await writeFile(profilePath,JSON.stringify({...profileValue,endpoint:{...installedEndpoint,
  windowsAcl:{...installedEndpoint.windowsAcl,knownHostsContentSha256:digest(await readFile(known))}}}));
 deny(/installed_host_pin/);
 await writeFile(known,installedPin);await writeFile(profilePath,JSON.stringify(profileValue));
 // Actual source component with inherited DACL must be rejected before
 // SSH spawn. The bytes stay identical and still match the signed manifest.
 await unlink(cipherPath);await writeFile(cipherPath,encrypted);
 deny(/sabora_ntfs_acl_stop:inherited_dacl/);
 protect([cipherPath]);
 const extraFile=join(bundle,'unexpected.txt');
 await writeFile(extraFile,'fixture');
 deny(/installed_source_inventory/);
 await unlink(extraFile);
 const final=invoke('preflight');assert.equal(final.status,0,final.stderr);
 assert.equal(JSON.parse(final.stdout).networkContacted,false);
 assert.equal(reached,reachedBeforeInstalled);
 console.log('sabora_backup_windows_installed_sender_dossier_and_private_ciphertext_ok');

}finally{
 for(const socket of connections)socket.destroy();
 if(listener)await new Promise(resolve=>listener.close(resolve));
 await rm(root,{recursive:true,force:true});
}
