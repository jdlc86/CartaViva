import {existsSync,mkdirSync,writeFileSync,renameSync,readdirSync,lstatSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {CONTROLLER_PATHS as P} from './sabora-release-installation.mjs';
import {releaseProcess} from './sabora-release-process.mjs';
import {protectedBytes,trustedDirectory,sha256,durableExclusive,syncDirectory,releaseStop as stop} from './sabora-release-protected-store.mjs';
import {inspectDockerSaveArchive} from './sabora-release-image-archive.mjs';
import {immutableComposeOverride,validateClosedCompose,RELEASE_MOUNTS} from './sabora-release-compose-policy.mjs';
import {verifyMaterialDossiers} from './sabora-release-evidence.mjs';
import {inspectLocalIsolation} from './sabora-release-local-inspector.mjs';
import {assertLiveSaboraIsolation} from './sabora-release-isolation-gate.mjs';
import {checkReleaseReadiness,verifyTlsMaterial} from './sabora-release-readiness.mjs';
import {EVIDENCE_KEYS,SABORA_RELEASE_SCOPE,stableStringify} from '../ci/sabora-release-governor.mjs';
const same=(a,b)=>stableStringify(a)===stableStringify(b);
const readJson=path=>JSON.parse(protectedBytes(path,{privateFile:true}).toString('utf8'));
function directoryBytes(path){let total=0;for(const entry of readdirSync(path)){
 const file=join(path,entry),st=lstatSync(file);if(st.isSymbolicLink()||st.nlink!==1&&!st.isDirectory())stop('storage_link');
 total+=st.isDirectory()?directoryBytes(file):st.size;
}return total;}
export function checkStorageQuota(config){
 if(directoryBytes(P.staging)+directoryBytes(P.bundles)>config.quotaBytes-1611000000)stop('retention_quota_requires_operator');
}
export function createRealReleaseDriver({installation,ledger,receipt,revalidate,run=releaseProcess}){
 const {config,reservation,environment}=installation;let current,composeArgs,composeView;
 const readEvidence=()=>Object.fromEntries(EVIDENCE_KEYS.map(key=>[key,protectedBytes(join(P.evidence,receipt.evidence[key]+'.json'),{privateFile:true})]));
 const evidence=()=>{const documents=readEvidence();verifyMaterialDossiers({receipt,documents,trust:config.evidenceKeys,
  expected:config.expected,environment,now:Date.now()});return documents;};
 const isolation=()=>{evidence();const witness=inspectLocalIsolation({run,policy:config.networkPolicy,reservation,now:Date.now()});
  if(ledger.readHistory().activeReleaseSha)assertLiveSaboraIsolation(witness,Date.now(),'running');return witness;};
 const json=(args,options)=>{const result=run('docker',args,options);return result.missing?null:JSON.parse(result.stdout);};
 function checkMounts(){
  for(const path of [RELEASE_MOUNTS.secrets,RELEASE_MOUNTS.tls])trustedDirectory(path);
  if(!same(Object.keys(config.mountHashes).sort(),['egress','manifest','secrets'].sort()))stop('mount_hashes_missing');
  for(const name of ['egress','manifest'])if(sha256(protectedBytes(RELEASE_MOUNTS[name]))!==config.mountHashes[name])stop('mount_content_changed');
  const names=readdirSync(RELEASE_MOUNTS.secrets).sort();
  if(!same(names,Object.keys(config.mountHashes.secrets).sort()))stop('secret_inventory_changed');
  for(const name of names){if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(name)||sha256(protectedBytes(join(RELEASE_MOUNTS.secrets,name),{privateFile:true}))!==config.mountHashes.secrets[name])stop('secret_changed');}
  verifyTlsMaterial(config.tls);
 }
 const retained=sha=>{
  if(!/^[0-9a-f]{40}$/.test(sha))stop('retained_sha_invalid');
  const entry=readJson(join(P.state,'retained-'+sha+'.json'));
  if(entry.releaseSha!==sha||!/^([A-Z0-9-]{12,64})$/.test(entry.authorizationId))stop('retention_index_invalid');
  return {...entry,location:join(P.bundles,entry.authorizationId),retainedPreviouslyHealthy:true};
 };
 function inspectRuntime(expectedSha){
  const stored=retained(expectedSha),manifest=readJson(join(stored.location,'manifest.json'));
  if(sha256(protectedBytes(join(stored.location,'manifest.json')))!==stored.bundleManifestSha256)stop('retained_manifest_changed');
  for(const service of SABORA_RELEASE_SCOPE.services){
   const info=json(['container','inspect','sabora-'+service+'-1'])[0];
   if(info.State?.Running!==true||(service!=='sabora-egress'&&info.State?.Health?.Status!=='healthy')||info.Image!==manifest.images[service==='web'?'web':'api'].imageId||
    info.Config?.Labels?.['com.docker.compose.project']!=='sabora'||info.Config.Labels['com.docker.compose.service']!==service||
    info.Config.Labels['io.sabora.release-sha']!==expectedSha||info.Config.Labels['io.sabora.managed-by']!=='release-controller-v1')
    stop('runtime_identity_mismatch');
  }
  return {schema:'sabora-runtime-observation/v1',project:'sabora',releaseSha:expectedSha,
   bundleManifestSha256:stored.bundleManifestSha256,services:[...SABORA_RELEASE_SCOPE.services],port:8443};
 }
 function checkNamedContainers(){
  const active=ledger.readHistory().activeReleaseSha;
  for(const service of SABORA_RELEASE_SCOPE.services){
   // Only minimum ownership metadata until proven to be this controller's.
   const result=run('docker',['container','inspect','--format','{{json .Config.Labels}}','sabora-'+service+'-1'],{allowMissing:true});
   if(result.missing){if(active)stop('active_container_missing');continue;}
   const labels=JSON.parse(result.stdout);
   if(!active||labels['com.docker.compose.project']!=='sabora'||labels['com.docker.compose.service']!==service||
    labels['io.sabora.managed-by']!=='release-controller-v1'||labels['io.sabora.release-sha']!==active)stop('container_name_collision');
  }
  if(active)inspectRuntime(active);
 }
 function validateArchives(bundle){
  for(const [i,type] of ['api','web'].entries()){
   const image=inspectDockerSaveArchive(bundle.paths[i],bundle.manifest.images[type]);
   const cfg=image.configuration;
   if(!cfg||cfg.User!==(type==='api'?'sabora':'10001:10001')||cfg.WorkingDir!==(type==='api'?'/app':'/srv')||
    !same(cfg.Entrypoint,type==='api'?['docker-entrypoint.sh']:['/bin/sh','/usr/local/bin/sabora-web-entrypoint'])||
    !same(cfg.Cmd,type==='api'?['node','src/server.mjs']:['caddy','run','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])||
    !same(Object.keys(cfg.Volumes??{}).sort(),type==='web'?['/config','/data']:[])||cfg.OnBuild?.length||cfg.Healthcheck||cfg.StopSignal&&cfg.StopSignal!=='SIGTERM')
    stop('image_execution_defaults_not_approved');
  }
 }
 const driver={
  getEvidence:async()=>evidence(),verifyEvidence:async()=>{evidence();return EVIDENCE_KEYS.map(gate=>({gate}));},
  inspectIsolation:async()=>isolation(),readHistory:async()=>ledger.assertReconciled(),
  observeRuntime:async()=>inspectRuntime(ledger.readHistory().activeReleaseSha),
  getRetainedBundle:async plan=>retained(plan.targetReleaseSha),
  inspectScopedCompose:async({bundle})=>{
   if(receipt.operation==='deploy'&&existsSync(join(P.state,'retained-'+receipt.releaseSha+'.json')))stop('release_already_retained_use_rollback');
   current=bundle;checkMounts();checkNamedContainers();validateArchives(bundle);
   if(bundle.manifest.compose.operational!==config.compose.operational||bundle.manifest.compose.web!==config.compose.web)
    stop('compose_source_not_installation_approved');
   // Approved source bytes are checked BEFORE compose parses YAML, so include,
   // env_file and extension interpolation cannot read an attacker-selected file.
   for(const [i,key] of [[2,'operational'],[3,'web']])if(sha256(protectedBytes(bundle.paths[i]))!==config.compose[key])stop('compose_source_changed');
   const overlay=join(P.state,'compose-'+receipt.authorizationId+'.yml');
   writeFileSync(overlay,immutableComposeOverride(bundle.manifest),{flag:'wx',mode:0o600});
   composeArgs=['compose','--project-name','sabora','--project-directory',P.root,'--env-file',P.runtimeEnv,
    '-f',bundle.paths[2],'-f',bundle.paths[3],'-f',overlay];
   const resolved=json([...composeArgs,'config','--format','json'],{timeout:30000});
   composeView=validateClosedCompose(resolved,bundle.manifest);return composeView;
  },
  inspectImages:async({bundle,allowMissing})=>Object.fromEntries(['api','web'].map(type=>{
   const result=run('docker',['image','inspect','--format','{{.Id}}',bundle.manifest.images[type].tag],{allowMissing});
   return [type,result.missing?null:result.stdout.trim()];
  })),
  registerAuthorization:async(value,details)=>{
   revalidate();evidence();checkMounts();checkNamedContainers();isolation();validateArchives(current);
   ledger.consume(value,details);
   // Revalidate original signature and freshness after durable consumption too.
   // On failure the ID stays consumed; never start a stale release.
   revalidate();isolation();
  },
  loadImage:async({type,archive})=>{
   revalidate();inspectDockerSaveArchive(archive,current.manifest.images[type]);
   const before=await driver.inspectImages({bundle:current,allowMissing:true});
   if(before[type]&&before[type]!==current.manifest.images[type].imageId)stop('late_tag_collision');
   ledger.phase('image-load-'+type);run('docker',['image','load','--input',archive]);
  },
  deployServices:async()=>{
   revalidate();checkMounts();isolation();
   validateClosedCompose(json([...composeArgs,'config','--format','json']),current.manifest);
   ledger.phase('compose-up');
   run('docker',[...composeArgs,'up','--detach','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','100',...SABORA_RELEASE_SCOPE.services],{timeout:120000});
   for(const service of SABORA_RELEASE_SCOPE.services){
    const info=json(['container','inspect','sabora-'+service+'-1'])[0];
    if(info.Image!==current.manifest.images[service==='web'?'web':'api'].imageId||info.Config.Labels['io.sabora.release-sha']!==receipt.releaseSha)
     stop('started_image_identity');
   }
  },
  readiness:async()=>{ledger.phase('readiness');return checkReleaseReadiness({installation,run,releaseSha:receipt.releaseSha});},
  commitResult:async input=>{
   ledger.phase('retention');
   if(receipt.operation==='deploy'){
    const target=join(P.bundles,receipt.authorizationId);
    for(const file of current.paths){const fd=openSync(file,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
    syncDirectory(current.paths[0].slice(0,-'/api.tar'.length));
    renameSync(current.paths[0].slice(0,-'/api.tar'.length),target);syncDirectory(P.staging);syncDirectory(P.bundles);
    const index=join(P.state,'retained-'+receipt.releaseSha+'.json');
    if(existsSync(index))stop('release_sha_already_retained');
    durableExclusive(index,{releaseSha:receipt.releaseSha,authorizationId:receipt.authorizationId,
     bundleManifestSha256:receipt.bundleManifestSha256,stage:'verified-only',authorizedToDeploy:false});
   }
   inspectRuntime(receipt.releaseSha);return ledger.commit(input);
  }
 };return driver;
}
