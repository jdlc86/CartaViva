import test from 'node:test';
import assert from 'node:assert/strict';
import {findReleasePackage,assertExactReleaseSource} from '../scripts/ci/sabora-release-artifact.mjs';
const sha='a'.repeat(40),token='unit-test-token-for-release';
const trusted={id:123,path:'.github/workflows/ci.yml',head_sha:sha,event:'push',
 head_branch:'main',status:'completed',conclusion:'success',
 repository:{full_name:'jdlc86/CartaViva'}};
function fake(runs,artifacts) {
 return async url=>({ok:true,json:async()=>url.includes('/artifacts?')
  ?{total_count:artifacts.length,artifacts}
  :{total_count:runs.length,workflow_runs:runs}});
}
test('Sabora release provenance: exact main push CI and unique unexpired artifact',async()=>{
 const artifact={id:65,name:'sabora-governed-release-package',expired:false,
  size_in_bytes:12345,workflow_run:{id:123}};
 assert.equal((await findReleasePackage(sha,token,fake([trusted],[artifact]))).artifactId,65);
 for(const changed of [
  {head_sha:'b'.repeat(40)},{head_branch:'feature'}, {event:'pull_request'},
  {conclusion:'failure'},{status:'in_progress'},
  {repository:{full_name:'another/Repo'}},{path:'.github/workflows/other.yml'}
 ]){
  const bad={...trusted,...changed};
  assert.throws(()=>assertExactReleaseSource(bad,sha),/untrusted_workflow_run/);
 }
 await assert.rejects(()=>findReleasePackage(sha,token,fake([trusted],[{...artifact,expired:true}])),/invalid_package/);
 await assert.rejects(()=>findReleasePackage(sha,token,fake([trusted],[])),/release_package_missing_or_ambiguous/);
 await assert.rejects(()=>findReleasePackage(sha,token,fake([trusted],[artifact,artifact])),/ambiguous_package/);
 await assert.rejects(()=>findReleasePackage(sha,token,fake([trusted,trusted],[artifact])),/release_package_missing_or_ambiguous/);
});
