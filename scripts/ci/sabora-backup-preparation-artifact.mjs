// Reproducible, closed source package from Git; never provision a host.
// Excludes lab entry, release driver, deployment commands, private keys and
// captures. A later approved root-owned receiver must be added/reviewed.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,readdirSync,lstatSync,existsSync,realpathSync} from 'node:fs';
import {join,dirname,resolve,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {BACKUP_PREPARATION_FILES,validateBackupPreparationManifest} from '../ops/sabora-backup-installation-plan.mjs';
const stop=code=>{throw Error('sabora_backup_preparation_stop:'+code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>a.slice().sort().join('|')===b.slice().sort().join('|');
function verifyDependencies(name,bytes){
 for(const match of bytes.toString('utf8').matchAll(/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
  const dep=match[1];
  if(dep.startsWith('node:'))continue;
  if(!dep.startsWith('.')||!BACKUP_PREPARATION_FILES.includes(posix.normalize(posix.join(posix.dirname(name),dep))))
   stop('source_dependency_outside_package');
 }
}
export function verifyBackupPreparationDirectory(destination){
 if(resolve(destination)!==destination||realpathSync(destination)!==destination)stop('noncanonical_destination');
 const inventory=[];
 function walk(dir){
  const st=lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink())stop('artifact_directory');
  for(const name of readdirSync(dir)){
   const child=join(dir,name),info=lstatSync(child);
   if(info.isSymbolicLink())stop('artifact_link');
   if(info.isDirectory())walk(child);
   else{
    if(!info.isFile()||info.nlink!==1||info.size<1||info.size>2*1024**2)stop('artifact_file');
    inventory.push(child.slice(destination.length+1).replaceAll('\\','/'));
   }
  }
 }
 walk(destination);
 if(!same(inventory,['artifact.json',...BACKUP_PREPARATION_FILES]))stop('artifact_inventory');
 const bytes=readFileSync(join(destination,'artifact.json'));
 const manifest=validateBackupPreparationManifest(bytes);
 for(const name of BACKUP_PREPARATION_FILES){
  const source=readFileSync(join(destination,name));
  if(hash(source)!==manifest.files[name])stop('artifact_content');
  verifyDependencies(name,source);
 }
 return Object.freeze({sourceSha:manifest.sourceSha,artifactSha256:hash(bytes),files:inventory.length,
  operationalAuthorization:false});
}
export function buildBackupPreparationArtifact(destination,sourceSha){
 if(!/^[0-9a-f]{40}$/.test(sourceSha)||resolve(destination)!==destination||existsSync(destination))
  stop('immutable_destination_required');
 const git=(...args)=>execFileSync('git',args,{maxBuffer:4*1024*1024});
 if(git('rev-parse','--verify',sourceSha+'^{commit}').toString().trim()!==sourceSha)stop('source_commit_required');
 const files={};
 // Read the blob for each exact path from the selected commit, not the
 // mutable checkout. Reject symlinks, submodules and unexpected dependencies.
 const blobs=BACKUP_PREPARATION_FILES.map(name=>{
  const match=/^(100644|100755) blob ([0-9a-f]{40})\t([\s\S]+)\0$/.exec(git('ls-tree','-r','-z',sourceSha,'--',name).toString());
  if(!match||match[3]!==name)stop('source_blob_missing');
  const bytes=git('cat-file','blob',match[2]);
  if(!bytes.length||bytes.length>2*1024**2)stop('source_blob_size');
  verifyDependencies(name,bytes);files[name]=hash(bytes);
  return {name,bytes};
 });
 mkdirSync(destination,{mode:0o700});
 for(const {name,bytes} of blobs){
  const path=join(destination,name);mkdirSync(dirname(path),{recursive:true,mode:0o700});
  writeFileSync(path,bytes,{mode:0o600,flag:'wx'});
 }
 const manifest={schema:'sabora-backup-preparation-artifact/v1',repository:'jdlc86/CartaViva',project:'sabora',
  sourceSha,purpose:'offline-preparation-not-installer',files};
 writeFileSync(join(destination,'artifact.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
 return verifyBackupPreparationDirectory(destination);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 if(process.argv.length!==4)stop('usage: output-directory full-commit-sha');
 console.log(JSON.stringify(buildBackupPreparationArtifact(resolve(process.argv[2]),process.argv[3])));
}
