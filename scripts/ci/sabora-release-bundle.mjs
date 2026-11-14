// Deterministic metadata for two previously built Sabora-only image archives.
// This module never builds/pulls images, accesses the VPS or uses credentials.
import {createHash} from 'node:crypto';
import {createReadStream,writeFileSync,statSync,lstatSync,readFileSync} from 'node:fs';
import {basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SABORA_RELEASE_SCOPE} from './sabora-release-governor.mjs';
const SHA=/^[0-9a-f]{40}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/;
function stop(reason){throw Error('sabora_bundle_stop:'+reason);}
export async function hashRegularFile(path){
 const st=lstatSync(path);
 if(!st.isFile()||st.nlink!==1||!st.size)stop('invalid_input_file');
 return await new Promise((resolve,reject)=>{
  const h=createHash('sha256');const s=createReadStream(path);
  s.on('data',data=>h.update(data));s.on('error',reject);
  s.on('end',()=>resolve(h.digest('hex')));
 });
}
export async function buildReleaseBundleManifest({releaseSha,apiArchive,webArchive,apiImageId,webImageId,operationalCompose,webCompose}){
 if(!SHA.test(releaseSha)||!IMAGE.test(apiImageId)||!IMAGE.test(webImageId))
  stop('release_sha_or_image_identity_invalid');
 if([apiArchive,webArchive,operationalCompose,webCompose].some(p=>typeof p!=='string'||!p||p.includes('\0')))
  stop('invalid_paths');
 const [a,w,o,c]=await Promise.all([
  hashRegularFile(apiArchive),hashRegularFile(webArchive),
  hashRegularFile(operationalCompose),hashRegularFile(webCompose)]);
 return {schema:'sabora-release-bundle/v1',repository:SABORA_RELEASE_SCOPE.repository,
  releaseSha,project:SABORA_RELEASE_SCOPE.project,
  services:[...SABORA_RELEASE_SCOPE.services],
  images:{
   api:{tag:'sabora-api:'+releaseSha,imageId:apiImageId,archiveSha256:a},
   web:{tag:'sabora-web:'+releaseSha,imageId:webImageId,archiveSha256:w}
  },compose:{operational:o,web:c}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const [sha,api,web,apiId,webId,operational,webCompose,out]=process.argv.slice(2);
  if(!out||typeof out!=='string'||basename(out)!=='manifest.json')
   stop('output_must_be_manifest_json');
  const manifest=await buildReleaseBundleManifest({releaseSha:sha,apiArchive:api,
   webArchive:web,apiImageId:apiId,webImageId:webId,
   operationalCompose:operational,webCompose:webCompose});
  writeFileSync(out,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  process.stdout.write('sabora_bundle_manifest_created\n');
 }catch(err){
  process.stderr.write(String(err.message).replace(/[^A-Za-z0-9:_-]/g,'_')+'\n');
  process.exitCode=1;
 }
}
