// Root-protected configuration, non-root receiver, disposable CI ONLY.
// No installation or activation entry for production. Invoked by the fixed
// compiled shell; the SSH client supplies only the ciphertext wire on stdin.
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {lstat,readFile,realpath,statfs} from 'node:fs/promises';
import {protectedBytes,trustedDirectory,exactKeys,sha256} from './sabora-release-protected-store.mjs';
import {verifySignedDocument,authorityFingerprint} from './sabora-release-evidence.mjs';
import {validateBackupPreparationManifest} from './sabora-backup-installation-plan.mjs';
import {receiveVerifiedVpsReplica} from './sabora-vps-backup-rotation.mjs';
const stop=code=>{throw Error('sabora_backup_governed_lab_stop:'+code);};
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
async function run(){
 const base=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
 if(process.platform!=='linux'||process.argv.length!==2||process.getuid()===0||
  process.getuid()!==process.geteuid()||!/^\/var\/lib\/sabora-backup-ci-[0-9]+$/.test(base)||
  Object.keys(process.env).some(k=>!['PATH','LANG'].includes(k))||
  !/^NoNewPrivs:\s+1$/m.test(await readFile('/proc/self/status','utf8')))stop('entry_context');
 trustedDirectory(base);
 const code=join(base,'code'),volume=join(base,'volume'),cache=join(volume,'cache');
 const rootBytes=(path,maxBytes)=>protectedBytes(path,{uid:0,maxBytes});
 const owner=rootBytes(join(base,'owner-public.pem'),4096).toString('utf8');
 const config=verifySignedDocument(rootBytes(join(base,'scope.json'),262144),owner,'sabora-backup-governed-lab/v1');
 const uid=process.getuid(),gid=process.getgid();
 if(!exactKeys(config,['schema','repository','project','environment','sourceSha','artifactSha256','nodeSha256',
  'shellSha256','uid','gid','volume','cache','device','filesystemBytes','scope'])||
  config.repository!=='jdlc86/CartaViva'||config.project!=='sabora'||config.environment!=='disposable-lab'||
  !/^[0-9a-f]{40}$/.test(config.sourceSha)||config.uid!==uid||config.gid!==gid||
  config.volume!==volume||config.cache!==cache||
  ![config.artifactSha256,config.nodeSha256,config.shellSha256].every(hex)||
  !exactKeys(config.scope,['environment','systemIdentifier','storageIdentitySha256','externalStorageIdentitySha256',
   'verifierPublicKey','recoveryPublicKey','quotaBytes','reserveBytes','maxBundleBytes','protectedGuard'])||
  config.scope.environment!=='disposable-lab'||
  new Set([owner,config.scope.verifierPublicKey,config.scope.recoveryPublicKey].map(authorityFingerprint)).size!==3)
  stop('scope');
 const artifact=rootBytes(join(code,'artifact.json'),262144),manifest=validateBackupPreparationManifest(artifact);
 if(sha256(artifact)!==config.artifactSha256||manifest.sourceSha!==config.sourceSha)stop('artifact_identity');
 for(const [name,digest] of Object.entries(manifest.files)){
  if(sha256(rootBytes(join(code,name),2*1024**2))!==digest)stop('artifact_content');
 }
 // The compiled launcher and its absolute native interpreter are anchored by
 // the root-owned fixture. No NODE_OPTIONS, path search, shell or sudo.
 const node=join(base,'bin','node'),shell=join(base,'bin','receive');
 if(await realpath(process.execPath)!==node||sha256(rootBytes(node,160*1024**2))!==config.nodeSha256||
  sha256(rootBytes(shell,1024**2))!==config.shellSha256)stop('runtime_identity');
 for(const path of [volume,cache]){
  const st=await lstat(path,{bigint:true});
  const parent=path===volume;
  if(await realpath(path)!==path||!st.isDirectory()||st.isSymbolicLink()||
   st.uid!==BigInt(parent?0:uid)||st.gid!==BigInt(gid)||(st.mode&0o777n)!==(parent?0o750n:0o700n)||
   String(st.dev)!==config.device)stop('storage_identity');
 }
 // Recovery authority is deliberately outside the writer's access. Its
 // protected directory does not enable any reconciliation operation.
 const recovery=await lstat(join(volume,'recovery'),{bigint:true});
 if(!recovery.isDirectory()||recovery.isSymbolicLink()||recovery.uid!==0n||recovery.gid!==0n||
  (recovery.mode&0o777n)!==0o700n||String(recovery.dev)!==config.device)stop('recovery_boundary');
 const mountinfo=(await readFile('/proc/self/mountinfo','utf8')).split('\n').filter(Boolean).map(line=>line.split(' '));
 const mounted=mountinfo.filter(fields=>fields[4]===volume);
 if(mounted.length!==1||mounted[0][mounted[0].indexOf('-')+1]!=='ext4'||
  !['nodev','nosuid','noexec'].every(flag=>mounted[0][5].split(',').includes(flag))||
  mountinfo.some(fields=>fields[4].startsWith(volume+'/')))stop('storage_mount');
 const fs=await statfs(volume,{bigint:true});
 if(fs.type!==0xef53n||String(fs.blocks*fs.bsize)!==config.filesystemBytes||
  !Number.isSafeInteger(config.scope.quotaBytes)||BigInt(config.scope.quotaBytes)>fs.blocks*fs.bsize||
  !Number.isSafeInteger(config.scope.maxBundleBytes)||config.scope.maxBundleBytes<1||
  2n*BigInt(config.scope.maxBundleBytes)+4n*1024n**2n+BigInt(config.scope.reserveBytes)>BigInt(config.scope.quotaBytes))
  stop('storage_capacity');
 process.umask(0o077);
 const result=await receiveVerifiedVpsReplica({root:cache,source:process.stdin,scope:config.scope});
 process.stdout.write(JSON.stringify(result)+'\n');
}
try{await run();}catch(error){
 // Source-owned diagnostics only, no paths or configuration bytes.
 const value=String(error?.message??'');
 const reason=/^sabora_backup_governed_lab_stop:[a-z_]+$/.test(value)?value:'sabora_backup_governed_lab_stop:rejected';
 process.stderr.write(reason+'\n');process.exitCode=1;process.stdin.destroy();
}
