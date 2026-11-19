// Dedicated account and root-owned code/control on a disposable hosted runner.
// Reuse the existing 32 MiB bounded ext4 fixture and real PG17 capture pair.
// The listener is separate, local only, and removed with its exact fixture.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer,connect} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,lstat,realpath,statfs,rm} from 'node:fs/promises';
import {join,dirname,basename,resolve} from 'node:path';
import {buildBackupPreparationArtifact} from './sabora-backup-preparation-artifact.mjs';
import {BACKUP_PREPARATION_FILES} from '../ops/sabora-backup-installation-plan.mjs';
import {stableStringify} from './sabora-release-governor.mjs';
import {backupLabSshArguments,sendVpsBackupOverSsh} from '../ops/sabora-vps-backup-transport.mjs';
const stop=code=>{throw Error('sabora_governed_receiver_ci_stop:'+code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function run(bin,args,{allowFailure=false}={}){
 const r=spawnSync(bin,args,{encoding:'utf8',timeout:30000,maxBuffer:262144});
 if(r.error||r.signal||(!allowFailure&&r.status!==0))stop('fixture_command_failed:'+basename(bin)+':'+basename(args[0]??''));
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
 let created=false,userCreated=false,mounted=false,server,ended,port;
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
  const artifact=join(temp,'source');
  const prepared=buildBackupPreparationArtifact(artifact,sourceSha);
  for(const name of ['artifact.json',...BACKUP_PREPARATION_FILES]){
   const target=join(code,name);dir(dirname(target));
   await put(target,await readFile(join(artifact,name)));
  }
  sudo(['/usr/bin/install','-o','root','-g','root','-m','0755',await realpath(process.execPath),node]);
  sudo(['/usr/sbin/useradd','--user-group','--no-create-home','--home-dir','/nonexistent','--shell',shell,account]);
  userCreated=true;sudo(['/usr/sbin/usermod','--password','*',account]);
  const uid=Number(run('/usr/bin/id',['-u',account]).stdout.trim()),gid=Number(run('/usr/bin/id',['-g',account]).stdout.trim());
  assert.ok(uid>0&&gid>0&&Number.isSafeInteger(uid)&&Number.isSafeInteger(gid));
  assert.equal(run('/usr/bin/id',['-G',account]).stdout.trim(),String(gid));
  const compiled=join(temp,'receive');
  run('/usr/bin/cc',['-O2','-Wall','-Wextra','-Werror',
   '-DSABORA_BACKUP_LAB_BASE="'+base+'"','-DSABORA_BACKUP_LAB_UID='+uid,'-DSABORA_BACKUP_LAB_GID='+gid,
   '-o',compiled,join(artifact,'deploy/sabora-backup-lab-shell.c')]);
  sudo(['/usr/bin/install','-o','root','-g','root','-m','0755',compiled,shell]);
  await mkdir(subdir,{mode:0o700});
  sudo(['/usr/bin/mount','--bind',subdir,mount]);mounted=true;
  sudo(['/usr/bin/mount','-o','remount,bind,nodev,nosuid,noexec',mount]);
  sudo(['/usr/bin/chown',uid+':'+gid,mount]);
  sudo(['/usr/bin/install','-d','-o',String(uid),'-g',String(gid),'-m','0700',cache]);
  const device=String((await lstat(volume,{bigint:true})).dev),fs=await statfs(volume,{bigint:true});
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const owner=publicKey.export({format:'pem',type:'spki'});
  const config={schema:'sabora-backup-governed-lab/v1',repository:'jdlc86/CartaViva',project:'sabora',
   environment:'disposable-lab',sourceSha,artifactSha256:prepared.artifactSha256,
   nodeSha256:hash(await readFile(process.execPath)),shellSha256:hash(await readFile(compiled)),
   uid,gid,volume:mount,cache,device,filesystemBytes:String(fs.blocks*fs.bsize),scope};
  const signed=p=>JSON.stringify({payload:p,signature:sign(null,Buffer.from(stableStringify(p)),privateKey).toString('base64')})+'\n';
  await put(join(base,'owner-public.pem'),owner);await put(join(base,'scope.json'),signed(config));
  await put(join(base,'private-sentinel'),'fixture only','0600');
  for(const path of [code,join(code,'artifact.json'),join(base,'scope.json'),node,shell,base]){
   assert.notEqual(sudo(['-u',account,'--','/usr/bin/test','-w',path],{allowFailure:true}).status,0);
  }
  assert.notEqual(sudo(['-u',account,'--','/usr/bin/test','-r',join(base,'private-sentinel')],{allowFailure:true}).status,0);
  assert.equal(sudo(['-u',account,'--','/usr/bin/test','-w',cache]).status,0);
  const hostKey=join(temp,'host-key'),identityFile=join(temp,'client-key');
  for(const path of [hostKey,identityFile])run('/usr/bin/ssh-keygen',['-q','-t','ed25519','-N','','-f',path]);
  await put(join(base,'host-key'),await readFile(hostKey),'0600');
  const publicClient=(await readFile(identityFile+'.pub','utf8')).trim().split(' ').slice(0,2).join(' ');
  const publicHost=(await readFile(hostKey+'.pub','utf8')).trim().split(' ').slice(0,2).join(' ');
  await put(join(base,'authorized_keys'),'restrict,command="'+shell+'" '+publicClient+'\n');
  port=await freePort();
  const knownHostsFile=join(temp,'known-hosts');await writeFile(knownHostsFile,'[127.0.0.1]:'+port+' '+publicHost+'\n',{mode:0o600});
  const sshdConfig=join(base,'sshd.conf');
  await put(sshdConfig,['ListenAddress 127.0.0.1','AddressFamily inet','Port '+port,
   'HostKey '+join(base,'host-key'),'PidFile '+join(base,'sshd.pid'),'AllowUsers '+account+'@127.0.0.1',
   'AuthorizedKeysFile '+join(base,'authorized_keys'),'StrictModes yes','AuthenticationMethods publickey',
   'PubkeyAuthentication yes','PasswordAuthentication no','KbdInteractiveAuthentication no','PermitRootLogin no',
   'UsePAM yes','PermitTTY no','DisableForwarding yes','PermitUserRC no','PermitUserEnvironment no',
   'ForceCommand '+shell,'MaxSessions 1','MaxAuthTries 2','LoginGraceTime 15','LogLevel ERROR',''].join('\n'));
  sudo(['/usr/sbin/sshd','-t','-f',sshdConfig]);
  server=spawn('/usr/bin/sudo',['-n','/usr/sbin/sshd','-D','-e','-f',sshdConfig],{stdio:['ignore','ignore','pipe']});
  ended=once(server,'close');ended.catch(()=>{});server.stderr.resume();
  let ready=false;
  for(let i=0;i<40;i++){if(server.exitCode!==null||server.signalCode!==null)stop('listener_exited');if(await occupied(port)){ready=true;break;}await delay(50);}
  if(!ready)stop('listener_not_ready');
  const endpoint={environment:'disposable-lab',host:'127.0.0.1',port,user:account,sshBinary:await realpath('/usr/bin/ssh'),identityFile,knownHostsFile};
  // Strict sender username grammar allows up to 32 lowercase/alphanumeric characters.
  const args=await backupLabSshArguments(endpoint);
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
   {...config,scope:{...scope,maxBundleBytes:1}}
  ]){
   await put(join(base,'scope.json'),signed(bad));
   await assert.rejects(send(first),/transfer_outcome_unknown/);assert.deepEqual(inventory(),[]);
  }
  await put(join(base,'scope.json'),signed(config));
  for(const request of [first,second]){
   const result=await send(request);
   assert.equal(result.manifestSha256,request.expected.manifestSha256);
   assert.deepEqual(inventory(),['current','state.json']);
   assert.equal(hash(Buffer.from(readRoot(join(cache,'current','manifest.json')))),request.expected.manifestSha256);
   const guard=join(mount,'.cache.rotation.guard');
   const expectedStat=uid+':'+String((await lstat(volume,{bigint:true})).dev);
   assert.equal(sudo(['/usr/bin/stat','-c','%u:%d',guard]).stdout.trim(),expectedStat);
   assert.equal(sudo(['/usr/bin/stat','-c','%u:%d',join(cache,'current')]).stdout.trim(),expectedStat);
  }
  await assert.rejects(send(second),/transfer_outcome_unknown/);
  assert.deepEqual(inventory(),['current','state.json']);
  assert.equal(readRoot(join(base,'private-sentinel')),'fixture only');
  console.log('sabora_backup_governed_dedicated_account_and_bounded_mount_ok');
 }finally{
  if(server){
   if(server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM');
   let timer;try{await Promise.race([ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('listener_cleanup_timeout')),5000);})]);}
   finally{clearTimeout(timer);}
   if(await occupied(port))stop('listener_cleanup_failed');
  }
  if(userCreated)sudo(['/usr/sbin/userdel',account]);
  if(mounted)sudo(['/usr/bin/umount',mount]);
  if(created)sudo(['/usr/bin/rm','-rf','--',base]);
  // subdir contains only the two-generation lab fixture and durable guard;
  // it stays in the disposable volume until its existing owner unmounts it.
  await rm(temp,{recursive:true,force:true});
 }
}
