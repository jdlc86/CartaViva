// Deployment authority V2: exclusively the owner-triggered protected GitHub
// Actions job plus its dedicated SSH key. NO Ed25519 approval or dossiers.
// The host additionally checks the immutable run identity, SHA, TTL and replay.
// Root compromise / leaked Actions SSH key are outside this trust boundary.
import {createHash} from 'node:crypto';
import {appendFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {SABORA_RELEASE_SCOPE,stableStringify} from './sabora-release-governor.mjs';

const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const RUN=/^[1-9][0-9]{5,19}$/;
const ID=/^(?:GH[1-9][0-9]{5,19}-A[1-9][0-9]{0,4}|IS[0-9]{12})$/;
const OPERATIONS=new Set(['deploy','rollback']);
const HEADER=['schema','repository','actor','operation','releaseSha','authorizationId',
 'githubRunId','githubRunAttempt','approvedAt','expiresAt','server','project','port',
 'origins','services','bundleManifestSha256','sourceIssueNumber'];
const fail=reason=>{throw Error('sabora_v2_authorization_stop:'+reason);};
const keys=(object,names)=>object&&typeof object==='object'&&!Array.isArray(object)&&
 Object.keys(object).sort().join('|')===names.slice().sort().join('|');
const digest=value=>createHash('sha256').update(value).digest('hex');
export function createGitHubReleaseAuthorization({actor,runId,attempt,operation,sha,
 bundleManifestSha256=null,sourceIssueNumber=null,now=Date.now()}){
 const issue=sourceIssueNumber===null?null:Number(sourceIssueNumber);
 if(issue!==null&&(!Number.isSafeInteger(issue)||issue<1||issue>999999999999))fail('source_issue_invalid');
 const id=issue===null?'GH'+String(runId)+'-A'+String(attempt):'IS'+String(issue).padStart(12,'0');
 if(actor!=='jdlc86'||!RUN.test(String(runId))||!Number.isSafeInteger(Number(runId))||
   !Number.isInteger(Number(attempt))||Number(attempt)<1||Number(attempt)>99999||
   !ID.test(id)||!OPERATIONS.has(operation)||!SHA40.test(sha)||
   (operation==='deploy'?!SHA64.test(bundleManifestSha256??''):bundleManifestSha256!==null))
  fail('invalid_owner_run_scope');
 if(!Number.isFinite(now)||now<=0)fail('invalid_clock');
 const data={schema:'sabora-governed-release/v2',repository:SABORA_RELEASE_SCOPE.repository,
  actor,operation,releaseSha:sha,authorizationId:id,githubRunId:String(runId),
  githubRunAttempt:Number(attempt),approvedAt:new Date(now).toISOString(),
  expiresAt:new Date(now+3600000).toISOString(),server:SABORA_RELEASE_SCOPE.host,
  project:SABORA_RELEASE_SCOPE.project,port:SABORA_RELEASE_SCOPE.port,
  origins:SABORA_RELEASE_SCOPE.origins,services:SABORA_RELEASE_SCOPE.services,
  bundleManifestSha256,sourceIssueNumber:issue};
 const raw=stableStringify(data);
 return {raw,approvalB64:Buffer.from(raw).toString('base64'),
  authorizationId:id,authorizationSha256:digest(raw)};
}
export function verifyGitHubReleaseAuthorizationV2(raw,{operation,sha,runId,attempt,manifestSha256,sourceIssueNumber}={},now=Date.now()){
 if(typeof raw!=='string'||raw.length<150||raw.length>4096)fail('invalid_payload_size');
 let approval;
 try{approval=JSON.parse(raw);}catch{fail('invalid_json');}
 if(!keys(approval,HEADER)||raw!==stableStringify(approval))fail('noncanonical_payload');
 if(approval.schema!=='sabora-governed-release/v2'||
  approval.repository!==SABORA_RELEASE_SCOPE.repository||approval.actor!=='jdlc86'||
  !OPERATIONS.has(approval.operation)||approval.operation!==operation||
  !SHA40.test(approval.releaseSha)||approval.releaseSha!==sha||
  approval.server!==SABORA_RELEASE_SCOPE.host||approval.project!==SABORA_RELEASE_SCOPE.project||
  approval.port!==SABORA_RELEASE_SCOPE.port||
  stableStringify(approval.origins)!==stableStringify(SABORA_RELEASE_SCOPE.origins)||
  stableStringify(approval.services)!==stableStringify(SABORA_RELEASE_SCOPE.services))
  fail('scope_mismatch');
 if(!RUN.test(approval.githubRunId)||!Number.isSafeInteger(Number(approval.githubRunId))||
  !Number.isInteger(approval.githubRunAttempt)||approval.githubRunAttempt<1||
  approval.githubRunAttempt>99999||
  approval.authorizationId!==(approval.sourceIssueNumber===null?
  'GH'+approval.githubRunId+'-A'+approval.githubRunAttempt:
  'IS'+String(approval.sourceIssueNumber).padStart(12,'0'))||
  (approval.sourceIssueNumber!==null&&(!Number.isSafeInteger(approval.sourceIssueNumber)||
   approval.sourceIssueNumber<1||approval.sourceIssueNumber>999999999999))||
  !ID.test(approval.authorizationId)||
  (runId!==undefined&&String(runId)!==approval.githubRunId)||
  (attempt!==undefined&&Number(attempt)!==approval.githubRunAttempt)||
  (sourceIssueNumber!==undefined&&sourceIssueNumber!==approval.sourceIssueNumber))
  fail('run_identity_mismatch');
 if(operation==='deploy'&&(!SHA64.test(approval.bundleManifestSha256??'')||
  (manifestSha256&&approval.bundleManifestSha256!==manifestSha256))||
  operation==='rollback'&&approval.bundleManifestSha256!==null)
  fail('manifest_scope');
 const from=Date.parse(approval.approvedAt),until=Date.parse(approval.expiresAt);
 if(!Number.isFinite(now)||!Number.isFinite(from)||!Number.isFinite(until)||
  new Date(from).toISOString()!==approval.approvedAt||
  new Date(until).toISOString()!==approval.expiresAt||
  from>now||now>=until||until-from!==3600000)
  fail('expired_or_invalid_window');
 return Object.freeze({schema:'sabora-release-authorization-receipt/v2',
  operation:approval.operation,releaseSha:approval.releaseSha,
  authorizationId:approval.authorizationId,authorizationSha256:digest(raw),
  githubRunId:approval.githubRunId,githubRunAttempt:approval.githubRunAttempt,
  bundleManifestSha256:approval.bundleManifestSha256,actor:approval.actor,
  sourceIssueNumber:approval.sourceIssueNumber});
}
const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){
 try{
  if(process.argv.length!==4||process.argv[2]!=='create')fail('usage');
  const operation=process.env.RELEASE_OPERATION;
  const file=process.argv[3];
  if(operation==='deploy'&&(!file||file==='none'))fail('package_manifest_required');
  let bundleManifestSha256=null;
  if(operation==='deploy'){
   const data=readFileSync(file);
   if(!data.length||data.length>32768)fail('manifest_size');
   const manifest=JSON.parse(data.toString('utf8'));
   if(manifest.schema!=='sabora-release-bundle/v1'||manifest.repository!==SABORA_RELEASE_SCOPE.repository||
    manifest.releaseSha!==process.env.RELEASE_SHA||manifest.project!=='sabora')fail('manifest_identity');
   bundleManifestSha256=digest(data);
  }
  const result=createGitHubReleaseAuthorization({
   actor:process.env.SABORA_OWNER_VERIFIED,runId:process.env.GITHUB_RUN_ID,
   attempt:Number(process.env.GITHUB_RUN_ATTEMPT),operation,sha:process.env.RELEASE_SHA,
   bundleManifestSha256,
   sourceIssueNumber:process.env.SABORA_SOURCE_ISSUE_NUMBER?Number(process.env.SABORA_SOURCE_ISSUE_NUMBER):null});
  verifyGitHubReleaseAuthorizationV2(result.raw,{operation,sha:process.env.RELEASE_SHA,
   runId:process.env.GITHUB_RUN_ID,attempt:Number(process.env.GITHUB_RUN_ATTEMPT)});
  if(!process.env.GITHUB_OUTPUT)fail('github_output_unavailable');
  appendFileSync(process.env.GITHUB_OUTPUT,'authorization_id='+result.authorizationId+'\n'+
   'authorization_sha256='+result.authorizationSha256+'\n'+
   'approval_b64='+result.approvalB64+'\n');
  process.stdout.write('sabora_v2_owner_run_authorization_created\n');
 }catch(error){
  process.stderr.write(String(error?.message||error).replace(/[^A-Za-z0-9_:]/g,'_')+'\n');
  process.exitCode=1;
 }
}
