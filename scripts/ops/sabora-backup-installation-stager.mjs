// Materialize a closed, INACTIVE installation set in an operator's private
// staging directory. Never write /etc, provision users/disks, copy a private
// key, issue activation, start sshd, or modify a firewall. Root installation
// and material host observations require separate permission.
import {constants,existsSync,lstatSync,mkdirSync,openSync,fstatSync,readFileSync,closeSync,
 realpathSync,writeFileSync,fsyncSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {verifyBackupInstallationPlan,validateBackupPreparationManifest,BACKUP_INSTALL_PATHS as P,
 BACKUP_PREPARATION_FILES} from './sabora-backup-installation-plan.mjs';
import {verifySignedDocument} from './sabora-release-evidence.mjs';
import {sshEd25519Sha256} from './sabora-backup-installed-contract.mjs';
import {sha256,syncDirectory} from './sabora-release-protected-store.mjs';
const stop=code=>{throw Error('sabora_backup_stage_stop:'+code);};
function bytes(path,max){
 if(resolve(path)!==path||realpathSync(path)!==path)stop('input_path');
 const before=lstatSync(path);
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size<1||before.size>max||
  (before.mode&0o022)!==0||![0,process.getuid()].includes(before.uid))stop('input_file');
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const same=s=>s.isFile()&&s.nlink===1&&s.dev===before.dev&&s.ino===before.ino&&
   s.size===before.size&&s.ctimeMs===before.ctimeMs&&s.mtimeMs===before.mtimeMs;
  if(!same(fstatSync(fd)))stop('input_changed');
  const b=readFileSync(fd);
  if(b.length!==before.size||!same(fstatSync(fd))||!same(lstatSync(path)))stop('input_changed');
  return b;
 }finally{closeSync(fd);}
}
export function stageInactiveBackupInstallation({sourceDirectory,destination,nodeBinary,shellBinary,
 planBytes,ownerPublicKey,hostPublicKey,clientPublicKey}={}){
 if(process.platform!=='linux'||process.getuid()===0||process.getuid()!==process.geteuid())stop('unprivileged_linux_required');
 if(typeof destination!=='string'||resolve(destination)!==destination||existsSync(destination)||
  realpathSync(dirname(destination))!==dirname(destination))stop('fresh_stage_required');
 const parent=lstatSync(dirname(destination));
 if(!parent.isDirectory()||parent.uid!==process.getuid()||(parent.mode&0o777)!==0o700)stop('private_stage_parent');
 if(typeof sourceDirectory!=='string'||resolve(sourceDirectory)!==sourceDirectory||
  realpathSync(sourceDirectory)!==sourceDirectory)stop('source_directory');
 const artifact=bytes(join(sourceDirectory,'artifact.json'),262144);
 const checked=verifyBackupInstallationPlan({planBytes,artifactBytes:artifact,ownerPublicKey});
 const plan=verifySignedDocument(planBytes,ownerPublicKey,'sabora-backup-installation-plan/v1');
 if(plan.environment!=='production-candidate')stop('production_candidate_required');
 if(sshEd25519Sha256(hostPublicKey)!==plan.transport.hostKeySha256||
  sshEd25519Sha256(clientPublicKey)!==plan.transport.clientKeySha256)stop('ssh_key_identity');
 const manifest=validateBackupPreparationManifest(artifact);
 const entries=[];
 const add=(name,buffer,mode)=>entries.push({name,buffer,mode,sha256:sha256(buffer)});
 add('code/artifact.json',artifact,'0644');
 for(const name of BACKUP_PREPARATION_FILES){
  const b=bytes(join(sourceDirectory,name),2*1024**2);
  if(sha256(b)!==manifest.files[name])stop('source_digest');
  add('code/'+name,b,'0644');
 }
 // Read and verify ALL bytes before creating anything at the target.
 const node=bytes(nodeBinary,160*1024**2),shell=bytes(shellBinary,1024**2);
 if(sha256(node)!==plan.runtime.nodeSha256||sha256(shell)!==plan.runtime.shellSha256)stop('runtime_digest');
 add('bin/node',node,'0755');add('bin/receive',shell,'0755');
 add('owner-public.pem',Buffer.from(ownerPublicKey),'0644');
 add('plan.json',planBytes,'0644');
 add('sshd.conf',Buffer.from(checked.sshdConfiguration),'0644');
 add('host-ed25519.pub',Buffer.from(hostPublicKey+'\n'),'0644');
 add('authorized_keys',Buffer.from('restrict,command="'+P.shell+'" '+clientPublicKey+'\n'),'0644');
 const receipt={schema:'sabora-backup-inactive-stage/v1',repository:'jdlc86/CartaViva',project:'sabora',
  sourceSha:checked.sourceSha,planSha256:checked.planSha256,artifactSha256:checked.artifactSha256,
  files:Object.fromEntries(entries.map(({name,sha256,mode})=>[name,{sha256,installMode:mode}])),
  installationRoot:P.config,controlRoot:P.control,installed:false,listenerEnabled:false,
  operationalAuthorization:false,requiresIndependentRootInstallation:true};
 mkdirSync(destination,{mode:0o700});
 // Everything remains private on staging, including executables. The listed
 // modes are target metadata, NOT changes to any real installation.
 for(const {name,buffer} of entries){
  const target=join(destination,name);mkdirSync(dirname(target),{mode:0o700,recursive:true});
  const fd=openSync(target,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,buffer);fsyncSync(fd);}finally{closeSync(fd);}
  syncDirectory(dirname(target));
 }
 const marker=openSync(join(destination,'stage.json'),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);
 try{writeFileSync(marker,JSON.stringify(receipt,null,2)+'\n');fsyncSync(marker);}finally{closeSync(marker);}
 syncDirectory(destination);syncDirectory(dirname(destination));
 return Object.freeze(receipt);
}
