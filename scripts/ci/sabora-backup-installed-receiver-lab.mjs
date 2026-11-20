// Material installed entry/sender test, hosted Linux runner ONLY.
// The production-candidate contract is exercised with ephemeral fixture keys,
// two already-verified PG17 initial captures, a disposable ext4 loop device,
// and a network namespace containing ONLY loopback. No external address,
// real owner authority, shared sshd, operational data or production receipt.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {generateKeyPairSync,sign,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,writeFile,lstat,realpath,statfs,rm} from 'node:fs/promises';
import {join,dirname,basename,resolve} from 'node:path';
import {buildBackupPreparationArtifact} from './sabora-backup-preparation-artifact.mjs';
import {BACKUP_INSTALL_PATHS as P,BACKUP_PREPARATION_FILES,verifyBackupInstallationPlan} from '../ops/sabora-backup-installation-plan.mjs';
import {sshEd25519Sha256} from '../ops/sabora-backup-installed-contract.mjs';
import {sha256} from '../ops/sabora-release-protected-store.mjs';
import {stableStringify} from './sabora-release-governor.mjs';

const stop=code=>{throw Error('sabora_installed_receiver_ci_stop:'+code);};
function run(bin,args,{allowFailure=false,input,timeout=30000}={}){
 const r=spawnSync(bin,args,{input,encoding:'utf8',timeout,maxBuffer:262144});
 if(r.error||r.signal||(!allowFailure&&r.status!==0))
  stop('fixture_command_failed:'+basename(bin)+':'+String(r.status??'spawn'));
 return r;
}
const sudo=(args,options)=>run('/usr/bin/sudo',['-n',...args],options);
const ip='/usr/sbin/ip';
const absent=path=>sudo(['/usr/bin/test','-e',path],{allowFailure:true}).status===1&&
 sudo(['/usr/bin/test','-L',path],{allowFailure:true}).status===1;
