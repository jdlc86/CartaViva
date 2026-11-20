// Materialize a closed, INACTIVE installation set in an operator's private
// staging directory. Never write /etc, provision users/disks, copy a private
// key, issue activation, start sshd, or modify a firewall. Root installation
// and material host observations require separate permission.
import {constants,existsSync,lstatSync,mkdirSync,openSync,fstatSync,readFileSync,closeSync,
 realpathSync,writeFileSync,fsyncSync,readdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyBackupInstallationPlan,validateBackupPreparationManifest,BACKUP_INSTALL_PATHS as P,
 BACKUP_PREPARATION_FILES} from './sabora-backup-installation-plan.mjs';
import {verifySignedDocument} from './sabora-release-evidence.mjs';
import {sshEd25519Sha256} from './sabora-backup-installed-contract.mjs';
import {sha256,syncDirectory} from './sabora-release-protected-store.mjs';
import {stableStringify} from '../ci/sabora-release-governor.mjs';
const stop=code=>{throw Error('sabora_backup_stage_stop:'+code);};
const equal=(a,b)=>stableStringify(a)===stableStringify(b);
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

// Re-derive the closed set from the owner's independently supplied public
// key and signed plan, not from stage.json. A staging receipt is merely
// metadata. This verifies a private unprivileged staging tree, never a
// provisioned host or an authorization to install.
export function verifyInactiveBackupStage({directory,ownerPublicKey}={}){
 if(process.platform!=='linux'||process.getuid()===0||process.getuid()!==process.geteuid())stop('unprivileged_linux_required');
 if(typeof directory!=='string'||resolve(directory)!==directory||realpathSync(directory)!==directory)stop('stage_path');
 const uid=process.getuid(),files=[],dirs=[];
 function walk(path,relative=''){
  const st=lstatSync(path);
  if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==uid||(st.mode&0o7777)!==0o700)stop('stage_directory');
  for(const name of readdirSync(path)){
   const nested=relative?relative+'/'+name:name,child=join(path,name),info=lstatSync(child);
   if(info.isDirectory()&&!info.isSymbolicLink()){dirs.push(nested);walk(child,nested);}
   else{
    if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.uid!==uid||
     (info.mode&0o7777)!==0o600)stop('stage_file');
    files.push(nested);
   }
  }
 }
 walk(directory);
 const targetModes={'code/artifact.json':'0644',
  ...Object.fromEntries(BACKUP_PREPARATION_FILES.map(name=>['code/'+name,'0644'])),
  'bin/node':'0755','bin/receive':'0755','owner-public.pem':'0644','plan.json':'0644',
  'sshd.conf':'0644','host-ed25519.pub':'0644','authorized_keys':'0644'};
 const expectedDirs=['bin','code','code/deploy','code/scripts','code/scripts/ci','code/scripts/ops'];
 if(!equal(files.sort(),['stage.json',...Object.keys(targetModes)].sort())||
  !equal(dirs.sort(),expectedDirs.sort()))stop('stage_inventory');
 const get=(name,max=2*1024**2)=>bytes(join(directory,name),max);
 // Never derive trust from the public key inside the staging tree.
 if(!get('owner-public.pem',4096).equals(Buffer.from(ownerPublicKey)))stop('stage_owner_identity');
 const artifact=get('code/artifact.json',262144),planBytes=get('plan.json',262144);
 const checked=verifyBackupInstallationPlan({planBytes,artifactBytes:artifact,ownerPublicKey});
 const plan=verifySignedDocument(planBytes,ownerPublicKey,'sabora-backup-installation-plan/v1');
 if(plan.environment!=='production-candidate')stop('production_candidate_required');
 const manifest=validateBackupPreparationManifest(artifact);
 const expectedHashes={'code/artifact.json':checked.artifactSha256,
  ...Object.fromEntries(Object.entries(manifest.files).map(([name,digest])=>['code/'+name,digest])),
  'bin/node':plan.runtime.nodeSha256,'bin/receive':plan.runtime.shellSha256,
  'owner-public.pem':sha256(Buffer.from(ownerPublicKey)),'plan.json':sha256(planBytes),
  'sshd.conf':checked.configurationSha256};
 const host=get('host-ed25519.pub',4096),authorized=get('authorized_keys',4096);
 const hostText=host.toString('utf8'),authText=authorized.toString('utf8');
 const prefix='restrict,command="'+P.shell+'" ';
 if(!hostText.endsWith('\n')||!authText.endsWith('\n')||!authText.startsWith(prefix)||
  sshEd25519Sha256(hostText.slice(0,-1))!==plan.transport.hostKeySha256||
  sshEd25519Sha256(authText.slice(prefix.length,-1))!==plan.transport.clientKeySha256)stop('stage_ssh_identity');
 expectedHashes['host-ed25519.pub']=sha256(host);
 expectedHashes.authorized_keys=sha256(authorized);
 const maxima={'bin/node':160*1024**2,'bin/receive':1024**2};
 for(const [name,digest] of Object.entries(expectedHashes))
  if(sha256(get(name,maxima[name]))!==digest)stop('stage_digest');
 const expected={schema:'sabora-backup-inactive-stage/v1',repository:'jdlc86/CartaViva',project:'sabora',
  sourceSha:checked.sourceSha,planSha256:checked.planSha256,artifactSha256:checked.artifactSha256,
  files:Object.fromEntries(Object.entries(targetModes).map(([name,installMode])=>
   [name,{sha256:expectedHashes[name],installMode}])),
  installationRoot:P.config,controlRoot:P.control,installed:false,listenerEnabled:false,
  operationalAuthorization:false,requiresIndependentRootInstallation:true};
 let receipt;
 try{receipt=JSON.parse(get('stage.json',262144).toString('utf8'));}catch{stop('stage_receipt');}
 if(!equal(receipt,expected))stop('stage_receipt');
 return Object.freeze({schema:'sabora-backup-inactive-stage-verification/v1',
  stageSha256:sha256(Buffer.from(stableStringify(expected))),sourceSha:checked.sourceSha,
  files:Object.keys(expected.files).length,installed:false,listenerEnabled:false,operationalAuthorization:false});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length===5&&process.argv[2]==='verify'){
   const result=verifyInactiveBackupStage({directory:process.argv[3],ownerPublicKey:bytes(process.argv[4],4096).toString('utf8')});
   process.stdout.write(JSON.stringify(result)+'\n');
  }else{
  if(process.argv.length!==10)stop('arguments');
  const [sourceDirectory,destination,nodeBinary,shellBinary,planPath,ownerPath,hostPath,clientPath]=process.argv.slice(2);
  // No key material in argv. Only public keys and a signed PREPARATION plan.
  const result=stageInactiveBackupInstallation({sourceDirectory,destination,nodeBinary,shellBinary,
   planBytes:bytes(planPath,262144),ownerPublicKey:bytes(ownerPath,4096).toString('utf8'),
   hostPublicKey:bytes(hostPath,4096).toString('utf8').trim(),
   clientPublicKey:bytes(clientPath,4096).toString('utf8').trim()});
  process.stdout.write(JSON.stringify(result)+'\n');
  }
 }catch(error){
  const value=String(error?.message??'');
  process.stderr.write((/^sabora_[a-z_]+_stop:[a-z_]+$/.test(value)?value:'sabora_backup_stage_stop:rejected')+'\n');
  process.exitCode=1;
 }
}
