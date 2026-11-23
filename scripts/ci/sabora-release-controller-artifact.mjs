// Reproducible source artifact, not an installer. No privileged commands.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from '../ops/sabora-release-protected-store.mjs';
export function buildControllerArtifact(destination,sourceSha){
 if(!/^[0-9a-f]{40}$/.test(sourceSha)||existsSync(destination))throw Error('sabora_artifact_stop:immutable_destination_required');
 const git=(...args)=>execFileSync('git',args,{maxBuffer:8*1024*1024});
 const listed=git('ls-tree','-r','--name-only',sourceSha).toString('utf8').trim().split('\n');
 const files=listed.filter(name=>/^scripts\/ops\/sabora-release-[a-z-]+\.mjs$/.test(name)||
  ['scripts/ci/sabora-release-governor.mjs','scripts/ci/sabora-release-transport.mjs',
   'scripts/ci/sabora-release-rollback-request.mjs',
   'scripts/ci/sabora-release-authorization-v2.mjs'].includes(name)||/^deploy\/sabora-release-[a-z-]+\.(c|conf|json)$/.test(name)).sort();
 if(!files.includes('scripts/ops/sabora-release-root-entry.mjs'))throw Error('sabora_artifact_stop:controller_missing_from_sha');
 mkdirSync(destination,{recursive:true,mode:0o700});const hashes={};
 for(const name of files){const bytes=git('show',sourceSha+':'+name);hashes[name]=sha256(bytes);
  const path=join(destination,name);mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,bytes,{mode:0o600});}
 const manifest={schema:'sabora-controller-artifact/v1',repository:'jdlc86/CartaViva',sourceSha,files:hashes};
 writeFileSync(join(destination,'artifact.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});return manifest;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 if(process.argv.length!==4)throw Error('usage: node sabora-release-controller-artifact.mjs OUTPUT SHA');
 buildControllerArtifact(resolve(process.argv[2]),process.argv[3]);
}