export async function exerciseInstalledBackupReceiver({fixture,volume,scope,repository,sourceSha,first,second}){
 const runId=process.env.GITHUB_RUN_ID??'',runnerUid=process.getuid(),runnerGid=process.getgid();
 if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||
  process.env.RUNNER_OS!=='Linux'||runnerUid===0||process.geteuid()!==runnerUid||
  !/^\d{1,15}$/.test(runId)||sourceSha!==process.env.GITHUB_SHA||scope.environment!=='production'||
  dirname(fixture)!==process.env.RUNNER_TEMP||dirname(volume)!==process.env.RUNNER_TEMP||
  !/^sabora-dual-backup-[A-Za-z0-9]+$/.test(basename(fixture))||
  !/^sabora-dual-backup-[A-Za-z0-9]+$/.test(basename(volume))||
  await realpath(fixture)!==fixture||await realpath(volume)!==volume||resolve(repository)!==repository)
  stop('disposable_context_required');
 // Fail closed on any existing path/account or namespace: never reuse or
 // delete a pre-existing installation. Only the hosted runner is mutable.
 const ns='sabora-installed-ci-'+runId,base='/etc/sabora',runDir=dirname(P.pidFile);
 const roots=[base,P.volume,runDir], account=P.account;
 for(const path of roots)if(!absent(path))stop('fixture_path_already_exists');
 for(const database of ['passwd','group'])
  if(run('/usr/bin/getent',[database,account],{allowFailure:true}).status!==2)stop('fixture_account_already_exists');
 if(sudo([ip,'netns','list']).stdout.split('\n').some(x=>x.split(' ')[0]===ns))stop('fixture_namespace_already_exists');
 const mountedDevice=sudo(['/usr/bin/findmnt','-n','-o','SOURCE','--mountpoint',volume]).stdout.trim();
 if(!/^\/dev\/loop[0-9]+$/.test(mountedDevice)||
  sudo(['/usr/sbin/losetup','--noheadings','--output','BACK-FILE',mountedDevice]).stdout.trim()!==join(fixture,'bounded-backup-disk.img'))
  stop('fixture_loop_device_identity');
 const fs=await statfs(volume,{bigint:true}),original=await lstat(volume);
 if(fs.type!==0xef53n||fs.blocks*fs.bsize>32n*1024n**2n||original.uid!==runnerUid||
  original.dev===(await lstat(fixture)).dev)stop('fixture_volume_identity');
 const uuid=sudo(['/usr/sbin/blkid','-s','UUID','-o','value',mountedDevice]).stdout.trim();
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(uuid))stop('fixture_uuid');
 const uuidPath='/dev/disk/by-uuid/'+uuid;
 const temp=await mkdtemp(join(process.env.RUNNER_TEMP,'sabora-installed-receiver-'));
 const created=[];let mounted=false,nsCreated=false,userCreated=false,uid,gid,uuidLink=false,server,ended;
 const installDir=(path,mode='0755',owner='0',group='0')=>
  sudo(['/usr/bin/install','-d','-o',owner,'-g',group,'-m',mode,path]);
 const put=async(path,bytes,mode='0644')=>{
  const local=join(temp,'put-'+sha256(Buffer.from(path)).slice(0,24));
  await writeFile(local,bytes,{mode:0o600});
  sudo(['/usr/bin/install','-o','root','-g','root','-m',mode,local,path]);
 };
 const names=()=>sudo(['/usr/bin/ls','-1A',P.cache]).stdout.trim().split('\n').filter(Boolean).sort();
 const currentSha=()=>sha256(Buffer.from(sudo(['/usr/bin/cat',join(P.cache,'current','manifest.json')]).stdout));
 const processes=()=>uid!==undefined&&['-U','-u'].some(flag=>{
  const r=run('/usr/bin/pgrep',[flag,String(uid)],{allowFailure:true});
  if(![0,1].includes(r.status))stop('fixture_process_probe_failed');
  return r.status===0;
 });
 try{
  for(const path of roots){sudo(['/usr/bin/mkdir','-m','0755',path]);created.push(path);}
  for(const path of [P.config,P.code,dirname(P.node)])installDir(path);
  assert.equal(run('/usr/bin/git',['-C',repository,'rev-parse','HEAD']).stdout.trim(),sourceSha);
  const artifactDir=join(temp,'artifact'),artifact=buildBackupPreparationArtifact(artifactDir,sourceSha);
  const artifactBytes=await readFile(join(artifactDir,'artifact.json'));
  for(const name of ['artifact.json',...BACKUP_PREPARATION_FILES]){
   const target=join(P.code,name);installDir(dirname(target));await put(target,await readFile(join(artifactDir,name)));
  }
  const node=await realpath(process.execPath);
  sudo(['/usr/bin/install','-o','root','-g','root','-m','0755',node,P.node]);
  sudo(['/usr/sbin/useradd','--user-group','--no-create-home','--home-dir','/nonexistent','--shell','/usr/sbin/nologin',account]);
  userCreated=true;
  uid=Number(run('/usr/bin/id',['-u',account]).stdout.trim());gid=Number(run('/usr/bin/id',['-g',account]).stdout.trim());
  assert.ok(Number.isSafeInteger(uid)&&uid>0&&uid!==10001&&Number.isSafeInteger(gid)&&gid>0&&gid!==10001);
  assert.equal(run('/usr/bin/id',['-G',account]).stdout.trim(),String(gid));
  const secret=randomBytes(48);
  try{
   const crypt=run('/usr/bin/openssl',['passwd','-6','-stdin'],{input:secret.toString('hex')+'\n'}).stdout.trim();
   if(!/^\$6\$[./A-Za-z0-9$]+$/.test(crypt))stop('fixture_shadow_hash');
   sudo(['/usr/sbin/chpasswd','-e'],{input:account+':'+crypt+'\n'});
  }finally{secret.fill(0);}
  const compiled=join(temp,'receive');
  run('/usr/bin/cc',['-O2','-Wall','-Wextra','-Werror','-DSABORA_BACKUP_UID='+uid,'-DSABORA_BACKUP_GID='+gid,
   '-o',compiled,join(artifactDir,'deploy/sabora-backup-installed-shell.c')]);
  sudo(['/usr/bin/install','-o','root','-g','root','-m','0755',compiled,P.shell]);
  sudo(['/usr/sbin/usermod','--shell',P.shell,account]);
  // Bind the FULL root of the individually identified ext4 loop volume,
  // never a subdirectory; the actual installed mountinfo check must pass.
  sudo(['/usr/bin/mount','--bind',volume,P.volume]);mounted=true;
  sudo(['/usr/bin/mount','-o','remount,bind,nodev,nosuid,noexec',P.volume]);
  sudo(['/usr/bin/chown','0:'+gid,P.volume]);sudo(['/usr/bin/chmod','0750',P.volume]);
  installDir(P.cache,'0700',String(uid),String(gid));installDir(P.recovery,'0700');
  const empty=join(temp,'empty');await writeFile(empty,'',{mode:0o600,flag:'wx'});
  sudo(['/usr/bin/install','-o','root','-g',String(gid),'-m','0440',empty,P.guard]);
  const [device,inode]=sudo(['/usr/bin/stat','-c','%d:%i',P.guard]).stdout.trim().split(':');
  // Some hosted runners do not create a by-uuid entry for loop devices.
  // If absent, provide the fixture-only alias after checking blkid and
  // backing image above; remove only the alias created by this test.
  if(absent(uuidPath)){
   if(absent(dirname(uuidPath)))stop('fixture_uuid_directory_missing');
   sudo(['/usr/bin/ln','-s',mountedDevice,uuidPath]);uuidLink=true;
  }
  assert.equal(await realpath(uuidPath),mountedDevice);
  const asAccount=(args,options)=>sudo(['/usr/bin/setpriv','--reuid',String(uid),'--regid',String(gid),'--clear-groups','--no-new-privs','--',...args],options);
  for(const path of [P.config,P.code,P.node,P.shell,P.volume,P.guard,P.recovery])
   assert.equal(asAccount(['/usr/bin/test','-w',path],{allowFailure:true}).status,1);
  assert.equal(asAccount(['/usr/bin/test','-w',P.cache]).status,0);
  assert.equal(asAccount(['/usr/bin/test','-x',P.recovery],{allowFailure:true}).status,1);
  await put(join(P.config,'private-sentinel'),'fixture','0600');
  assert.equal(asAccount(['/usr/bin/test','-r',join(P.config,'private-sentinel')],{allowFailure:true}).status,1);
  const hostKey=join(temp,'host'),identityFile=join(temp,'client');
  for(const path of [hostKey,identityFile])run('/usr/bin/ssh-keygen',['-q','-t','ed25519','-N','','-f',path]);
  const publicKey=async path=>(await readFile(path+'.pub','utf8')).trim().split(' ').slice(0,2).join(' ');
  const host=await publicKey(hostKey),client=await publicKey(identityFile);
  await put(P.hostKey,await readFile(hostKey),'0600');await put(P.hostKey+'.pub',host+'\n');
  await put(P.authorizedKeys,'restrict,command="'+P.shell+'" '+client+'\n');
  // Both SSH ends execute in an isolated namespace with no veth/uplink,
  // default route or connection to the host network. TEST-NET address is
  // assigned ONLY to its loopback and is never contacted outside it.
  sudo([ip,'netns','add',ns]);nsCreated=true;
  sudo([ip,'-n',ns,'link','set','lo','up']);
  const addr='192.0.2.17',port=22239;
  sudo([ip,'-n',ns,'addr','add',addr+'/32','dev','lo']);
  const links=JSON.parse(sudo([ip,'-n',ns,'-j','link','show']).stdout);
  assert.deepEqual(links.map(x=>x.ifname),['lo']);
  assert.equal(sudo([ip,'-n',ns,'route','show','default']).stdout.trim(),'');
  assert.equal(sudo([ip,'-n',ns,'-6','route','show','default']).stdout.trim(),'');
  const owner=generateKeyPairSync('ed25519'),ownerPublicKey=owner.publicKey.export({format:'pem',type:'spki'});
  const pem=join(temp,'owner.pem');
  await writeFile(pem,ownerPublicKey,{mode:0o600,flag:'wx'});await put(join(P.config,'owner-public.pem'),ownerPublicKey);
  const ssh=await realpath('/usr/bin/ssh'),knownHostsFile=join(temp,'known-hosts');
  await writeFile(knownHostsFile,'['+addr+']:'+port+' '+host+'\n',{mode:0o600,flag:'wx'});
  const runtime={nodeSha256:sha256(await readFile(node)),shellSha256:sha256(await readFile(compiled)),
   sshdSha256:sha256(await readFile('/usr/sbin/sshd')),flockSha256:sha256(await readFile('/usr/bin/flock'))};
  const now=Date.now(),from=new Date(now-1000).toISOString(),until=new Date(now+240000).toISOString();
  const plan={schema:'sabora-backup-installation-plan/v1',repository:'jdlc86/CartaViva',project:'sabora',
   environment:'production-candidate',sourceSha,artifactSha256:artifact.artifactSha256,plannedAt:from,validUntil:until,
   account,paths:{config:P.config,volume:P.volume,cache:P.cache,recovery:P.recovery,guard:P.guard,control:P.control},
   transport:{listenAddress:addr,port,clientAddress:addr,hostKeySha256:sshEd25519Sha256(host),clientKeySha256:sshEd25519Sha256(client)},
   storage:{filesystem:'ext4',filesystemUuid:uuid,filesystemBytes:Number(fs.blocks*fs.bsize),
    quotaBytes:scope.quotaBytes,reserveBytes:scope.reserveBytes,maxBundleBytes:scope.maxBundleBytes,
    metadataBudgetBytes:4*1024**2,storageIdentitySha256:scope.storageIdentitySha256,
    externalStorageIdentitySha256:scope.externalStorageIdentitySha256,systemIdentifier:scope.systemIdentifier},
   authorities:{verificationPublicKey:scope.verifierPublicKey,recoveryPublicKey:scope.recoveryPublicKey},runtime};
  const signed=payload=>Buffer.from(JSON.stringify({payload,signature:sign(null,Buffer.from(stableStringify(payload)),owner.privateKey).toString('base64')}));
  const planBytes=signed(plan),checked=verifyBackupInstallationPlan({planBytes,artifactBytes,ownerPublicKey});
  await put(join(P.config,'plan.json'),planBytes);await put(join(P.config,'sshd.conf'),checked.sshdConfiguration);
  const activation={schema:'sabora-backup-receiver-activation/v1',repository:plan.repository,project:plan.project,
   environment:'production',operation:'receive-encrypted-only',sourceSha,artifactSha256:plan.artifactSha256,
   planSha256:checked.planSha256,configurationSha256:checked.configurationSha256,
   installationId:'SABORA-BACKUP-INSTALL-CI-'+runId,hostIdentitySha256:sha256(await readFile('/etc/machine-id')),
   uid,gid,device,guardInode:inode,independentReviewSha256:sha256(Buffer.from('fixture-not-independent-review')),
   isolationEvidenceSha256:sha256(Buffer.from('fixture-not-operational-isolation')),senderBinarySha256:sha256(await readFile(ssh)),
   authorizedAt:from,validUntil:until};
  const activationBytes=signed(activation);
  const configPath=join(P.config,'activation.json');
  await put(configPath,activationBytes);
  const planPath=join(temp,'plan.json'),artifactPath=join(temp,'artifact.json'),activationPath=join(temp,'activation.json');
  for(const [path,bytes] of [[planPath,planBytes],[artifactPath,artifactBytes],[activationPath,activationBytes]])
   await writeFile(path,bytes,{mode:0o600,flag:'wx'});
  const sshdConf=join(P.config,'sshd.conf'),net=(args,opts)=>sudo([ip,'netns','exec',ns,...args],opts);
  net(['/usr/sbin/sshd','-t','-f',sshdConf]);
  const effective=net(['/usr/sbin/sshd','-T','-f',sshdConf,'-C',
   'user='+account+',host=fixture,addr='+addr+',laddr='+addr+',lport='+port]).stdout.split('\n');
  for(const value of ['usepam no','authenticationmethods publickey','passwordauthentication no','disableforwarding yes',
   'forcecommand '+P.shell,'allowusers '+account+'@'+addr])assert.ok(effective.includes(value));
  server=spawn('/usr/bin/sudo',['-n',ip,'netns','exec',ns,'/usr/sbin/sshd','-D','-e','-f',sshdConf],{stdio:['ignore','ignore','pipe']});
  ended=once(server,'close');ended.catch(()=>{});server.stderr.resume();
  let ready=false;
  for(let i=0;i<100;i++){
   if(server.exitCode!==null)stop('fixture_listener_exited');
   if(net(['/usr/bin/ss','-H','-ltn','sport','=',':'+port]).stdout.includes(addr+':'+port)){ready=true;break;}
   await delay(50);
  }
  if(!ready)stop('fixture_listener_not_ready');
  const endpoint={environment:'production',host:addr,port,user:account,sshBinary:ssh,identityFile,knownHostsFile};
  const profile=join(temp,'profile.json'),proofPath=join(temp,'proof.json');
  const send=async(request,mode='send')=>{
   await writeFile(proofPath,request.proofBytes,{mode:0o600});
   await writeFile(profile,JSON.stringify({schema:'sabora-installed-backup-sender-profile/v1',sourceDirectory:request.sourceDirectory,
    endpoint,ownerPublicKeyPath:pem,planPath,artifactPath,activationPath,proofPath}),{mode:0o600});
   return net(['/usr/bin/setpriv','--reuid',String(runnerUid),'--regid',String(runnerGid),'--clear-groups','--no-new-privs','--',
    node,join(repository,'scripts/ops/sabora-backup-installed-send.mjs'),mode,profile],{allowFailure:true,timeout:60000});
  };
  const preflight=await send(first,'preflight');
  assert.equal(preflight.status,0,'installed sender preflight');
  assert.equal(JSON.parse(preflight.stdout).networkContacted,false);
  assert.deepEqual(names(),[]);
  for(const incorrect of [{...activation,hostIdentitySha256:sha256(Buffer.from('wrong-host'))},
   {...activation,guardInode:inode==='1'?'2':'1'}]){
   await put(configPath,signed(incorrect));
   const denied=await send(first);
   assert.notEqual(denied.status,0);assert.equal(denied.stdout,'');assert.deepEqual(names(),[]);
  }
  await put(configPath,activationBytes);
  for(const request of [first,second]){
   const sent=await send(request);
   if(sent.status!==0){
    // Sender emits typed diagnostics only; never copy sshd stderr or paths.
    const reason=sent.stderr.trim();
    stop('installed_exchange_rejected:'+(/^[a-z_]+:[a-z_]+(?::[a-z_]+)?$/.test(reason)?reason:'unclassified'));
   }
   const ack=JSON.parse(sent.stdout);
   assert.equal(ack.schema,'sabora-vps-installed-rotation-result/v1');
   assert.equal(ack.installationId,activation.installationId);
   assert.equal(ack.activationSha256,sha256(activationBytes));
   assert.equal(ack.manifestSha256,request.expected.manifestSha256);
   assert.equal(ack.previousManifestSha256,request.expected.previousManifestSha256);
   assert.equal(ack.operationalReceipt,false);assert.equal(ack.generations,1);
   assert.deepEqual(names(),['current','state.json']);assert.equal(currentSha(),request.expected.manifestSha256);
  }
  const replay=await send(second);assert.notEqual(replay.status,0);assert.equal(replay.stdout,'');
  assert.deepEqual(names(),['current','state.json']);assert.equal(currentSha(),second.expected.manifestSha256);
  assert.equal(sudo(['/usr/bin/stat','-c','%d:%i',P.guard]).stdout.trim(),device+':'+inode);
  console.log('sabora_backup_installed_receiver_native_linux_ssh_ok');
 }finally{
  if(server){
   if(server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM');
   let timer;try{await Promise.race([ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('fixture_listener_stop_timeout')),5000);})]);}
   finally{clearTimeout(timer);}
  }
  if(userCreated){
   for(let i=0;i<100&&processes();i++)await delay(50);
   if(processes())stop('fixture_account_still_active');
   sudo(['/usr/sbin/userdel',account]);
   for(const database of ['passwd','group'])assert.equal(run('/usr/bin/getent',[database,account],{allowFailure:true}).status,2);
  }
  if(nsCreated){
   if(sudo([ip,'netns','pids',ns]).stdout.trim())stop('fixture_namespace_still_active');
   sudo([ip,'netns','delete',ns]);
  }
  if(uuidLink){
   assert.equal(await realpath(uuidPath),mountedDevice);sudo(['/usr/bin/unlink',uuidPath]);
  }
  if(mounted){
   sudo(['/usr/bin/chown',runnerUid+':'+runnerGid,P.volume]);sudo(['/usr/bin/chmod','0700',P.volume]);
   sudo(['/usr/bin/umount',P.volume]);
  }
  // Only roots whose mkdir succeeded in this hosted fixture can be removed.
  // The ext4 image itself is torn down by the owning bounded-volume harness.
  for(const path of created.reverse())sudo(['/usr/bin/rm','-r','--',path]);
  await rm(temp,{recursive:true,force:true});
 }
 console.log('sabora_backup_installed_receiver_fixture_cleanup_ok');
}
