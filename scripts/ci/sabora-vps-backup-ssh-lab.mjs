// Disposable loopback SSH test using the real PG17 backup fixtures. No
// changes to system SSH configuration, accounts or services; a separate
// foreground daemon is started and stopped by this test only.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer,connect} from 'node:net';
import {userInfo} from 'node:os';
import {dirname,join,basename,isAbsolute} from 'node:path';
import {mkdir,readFile,writeFile,lstat,statfs,realpath,access,readdir,unlink,mkdtemp,open,rmdir} from 'node:fs/promises';
import {generateKeyPairSync,sign} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {stableStringify} from './sabora-release-governor.mjs';
import {backupLabSshArguments,sendVpsBackupOverSsh} from '../ops/sabora-vps-backup-transport.mjs';
import {inspectEncryptedBackupBundle} from '../ops/sabora-encrypted-backup-bundle.mjs';
import {encodeVpsBackupStream} from '../ops/sabora-vps-backup-wire.mjs';
import {inspectVpsRotationRecovery} from '../ops/sabora-vps-backup-rotation.mjs';
const stop=code=>{throw Error('sabora_backup_ssh_ci_stop:'+code);};
function run(bin,args,{allowFailure=false}={}){
 const value=spawnSync(bin,args,{encoding:'utf8',timeout:15000,maxBuffer:16384});
 if(value.error||value.signal||(!allowFailure&&value.status!==0))stop('fixture_command_failed:'+basename(bin));
 return value;
}
async function portForLab(){
 const server=createServer();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.address().port;
 await new Promise(resolve=>server.close(resolve));
 return port;
}
async function listening(port){
 return new Promise(resolve=>{
  const socket=connect(port,'127.0.0.1');
  const done=value=>{socket.destroy();resolve(value);};
  socket.setTimeout(250);socket.once('connect',()=>done(true));socket.once('timeout',()=>done(false));socket.once('error',()=>done(false));
 });
}
async function until(check,code,ms=10000){
 const deadline=Date.now()+ms;
 for(;;){
  if(await check())return;
  if(Date.now()>=deadline)stop(code);
  await delay(25);
 }
}
async function optionalStat(path){
 try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function labDocument(payload,key){
 return JSON.stringify({payload,signature:sign(null,Buffer.from(stableStringify(payload)),key).toString('base64')})+'\n';
}
export async function startBackupSshLab({fixture,scope,sourceSha,entryPath}){
 const {uid,username}=userInfo();
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Linux'||process.platform!=='linux'||
  !process.env.RUNNER_TEMP||uid===0||process.geteuid()!==uid||
  dirname(fixture)!==process.env.RUNNER_TEMP||!/^sabora-dual-backup-[a-zA-Z0-9]+$/.test(basename(fixture))||
  scope.environment!=='disposable-lab'||!/^[0-9a-f]{40}$/.test(sourceSha)||
  !/^[a-z_][a-z0-9_-]{0,31}$/.test(username))stop('disposable_context_required');
 const control=join(fixture,'ssh-backup-control'),root=join(fixture,'ssh-backup-cache');
 await mkdir(control,{mode:0o700});await mkdir(root,{mode:0o700});
 const owner=generateKeyPairSync('ed25519');
 const put=(name,data)=>writeFile(join(control,name),data,{mode:0o600,flag:'wx'});
 await put('owner-public.pem',owner.publicKey.export({format:'pem',type:'spki'}));
 const config={schema:'sabora-backup-lab-installation/v1',repository:'jdlc86/CartaViva',project:'sabora',
  environment:'disposable-lab',sourceSha,root,uid,filesystemDevice:String((await lstat(root,{bigint:true})).dev),
  filesystemType:String((await statfs(root,{bigint:true})).type),
  filesystemBytes:String(await statfs(root,{bigint:true}).then(fs=>fs.blocks*fs.bsize)),scope};
 const signed=labDocument(config,owner.privateKey);
 await put('scope.json',signed);
 const hostKey=join(control,'host-key'),clientKey=join(control,'client-key');
 for(const path of [hostKey,clientKey])run('/usr/bin/ssh-keygen',['-q','-t','ed25519','-N','','-f',path]);
 const clientPublic=(await readFile(clientKey+'.pub','utf8')).trim().split(' ').slice(0,2).join(' ');
 const publicHost=(await readFile(hostKey+'.pub','utf8')).trim().split(' ').slice(0,2).join(' ');
 const node=await realpath(process.execPath),entry=await realpath(entryPath);
 if(![node,entry,control,root,hostKey].every(p=>isAbsolute(p)&&/^\/[A-Za-z0-9_./-]+$/.test(p)))stop('fixture_path_unsafe');
 // Test-only wrapper. The receiver code remains unchanged and consumes the
 // real SSH stdin. When requested by the fixture, withhold only its success
 // response after actual commit; no synthetic receipt or production hook.
 const wrapper=join(control,'receiver-fixture.mjs');
 await put('receiver-fixture.mjs',`
 import {spawn} from 'node:child_process';
 import {once} from 'node:events';
 import {access,writeFile,rename} from 'node:fs/promises';
 import {join} from 'node:path';
 import {setTimeout as delay} from 'node:timers/promises';
 const [entry,control]=process.argv.slice(2);
 const has=async p=>{try{await access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
 const hold=await has(join(control,'hold-ack'));
 const child=spawn(process.execPath,[entry,control],{stdio:['inherit',hold?'pipe':'inherit','inherit']});
 const ended=once(child,'close');let chunks=[],size=0;
 if(hold)child.stdout.on('data',chunk=>{size+=chunk.length;if(size>4096){child.kill();return;}chunks.push(chunk)});
 const [status,signal]=await ended;
 if(status!==0||signal||size>4096){process.exitCode=1;}
 else if(hold){
  const ack=Buffer.concat(chunks);
  if(!ack.length)throw Error('fixture_ack_missing');
  // Publish the completed ACK atomically. The observer polls ack-ready;
  // exposing a newly opened zero-length file races with its JSON parser.
  const pending=join(control,'ack-ready.pending');
  await writeFile(pending,ack,{mode:0o600,flag:'wx'});
  await rename(pending,join(control,'ack-ready'));
  // Wait until the test closes the actual SSH client; never send the ACK.
  for(let i=0;i<400;i++){if(await has(join(control,'ack-release')))break;await delay(25);}
  process.exitCode=1;
 }
 `);
 const command=[node,wrapper,entry,control].join(' ');
 await put('authorized_keys','restrict,command="'+command+'" '+clientPublic+'\n');
 const port=await portForLab();
 const knownHosts=join(control,'known-hosts'),wrongKnown=join(control,'wrong-hosts');
 await put('known-hosts','[127.0.0.1]:'+port+' '+publicHost+'\n');
 await put('wrong-hosts','[127.0.0.1]:'+port+' '+clientPublic+'\n');
 const endpoint={environment:'disposable-lab',host:'127.0.0.1',port,user:username,
  sshBinary:await realpath('/usr/bin/ssh'),identityFile:clientKey,knownHostsFile:knownHosts};
 const sshdConfig=join(control,'sshd.conf');
 await put('sshd.conf',[
  'ListenAddress 127.0.0.1','AddressFamily inet','Port '+port,'HostKey '+hostKey,
  'PidFile '+join(control,'daemon.pid'),'AllowUsers '+username,'AuthorizedKeysFile '+join(control,'authorized_keys'),
  'StrictModes yes','AuthenticationMethods publickey','PubkeyAuthentication yes','PasswordAuthentication no',
  'KbdInteractiveAuthentication no','PermitRootLogin no','UsePAM yes','PermitTTY no','DisableForwarding yes',
  'AllowTcpForwarding no','AllowAgentForwarding no','X11Forwarding no','PermitTunnel no','PermitUserRC no',
  'PermitUserEnvironment no','ForceCommand '+command,'MaxSessions 1','MaxAuthTries 2','LoginGraceTime 15',
  'LogLevel ERROR',''
 ].join('\n'));
 // Ubuntu hosted runner only, no shared daemon reload or account changes.
 try{await access('/run/sshd');}catch{run('/usr/bin/sudo',['-n','/usr/bin/install','-d','-m','0755','/run/sshd']);}
 run('/usr/bin/sudo',['-n','/usr/sbin/sshd','-t','-f',sshdConfig]);
 const server=spawn('/usr/bin/sudo',['-n','/usr/sbin/sshd','-D','-e','-f',sshdConfig],{stdio:['ignore','ignore','pipe']});
 const ended=once(server,'close');ended.catch(()=>{});
 server.stderr.resume();
 let stopped=false;
 const close=async()=>{
  if(stopped)return;stopped=true;
  if(server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM');
  let timer;
  try{await Promise.race([ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('fixture_daemon_stop_timeout')),5000);})]);}
  finally{clearTimeout(timer);}
  if(await listening(port))stop('fixture_listener_not_closed');
 };
 const send=({sourceDirectory,proofBytes,expected,endpoint:target=endpoint,signal})=>
  sendVpsBackupOverSsh({endpoint:target,sourceDirectory,proofBytes,expected,timeoutMs:60000,signal});
 try{
  let ready=false;
  for(let i=0;i<30;i++){
   if(server.exitCode!==null||server.signalCode!==null)stop('fixture_daemon_exited');
   if(await listening(port)){ready=true;break;}
   await delay(100);
  }
  if(!ready||server.exitCode!==null)stop('fixture_listener_not_ready');
  const args=await backupLabSshArguments(endpoint);
  const denied=commandArgs=>{
   const result=run(endpoint.sshBinary,commandArgs,{allowFailure:true});
   assert.notEqual(result.status,0,'unexpected remote command success');
  };
  denied([...args,'id']);denied(args);
  // A subsystem request goes through the same restricted command boundary.
  denied([...args.slice(0,-1),'-s',args.at(-1),'sftp']);
  assert.deepEqual(await readdir(root),[]);
  console.log('sabora_vps_backup_ssh_restricted_commands_ok');
  const proveInitialNegatives=async request=>{
   await assert.rejects(send({...request,endpoint:{...endpoint,knownHostsFile:wrongKnown}}),/transfer_outcome_unknown/);
   await assert.rejects(send({...request,endpoint:{...endpoint,environment:'production'}}),/endpoint_not_authorized/);
   const path=join(control,'scope.json');
   const changed=JSON.parse(signed);changed.payload.scope.quotaBytes++;
   const signedBadDisk=labDocument({...config,filesystemDevice:'0'},owner.privateKey);
   const signedBadCapacity=labDocument({...config,filesystemBytes:'1'},owner.privateKey);
   const signedBadQuota=labDocument({...config,scope:{...scope,quotaBytes:scope.reserveBytes+1}},owner.privateKey);
   const signedProduction=labDocument({...config,environment:'production'},owner.privateKey);
   try{
    for(const invalid of [JSON.stringify(changed),signedBadDisk,signedBadCapacity,signedBadQuota,signedProduction]){
     await writeFile(path,invalid,{mode:0o600});
     await assert.rejects(send(request),/transfer_outcome_unknown/);
     assert.deepEqual(await readdir(root),[],'failed signed setup does not create a bundle');
    }
   }finally{await writeFile(path,signed,{mode:0o600});}
   // A real SSH session ends with an incomplete header. The receiver must
   // fail without beginning a candidate or leaving a durable intent.
   const truncated=spawnSync(endpoint.sshBinary,[...args,'sabora-backup-receive-v1'],
    {input:Buffer.from('SABORA-BACKUP-WIRE/1\n'),timeout:15000,maxBuffer:8192});
   assert.equal(truncated.error,undefined);assert.equal(truncated.signal,null);assert.notEqual(truncated.status,0);
   assert.deepEqual(await readdir(root),[]);
   console.log('sabora_vps_backup_ssh_host_scope_and_truncation_ok');
  };
  const transfer=async request=>{
   const result=await send(request);
   assert.equal((await inspectEncryptedBackupBundle(join(root,'current'))).manifestSha256,request.expected.manifestSha256);
   assert.deepEqual((await readdir(root)).sort(),['current','state.json']);
   return result;
  };
  const waitWriterGone=async()=>{
   const guard=join(fixture,'.'+basename(root)+'.rotation.guard');
   await until(async()=>{
    if(!await optionalStat(guard))return false;
    const lock=run('/usr/bin/flock',['-n','-E','75',guard,'/usr/bin/true'],{allowFailure:true});
    if(![0,75].includes(lock.status))stop('fixture_guard_probe_failed');
    return lock.status===0;
   },'fixture_writer_not_released');
  };
  const loseAcknowledgement=async request=>{
   await put('hold-ack','fixture-only');
   const controller=new AbortController();
   const attempt=send({...request,signal:controller.signal});
   const rejected=assert.rejects(attempt,/transfer_outcome_unknown/);
   // Attach an observer immediately: failure before actual commit is not
   // accepted as an ACK loss by this fixture.
   rejected.catch(()=>{});
   try{
    await until(()=>optionalStat(join(control,'ack-ready')),'fixture_commit_not_observed');
    const ack=JSON.parse(await readFile(join(control,'ack-ready'),'utf8'));
    assert.equal(ack.manifestSha256,request.expected.manifestSha256);
    assert.equal((await inspectEncryptedBackupBundle(join(root,'current'))).manifestSha256,request.expected.manifestSha256);
    assert.deepEqual((await readdir(root)).sort(),['current','state.json']);
    controller.abort();await rejected;
   }finally{
    controller.abort();
    await attempt.catch(()=>{});
    await put('ack-release','fixture-only');
    await unlink(join(control,'hold-ack'));
   }
   await waitWriterGone();
   // Replaying the original transfer would not establish its outcome.
   await assert.rejects(send(request),/transfer_outcome_unknown/);
   assert.equal((await inspectEncryptedBackupBundle(join(root,'current'))).manifestSha256,request.expected.manifestSha256);
   console.log('sabora_vps_backup_ssh_ack_lost_after_commit_ok');
  };
  const disconnectMidBody=async request=>{
   // Only the tiny real PREINSTALL fixture is buffered here, never V2 data.
   const frames=[];let bytes=0;
   for await(const frame of encodeVpsBackupStream(request)){
    bytes+=frame.length;if(bytes>262144)stop('fixture_wire_too_large');frames.push(frame);
   }
   const wire=Buffer.concat(frames);
   // The sole initial-state ciphertext frame follows the fixed header.
   const header=frames.slice(0,6).reduce((n,b)=>n+b.length,0);
   const length=Number(frames[5].readBigUInt64BE());
   if(length<2||wire.length!==header+length)stop('fixture_preinstall_frame_required');
   const partial=Math.floor(length/2);
   const client=spawn(endpoint.sshBinary,[...args,'sabora-backup-receive-v1'],{stdio:['pipe','pipe','pipe']});
   const ended=once(client,'close');ended.catch(()=>{});
   client.stdin.on('error',()=>{});client.stdout.resume();client.stderr.resume();
   try{
    // Keep stdin open: distinguish a dead SSH connection from a normal EOF.
    client.stdin.write(wire.subarray(0,header+partial));
    await until(async()=>{
     const file=await optionalStat(join(root,'candidate','initial-state.aesgcm'));
     return file?.size===partial;
    },'fixture_partial_not_received');
    client.kill('SIGKILL');
    const [code,signal]=await ended;
    assert.equal(signal,'SIGKILL');assert.equal(code,null);
   }finally{if(client.exitCode===null&&client.signalCode===null)client.kill('SIGKILL');await ended;}
   await waitWriterGone();
   assert.deepEqual((await readdir(root)).sort(),['candidate','current','rotation.lock','state.json']);
   assert.equal((await lstat(join(root,'candidate','initial-state.aesgcm'))).size,partial);
   assert.equal((await inspectEncryptedBackupBundle(join(root,'current'))).manifestSha256,request.expected.previousManifestSha256);
   const diagnosis=await inspectVpsRotationRecovery({root,scope});
   assert.equal(diagnosis.phase,'before-promotion');assert.equal(diagnosis.blocked,true);
   assert.ok(diagnosis.recoverableSlots.every(s=>s.slot==='current'));
   await assert.rejects(send(request),/transfer_outcome_unknown/);
   assert.deepEqual((await readdir(root)).sort(),['candidate','current','rotation.lock','state.json']);
   console.log('sabora_vps_backup_ssh_midbody_disconnect_preserved_previous_ok');
  };
  // Fill only the explicitly bounded disposable disk AFTER admission and
  // opening the ciphertext file, before delivering its body. Require the
  // actual kernel failure class, not simply a transport failure.
  const exhaustDuringBody=async({request,fill,release})=>{
   if(typeof fill!=='function'||typeof release!=='function')stop('fixture_pressure_required');
   const frames=[];let bytes=0;
   for await(const frame of encodeVpsBackupStream(request)){
    bytes+=frame.length;if(bytes>262144)stop('fixture_wire_too_large');frames.push(frame);
   }
   const wire=Buffer.concat(frames),header=frames.slice(0,6).reduce((n,b)=>n+b.length,0);
   const length=Number(frames[5].readBigUInt64BE());
   if(length<1||wire.length!==header+length)stop('fixture_preinstall_frame_required');
   const client=spawn(endpoint.sshBinary,[...args,'sabora-backup-receive-v1'],{stdio:['pipe','pipe','pipe']});
   const ended=once(client,'close');ended.catch(()=>{});
   let out='',err='';
   client.stdin.on('error',()=>{});
   client.stdout.on('data',b=>{out=(out+b.toString()).slice(0,4096);});
   client.stderr.on('data',b=>{err=(err+b.toString()).slice(0,8192);});
   let timedOut=false;
   const timer=setTimeout(()=>{timedOut=true;client.kill('SIGKILL');},25000);
   try{
    client.stdin.write(wire.subarray(0,header));
    await until(async()=>{
     const file=await optionalStat(join(root,'candidate','initial-state.aesgcm'));
     return file?.isFile()&&file.size===0;
    },'fixture_candidate_not_opened');
    assert.equal((await inspectEncryptedBackupBundle(join(root,'current'))).manifestSha256,request.expected.previousManifestSha256);
    await fill();
    assert.equal((await statfs(root,{bigint:true})).bavail,0n);
    client.stdin.end(wire.subarray(header));
    const [code,signal]=await ended;
    assert.equal(timedOut,false);assert.equal(signal,null);assert.notEqual(code,0);
    assert.equal(out,'');assert.match(err,/sabora_backup_lab_entry_stop:storage_enospc/);
   }finally{
    clearTimeout(timer);
    if(client.exitCode===null&&client.signalCode===null)client.kill('SIGKILL');
    try{await ended;}finally{await release();}
   }
   await waitWriterGone();
   assert.deepEqual((await readdir(root)).sort(),['candidate','current','rotation.lock','state.json']);
   assert.equal((await inspectEncryptedBackupBundle(join(root,'current'))).manifestSha256,request.expected.previousManifestSha256);
   const diagnosis=await inspectVpsRotationRecovery({root,scope});
   assert.equal(diagnosis.phase,'before-promotion');assert.equal(diagnosis.blocked,true);
   assert.ok(diagnosis.recoverableSlots.some(s=>s.slot==='current'&&s.manifestSha256===request.expected.previousManifestSha256));
   await assert.rejects(send(request),/transfer_outcome_unknown/);
   assert.deepEqual((await readdir(root)).sort(),['candidate','current','rotation.lock','state.json']);
   console.log('sabora_vps_backup_ssh_enospc_after_admission_preserved_previous_ok');
  };
  return {root,send,transfer,proveInitialNegatives,loseAcknowledgement,disconnectMidBody,exhaustDuringBody,close};
 }catch(error){await close();throw error;}
}

