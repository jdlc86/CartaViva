// Read-only provenance gate for immutable Sabora release packages.
// Actions runner only; never downloads anything to the shared host.
import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const SHA=/^[0-9a-f]{40}$/;
const ENDPOINT='https://api.github.com/repos/jdlc86/CartaViva';
export function assertExactReleaseSource(run,sha) {
 if(!run||run.head_sha!==sha||run.event!=='push'||run.head_branch!=='main'||
    run.status!=='completed'||run.conclusion!=='success'||
    run.path!=='.github/workflows/ci.yml'||run.repository?.full_name!=='jdlc86/CartaViva')
  throw Error('sabora_artifact_stop:untrusted_workflow_run');
 return run.id;
}
export async function findReleasePackage(sha,token,fetcher=fetch) {
 if(!SHA.test(sha)||typeof token!=='string'||token.length<10)
  throw Error('sabora_artifact_stop:invalid_lookup');
 const get=async path=>{
  const response=await fetcher(ENDPOINT+path,{
   headers:{accept:'application/vnd.github+json',
    authorization:'Bearer '+token,'x-github-api-version':'2022-11-28'}});
  if(!response.ok)throw Error('sabora_artifact_stop:github_request_failed');
  return response.json();
 };
 const data=await get('/actions/runs?event=push&branch=main&head_sha='+sha+'&per_page=100');
 if(!Array.isArray(data.workflow_runs)||data.total_count>100)
  throw Error('sabora_artifact_stop:incomplete_main_run_list');
 const found=[];
 for(const run of data.workflow_runs){
  // Ignore unrelated workflows; a suspicious CI workflow with the exact
  // name/path is rejected rather than accepted by a loose SHA match.
  if(run.path!=='.github/workflows/ci.yml')continue;
  assertExactReleaseSource(run,sha);
  const artifacts=await get('/actions/runs/'+run.id+'/artifacts?per_page=100');
  if(!Array.isArray(artifacts.artifacts)||artifacts.total_count>100)
   throw Error('sabora_artifact_stop:incomplete_artifact_list');
  const candidates=artifacts.artifacts.filter(a=>a.name==='sabora-governed-release-package');
  if(candidates.length>1)throw Error('sabora_artifact_stop:ambiguous_package');
  if(candidates.length===1){
   const item=candidates[0];
   if(item.expired!==false||item.workflow_run?.id!==run.id||
     !(Number.isSafeInteger(item.size_in_bytes)&&item.size_in_bytes>0))
    throw Error('sabora_artifact_stop:invalid_package');
   found.push({runId:run.id,artifactId:item.id,releaseSha:sha});
  }
 }
 if(found.length!==1)throw Error('sabora_artifact_stop:release_package_missing_or_ambiguous');
 return found[0];
}

const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){
 try{
  if(process.argv.length!==3)throw Error('sabora_artifact_stop:sha_required');
  const result=await findReleasePackage(process.argv[2],process.env.GITHUB_TOKEN);
  if(!process.env.GITHUB_OUTPUT)throw Error('sabora_artifact_stop:github_output_missing');
  appendFileSync(process.env.GITHUB_OUTPUT,'run_id='+result.runId+'\n');
  process.stdout.write('sabora_release_artifact_provenance_verified\n');
 }catch(error){
  process.stderr.write(String(error?.message||error).replace(/[^a-zA-Z0-9:_-]/g,'_')+'\n');
  process.exitCode=1;
 }
}
