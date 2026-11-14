import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PassThrough} from 'node:stream';
import {sendReleaseBundle} from '../scripts/ci/sabora-release-transport.mjs';
import {receiveReleaseBundle} from '../scripts/ops/sabora-release-receiver.mjs';
import {executeScopedSaboraRelease} from '../scripts/ops/sabora-release-actuator.mjs';
import {verifyHostEnvelope} from '../scripts/ops/sabora-release-host-agent.mjs';
import {buildReleaseBundleManifest} from '../scripts/ci/sabora-release-bundle.mjs';
import {SABORA_RELEASE_SCOPE,EVIDENCE_KEYS,stableStringify} from '../scripts/ci/sabora-release-governor.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const sha='e'.repeat(40),now=Date.now();
function witness(running=false){
 const mk=(name,kind,bridge,cidr,internal,services)=>({
  name,project:'sabora',kind,driver:'bridge',bridge,cidr,internal,attachable:false,
  ipv6:false,attachedServices:running?services:[]});
 return {schema:'sabora-live-isolation/v1',source:'host-readonly-inspector',
  project:'sabora',observedAt:new Date(now).toISOString(),
  routingCollisionTested:true,
  serviceNetworks:running?{
   api:['sabora_sabora_runtime_internal'],
   'sabora-egress':['sabora_egress_filtered','sabora_sabora_runtime_internal'],
   web:['sabora_ingress_filtered','sabora_sabora_runtime_internal']}:undefined,
  networks:{
   runtime:mk('sabora_sabora_runtime_internal','runtime','br-1234567890ab','172.28.200.0/24',true,
    ['sabora-egress','api','web']),
   ingress:mk('sabora_ingress_filtered','ingress','br-234567890abc','172.28.240.0/24',false,['web']),
   egress:mk('sabora_egress_filtered','egress','br-34567890abcd','172.28.241.0/24',false,['sabora-egress'])},
  ingress:{bridge:'br-234567890abc',table:'sabora_ingress_guard',filterHook:'forward',
   cloudflareOnly:true,directOriginDenied:true,newOutboundDenied:true,
   ipv6BypassDenied:true,otherServicesUnaffected:true},
  egress:{bridge:'br-34567890abcd',table:'sabora_egress_guard',filterHook:'forward',
   explicitDestinationAllowlist:true,wildcardDenied:true,
   prohibitedOutboundDenied:true,ipv6BypassDenied:true,otherServicesUnaffected:true},
  port:{ip:'146.59.145.64',tcp:8443,exclusivelyReservedForSabora:true,
   otherPortsUntouched:true,sharedHostDaemonUntouched:true}};
}
test('M6 integrated dry lab: signed release -> 4 frames -> guarded network/evidence -> scoped image IDs -> 3 services -> readiness/ledger',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sabora-actuator-integral-'));
 try{
  const source=join(root,'src'),stageRoot=join(root,'stage');
  mkdirSync(source,{mode:0o700});mkdirSync(stageRoot,{mode:0o700});
  const paths=['api.tar','web.tar','operational.yml','web.yml'];
  const contents=[
   Buffer.from('SIMULATED_API_IMAGE_NOT_REAL_DOCKER'),
   Buffer.from('SIMULATED_TWO_PWA_IMAGE_NOT_REAL_DOCKER'),
   Buffer.from('name: sabora\nservices:\n  api: {}\n'),
   Buffer.from('name: sabora\nservices:\n  web: {}\n')];
  for(let i=0;i<4;i++)writeFileSync(join(source,paths[i]),contents[i],{mode:0o600});
  const manifest=await buildReleaseBundleManifest({
   releaseSha:sha,apiArchive:join(source,paths[0]),webArchive:join(source,paths[1]),
   operationalCompose:join(source,paths[2]),webCompose:join(source,paths[3]),
   apiImageId:'sha256:'+'a'.repeat(64),webImageId:'sha256:'+'b'.repeat(64)});
  const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  const docs=Object.fromEntries(EVIDENCE_KEYS.map((gate,i)=>[gate,Buffer.from(JSON.stringify({
   schema:'sabora-release-evidence/v1',gate,restaurant:'sabora',status:'verified',
   observedAt:new Date(now).toISOString(),reference:'LAB-FIXTURE-NOT-REAL-EVIDENCE-'+i}))]));
  const keys=generateKeyPairSync('ed25519');
  const approval={schema:'sabora-governed-release/v1',repository:'jdlc86/CartaViva',
   operation:'deploy',releaseSha:sha,authorizationId:'SABORA-LAB-RELEASE-0001',
   approvedAt:new Date(now-120000).toISOString(),expiresAt:new Date(now+1200000).toISOString(),
   server:'146.59.145.64',project:'sabora',port:8443,
   origins:[...SABORA_RELEASE_SCOPE.origins],services:[...SABORA_RELEASE_SCOPE.services],
   bundleManifestSha256:hash(manifestBytes),
   evidence:Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,hash(docs[k])]))};
  const raw=stableStringify(approval);
  const approvalB64=Buffer.from(raw).toString('base64');
  const signatureB64=sign(null,Buffer.from(raw),keys.privateKey).toString('base64');
  const publicKey=keys.publicKey.export({format:'pem',type:'spki'});
  const cmd='sabora-release-v1 deploy '+sha+' SABORA-LAB-RELEASE-0001 '+hash(raw)+' 9011';
  const ch=new PassThrough({highWaterMark:2048});
  const [_,stage]=await Promise.all([
   sendReleaseBundle(ch,{approvalB64,signatureB64,manifestBytes,paths:paths.map(x=>join(source,x))}),
   receiveReleaseBundle(ch,{command:cmd,publicKey,stageRoot,now})
  ]);
  const receipt=verifyHostEnvelope(cmd,JSON.stringify({approvalB64,signatureB64}),publicKey,now);
  const events=[];
  let running=false,registered=false;
  let loaded={};
  let threat=null;
  const compose=()=>({project:'sabora',releaseSha:sha,
   services:[...SABORA_RELEASE_SCOPE.services],
   publicTcpPorts:['146.59.145.64:8443'],
   loopbackTcpPorts:[],
   externalNetworks:['sabora_ingress_filtered','sabora_egress_filtered'],
   internalNetwork:'sabora_sabora_runtime_internal',
   unsafeOptionsPresent:false,unknownServicesPresent:false,healthchecksEnabled:true});
  const driver={
   getEvidence:async()=>threat==='evidence'?{...docs,externalRestoreSha256:Buffer.from('{}')}:docs,
   inspectIsolation:async()=>{const w=witness(running);
    if(threat==='egress')w.egress.wildcardDenied=false;
    if(threat==='overlap')w.networks.egress.cidr='172.28.240.0/23';
    if(threat==='network')w.routingCollisionTested=false;
    return w;},
   inspectScopedCompose:async()=>{const c=compose();if(threat==='port')c.publicTcpPorts=['0.0.0.0:443'];return c;},
   inspectImages:async()=>loaded,
   loadImage:async input=>{events.push('load:'+input.type);loaded={...loaded,[input.type]:manifest.images[input.type].imageId};},
   deployServices:async input=>{assert.deepEqual(input.services,['sabora-egress','api','web']);
    assert.equal(input.noDependencies,true);assert.equal(input.noBuild,true);
    assert.equal(input.noPull,true);events.push('up:sabora-only');running=true;},
   readiness:async()=>({apiReady:true,clientHttps:true,managementHttps:true,alertReception:true}),
   readHistory:async()=>({activeReleaseSha:null}),
   observeRuntime:async()=>{throw Error('rollback_not_invoked');},
   registerAuthorization:async()=>{if(registered)throw Error('authorization_replay');registered=true;events.push('consumed');},
   commitResult:async input=>{events.push('record');return {durablyRecorded:true,
    releaseSha:input.releaseSha,operation:input.operation};},
   getRetainedBundle:async()=>{throw Error('rollback_not_invoked');}
  };
  for(const reason of ['evidence','egress','port','overlap','network']){
   threat=reason;
   await assert.rejects(executeScopedSaboraRelease({
    operation:'deploy',receipt,stage,stageRoot,driver,now}),/sabora_/);
   assert.deepEqual(events,[]);
  }
  threat=null;
  const success=await executeScopedSaboraRelease({
   operation:'deploy',receipt,stage,stageRoot,driver,now});
  assert.equal(success.status,'lab-executor-complete');
  assert.equal(success.operation,'deploy');
  assert.deepEqual(events,['consumed','load:api','load:web','up:sabora-only','record']);
  await assert.rejects(executeScopedSaboraRelease({
   operation:'deploy',receipt,stage,stageRoot,driver,now}),/authorization_replay/);
  assert.deepEqual(events,['consumed','load:api','load:web','up:sabora-only','record']);
 }finally{rmSync(root,{recursive:true,force:true});}
});
