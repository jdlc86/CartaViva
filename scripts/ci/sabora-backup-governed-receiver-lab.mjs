// Dedicated account and root-owned code/control on a disposable hosted runner.
// Reuse the existing 32 MiB bounded ext4 fixture and real PG17 capture pair.
// The listener is separate, local only, and removed with its exact fixture.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer,connect} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {generateKeyPairSync,sign,createHash,randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,lstat,realpath,statfs,rm} from 'node:fs/promises';
import {join,dirname,basename,resolve} from 'node:path';
import {buildBackupPreparationArtifact} from './sabora-backup-preparation-artifact.mjs';
import {BACKUP_PREPARATION_FILES} from '../ops/sabora-backup-installation-plan.mjs';
import {stableStringify} from './sabora-release-governor.mjs';
import {authorityFingerprint} from '../ops/sabora-release-evidence.mjs';
import {backupLabSshArguments,sendVpsBackupOverSsh} from '../ops/sabora-vps-backup-transport.mjs';
const stop=code=>{throw Error('sabora_governed_receiver_ci_stop:'+code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function run(bin,args,{allowFailure=false,input}={}){
 const r=spawnSync(bin,args,{input,encoding:'utf8',timeout:30000,maxBuffer:262144});
 if(r.error||r.signal||(!allowFailure&&r.status!==0)){
  const operation=bin==='/usr/bin/sudo'?args.find(x=>/^\/usr\/(bin|sbin)\/[a-z]+$/.test(x))??'unknown':bin;
  stop('fixture_command_failed:'+basename(operation)+':'+String(r.status??'spawn'));
 }
 return r;
}
const sudo=(args,opts)=>run('/usr/bin/sudo',['-n',...args],opts);
async function occupied(port){
 return new Promise(resolve=>{
  const socket=connect(port,'127.0.0.1');
  const done=value=>{socket.destroy();resolve(value);};
  socket.setTimeout(250);socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.once('timeout',()=>done(false));
 });
}
async function freePort(){
 const listener=createServer();
 await new Promise((ok,no)=>{listener.once('error',no);listener.listen(0,'127.0.0.1',ok);});
 const port=listener.address().port;
 await new Promise(ok=>listener.close(ok));return port;
}
export async function exerciseGovernedBackupReceiver({volume,scope,repository,sourceSha,first,second}){
 const runId=process.env.GITHUB_RUN_ID??'';
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||
  process.env.RUNNER_OS!=='Linux'||process.platform!=='linux'||process.geteuid()===0||
  !/^\d{1,15}$/.test(runId)||sourceSha!==process.env.GITHUB_SHA||
  dirname(volume)!==process.env.RUNNER_TEMP||!/^sabora-dual-backup-[A-Za-z0-9]+$/.test(basename(volume))||
  await realpath(volume)!==volume||scope.environment!=='disposable-lab'||
  (await statfs(volume,{bigint:true})).type!==0xef53n)stop('disposable_context_required');
 const account='sabora-bk-ci-'+runId,base='/var/lib/sabora-backup-ci-'+runId;
 const mount=join(base,'volume'),cache=join(mount,'cache'),subdir=join(volume,'governed-receiver');
 const node=join(base,'bin/node'),shell=join(base,'bin/receive'),code=join(base,'code');
 const temp=await mkdtemp(join(process.env.RUNNER_TEMP,'sabora-governed-receiver-'));
 let created=false,userCreated=false,mounted=false,server,ended,port,accountUid;
 const closeListener=async()=>{
  if(!server)return;
  if(server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM');
  let timer;try{await Promise.race([ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('listener_cleanup_timeout')),5000);})]);}
  finally{clearTimeout(timer);}
  if(await occupied(port))stop('listener_cleanup_failed');
  server=undefined;
 };
 const put=(path,bytes,mode='0644')=>{
  const source=join(temp,'put-'+hash(Buffer.from(path)).slice(0,20));
  return writeFile(source,bytes,{mode:0o600}).then(()=>sudo(['/usr/bin/install','-o','root','-g','root','-m',mode,source,path]));
 };
 const dir=path=>sudo(['/usr/bin/install','-d','-o','root','-g','root','-m','0755',path]);
 const readRoot=path=>sudo(['/usr/bin/cat',path]).stdout;
 try{
  assert.notEqual(sudo(['/usr/bin/test','-e',base],{allowFailure:true}).status,0);
  assert.notEqual(sudo(['/usr/bin/test','-L',base],{allowFailure:true}).status,0);
  assert.notEqual(run('/usr/bin/getent',['passwd',account],{allowFailure:true}).status,0);
  assert.notEqual(run('/usr/bin/getent',['group',account],{allowFailure:true}).status,0);
  sudo(['/usr/bin/mkdir','-m','0755',base]);created=true;
  dir(join(base,'bin'));dir(code);dir(mount);
  assert.equal(resolve(repository),repository);
  assert.equal(run('/usr/bin/git',['-C',repository,'rev-parse','HEAD']).stdout.trim(),sourceSha);
  const artifact=join(temp,'source');
  const prepared=buildBackupPreparationArtifact(artifact,sourceSha);
  for(const name of ['artifact.json',...BACKUP_PREPARATION_FILES]){
   const target=join(code,name);dir(dirname(target));
   await put(target,await readFile(join(artifact,name)));
  }
  sudo(['/usr/bin/install','-o','root','-g','root','-m','0755',await realpath(process.execPath),node]);
  sudo(['/usr/sbin/useradd','--user-group','--no-create-home','--home-dir','/nonexistent','--shell','/usr/sbin/nologin',account]);
  userCreated=true;
  // An OpenSSH listener with UsePAM=no can refuse a locked shadow account.
  // Give the disposable account a hash of a high-entropy value discarded
  // immediately; never enable password authentication or expose the hash.
  // Both inputs travel over stdin, not argv, intermediate files or logs.
  // Only the one-way hash persists in the disposable account's shadow entry.
  const secret=randomBytes(48);
  let crypt;
  try{
   crypt=run('/usr/bin/openssl',['passwd','-6','-stdin'],{input:secret.toString('hex')+'\n'}).stdout.trim();
   if(!/^\$6\$[./A-Za-z0-9$]+$/.test(crypt))stop('fixture_shadow_hash_invalid');
   sudo(['/usr/sbin/chpasswd','-e'],{input:account+':'+crypt+'\n'});
  }finally{secret.fill(0);crypt=undefined;}
  const uid=Number(run('/usr/bin/id',['-u',account]).stdout.trim()),gid=Number(run('/usr/bin/id',['-g',account]).stdout.trim());
  assert.ok(uid>0&&gid>0&&Number.isSafeInteger(uid)&&Number.isSafeInteger(gid));
  accountUid=uid;
  assert.equal(run('/usr/bin/id',['-G',account]).stdout.trim(),String(gid));
  const compiled=join(temp,'receive');
  run('/usr/bin/cc',['-O2','-Wall','-Wextra','-Werror',
   '-DSABORA_BACKUP_LAB_BASE="'+base+'"','-DSABORA_BACKUP_LAB_UID='+uid,'-DSABORA_BACKUP_LAB_GID='+gid,
   '-o',compiled,join(artifact,'deploy/sabora-backup-lab-shell.c')]);
  sudo(['/usr/bin/install','-o','root','-g','root','-m','0755',compiled,shell]);
  sudo(['/usr/sbin/usermod','--shell',shell,account]);
  await mkdir(subdir,{mode:0o700});
  sudo(['/usr/bin/mount','--bind',subdir,mount]);mounted=true;
  sudo(['/usr/bin/mount','-o','remount,bind,nodev,nosuid,noexec',mount]);
  sudo(['/usr/bin/chown','0:'+gid,mount]);
  sudo(['/usr/bin/chmod','0750',mount]);
  sudo(['/usr/bin/install','-d','-o','root','-g','root','-m','0700',join(mount,'recovery')]);
  const guard=join(mount,'.cache.rotation.guard');
  const empty=join(temp,'empty-guard');await writeFile(empty,'',{mode:0o600,flag:'wx'});
  sudo(['/usr/bin/install','-o','root','-g',String(gid),'-m','0440',empty,guard]);
  const guardIdentity=sudo(['/usr/bin/stat','-c','%d:%i',guard]).stdout.trim().split(':');
  const recoveryAuthority=generateKeyPairSync('ed25519');
  scope={...scope,recoveryPublicKey:recoveryAuthority.publicKey.export({format:'pem',type:'spki'}),
   protectedGuard:{device:guardIdentity[0],inode:guardIdentity[1]}};
  const recoveryDir=join(mount,'recovery'),recordPath=join(recoveryDir,'sequence.json');
  const genesis={schema:'sabora-protected-recovery-sequence/v1',repository:'jdlc86/CartaViva',project:'sabora',
   environment:scope.environment,storageIdentitySha256:scope.storageIdentitySha256,
   externalStorageIdentitySha256:scope.externalStorageIdentitySha256,authoritySha256:authorityFingerprint(scope.recoveryPublicKey),
   sequence:0,authorizationSha256:null,lockSha256:null};
  await put(recordPath,JSON.stringify(genesis)+'\n','0600');
  sudo(['/usr/bin/install','-d','-o',String(uid),'-g',String(gid),'-m','0700',cache]);
  const device=String((await lstat(volume,{bigint:true})).dev),fs=await statfs(volume,{bigint:true});
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const owner=publicKey.export({format:'pem',type:'spki'});
  port=await freePort();
  const config={schema:'sabora-backup-governed-lab/v1',repository:'jdlc86/CartaViva',project:'sabora',
   environment:'disposable-lab',sourceSha,artifactSha256:prepared.artifactSha256,
   nodeSha256:hash(await readFile(process.execPath)),shellSha256:hash(await readFile(compiled)),
   uid,gid,port,volume:mount,cache,device,filesystemBytes:String(fs.blocks*fs.bsize),scope};
  const signed=p=>JSON.stringify({payload:p,signature:sign(null,Buffer.from(stableStringify(p)),privateKey).toString('base64')})+'\n';
  await put(join(base,'owner-public.pem'),owner);await put(join(base,'scope.json'),signed(config));
  await put(join(base,'private-sentinel'),'fixture only','0600');
  // Probe permission as the fixture UID/GID without starting a PAM
  // session for that account via sudo -u. sudo itself remains the runner.
  const asAccount=(args,opts)=>sudo(['/usr/bin/setpriv','--reuid',String(uid),'--regid',String(gid),
   '--clear-groups','--no-new-privs','--',...args],opts);
  assert.equal(asAccount(['/usr/bin/id','-u']).stdout.trim(),String(uid));
  assert.equal(asAccount(['/usr/bin/id','-G']).stdout.trim(),String(gid));
  for(const path of [code,join(code,'artifact.json'),join(base,'scope.json'),node,shell,base,mount,guard,join(mount,'recovery')]){
   assert.notEqual(asAccount(['/usr/bin/test','-w',path],{allowFailure:true}).status,0);
  }
  assert.notEqual(asAccount(['/usr/bin/test','-r',join(base,'private-sentinel')],{allowFailure:true}).status,0);
  assert.equal(asAccount(['/usr/bin/test','-w',cache]).status,0);
  assert.equal(asAccount(['/usr/bin/test','-r',guard]).status,0);
  assert.notEqual(asAccount(['/usr/bin/test','-x',join(mount,'recovery')],{allowFailure:true}).status,0);
  // Real attempted unlink and replacement under the dedicated UID.
  for(const args of [['/usr/bin/rm','--',guard],['/usr/bin/touch',guard],['/usr/bin/mkdir',join(mount,'unauthorized')]]){
   assert.notEqual(asAccount(args,{allowFailure:true}).status,0);
  }
  assert.equal(sudo(['/usr/bin/stat','-c','%d:%i',guard]).stdout.trim(),guardIdentity.join(':'));
  const hostKey=join(temp,'host-key'),identityFile=join(temp,'client-key');
  for(const path of [hostKey,identityFile])run('/usr/bin/ssh-keygen',['-q','-t','ed25519','-N','','-f',path]);
  await put(join(base,'host-key'),await readFile(hostKey),'0600');
  const publicClient=(await readFile(identityFile+'.pub','utf8')).trim().split(' ').slice(0,2).join(' ');
  const publicHost=(await readFile(hostKey+'.pub','utf8')).trim().split(' ').slice(0,2).join(' ');
  await put(join(base,'authorized_keys'),'restrict,command="'+shell+'" '+publicClient+'\n');
  const knownHostsFile=join(temp,'known-hosts');await writeFile(knownHostsFile,'[127.0.0.1]:'+port+' '+publicHost+'\n',{mode:0o600});
  const sshdConfig=join(base,'sshd.conf');
  await put(sshdConfig,['ListenAddress 127.0.0.1','AddressFamily inet','Port '+port,
   'HostKey '+join(base,'host-key'),'PidFile '+join(base,'sshd.pid'),'AllowUsers '+account+'@127.0.0.1',
   'AuthorizedKeysFile '+join(base,'authorized_keys'),'StrictModes yes','AuthenticationMethods publickey',
   'PubkeyAuthentication yes','PasswordAuthentication no','KbdInteractiveAuthentication no','PermitRootLogin no',
   'UsePAM no','PermitTTY no','DisableForwarding yes','PermitUserRC no','PermitUserEnvironment no',
   'ForceCommand '+shell,'MaxSessions 1','MaxAuthTries 2','LoginGraceTime 15','LogLevel ERROR',''].join('\n'));
  sudo(['/usr/sbin/sshd','-t','-f',sshdConfig]);
  const effective=sudo(['/usr/sbin/sshd','-T','-f',sshdConfig,'-C',
   'user='+account+',host=localhost,addr=127.0.0.1,laddr=127.0.0.1,lport='+port]).stdout;
  for(const line of ['usepam no','authenticationmethods publickey','passwordauthentication no',
   'kbdinteractiveauthentication no','pubkeyauthentication yes','permitrootlogin no',
   'disableforwarding yes','permittty no','forcecommand '+shell,'allowusers '+account+'@127.0.0.1']){
   assert.ok(effective.split('\n').includes(line),'effective isolated listener policy mismatch: '+line.split(' ')[0]);
  }
  console.log('sabora_backup_governed_non_pam_publickey_policy_ok');
  server=spawn('/usr/bin/sudo',['-n','/usr/sbin/sshd','-D','-e','-f',sshdConfig],{stdio:['ignore','ignore','pipe']});
  ended=once(server,'close');ended.catch(()=>{});server.stderr.resume();
  let ready=false;
  for(let i=0;i<40;i++){if(server.exitCode!==null||server.signalCode!==null)stop('listener_exited');if(await occupied(port)){ready=true;break;}await delay(50);}
  if(!ready)stop('listener_not_ready');
  const endpoint={environment:'disposable-lab',host:'127.0.0.1',port,user:account,sshBinary:await realpath('/usr/bin/ssh'),identityFile,knownHostsFile};
  // Strict sender username grammar allows up to 32 lowercase/alphanumeric characters.
  const args=await backupLabSshArguments(endpoint);
  const wrongKey=join(temp,'unapproved-key');
  run('/usr/bin/ssh-keygen',['-q','-t','ed25519','-N','','-f',wrongKey]);
  const wrongArgs=await backupLabSshArguments({...endpoint,identityFile:wrongKey});
  const deniedKey=run(endpoint.sshBinary,[...wrongArgs,'sabora-backup-receive-v1'],{allowFailure:true});
  assert.notEqual(deniedKey.status,0);assert.equal(deniedKey.stdout,'');
  assert.match(deniedKey.stderr,/Permission denied \(publickey\)/);
  for(const command of ['id','/bin/sh','sabora-backup-receive-v1; id','sabora-release-v1','sftp']){
   const denied=run(endpoint.sshBinary,[...args,command],{allowFailure:true});
   assert.notEqual(denied.status,0);assert.equal(denied.stdout,'');
  }
  assert.notEqual(run(endpoint.sshBinary,args,{allowFailure:true}).status,0);
  assert.notEqual(run(endpoint.sshBinary,[...args.slice(0,-1),'-s',args.at(-1),'sftp'],{allowFailure:true}).status,0);
  const send=request=>sendVpsBackupOverSsh({...request,endpoint,timeoutMs:60000});
  const inventory=()=>sudo(['/usr/bin/ls','-1A',cache]).stdout.trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(inventory(),[]);
  // The root-held signer is not the SSH account. A correctly signed wrong
  // scope or lower bundle budget still cannot progress to candidate creation.
  for(const bad of [
   {...config,environment:'production'},
   {...config,device:'0'},
   {...config,artifactSha256:'f'.repeat(64)},
   {...config,scope:{...scope,maxBundleBytes:1}},
   {...config,scope:{...scope,protectedGuard:{...scope.protectedGuard,inode:'1'}}}
  ]){
   await put(join(base,'scope.json'),signed(bad));
   await assert.rejects(send(first),/transfer_outcome_unknown/);assert.deepEqual(inventory(),[]);
  }
  await put(join(base,'scope.json'),signed(config));
  let priorPublishedState;
  for(const request of [first,second]){
   if(request===second){
    // Hold the exact guard before a valid new generation, NOT a replay
    // that would also fail without exclusion. The holder is deadline-bound
    // and exits on stdin EOF, with no arbitrary process termination.
    const holder=spawn('/usr/bin/sudo',['-n','/usr/bin/flock','-x',guard,
     '/usr/bin/timeout','15','/usr/bin/cat'],{stdio:['pipe','ignore','ignore']});
    holder.stdin.on('error',()=>{});
    const held=once(holder,'close');held.catch(()=>{});
    try{
     let locked=false;
     for(let i=0;i<80;i++){
      const probe=asAccount(['/usr/bin/flock','-n','-E','75',guard,'/usr/bin/true'],{allowFailure:true});
      if(probe.status===75){locked=true;break;}
      if(probe.status!==0||holder.exitCode!==null)stop('protected_guard_probe');
      await delay(25);
     }
     assert.equal(locked,true);
     await assert.rejects(send(second),/transfer_outcome_unknown/);
     assert.equal(holder.exitCode,null);
     assert.deepEqual(inventory(),['current','state.json']);
     assert.equal(hash(Buffer.from(readRoot(join(cache,'current','manifest.json')))),first.expected.manifestSha256);
    }finally{
     holder.stdin.end();
     const [status,signal]=await held;assert.equal(status,0);assert.equal(signal,null);
    }
   }
   const result=await send(request);
   assert.equal(result.manifestSha256,request.expected.manifestSha256);
   assert.deepEqual(inventory(),['current','state.json']);
   assert.equal(hash(Buffer.from(readRoot(join(cache,'current','manifest.json')))),request.expected.manifestSha256);
   const expectedStat=uid+':'+String((await lstat(volume,{bigint:true})).dev);
   assert.equal(sudo(['/usr/bin/stat','-c','%u:%d',guard]).stdout.trim(),'0:'+guardIdentity[0]);
   assert.equal(sudo(['/usr/bin/stat','-c','%d:%i',guard]).stdout.trim(),guardIdentity.join(':'));
   assert.equal(sudo(['/usr/bin/stat','-c','%u:%d',join(cache,'current')]).stdout.trim(),expectedStat);
   if(request===first)priorPublishedState=JSON.parse(readRoot(join(cache,'state.json')));
  }
  await assert.rejects(send(second),/transfer_outcome_unknown/);
  assert.deepEqual(inventory(),['current','state.json']);
  assert.equal(readRoot(join(base,'private-sentinel')),'fixture only');
  console.log('sabora_backup_governed_root_owned_guard_ok');
  // Real first/second ciphertexts and signed proofs, reconstructed at the
  // exact post-rename/pre-publication crash boundary. This is a controlled
  // state fixture, not a new SIGKILL experiment. Reuse existing restores.
  const coordinatorArgs=[node,join(code,'scripts/ops/sabora-backup-recovery-coordinator.mjs')];
  const coordinate=(request,opts={})=>sudo(coordinatorArgs,{input:JSON.stringify(request),...opts});
  const observe={operation:'inspect-transition'};
  assert.match(asAccount(coordinatorArgs,{input:JSON.stringify(observe),allowFailure:true}).stderr,/disposable_root_only/);
  assert.match(coordinate(observe,{allowFailure:true}).stderr,/listener_not_offline|writer_not_quiescent/);
  await closeListener();
  const active=()=>['-u','-U'].some(flag=>{
   const p=run('/usr/bin/pgrep',[flag,String(uid)],{allowFailure:true});
   if(![0,1].includes(p.status))stop('cleanup_process_probe_failed');
   return p.status===0;
  });
  for(let i=0;i<100&&active();i++)await delay(50);
  assert.equal(active(),false);
  const previous=join(cache,'previous');
  asAccount(['/usr/bin/mkdir','-m','0700',previous]);
  for(const name of ['manifest.json','initial-state.aesgcm']){
   sudo(['/usr/bin/install','-o',String(uid),'-g',String(gid),'-m','0600',join(first.sourceDirectory,name),join(previous,name)]);
  }
  const oldManifest=await readFile(join(first.sourceDirectory,'manifest.json'));
  const nextManifest=await readFile(join(second.sourceDirectory,'manifest.json'));
  assert.equal(hash(oldManifest),first.expected.manifestSha256);
  assert.equal(hash(nextManifest),second.expected.manifestSha256);
  const intent={schema:'sabora-vps-rotation-intent/v1',pid:process.pid,
   previous:{manifestB64:oldManifest.toString('base64'),proof:priorPublishedState.proof},
   next:{manifestB64:nextManifest.toString('base64'),proof:JSON.parse(second.proofBytes.toString('utf8'))}};
  for(const [name,value] of [['state.json',priorPublishedState],['rotation.lock',intent]]){
   const p=join(temp,'recovery-fixture-'+name);
   await writeFile(p,JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});
   sudo(['/usr/bin/install','-o',String(uid),'-g',String(gid),'-m','0600',p,join(cache,name)]);
  }
  assert.deepEqual(inventory(),['current','previous','rotation.lock','state.json']);
  const observed=JSON.parse(coordinate(observe).stdout);
  assert.equal(observed.operationalAuthorization,false);
  const subject=observed.result;
  assert.equal(subject.action,'publish-promoted-state');assert.equal(subject.phase,'promoted-unpublished');
  assert.equal(subject.sequence,1);assert.equal(subject.retainedManifestSha256,second.expected.manifestSha256);
  const proofBytes=second.proofBytes;
  const signedRecovery=(operation,fields,overrides={})=>{
   const payload={schema:operation==='apply-purge'?'sabora-vps-purge-authorization/v1':'sabora-vps-recovery-transition/v1',
    repository:genesis.repository,project:genesis.project,environment:scope.environment,
    storageIdentitySha256:scope.storageIdentitySha256,externalStorageIdentitySha256:scope.externalStorageIdentitySha256,
    externalProofSha256:hash(proofBytes),observedAt:new Date(Date.now()-1000).toISOString(),
    validUntil:new Date(Date.now()+60000).toISOString(),...fields,...overrides};
   const authorization=Buffer.from(JSON.stringify({payload,signature:sign(null,Buffer.from(stableStringify(payload)),recoveryAuthority.privateKey).toString('base64')}));
   return {operation,authorizationB64:authorization.toString('base64'),externalProofB64:proofBytes.toString('base64')};
  };
  const fields={action:subject.action,lockSha256:subject.lockSha256,subjectSha256:subject.subjectSha256,sequence:subject.sequence};
  const publish=signedRecovery('apply-transition',fields);
  const badSubject=signedRecovery('apply-transition',fields,{subjectSha256:hash('wrong-actual-subject')});
  assert.match(coordinate(badSubject,{allowFailure:true}).stderr,/recovery_authorization_scope_mismatch/);
  assert.match(coordinate({...publish,externalProofB64:first.proofBytes.toString('base64')},{allowFailure:true}).stderr,/external_proof_identity/);
  assert.equal(JSON.parse(readRoot(recordPath)).sequence,0);
  const published=JSON.parse(coordinate(publish).stdout);
  assert.equal(published.operationalAuthorization,false);assert.equal(published.result.phase,'state-published');
  assert.equal(JSON.parse(readRoot(recordPath)).sequence,1);
  assert.equal(JSON.parse(readRoot(join(cache,'state.json'))).manifestSha256,second.expected.manifestSha256);
  assert.deepEqual(inventory(),['current','previous','rotation.lock','state.json']);
  assert.match(coordinate(publish,{allowFailure:true}).stderr,/authorization_sequence/);
  const purgeSubject=JSON.parse(coordinate({operation:'inspect-purge'}).stdout).result;
  assert.equal(purgeSubject.sequence,2);assert.equal(purgeSubject.currentManifestSha256,second.expected.manifestSha256);
  const purge=signedRecovery('apply-purge',{action:'finish-published-purge',lockSha256:purgeSubject.lockSha256,
   currentManifestSha256:purgeSubject.currentManifestSha256,previousManifestSha256:purgeSubject.previousManifestSha256,
   previousRemainderSha256:purgeSubject.previousRemainderSha256,sequence:purgeSubject.sequence});
  const repaired=JSON.parse(coordinate(purge).stdout);
  assert.equal(repaired.operationalAuthorization,false);assert.equal(repaired.result.generations,1);
  assert.equal(repaired.result.currentManifestSha256,second.expected.manifestSha256);
  assert.equal(JSON.parse(readRoot(recordPath)).sequence,2);
  assert.match(coordinate(purge,{allowFailure:true}).stderr,/authorization_sequence/);
  assert.equal(hash(Buffer.from(readRoot(join(cache,'current','manifest.json')))),second.expected.manifestSha256);
  assert.deepEqual(inventory(),['current','state.json']);
  console.log('sabora_backup_governed_offline_coordinator_publish_and_purge_ok');
  // Exercise authorization consumption as a root-only primitive. The
  // subject is synthetic: no recovery action or slot mutation is authorized.
  const fenceProgram=`
   import {reserveProtectedRecoverySequence} from '${join(code,'scripts/ops/sabora-backup-recovery-fence.mjs')}';
   let raw='';for await(const chunk of process.stdin)raw+=chunk;
   const {authorizationB64,...request}=JSON.parse(raw);
   try{
    const result=reserveProtectedRecoverySequence({...request,authorizationBytes:Buffer.from(authorizationB64,'base64')});
    process.stdout.write(JSON.stringify(result)+'\\n');
   }catch(error){
    process.stderr.write(String(error.message)+'\\n');process.exitCode=1;
   }
  `;
  const fenceArgs=[node,'--input-type=module','--eval',fenceProgram];
  const expectedSubject={action:'discard-verified-candidate',lockSha256:hash('synthetic-lock'),
   subjectSha256:hash('synthetic-subject'),externalProofSha256:hash('synthetic-proof')};
  const auth={schema:'sabora-vps-recovery-transition/v1',repository:genesis.repository,project:genesis.project,
   environment:scope.environment,storageIdentitySha256:scope.storageIdentitySha256,
   externalStorageIdentitySha256:scope.externalStorageIdentitySha256,...expectedSubject,
   sequence:3,observedAt:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString()};
  const fenceInput=(payload=auth,subject=expectedSubject,key=recoveryAuthority.privateKey)=>{
   const authorization=Buffer.from(JSON.stringify({payload,signature:sign(null,Buffer.from(stableStringify(payload)),key).toString('base64')}));
   return JSON.stringify({directory:recoveryDir,scope,expected:subject,authorizationB64:authorization.toString('base64')});
  };
  const fence=(input,opts={})=>sudo(fenceArgs,{input,...opts});
  assert.match(asAccount(fenceArgs,{input:fenceInput(),allowFailure:true}).stderr,/disposable_root_only/);
  assert.match(fence(fenceInput({...auth,sequence:4}),{allowFailure:true}).stderr,/authorization_scope_or_sequence/);
  assert.match(fence(fenceInput(auth,{...expectedSubject,lockSha256:hash('wrong')}),{allowFailure:true}).stderr,/authorization_scope_or_sequence/);
  assert.match(fence(fenceInput(auth,expectedSubject,privateKey),{allowFailure:true}).stderr,/document_signature_invalid/);
  const reservation=JSON.parse(fence(fenceInput()).stdout);
  assert.equal(reservation.sequence,3);assert.equal(reservation.slotsChanged,false);
  assert.equal(reservation.operationalAuthorization,false);
  assert.match(fence(fenceInput(),{allowFailure:true}).stderr,/authorization_scope_or_sequence/);
  assert.equal(JSON.parse(readRoot(recordPath)).sequence,3);
  assert.notEqual(asAccount(['/usr/bin/rm','--',recordPath],{allowFailure:true}).status,0);
  // A missing genesis is never implicitly reset; an unpublished pending
  // counter is never discarded to authorize another operation.
  const saved=join(recoveryDir,'saved-sequence');
  sudo(['/usr/bin/mv','--',recordPath,saved]);
  try{assert.match(fence(fenceInput({...auth,sequence:4}),{allowFailure:true}).stderr,/unreconciled_sequence/);}
  finally{sudo(['/usr/bin/mv','--',saved,recordPath]);}
  const pending=join(recoveryDir,'sequence.pending');
  await put(pending,JSON.stringify(genesis)+'\n','0600');
  try{assert.match(fence(fenceInput({...auth,sequence:4}),{allowFailure:true}).stderr,/unreconciled_sequence/);}
  finally{sudo(['/usr/bin/rm','--',pending]);}
  const successor=JSON.parse(fence(fenceInput({...auth,sequence:4})).stdout);
  assert.equal(successor.sequence,4);assert.equal(JSON.parse(readRoot(recordPath)).sequence,4);
  assert.equal(hash(Buffer.from(readRoot(join(cache,'current','manifest.json')))),second.expected.manifestSha256);
  assert.deepEqual(inventory(),['current','state.json']);
  console.log('sabora_backup_governed_root_recovery_reservation_ok');
  console.log('sabora_backup_governed_dedicated_account_and_bounded_mount_ok');
 }finally{
  await closeListener();
  if(userCreated){
   // sshd session children can outlive the client ACK and the parent
   // daemon's exit briefly (including PAM cleanup). Wait for this exact
   // ephemeral account, not for a guessed delay or unrelated processes.
   const uid=Number(run('/usr/bin/id',['-u',account]).stdout.trim());
   if(accountUid!==undefined&&uid!==accountUid)stop('cleanup_account_identity_changed');
   if(!Number.isSafeInteger(uid)||uid<=0)stop('cleanup_account_identity_invalid');
   const processes=()=>{
    return ['-u','-U'].map(flag=>{
     const p=run('/usr/bin/pgrep',[flag,String(uid)],{allowFailure:true});
     if(![0,1].includes(p.status))stop('cleanup_process_probe_failed');
     return p.status===0;
    }).some(Boolean);
   };
   for(let i=0;i<100&&processes();i++)await delay(50);
   if(processes()){
    // Emit only counts/state for the exact disposable UID, never command
    // lines, environment or arbitrary user process details.
    const states=run('/usr/bin/ps',['-u',String(uid),'-U',String(uid),'-o','stat='],{allowFailure:true});
    const counts={running:0,sleeping:0,zombie:0,other:0};
    for(const state of states.stdout.trim().split(/\s+/).filter(Boolean)){
     const key=state[0]==='R'?'running':state[0]==='S'||state[0]==='D'?'sleeping':state[0]==='Z'?'zombie':'other';
     counts[key]++;
    }
    console.log('sabora_backup_governed_fixture_remaining_process_states:'+JSON.stringify(counts));
    stop('cleanup_account_sessions_still_live');
   }
   // Check real/effective identity and NSS after deletion; never force-delete
   // an in-use account or kill processes outside this lab.
   const deletion=sudo(['/usr/sbin/userdel',account],{allowFailure:true});
   if(deletion.status!==0)stop('cleanup_userdel_status_'+String(deletion.status));
   assert.equal(run('/usr/bin/getent',['passwd',account],{allowFailure:true}).status,2);
   assert.equal(run('/usr/bin/getent',['group',account],{allowFailure:true}).status,2);
  }
  if(mounted)sudo(['/usr/bin/umount',mount]);
  if(created)sudo(['/usr/bin/rm','-rf','--',base]);
  // subdir contains only the two-generation lab fixture and durable guard;
  // it stays in the disposable volume until its existing owner unmounts it.
  await rm(temp,{recursive:true,force:true});
  console.log('sabora_backup_governed_fixture_cleanup_ok');
 }
}