// Dedicated bounded disk fixture, never allocate pressure on the runner's
// shared filesystem. The image is small, newly created and mounted only at
// this named fixture, with no host service restart or global quota changes.
export async function withBoundedBackupVolume({fixture,operation}){
 const {uid,gid}=userInfo();
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||
  process.env.RUNNER_OS!=='Linux'||process.platform!=='linux'||uid===0||
  dirname(fixture)!==process.env.RUNNER_TEMP||!/^sabora-dual-backup-[a-zA-Z0-9]+$/.test(basename(fixture)))
  stop('bounded_disk_disposable_context_required');
 const volume=await mkdtemp(join(process.env.RUNNER_TEMP,'sabora-dual-backup-'));
 const image=join(fixture,'bounded-backup-disk.img');
 const fd=await open(image,'wx',0o600);
 try{await fd.truncate(32*1024**2);}finally{await fd.close();}
 let mounted=false;
 try{
  run('/usr/sbin/mkfs.ext4',['-q','-F','-m','0',image]);
  run('/usr/bin/sudo',['-n','/usr/bin/mount','-o','loop,nodev,nosuid,noexec',image,volume]);
  mounted=true;
  run('/usr/bin/sudo',['-n','/usr/bin/chown',uid+':'+gid,volume]);
  run('/usr/bin/chmod',['0700',volume]);
  const initial=await statfs(volume,{bigint:true});
  const capacity=initial.blocks*initial.bsize;
  assert.equal(initial.type,0xef53n);
  assert.ok(capacity>16n*1024n**2n&&capacity<=32n*1024n**2n);
  assert.notEqual((await lstat(volume,{bigint:true})).dev,(await lstat(fixture,{bigint:true})).dev);
  const pressure=join(volume,'bounded-capacity-pressure-fixture');
  const proveCapacity=async({root,request,send})=>{
   // Confirm the real filesystem rejects an allocation beyond its capacity.
   await writeFile(pressure,'',{mode:0o600,flag:'wx'});
   try{
    const oversized=run('/usr/bin/fallocate',['-l',String(capacity*2n),pressure],{allowFailure:true});
    assert.notEqual(oversized.status,0);
   }finally{await unlink(pressure);}
   await writeFile(pressure,'',{mode:0o600,flag:'wx'});
   try{
    const fs=await statfs(volume,{bigint:true}),free=fs.bavail*fs.bsize;
    const leave=512n*1024n;
    const allocate=((free-leave)/fs.bsize)*fs.bsize;
    assert.ok(allocate>0n);
    run('/usr/bin/fallocate',['-l',String(allocate),pressure]);
    const low=await statfs(volume,{bigint:true});
    assert.ok(low.bavail*low.bsize<1048576n&&low.bavail*low.bsize>65536n);
    await assert.rejects(send(request),/transfer_outcome_unknown/);
    assert.deepEqual((await readdir(root)).sort(),['current','state.json']);
    assert.equal((await inspectEncryptedBackupBundle(join(root,'current'))).manifestSha256,request.expected.previousManifestSha256);
   }finally{await unlink(pressure);}
   assert.ok((await statfs(volume,{bigint:true})).bavail*initial.bsize>1048576n);
   console.log('sabora_vps_backup_bounded_ext4_capacity_stop_ok');
  };
  // A second, empty pressure file is pre-created while space is available.
  // Allocation stays confined to this exact mounted ext4 fixture, never to
  // the host filesystem. Reduce the requested extent on allocation failure.
  const exhaust=async({root,request,transfer})=>{
   if(dirname(root)!==volume||(await lstat(root,{bigint:true})).dev!==(await lstat(volume,{bigint:true})).dev||
    (await statfs(volume,{bigint:true})).type!==0xef53n)stop('bounded_pressure_identity');
   await writeFile(pressure,'',{mode:0o600,flag:'wx'});
   let released=false;
   const release=async()=>{if(!released){await unlink(pressure);released=true;}};
   const fill=async()=>{
    for(let i=0;i<64;i++){
     const fs=await statfs(volume,{bigint:true});
     if(fs.bavail===0n)return;
     let blocks=fs.bavail;
     let allocated=false;
     while(blocks>0n){
      const current=await lstat(pressure,{bigint:true});
      const offset=((current.size+fs.bsize-1n)/fs.bsize)*fs.bsize;
      const result=run('/usr/bin/fallocate',['-o',String(offset),'-l',String(blocks*fs.bsize),pressure],{allowFailure:true});
      const after=await statfs(volume,{bigint:true});
      if(after.bavail===0n)return;
      if(result.status===0||after.bavail<fs.bavail){allocated=true;break;}
      blocks/=2n;
     }
     if(!allocated)stop('bounded_pressure_not_exhausted');
    }
    stop('bounded_pressure_iteration_limit');
   };
   try{await transfer({request,fill,release});}finally{await release();}
   assert.ok((await statfs(volume,{bigint:true})).bavail*initial.bsize>1048576n);
  };
  return await operation({volume,capacity,proveCapacity,exhaust});
 }finally{
  if(mounted)run('/usr/bin/sudo',['-n','/usr/bin/umount',volume]);
  await rmdir(volume);await unlink(image);
 }
}
