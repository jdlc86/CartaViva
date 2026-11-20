// Installed receiver candidate. Root-owned material is checked on every
// invocation. This is not a provisioner and cannot activate recovery,
// deploy application services, create a listener or select arbitrary paths.
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {readFile,lstat,stat,realpath,statfs} from 'node:fs/promises';
import {BACKUP_INSTALL_PATHS as P,validateBackupPreparationManifest} from './sabora-backup-installation-plan.mjs';
import {verifyInstalledBackupActivation,sshEd25519Sha256} from './sabora-backup-installed-contract.mjs';
import {protectedBytes,trustedDirectory,sha256} from './sabora-release-protected-store.mjs';
const stop=code=>{throw Error('sabora_backup_installed_receiver_stop:'+code);};
const rootBytes=(p,maxBytes)=>protectedBytes(p,{uid:0,maxBytes});
async function directory(path,uid,gid,mode,device){
 const st=await lstat(path,{bigint:true});
 if(await realpath(path)!==path||!st.isDirectory()||st.isSymbolicLink()||
  st.uid!==BigInt(uid)||st.gid!==BigInt(gid)||(st.mode&0o7777n)!==BigInt(mode)||
  (device!==undefined&&String(st.dev)!==device))stop('directory_identity');
}
export async function loadInstalledBackupReceiver(){
 const entry=join(P.code,'scripts/ops/sabora-backup-installed-entry.mjs');
 if(process.platform!=='linux'||process.argv.length!==2||process.argv[1]!==entry||
  process.getuid()===0||process.getuid()!==process.geteuid()||process.getgid()!==process.getegid()||
  !Object.keys(process.env).every(k=>['PATH','LANG'].includes(k))||
  !/^NoNewPrivs:\s+1$/m.test(await readFile('/proc/self/status','utf8'))||
  fileURLToPath(import.meta.url)!==join(P.code,'scripts/ops/sabora-backup-installed-receiver.mjs')||
  await realpath(process.execPath)!==P.node)stop('installed_entry_context');
 trustedDirectory(P.config);
 const owner=rootBytes(join(P.config,'owner-public.pem'),4096).toString('utf8');
 const artifactBytes=rootBytes(join(P.code,'artifact.json'),262144);
 const planBytes=rootBytes(join(P.config,'plan.json'),262144);
 const activationBytes=rootBytes(join(P.config,'activation.json'),262144);
 const {plan,activation:a,activationSha256,checked}=verifyInstalledBackupActivation({
  planBytes,artifactBytes,activationBytes,ownerPublicKey:owner});
 const uid=process.getuid(),gid=process.getgid(),groups=process.getgroups();
 if(uid!==a.uid||gid!==a.gid||groups.some(g=>g!==gid))stop('account_identity');
 if(sha256(rootBytes('/etc/machine-id',256))!==a.hostIdentitySha256)stop('host_identity');
 const manifest=validateBackupPreparationManifest(artifactBytes);
 for(const [name,digest] of Object.entries(manifest.files))
  if(sha256(rootBytes(join(P.code,name),2*1024**2))!==digest)stop('artifact_content');
 for(const [path,digest,max] of [[P.node,plan.runtime.nodeSha256,160*1024**2],
  [P.shell,plan.runtime.shellSha256,1024**2],['/usr/sbin/sshd',plan.runtime.sshdSha256,32*1024**2],
  ['/usr/bin/flock',plan.runtime.flockSha256,4*1024**2]]){
  if(sha256(rootBytes(path,max))!==digest)stop('runtime_identity');
 }
 // The host key itself remains inaccessible to this account. Compare its
 // provisioned public counterpart; root must validate the private/public
 // match and effective sshd policy before issuing the activation.
 const host=rootBytes(P.hostKey+'.pub',4096).toString('utf8').trim();
 const authorized=rootBytes(P.authorizedKeys,4096).toString('utf8').trim();
 const prefix='restrict,command="'+P.shell+'" ';
 if(sshEd25519Sha256(host)!==plan.transport.hostKeySha256||!authorized.startsWith(prefix)||
  sshEd25519Sha256(authorized.slice(prefix.length))!==plan.transport.clientKeySha256||
  sha256(rootBytes(join(P.config,'sshd.conf'),16384))!==checked.configurationSha256)
  stop('ssh_identity');
 // The installed account can read the immutable guard, not replace its
 // parent. No bind of a subdirectory, nested mount or cross-device cache.
 trustedDirectory(P.volume);
 await directory(P.volume,0,gid,0o750,a.device);
 await directory(P.cache,uid,gid,0o700,a.device);
 await directory(P.recovery,0,0,0o700,a.device);
 const guard=await lstat(P.guard,{bigint:true});
 if(!guard.isFile()||guard.isSymbolicLink()||guard.uid!==0n||guard.gid!==BigInt(gid)||
  guard.nlink!==1n||guard.size!==0n||(guard.mode&0o7777n)!==0o440n||
  String(guard.dev)!==a.device||String(guard.ino)!==a.guardInode)stop('guard_identity');
 const fields=(await readFile('/proc/self/mountinfo','utf8')).split('\n').filter(Boolean).map(x=>x.split(' '));
 const mounts=fields.filter(f=>f[4]===P.volume),m=mounts[0],sep=m?.indexOf('-');
 if(mounts.length!==1||m[3]!=='/'||sep<6||m[sep+1]!=='ext4'||
  !['nodev','nosuid','noexec'].every(x=>m[5].split(',').includes(x))||
  fields.some(f=>f[4].startsWith(P.volume+'/')))stop('storage_mount');
 // Resolve the independently approved filesystem UUID to the actual
 // block device backing this mount; stat of a device node is non-mutating.
 const devicePath=await realpath('/dev/disk/by-uuid/'+plan.storage.filesystemUuid);
 const deviceStat=await stat(devicePath,{bigint:true});
 if(!deviceStat.isBlockDevice()||String(deviceStat.rdev)!==a.device)stop('filesystem_uuid');
 const fs=await statfs(P.volume,{bigint:true});
 if(fs.type!==0xef53n||fs.blocks*fs.bsize!==BigInt(plan.storage.filesystemBytes)||
  plan.storage.quotaBytes>plan.storage.filesystemBytes)stop('filesystem_capacity');
 // A dedicated filesystem provides the physical ceiling; the library
 // additionally enforces the approved logical two-generation budget.
 return Object.freeze({installationId:a.installationId,activationSha256,
  validUntil:Date.parse(a.validUntil),scope:Object.freeze({
   environment:'production',systemIdentifier:plan.storage.systemIdentifier,
   storageIdentitySha256:plan.storage.storageIdentitySha256,
   externalStorageIdentitySha256:plan.storage.externalStorageIdentitySha256,
   verifierPublicKey:plan.authorities.verificationPublicKey,
   recoveryPublicKey:plan.authorities.recoveryPublicKey,
   quotaBytes:plan.storage.quotaBytes,reserveBytes:plan.storage.reserveBytes,
   maxBundleBytes:plan.storage.maxBundleBytes,
   protectedGuard:Object.freeze({device:a.device,inode:a.guardInode})
  })});
}
