// Strict Sabora-only application rollback decision.
// A physical host inspector MUST supply its own live observation. This plan
// does not execute Docker, roll back PostgreSQL, or create privileged access.
import {SABORA_RELEASE_SCOPE} from '../ci/sabora-release-governor.mjs';
const SHA=/^[0-9a-f]{40}$/,HEX=/^[0-9a-f]{64}$/;
function stop(code){throw Error('sabora_rollback_stop:'+code);}
function exact(v,keys){return !!v&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).sort().join('|')===keys.slice().sort().join('|');}
function validVersion(v){
 return exact(v,['releaseSha','bundleManifestSha256','status','verifiedAt'])&&
 SHA.test(v.releaseSha)&&HEX.test(v.bundleManifestSha256)&&
 ['healthy','unhealthy','superseded'].includes(v.status)&&
 typeof v.verifiedAt==='string'&&Number.isFinite(Date.parse(v.verifiedAt));
}
export function planSaboraRollback({authorization,history,observed}){
 if(authorization?.operation!=='rollback'||!SHA.test(authorization.releaseSha)||
   !HEX.test(authorization.bundleManifestSha256))stop('signed_rollback_required');
 if(!exact(history,['schema','project','activeReleaseSha','versions'])||
   history.schema!=='sabora-release-history/v1'||history.project!=='sabora'||
   !SHA.test(history.activeReleaseSha)||!Array.isArray(history.versions)||
   history.versions.length<2||history.versions.length>100||
   history.versions.some(v=>!validVersion(v))||
   new Set(history.versions.map(v=>v.releaseSha)).size!==history.versions.length)
  stop('invalid_host_release_history');
 const active=history.versions.find(v=>v.releaseSha===history.activeReleaseSha);
 const previous=history.versions.find(v=>v.releaseSha===authorization.releaseSha);
 if(!active||!previous||previous.releaseSha===active.releaseSha||
   previous.status!=='healthy'||previous.bundleManifestSha256!==authorization.bundleManifestSha256)
  stop('no_previously_healthy_target');
 // Caller must derive "observed" from actual runtime inspection, NOT from
 // caller-supplied SSH input or from history itself.
 if(!exact(observed,['schema','project','releaseSha','bundleManifestSha256','services','port'])||
   observed.schema!=='sabora-runtime-observation/v1'||observed.project!=='sabora'||
   observed.releaseSha!==active.releaseSha||
   observed.bundleManifestSha256!==active.bundleManifestSha256||
   observed.port!==8443||!Array.isArray(observed.services)||
   observed.services.join('|')!==SABORA_RELEASE_SCOPE.services.join('|'))
  stop('live_runtime_does_not_match_history');
 return Object.freeze({
  schema:'sabora-application-only-rollback-plan/v1',
  project:'sabora',targetReleaseSha:previous.releaseSha,priorReleaseSha:active.releaseSha,
  targetManifestSha256:previous.bundleManifestSha256,
  services:[...SABORA_RELEASE_SCOPE.services],
  explicitlyExcluded:['sql','migrations','global-docker','networks','other-project-services'],
  validatedAsPlanOnly:true,changed:false,authorizedToExecute:false
 });
}
