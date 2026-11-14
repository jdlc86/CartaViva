import {createHash,createPublicKey,verify as verifySignature} from 'node:crypto';
import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SABORA_RELEASE_SCOPE=Object.freeze({
 repository:'jdlc86/CartaViva',
 host:'146.59.145.64',
 project:'sabora',
 port:8443,
 origins:['https://sabora.allaiso.com:8443','https://gestion-sabora.allaiso.com:8443'],
 services:['sabora-egress','api','web'],
 compose:['deploy/compose.sabora-operational.yml','deploy/compose.sabora-web.yml']
});
export const EVIDENCE_KEYS=Object.freeze([
 'externalRestoreSha256','sqlProviderGateSha256','ingressIsolationSha256',
 'egressEnforcementSha256','alertDeliverySha256','independentReviewSha256'
]);
const HEX64=/^[0-9a-f]{64}$/;
const SHA=/^[0-9a-f]{40}$/;
const OPS=['deploy','rollback'];
function reject(code){throw Error('sabora_release_stop:'+code);}
function exactKeys(value,keys){
 return value && typeof value==='object'&&!Array.isArray(value)
  && Object.keys(value).sort().join('|')===keys.slice().sort().join('|');
}
export function stableStringify(value){
 if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
 if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableStringify(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export function planRelease(operation,sha){
 if(!['plan',...OPS].includes(operation))reject('invalid_operation');
 if(!SHA.test(sha))reject('invalid_release_sha');
 return Object.freeze({operation,releaseSha:sha,scope:SABORA_RELEASE_SCOPE,
  requires:['exact-sha-on-main','all-integrated-CI-checks-success',
   'signed-time-bounded-owner-authorization','actual-external-restore-evidence',
   'real-supabase-sql-preflight','exclusive-ingress-egress-enforcement',
   'host-locked-sabora-agent','isolated-rollback-ledger','operational-acceptance'],
  automaticallyAuthorized:false,serverChanged:false});
}
export function verifyReleaseAuthorization(raw,signatureB64,publicPem,expected,now=Date.now()){
 if(!expected||!OPS.includes(expected.operation)||!SHA.test(expected.sha))reject('invalid_expected_release');
 if(typeof raw!=='string'||raw.length>8192||raw.length<100)reject('invalid_approval_content');
 let approval;
 try{approval=JSON.parse(raw)}catch{reject('approval_not_json');}
 const fields=['schema','repository','operation','releaseSha','authorizationId','approvedAt','expiresAt',
  'server','project','port','origins','services','bundleManifestSha256','evidence'];
 if(!exactKeys(approval,fields)||raw!==stableStringify(approval))reject('noncanonical_approval');
 if(approval.schema!=='sabora-governed-release/v1'||approval.repository!==SABORA_RELEASE_SCOPE.repository ||
    approval.operation!==expected.operation||approval.releaseSha!==expected.sha ||
    approval.server!==SABORA_RELEASE_SCOPE.host||approval.project!=='sabora'||approval.port!==8443)
  reject('wrong_release_scope');
 if(!Array.isArray(approval.origins)||!Array.isArray(approval.services)||
    approval.origins.join('|')!==SABORA_RELEASE_SCOPE.origins.join('|')||
    approval.services.join('|')!==SABORA_RELEASE_SCOPE.services.join('|'))
  reject('wrong_runtime_scope');
 if(typeof approval.authorizationId!=='string'||!/^[A-Z0-9-]{12,64}$/.test(approval.authorizationId))reject('invalid_authorization_id');
 const start=Date.parse(approval.approvedAt),end=Date.parse(approval.expiresAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||!/^\d{4}-\d{2}-\d{2}T/.test(approval.approvedAt)||
    !/^\d{4}-\d{2}-\d{2}T/.test(approval.expiresAt)||
    start>now||now>=end||end-start>3600000||end<=start||now-start>3600000)
  reject('expired_or_invalid_authorization_window');
 if(typeof approval.bundleManifestSha256!=='string'||!HEX64.test(approval.bundleManifestSha256)||
    /^0+$/.test(approval.bundleManifestSha256))reject('invalid_bundle_manifest_hash');
 if(!exactKeys(approval.evidence,EVIDENCE_KEYS)||EVIDENCE_KEYS.some(k=>typeof approval.evidence[k]!=='string'||
    !HEX64.test(approval.evidence[k])||/^0+$/.test(approval.evidence[k]))||
    new Set(EVIDENCE_KEYS.map(k=>approval.evidence[k])).size!==EVIDENCE_KEYS.length)
  reject('missing_or_reused_real_evidence_reference');
 if(typeof signatureB64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureB64))reject('signature_missing');
 let pub,valid;
 try{
  pub=createPublicKey(publicPem);
  if(pub.asymmetricKeyType!=='ed25519')reject('wrong_approval_key_algorithm');
  valid=verifySignature(null,Buffer.from(raw,'utf8'),pub,Buffer.from(signatureB64,'base64'));
 }catch(e){if(String(e?.message).startsWith('sabora_release_stop:'))throw e;reject('signature_verification_failed');}
 if(!valid)reject('signature_invalid');
 const digest=createHash('sha256').update(raw).digest('hex');
 return Object.freeze({authorizationId:approval.authorizationId,releaseSha:approval.releaseSha,
   operation:approval.operation,authorizationSha256:digest,
   bundleManifestSha256:approval.bundleManifestSha256,evidence:approval.evidence});
}
export async function verifyGithubChecks(sha,token,fetcher=fetch){
 if(!SHA.test(sha)||typeof token!=='string'||token.length<10)reject('ci_lookup_credentials_missing');
 const response=await fetcher('https://api.github.com/repos/jdlc86/CartaViva/commits/'+sha+'/check-runs?per_page=100',{
  headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token,'x-github-api-version':'2022-11-28'}});
 if(!response.ok)reject('ci_check_lookup_failed');
 const body=await response.json();
 if(!Array.isArray(body.check_runs)||body.total_count>100)reject('incomplete_ci_check_list');
 const names=['validate','web-publication','generate-lockfile','functional-ui-gate'];
 for(const name of names){
  const candidates=body.check_runs.filter(c=>c.name===name);
  if(!candidates.length||candidates.some(c=>c.status!=='completed'||c.conclusion!=='success'||c.head_sha!==sha||c.app?.slug!=='github-actions'))
   reject('ci_not_success:'+name);
 }
 return names;
}
const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){
 try{
  const [mode,operation,sha]=process.argv.slice(2);
  const plan=planRelease(operation,sha);
  if(mode==='plan'){
   process.stdout.write(JSON.stringify(plan)+'\n');
  }else if(mode==='check-ci'){
   const names=await verifyGithubChecks(sha,process.env.GITHUB_TOKEN);
   process.stdout.write('sabora_release_ci_pass:'+names.join(',')+'\n');
  }else if(mode==='authorize'){
   const env=process.env;
   if(env.SABORA_RELEASE_AGENT_READY!=='explicitly-provisioned')reject('host_agent_not_provisioned');
   const raw=Buffer.from(env.SABORA_APPROVAL_JSON_B64||'','base64').toString('utf8');
   const pub=Buffer.from(env.SABORA_APPROVER_PUBLIC_KEY_B64||'','base64').toString('utf8');
   const result=verifyReleaseAuthorization(raw,env.SABORA_APPROVAL_SIG_B64,pub,{operation,sha});
   if(!env.GITHUB_OUTPUT)reject('github_output_missing');
   appendFileSync(env.GITHUB_OUTPUT,'authorization_id='+result.authorizationId+'\n'+
    'authorization_sha256='+result.authorizationSha256+'\n');
   process.stdout.write('sabora_release_authorization_verified\n');
  }else reject('invalid_cli_mode');
 }catch(error){
  process.stderr.write(String(error?.message||error).replace(/[^a-zA-Z0-9:_-]/g,'_')+'\n');
  process.exitCode=1;
 }
}
