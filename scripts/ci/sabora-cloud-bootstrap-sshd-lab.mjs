// Real SSHd and forced-command integration, exclusively on disposable CI Linux.
// The production receiver code is unchanged except for a fixture SHA256.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,chmodSync,chownSync,lstatSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

if(process.platform!=='linux'||process.getuid?.()!==0||process.env.CI!=='true'||
 process.env.GITHUB_ACTIONS!=='true'||process.env.SABORA_BOOTSTRAP_DISPOSABLE_SSH_LAB!=='explicitly-authorized-ci')
 throw Error('sabora_bootstrap_lab_stop:disposable_root_ci_required');

const user='sabora-bootstrap',home='/home/sabora-bootstrap',root='/etc/sabora/bootstrap';
const helper=root+'/receive-v1.sh',dest=home+'/.sabora-original-launchers-426960f0.zip';
const work=mkdtempSync(join(tmpdir(),'sabora-bootstrap-sshd-'));const port=22230;
const sha=data=>createHash('sha256').update(data).digest('hex');
const fixture=Buffer.alloc(8792,0x53),expected=sha(fixture);
let daemon=null,userCreated=false,helperCreated=false;
function run(cmd,args=[],opts={}){
 const r=spawnSync(cmd,args,{timeout:20000,encoding:'utf8',maxBuffer:2*1024*1024,...opts});
 if(r.error||r.status!==0)throw Error('sabora_bootstrap_lab_stop:command_failed:'+cmd+':'+String(r.error?.code??r.signal??r.status)+':'+String(r.stderr??'').slice(0,400));
 return r.stdout;
}
function session(command,input){
 return spawnSync('ssh',['-F','/dev/null','-T','-p',String(port),'-i',join(work,'client'),
  '-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','IdentityAgent=none',
  '-o','StrictHostKeyChecking=yes','-o','HostKeyAlgorithms=ssh-ed25519',
  '-o','UserKnownHostsFile='+join(work,'known_hosts'),'-o','ConnectTimeout=4',
  user+'@127.0.0.1',command],{input,encoding:null,timeout:12000,maxBuffer:64*1024});
}
const assertFailed=(r,label)=>{assert.notEqual(r.status,0,'must refuse '+label);assert.equal(existsSync(dest),false,'must not stage '+label);};
async function main(){
 try{
  assert.equal(existsSync(home),false,'home already exists: stop');
  assert.equal(existsSync(helper),false,'helper already exists: stop');
  run('useradd',['--no-create-home','--home-dir',home,'--shell','/bin/bash',user]);userCreated=true;
  const uid=Number(run('id',['-u',user]).trim()),gid=Number(run('id',['-g',user]).trim());
  mkdirSync(home,{mode:0o700});chownSync(home,uid,gid);
  run('usermod',['--password','*',user]);chmodSync(home,0o700);
  const script=readFileSync('deploy/sabora-bootstrap-receive-v1.sh','utf8');
  const original="readonly EXPECTED_SHA='a94c3d09ca371fe2cf021c9fe38bf4694e0c85af9b3c01092eddc6abda6faf5c'";
  assert.ok(script.includes(original));
  // Production receiver logic is exercised, changing only the fixture digest.
  mkdirSync(root,{recursive:true,mode:0o755});
  writeFileSync(helper,script.replace(original,"readonly EXPECTED_SHA='"+expected+"'"),{mode:0o755});helperCreated=true;
  run('ssh-keygen',['-q','-t','ed25519','-N','','-f',join(work,'host')]);
  run('ssh-keygen',['-q','-t','ed25519','-N','','-f',join(work,'client')]);
  const client=readFileSync(join(work,'client.pub'),'utf8').trim();
  mkdirSync(join(home,'.ssh'),{mode:0o700});
  writeFileSync(join(home,'.ssh','authorized_keys'),'restrict,command="'+helper+'" '+client+'\n',{mode:0o600});
  chownSync(join(home,'.ssh'),uid,gid);chownSync(join(home,'.ssh','authorized_keys'),uid,gid);
  const hostPub=readFileSync(join(work,'host.pub'),'utf8').trim().split(' ').slice(0,2).join(' ');
  writeFileSync(join(work,'known_hosts'),'[127.0.0.1]:'+port+' '+hostPub+'\n',{mode:0o600});
  const config=['Port '+port,'ListenAddress 127.0.0.1','HostKey '+join(work,'host'),
   'PidFile '+join(work,'sshd.pid'),'LogLevel ERROR','UsePAM yes','StrictModes yes',
   'PubkeyAuthentication yes','PasswordAuthentication no','KbdInteractiveAuthentication no',
   'PermitRootLogin no','AllowUsers '+user,'X11Forwarding yes','AllowTcpForwarding yes',
   'PermitTTY yes','Subsystem sftp internal-sftp'].join('\n')+'\n';
  writeFileSync(join(work,'sshd_config'),config);
  mkdirSync('/run/sshd',{recursive:true});run('/usr/sbin/sshd',['-t','-f',join(work,'sshd_config')]);
  daemon=spawn('/usr/sbin/sshd',['-D','-e','-f',join(work,'sshd_config')],{stdio:['ignore','ignore','pipe']});
  let daemonErr='';daemon.stderr.on('data',x=>{daemonErr+=x.toString().slice(0,200)});
  await new Promise(resolve=>setTimeout(resolve,350));assert.equal(daemon.exitCode,null,daemonErr);
  const cmd='sabora-bootstrap-stage-v1 426960f0c6e645cd21575e0883e8a03638cc9e3a';
  assertFailed(session('id -a',fixture),'shell command');
  const savedPin=readFileSync(join(work,'known_hosts'));
  writeFileSync(join(work,'known_hosts'),'[127.0.0.1]:22230 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHhcDw5eqf7g7MwgffoSNr6Q3Cgm5t4I32SmmsMuVyIq\n');
  assertFailed(session(cmd,fixture),'wrong host pin');
  writeFileSync(join(work,'known_hosts'),savedPin);
  let result=session(cmd,Buffer.alloc(8792,0x54));
  assert.notEqual(result.status,0,'digest mismatch must fail');assert.equal(lstatSync(dest).size,8792);
  // Test-only cleanup in ephemeral CI; production NEVER blindly retries.
  rmSync(dest);
  result=session(cmd,Buffer.alloc(8793,0x53));
  assert.notEqual(result.status,0,'oversized stream must fail');assert.equal(lstatSync(dest).size,8793);
  rmSync(dest);
  result=session(cmd,fixture);
  assert.equal(result.status,0,'valid stream failed: '+String(result.stderr).slice(0,500));
  assert.equal(result.stdout.toString('utf8'),'SABORA_BOOTSTRAP_STAGED:'+expected+'\n');
  assert.equal(sha(readFileSync(dest)),expected);assert.equal(lstatSync(dest).mode&0o777,0o600);
  result=session(cmd,fixture);assert.notEqual(result.status,0,'replay must fail');
  assert.equal(sha(readFileSync(dest)),expected);
  assert.equal(run('id',['-nG',user]).trim(),user);
  console.log('SABORA_BOOTSTRAP_REAL_SSHD_LAB_PASS:forced-command,wrong-command,host-pin,digest,oversize,stage,replay');
 }finally{
  if(daemon&&daemon.exitCode===null){const closed=once(daemon,'close');daemon.kill('SIGTERM');await closed;}
  if(userCreated){
   // SSHd children can outlive the listener briefly. The hosted runner is
   // disposable; do not hide a test failure behind a teardown race.
   const cleanup=spawnSync('userdel',['--remove',user],{timeout:5000,encoding:'utf8'});
   if(cleanup.status!==0)console.log('SABORA_BOOTSTRAP_LAB_CLEANUP_DEFERRED:ephemeral_runner_only');
  }
  if(helperCreated)rmSync(helper,{force:true});
  rmSync(work,{recursive:true,force:true});
 }
}
await main();
