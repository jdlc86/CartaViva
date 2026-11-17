// Bounded Sabora-only release executor for disposable integration testing.
// Production invocation is NOT wired: the SSH forced-command still returns STOP.
// An operator must later supply an independently reviewed, privileged driver,
// trusted evidence reader, live network inspector and retention/ledger backend.
import {SABORA_RELEASE_SCOPE,EVIDENCE_KEYS} from '../ci/sabora-release-governor.mjs';
import {verifyHostEvidence,verifyReleaseBundleManifest} from './sabora-release-host-agent.mjs';
import {assertLiveSaboraIsolation} from './sabora-release-isolation-gate.mjs';
import {planSaboraRollback} from './sabora-release-rollback-plan.mjs';
import {createHash} from 'node:crypto';
import {lstatSync,createReadStream,readFileSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
function stop(code){throw Error('sabora_actuator_stop:'+code);}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const SHA=/^[0-9a-f]{40}$/;
const ITEMS=Object.freeze(['api.tar','web.tar','operational.yml','web.yml','manifest.json']);
function protectedStage(dir,root){
 const base=resolve(root),candidate=resolve(dir);
 if(!candidate.startsWith(base+sep)||candidate===base||candidate.split(sep).length!==base.split(sep).length+1)
  stop('untrusted_staged_directory');
 const parent=lstatSync(base),st=lstatSync(candidate);
 for(const part of [parent,st]){
  if(!part.isDirectory()||part.isSymbolicLink()||part.uid!==process.getuid()||
     (part.mode&0o077)!==0)stop('unsafe_stage_ownership');
 }
}
async function hashStageFile(file,maxSize){
 const st=lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
    st.uid!==process.getuid()||(st.mode&0o077)!==0||
    st.size===0||st.size>maxSize)stop('unsafe_bundle_file');
 return await new Promise((resolveDigest,reject)=>{
  const h=createHash('sha256'),stream=createReadStream(file,{highWaterMark:65536});
  stream.on('data',b=>h.update(b));stream.on('error',reject);
  stream.on('end',()=>resolveDigest(h.digest('hex')));
 });
}
export async function verifyStagedSaboraBundle(stage,root,receipt){
 if(!stage||stage.stage!=='verified-only'||stage.authorizedToDeploy!==false||
  (stage.authorizationId!==receipt?.authorizationId&&!stage.retainedPreviouslyHealthy)||
  stage.releaseSha!==receipt?.releaseSha||
  stage.bundleManifestSha256!==receipt?.bundleManifestSha256)
  stop('untrusted_stage_receipt');
 protectedStage(stage.location,root);
 const paths=ITEMS.map(n=>join(stage.location,n));
 const metadata=lstatSync(paths[4]);
 if(!metadata.isFile()||metadata.isSymbolicLink()||metadata.nlink!==1||
    metadata.uid!==process.getuid()||(metadata.mode&0o077)!==0||
    metadata.size<20||metadata.size>65536)stop('unsafe_manifest_file');
 const manifestBytes=readFileSync(paths[4]);
 let manifest;
 try{manifest=JSON.parse(manifestBytes.toString('utf8'))}
 catch{stop('invalid_staged_manifest');}
 verifyReleaseBundleManifest(receipt,manifest,manifestBytes);
 const expected=[manifest.images.api.archiveSha256,manifest.images.web.archiveSha256,
   manifest.compose.operational,manifest.compose.web,digest(manifestBytes)];
 for(let i=0;i<ITEMS.length;i++){
  if(await hashStageFile(paths[i],i<2?805306368:65536)!==expected[i])
   stop('mismatched_staged_bundle:'+ITEMS[i]);
 }
 return Object.freeze({sha:receipt.releaseSha,manifest,paths});
}
function checkScope(plan,receipt,mode){
 if(!receipt||receipt.operation!==mode||!SHA.test(receipt.releaseSha)||
  !/^[0-9a-f]{64}$/.test(receipt.authorizationSha256)||
  !/^[0-9a-f]{64}$/.test(receipt.bundleManifestSha256)||
  !EVIDENCE_KEYS.every(k=>/^[0-9a-f]{64}$/.test(receipt.evidence?.[k]??'')))
  stop('invalid_signed_scope');
 if(plan?.operation!==mode||plan?.project!==SABORA_RELEASE_SCOPE.project||
    !Array.isArray(plan.services)||plan.services.join('|')!==SABORA_RELEASE_SCOPE.services.join('|')||
    plan.port!==8443||plan.host!==SABORA_RELEASE_SCOPE.host)
  stop('unapproved_runtime_scope');
}
function assertDriver(driver){
 const methods=['getEvidence','inspectIsolation','inspectScopedCompose','inspectImages',
  'loadImage','deployServices','readiness','readHistory','observeRuntime',
  'registerAuthorization','commitResult','getRetainedBundle'];
 if(methods.some(k=>typeof driver?.[k]!=='function'))stop('unprovisioned_host_driver');
}
function verifiedEvidence(receipt,documents){
 const verified=verifyHostEvidence(receipt,documents);
 if(verified.length!==EVIDENCE_KEYS.length)stop('incomplete_real_gates');
 return verified;
}
function checkComposeView(config,sha){
 if(!config||config.project!=='sabora'||config.releaseSha!==sha||
  !Array.isArray(config.services)||config.services.join('|')!==SABORA_RELEASE_SCOPE.services.join('|')||
  config.publicTcpPorts?.length!==1||config.publicTcpPorts[0]!=='146.59.145.64:8443'||
  config.loopbackTcpPorts?.length!==0||
  config.externalNetworks?.join('|')!=='sabora_ingress_filtered|sabora_egress_filtered'||
  config.internalNetwork!=='sabora_sabora_runtime_internal'||
  config.unsafeOptionsPresent!==false||config.unknownServicesPresent!==false||
  config.healthchecksEnabled!==true)stop('resolved_compose_unsafe');
}
function checkImages(images,manifest){
 if(!images||images.api!==manifest.images.api.imageId||
   images.web!==manifest.images.web.imageId)stop('loaded_image_identity_mismatch');
}
export async function executeScopedSaboraRelease({
 receipt,stage,stageRoot,driver,operation,now=Date.now()}){
 // Caller is not a CLI: this cannot be reached from installed SSH until a
 // separately audited wiring/privilege boundary is explicitly authorized.
 if(operation!=='deploy'&&operation!=='rollback')stop('operation_disallowed');
 assertDriver(driver);
 if(receipt?.operation!==operation)stop('signed_operation_mismatch');
 const evidence=verifiedEvidence(receipt,await driver.getEvidence(receipt));
 const network=assertLiveSaboraIsolation(await driver.inspectIsolation(),now,'preflight');
 const history=await driver.readHistory();
 let bundle,rollbackPlan;
 if(operation==='deploy'){
  if(!stage)stop('missing_deploy_bundle');
  if(stage.retainedPreviouslyHealthy===true)stop('deploy_cannot_bypass_current_authorization');
  bundle=await verifyStagedSaboraBundle(stage,stageRoot,receipt);
 }else{
  const live=await driver.observeRuntime();
  rollbackPlan=planSaboraRollback({authorization:receipt,history,observed:live});
  bundle=await driver.getRetainedBundle(rollbackPlan);
  if(bundle?.retainedPreviouslyHealthy!==true)stop('rollback_bundle_not_retained');
  bundle=await verifyStagedSaboraBundle(bundle,stageRoot,receipt);
  if(bundle.sha!==rollbackPlan.targetReleaseSha)
   stop('retained_bundle_not_rollback_target');
 }
 const plan={operation,project:'sabora',host:SABORA_RELEASE_SCOPE.host,port:8443,
   releaseSha:receipt.releaseSha,services:[...SABORA_RELEASE_SCOPE.services]};
 checkScope(plan,receipt,operation);
 const config=await driver.inspectScopedCompose({bundle,plan,network});
 checkComposeView(config,receipt.releaseSha);
 if(operation==='deploy'){
  // Validate tags have no pre-existing owners; never overwrite an image that
  // has a different ID, even if its tag is within the Sabora namespace.
  const before=await driver.inspectImages({bundle,allowMissing:true});
  for(const type of ['api','web']){
   const id=before?.[type];
   if(id&&id!==bundle.manifest.images[type].imageId)
    stop('existing_tag_collision:'+type);
  }
 }
 // Exactly-once consent is durably consumed BEFORE Docker first mutates.
 // A failure afterward may require a NEW signed authorization to recover.
 await driver.registerAuthorization(receipt,{operation,releaseSha:receipt.releaseSha,
  manifestSha256:receipt.bundleManifestSha256,evidenceCount:evidence.length});
 if(operation==='deploy'){
  for(const type of ['api','web'])
   await driver.loadImage({type,archive:bundle.paths[type==='api'?0:1],
    tag:bundle.manifest.images[type].tag});
 }
 checkImages(await driver.inspectImages({bundle,allowMissing:false}),bundle.manifest);
 // No generic project commands, no down/prune/global restart or auto rollback.
 await driver.deployServices({plan,bundle,services:[...SABORA_RELEASE_SCOPE.services],
   noDependencies:true,noBuild:true,noPull:true});
 const health=await driver.readiness({plan,bundle,expectedOrigins:SABORA_RELEASE_SCOPE.origins});
 if(!health||health.apiReady!==true||health.clientHttps!==true||
  health.managementHttps!==true||health.alertReception!==true)
  stop('operational_readiness_not_demonstrated');
 // Recheck exclusive network state AFTER launch: a green health is insufficient.
 assertLiveSaboraIsolation(await driver.inspectIsolation(),now,'running');
 const record=await driver.commitResult({receipt,operation,previous:history?.activeReleaseSha??null,
   manifestSha256:receipt.bundleManifestSha256,evidenceVerified:evidence.length,
   releaseSha:receipt.releaseSha,readiness:health});
 if(record?.durablyRecorded!==true||record.releaseSha!==receipt.releaseSha||
    record.operation!==operation)stop('release_ledger_not_committed');
 return Object.freeze({releaseSha:receipt.releaseSha,operation,
  status:'lab-executor-complete',receiptId:receipt.authorizationId,
  proof:record,changed:true,previousRelease:history?.activeReleaseSha??null});
}
