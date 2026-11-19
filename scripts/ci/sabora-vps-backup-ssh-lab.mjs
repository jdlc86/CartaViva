// Disposable loopback SSH test using the real PG17 backup fixtures. No
// changes to system SSH configuration, accounts or services; a separate
// foreground daemon is started and stopped by this test only.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer,connect} from 'node:net';
import {userInfo} from 'node:os';
import {dirname,join,basename,isAbsolute} from 'node:path';
import {mkdir,readFile,writeFile,lstat,statfs,realpath,access,readdir} from 'node:fs/promises';
import {generateKeyPairSync,sign} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {stableStringify} from './sabora-release-governor.mjs';
import {backupLabSshArguments,sendVpsBackupOverSsh} from '../ops/sabora-vps-backup-transport.mjs';
import {inspectEncryptedBackupBundle} from '../ops/sabora-encrypted-backup-bundle.mjs';
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
  filesystemType:String((await statfs(root,{bigint:true})).type),scope};
 const signed=labDocument(config,owner.privateKey);
 await put('scope.json',signed);
 const hostKey=join(control,'host-key'),clientKey=join(control,'client-key');
 for(const path of [hostKey,clientKey])run('/usr/bin/ssh-keygen',['-q','-t','ed25519','-N','','-f',path]);
 const clientPublic=(await readFile(clientKey+'.pub','utf8')).trim().split(' ').slice(0,2).join(' ');
 const publicHost=(await readFile(hostKey+'.pub','utf8')).trim().split(' ').slice(0,2).join(' ');
 const node=await realpath(process.execPath),entry=await realpath(entryPath);
 if(![node,entry,control,root,hostKey].every(p=>isAbsolute(p)&&/^\/[A-Za-z0-9_./-]+$/.test(p)))stop('fixture_path_unsafe');
 const command=[node,entry,control].join(' ');
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
 const send=({sourceDirectory,proofBytes,expected,endpoint:target=endpoint})=>
  sendVpsBackupOverSsh({endpoint:target,sourceDirectory,proofBytes,expected,timeoutMs:60000});
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
   const signedBadQuota=labDocument({...config,scope:{...scope,quotaBytes:scope.reserveBytes+1}},owner.privateKey);
   const signedProduction=labDocument({...config,environment:'production'},owner.privateKey);
   try{
    for(const invalid of [JSON.stringify(changed),signedBadDisk,signedBadQuota,signedProduction]){
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
  return {root,send,transfer,proveInitialNegatives,close};
 }catch(error){await close();throw error;}
}
