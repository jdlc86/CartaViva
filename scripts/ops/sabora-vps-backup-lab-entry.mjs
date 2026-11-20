// Dedicated disposable-lab receiver. No production entry or privilege
// elevation; configuration and trust anchor are provisioned by the fixture,
// not by the SSH request. Never install this program as a real service.
import {constants} from 'node:fs';
import {open,lstat,realpath,statfs} from 'node:fs/promises';
import {resolve,dirname,basename,join,isAbsolute,parse} from 'node:path';
import {verifySignedDocument,authorityFingerprint} from './sabora-release-evidence.mjs';
import {exactKeys} from './sabora-release-protected-store.mjs';
import {receiveVerifiedVpsReplica} from './sabora-vps-backup-rotation.mjs';
import {BACKUP_RECEIVE_COMMAND} from './sabora-vps-backup-transport.mjs';
const stop=()=>{throw Error('backup_lab_entry_rejected');};
async function privateDir(path,uid){
 if(!isAbsolute(path)||resolve(path)!==path||await realpath(path)!==path)stop();
 for(let p=path;;p=dirname(p)){
  const st=await lstat(p);
  if(!st.isDirectory()||st.isSymbolicLink()||![uid,0].includes(st.uid)||(st.mode&0o022)!==0)stop();
  if(p===path&&(st.uid!==uid||(st.mode&0o077)!==0))stop();
  if(p===parse(p).root)break;
 }
}
async function privateBytes(path,uid,max){
 const before=await lstat(path),fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const st=await fd.stat();
  if(!st.isFile()||st.uid!==uid||st.nlink!==1||(st.mode&0o777)!==0o600||
   before.ino!==st.ino||before.dev!==st.dev||st.size<1||st.size>max)stop();
  const bytes=await fd.readFile(),after=await fd.stat();
  if(bytes.length!==st.size||after.size!==st.size||after.ctimeMs!==st.ctimeMs||after.mtimeMs!==st.mtimeMs)stop();
  return bytes;
 }finally{await fd.close();}
}
async function run(){
 // This executable can only serve the non-root CI fixture. No SSH request
 // can select a directory, authority, sender command, or production scope.
 if(process.platform!=='linux'||process.argv.length!==3||process.geteuid()===0||
  process.env.SSH_ORIGINAL_COMMAND!==BACKUP_RECEIVE_COMMAND)stop();
 const uid=process.geteuid(),control=process.argv[2],parent=dirname(control);
 if(basename(control)!=='ssh-backup-control'||!/^sabora-dual-backup-[a-zA-Z0-9]+$/.test(basename(parent)))stop();
 await privateDir(control,uid);await privateDir(parent,uid);
 const root=join(parent,'ssh-backup-cache');
 await privateDir(root,uid);
 const owner=(await privateBytes(join(control,'owner-public.pem'),uid,4096)).toString('utf8');
 const config=verifySignedDocument(await privateBytes(join(control,'scope.json'),uid,262144),
  owner,'sabora-backup-lab-installation/v1');
 if(!exactKeys(config,['schema','repository','project','environment','sourceSha','root','uid','filesystemDevice','filesystemType','filesystemBytes','scope'])||
  config.repository!=='jdlc86/CartaViva'||config.project!=='sabora'||config.environment!=='disposable-lab'||
  !/^[0-9a-f]{40}$/.test(config.sourceSha)||config.root!==root||config.uid!==uid||
  !exactKeys(config.scope,['environment','systemIdentifier','storageIdentitySha256','externalStorageIdentitySha256',
    'verifierPublicKey','recoveryPublicKey','quotaBytes','reserveBytes'])||config.scope.environment!=='disposable-lab'||
  new Set([owner,config.scope.verifierPublicKey,config.scope.recoveryPublicKey].map(authorityFingerprint)).size!==3)stop();
 const disk=await lstat(root,{bigint:true}),fs=await statfs(root,{bigint:true});
 const filesystemBytes=fs.blocks*fs.bsize;
 if(config.filesystemDevice!==String(disk.dev)||config.filesystemType!==String(fs.type)||
  config.filesystemBytes!==String(filesystemBytes)||!Number.isSafeInteger(config.scope.quotaBytes)||
  config.scope.quotaBytes<1||BigInt(config.scope.quotaBytes)>filesystemBytes)stop();
 // Rotation itself checks the signed logical quota and free capacity under
 // the shared guard. Binding the observed device/type is not physical quota.
 process.umask(0o077);
 const result=await receiveVerifiedVpsReplica({root,source:process.stdin,scope:config.scope});
 process.stdout.write(JSON.stringify(result)+'\n');
}
try{await run();}catch(error){
 // Only the disposable lab exposes the exact storage failure class, not
 // filesystem paths or arbitrary OS diagnostics. This is not an ACK.
 const reason=error?.code==='ENOSPC'?'storage_enospc':'rejected';
 process.stderr.write('sabora_backup_lab_entry_stop:'+reason+'\n');process.exitCode=1;
 // Close request input on rejection instead of waiting for an attacker EOF.
 process.stdin.destroy();
}
