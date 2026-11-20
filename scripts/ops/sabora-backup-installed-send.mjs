#!/usr/bin/env node
// Explicit operator entry for the separately activated remote receiver.
// All keys remain outside the checkout. No credentials are accepted in argv,
// no shell, no capture, no scheduler, no local replica masquerading as VPS.
import {constants} from 'node:fs';
import {lstat,realpath,open} from 'node:fs/promises';
import {isAbsolute,resolve,dirname,parse} from 'node:path';
import {fileURLToPath} from 'node:url';
import {exactKeys} from './sabora-release-protected-store.mjs';
import {prepareInstalledBackupTransfer,sendInstalledVpsBackupOverSsh} from './sabora-vps-backup-transport.mjs';
const stop=code=>{throw Error('sabora_backup_installed_send_stop:'+code);};
async function privateInput(path,max){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||await realpath(path)!==path)stop('input_path');
 const before=await lstat(path);
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size<1||before.size>max)stop('input_file');
 if(process.platform!=='linux'||before.uid!==process.getuid()||(before.mode&0o077)!==0)stop('input_permissions');
  for(let p=dirname(path);;p=dirname(p)){
   const st=await lstat(p),leaf=p===dirname(path);
   if(!st.isDirectory()||st.isSymbolicLink()||![0,process.getuid()].includes(st.uid)||
    ((st.mode&0o022)!==0&&!(st.uid===0&&(st.mode&0o1000)!==0&&!leaf))||
    (leaf&&(st.uid!==process.getuid()||(st.mode&0o077)!==0)))stop('input_parent');
   if(p===parse(p).root)break;
  }
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{
  const st=await handle.stat();
  const same=value=>value.isFile()&&value.nlink===1&&value.dev===before.dev&&value.ino===before.ino&&
   value.size===before.size&&value.mtimeMs===before.mtimeMs&&value.ctimeMs===before.ctimeMs;
  if(!same(st))stop('input_changed');
  const bytes=await handle.readFile();
  if(bytes.length!==before.size||!same(await handle.stat())||!same(await lstat(path)))stop('input_changed');
  return bytes;
 }finally{await handle.close();}
}
async function request(profilePath){
 let profile;try{profile=JSON.parse((await privateInput(profilePath,65536)).toString('utf8'));}catch{stop('profile_invalid');}
 if(!exactKeys(profile,['schema','sourceDirectory','endpoint','ownerPublicKeyPath','planPath','artifactPath','activationPath','proofPath'])||
  profile.schema!=='sabora-installed-backup-sender-profile/v1')stop('profile_contract');
 const [ownerPublicKey,planBytes,artifactBytes,activationBytes,proofBytes]=await Promise.all([
  privateInput(profile.ownerPublicKeyPath,4096),privateInput(profile.planPath,262144),privateInput(profile.artifactPath,262144),
  privateInput(profile.activationPath,262144),privateInput(profile.proofPath,262144)]);
 return {ownerPublicKey:ownerPublicKey.toString('utf8'),planBytes,artifactBytes,activationBytes,proofBytes,
  endpoint:profile.endpoint,sourceDirectory:profile.sourceDirectory};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4||!['preflight','send'].includes(process.argv[2]))stop('arguments');
  const r=await request(process.argv[3]);
  if(process.argv[2]==='preflight'){
   const prepared=await prepareInstalledBackupTransfer(r);
   process.stdout.write(JSON.stringify({schema:'sabora-backup-sender-preflight/v1',
    manifestSha256:prepared.expected.manifestSha256,installationId:prepared.installation.activation.installationId,
    networkContacted:false,operationalReceipt:false})+'\n');
  }else process.stdout.write(JSON.stringify(await sendInstalledVpsBackupOverSsh(r))+'\n');
 }catch(error){
  // Typed diagnostics only. No absolute path, profile, signed document, or
  // raw SSH output enters operator logs.
  const reason=String(error?.message??'');
  process.stderr.write((/^sabora_[a-z_]+_stop:[a-z_]+(?::[a-z_]+)?$/.test(reason)?reason:'sabora_backup_installed_send_stop:rejected')+'\n');
  process.exitCode=1;
 }
}
