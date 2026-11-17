import test from 'node:test';
import assert from 'node:assert/strict';
import {planSaboraRollback} from '../scripts/ops/sabora-release-rollback-plan.mjs';
import {SABORA_RELEASE_SCOPE} from '../scripts/ci/sabora-release-governor.mjs';
test('Sabora rollback: previously healthy signed release, runtime match and hard failure boundaries',()=>{
 const current='a'.repeat(40),previous='b'.repeat(40);
 const liveHash='1'.repeat(64),oldHash='2'.repeat(64);
 const authorization={operation:'rollback',releaseSha:previous,bundleManifestSha256:oldHash};
 const history={schema:'sabora-release-history/v1',project:'sabora',
  activeReleaseSha:current,versions:[
   {releaseSha:previous,bundleManifestSha256:oldHash,status:'healthy',verifiedAt:'2026-11-13T09:00:00Z'},
   {releaseSha:current,bundleManifestSha256:liveHash,status:'unhealthy',verifiedAt:'2026-11-14T09:00:00Z'}]};
 const observed={schema:'sabora-runtime-observation/v1',project:'sabora',
  releaseSha:current,bundleManifestSha256:liveHash,
  services:[...SABORA_RELEASE_SCOPE.services],port:8443};
 const input={authorization,history,observed};
 const plan=planSaboraRollback(input);
 assert.deepEqual(plan.services,['sabora-egress','api','web']);
 assert.equal(plan.changed,false);
 assert.equal(plan.authorizedToExecute,false);
 assert.equal(plan.targetReleaseSha,previous);
 assert.ok(plan.explicitlyExcluded.includes('sql'));
 for(const invalid of [
  {...input,authorization:{...authorization,operation:'deploy'}},
  {...input,authorization:{...authorization,releaseSha:'c'.repeat(40)}},
  {...input,authorization:{...authorization,bundleManifestSha256:liveHash}},
  {...input,history:{...history,project:'another'}},
  {...input,history:{...history,activeReleaseSha:previous}},
  {...input,history:{...history,versions:history.versions.map(v=>v.releaseSha===previous?{...v,status:'unhealthy'}:v)}},
  {...input,observed:{...observed,project:'another'}},
  {...input,observed:{...observed,releaseSha:previous}},
  {...input,observed:{...observed,services:['api','web']}},
  {...input,observed:{...observed,port:443}}
 ])assert.throws(()=>planSaboraRollback(invalid),/sabora_rollback_stop/);
});
