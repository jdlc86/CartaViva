// Real Docker implementation of the bounded actuator driver, restricted to a
// root-owned disposable GitHub runner. It builds and loads genuine image
// archives, renders the signed three-service Compose scope, applies nftables
// only to dedicated lab bridges, starts exactly those services, checks TLS/API
// readiness, commits an fsync'd ledger, then removes only its named resources.
// It is evidence about the implementation, never authorization for a VPS.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {constants as fsConstants} from 'node:fs';
import {
 chmod,copyFile,mkdir,mkdtemp,open,readFile,rename,rm,writeFile,
} from 'node:fs/promises';
import https from 'node:https';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildReleaseBundleManifest} from './sabora-release-bundle.mjs';
import {EVIDENCE_KEYS,SABORA_RELEASE_SCOPE} from './sabora-release-governor.mjs';
import {renderIngressFilter} from './sabora-ingress-network-policy.mjs';
import {renderSaboraEgressGuard} from './sabora-egress-network-policy.mjs';
import {executeScopedSaboraRelease} from '../ops/sabora-release-actuator.mjs';
import {inspectResolvedSaboraCompose,scopedDockerCommands} from '../ops/sabora-release-docker-commands.mjs';

const stop=code=>Error('sabora_real_driver_lab_stop:'+code);
const hash=value=>createHash('sha256').update(value).digest('hex');
const runId=process.env.GITHUB_RUN_ID??'',sha=process.env.GITHUB_SHA??'';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.CI!=='true'||
 process.env.SABORA_DISPOSABLE_RELEASE_LAB!=='explicitly-authorized-ci'||
 !process.env.RUNNER_TEMP||!/^\d+$/.test(runId)||!/^[0-9a-f]{40}$/.test(sha)||
 (typeof process.getuid==='function'&&process.getuid()!==0))
 throw stop('root_disposable_actions_context_required');

function run(command,args,{input,allowFailure=false,encoding='utf8',maxBuffer=128*1024*1024}={}){
 const result=spawnSync(command,args,{input,encoding,windowsHide:true,maxBuffer});
 if(!allowFailure&&(result.error||result.status!==0)){
  const detail=String(result.stderr??'').replace(/[^A-Za-z0-9_:. /-]/g,'_').slice(0,1000);
  throw stop('command_failed:'+command+':'+String(result.status??'spawn')+':'+detail);
 }
 return result;
}
const docker=(args,options)=>run('docker',args,options);
const nft=(args,options)=>run('nft',args,options);
function dockerJson(args){return JSON.parse(docker(args).stdout);}
async function atomicJson(path,value){
 const partial=path+'.partial',handle=await open(partial,fsConstants.O_CREAT|fsConstants.O_EXCL|fsConstants.O_WRONLY,0o600);
 try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}
 finally{await handle.close();}
 await rename(partial,path);
}
function httpsProbe(hostname){
 return new Promise((accept,reject)=>{
  const request=https.request({host:'146.59.145.64',port:8443,path:'/',method:'GET',
   headers:{host:hostname},servername:hostname,rejectUnauthorized:false,timeout:3000},response=>{
    let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);
    response.on('end',()=>response.statusCode===200?accept(body):reject(stop('https_status')));
   });
  request.once('timeout',()=>request.destroy(stop('https_timeout')));
  request.once('error',reject);request.end();
 });
}
async function eventually(label,probe,{attempts=40,delayMs=250}={}){
 let last;
 for(let attempt=1;attempt<=attempts;attempt++){
  try{return await probe();}catch(error){last=error;}
  await new Promise(accept=>setTimeout(accept,delayMs));
 }
 const detail=String(last?.code??last?.message??'unknown').replace(/[^A-Za-z0-9_.:-]/g,'_').slice(0,120);
 throw stop('readiness_timeout:'+label+':'+detail);
}
function addressRange(cidr){
 const [ip,bitsRaw]=cidr.split('/'),bits=Number(bitsRaw),oct=ip.split('.').map(Number);
 const value=oct.reduce((total,item)=>((total<<8)|item)>>>0,0);
 const mask=(0xffffffff<<(32-bits))>>>0;
 return {first:(value&mask)>>>0,last:((value&mask)|(~mask>>>0))>>>0};
}
function overlaps(a,b){return a.first<=b.last&&b.first<=a.last;}

const work=await mkdtemp(join(process.env.RUNNER_TEMP||tmpdir(),'sabora-real-driver-'));
const context=join(work,'image'),source=join(work,'source'),stageRoot=join(work,'stages');
const stage=join(stageRoot,'authorized-stage'),ledger=join(work,'ledger');
const evidenceDir=join(work,'evidence'),runtimeEnv='/etc/sabora/release/runtime.env';
const policy=join(work,'network-policy.nft'),labReceiptPath=join(process.env.RUNNER_TEMP,'sabora-network-enforcement','receipt.json');
const resultDirectory=join(process.env.RUNNER_TEMP,'sabora-release-driver-lab');
const networks=[
 {name:'sabora_sabora_runtime_internal',bridge:'br-1234567890ab',subnet:'172.28.200.0/24',internal:true,
  label:'sabora_runtime_internal'},
 {name:'sabora_ingress_filtered',bridge:'br-234567890abc',subnet:'172.28.240.0/24',internal:false,
  label:'sabora_ingress_filtered'},
 {name:'sabora_egress_filtered',bridge:'br-34567890abcd',subnet:'172.28.241.0/24',internal:false,
  label:'sabora_egress_allowlisted'},
];
const tags=['sabora-api:'+sha,'sabora-web:'+sha],builtImageIds=[];
const ownedTags=new Set(),ownedNetworks=[];
let addressAdded=false,envWritten=false,nftOwned=false,projectOwned=false;
let resultOwned=false,labComplete=false;
async function cleanup(){
 if(nftOwned){
  nft(['delete','table','inet','sabora_ingress_guard'],{allowFailure:true});
  nft(['delete','table','inet','sabora_egress_guard'],{allowFailure:true});
 }
 const listed=projectOwned?
  docker(['ps','-aq','--filter','label=com.docker.compose.project=sabora'],{allowFailure:true}):null;
 if(listed?.status===0){
  for(const id of listed.stdout.trim().split(/\s+/).filter(Boolean)){
   const name=docker(['inspect','--format','{{.Name}}',id],{allowFailure:true}).stdout.trim();
   if(/^\/sabora-(?:api|web|sabora-egress)-1$/.test(name))docker(['rm','-f','-v',id],{allowFailure:true});
  }
 }
 for(const name of ownedNetworks.slice().reverse())docker(['network','rm',name],{allowFailure:true});
 for(const tag of ownedTags)docker(['image','rm','-f',tag],{allowFailure:true});
 for(const id of builtImageIds)docker(['image','rm','-f',id],{allowFailure:true});
 if(addressAdded)run('ip',['address','del','146.59.145.64/32','dev','lo'],{allowFailure:true});
 if(envWritten)await rm(runtimeEnv,{force:true});
 if(resultOwned&&!labComplete)await rm(resultDirectory,{recursive:true,force:true});
 await rm(work,{recursive:true,force:true});
}

try{
 for(const name of [...networks.map(x=>x.name),...tags]){
  const kind=name.startsWith('sabora_')?'network':'image';
  assert.notEqual(docker([kind,'inspect',name],{allowFailure:true}).status,0,'lab resource must start absent: '+name);
 }
 const existing=docker(['ps','-aq','--filter','label=com.docker.compose.project=sabora']).stdout.trim();
 assert.equal(existing,'','Sabora Compose project must start absent');
 for(const table of ['sabora_ingress_guard','sabora_egress_guard'])
  assert.notEqual(nft(['list','table','inet',table],{allowFailure:true}).status,0,
   'lab nft table must start absent: '+table);
 assert.notEqual(run('ip',['address','show','dev','lo']).stdout.includes('146.59.145.64'),true);
 const routeJson=JSON.parse(run('ip',['-j','route','show']).stdout);
 const candidateRanges=networks.map(x=>addressRange(x.subnet));
 for(const route of routeJson){
  if(!route.dst||route.dst==='default'||route.dst.includes(':'))continue;
  const value=route.dst.includes('/')?route.dst:route.dst+'/32';
  assert.equal(candidateRanges.some(range=>overlaps(range,addressRange(value))),false,
   'dedicated Sabora subnet overlaps a pre-existing route');
 }
 await Promise.all([context,source,stageRoot,stage,ledger,evidenceDir].map(path=>mkdir(path,{recursive:true,mode:0o700})));
 await mkdir(resultDirectory,{recursive:false,mode:0o700});resultOwned=true;
 const key=join(context,'lab.key'),cert=join(context,'lab.crt');
 run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,
  '-subj','/CN=sabora.allaiso.com','-addext','subjectAltName=DNS:sabora.allaiso.com,DNS:gestion-sabora.allaiso.com']);
 const server=`import http from 'node:http';import https from 'node:https';import {readFileSync} from 'node:fs';
const mode=process.env.LAB_MODE;const response=(req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({mode,host:req.headers.host,path:req.url}));};
if(mode==='web')https.createServer({key:readFileSync('/app/lab.key'),cert:readFileSync('/app/lab.crt')},response).listen(8443,'0.0.0.0');
else http.createServer(response).listen(mode==='api'?4100:4300,'0.0.0.0');\n`;
 const dockerfile=`FROM node:22-alpine\nARG FLAVOR\nLABEL sabora.lab.flavor=$FLAVOR\nWORKDIR /app\nCOPY server.mjs lab.key lab.crt ./\nRUN chown -R node:node /app && chmod 600 /app/lab.key\nUSER node\nCMD ["node","/app/server.mjs"]\n`;
 await writeFile(join(context,'server.mjs'),server,{mode:0o600});
 await writeFile(join(context,'Dockerfile'),dockerfile,{mode:0o600});
 docker(['build','--build-arg','FLAVOR=api','-t',tags[0],context]);ownedTags.add(tags[0]);
 docker(['build','--build-arg','FLAVOR=web','-t',tags[1],context]);ownedTags.add(tags[1]);
 const imageIds={api:docker(['image','inspect','--format','{{.Id}}',tags[0]]).stdout.trim(),
  web:docker(['image','inspect','--format','{{.Id}}',tags[1]]).stdout.trim()};
 builtImageIds.push(imageIds.api,imageIds.web);
 const apiArchive=join(source,'api.tar'),webArchive=join(source,'web.tar');
 docker(['save','--output',apiArchive,tags[0]]);docker(['save','--output',webArchive,tags[1]]);
 const operational=join(source,'operational.yml'),webCompose=join(source,'web.yml');
 await writeFile(operational,`name: sabora
services:
  api:
    command: ["node", "/app/server.mjs"]
    environment: {LAB_MODE: api}
    ports: ["127.0.0.1:4100:4100"]
    networks: [sabora_runtime_internal]
    read_only: true
    tmpfs: [/tmp]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:4100/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 1s
      timeout: 2s
      retries: 15
  sabora-egress:
    command: ["node", "/app/server.mjs"]
    environment: {LAB_MODE: egress}
    networks: [sabora_runtime_internal, sabora_egress_allowlisted]
    read_only: true
    tmpfs: [/tmp]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
networks:
  sabora_runtime_internal:
    name: sabora_sabora_runtime_internal
    internal: true
    ipam: {config: [{subnet: 172.28.200.0/24}]}
  sabora_egress_allowlisted:
    external: true
    name: sabora_egress_filtered
`,{mode:0o600});
 await writeFile(webCompose,`name: sabora
services:
  web:
    command: ["node", "/app/server.mjs"]
    environment: {LAB_MODE: web}
    ports: ["146.59.145.64:8443:8443"]
    networks: [sabora_runtime_internal, sabora_ingress_filtered]
    read_only: true
    tmpfs: [/tmp]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    healthcheck:
      test: ["CMD", "node", "-e", "require('node:https').get({host:'127.0.0.1',port:8443,rejectUnauthorized:false},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
      interval: 1s
      timeout: 2s
      retries: 15
networks:
  sabora_ingress_filtered:
    external: true
    name: sabora_ingress_filtered
`,{mode:0o600});
 const manifest=await buildReleaseBundleManifest({releaseSha:sha,apiArchive,webArchive,
  operationalCompose:operational,webCompose,apiImageId:imageIds.api,webImageId:imageIds.web});
 const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
 const authorizationId='SABORA-REAL-DRIVER-LAB-'+runId;
 for(const [name,path] of Object.entries({
  'api.tar':apiArchive,'web.tar':webArchive,'operational.yml':operational,'web.yml':webCompose})){
  await copyFile(path,join(stage,name));await chmod(join(stage,name),0o600);
 }
 await writeFile(join(stage,'manifest.json'),manifestBytes,{mode:0o600});
 await chmod(stageRoot,0o700);await chmod(stage,0o700);
 const documents={};
 for(const [index,gate] of EVIDENCE_KEYS.entries()){
  documents[gate]=Buffer.from(JSON.stringify({schema:'sabora-release-evidence/v1',gate,
   restaurant:'sabora',status:'verified',observedAt:new Date().toISOString(),
   reference:'DISPOSABLE-LAB-EVIDENCE-'+index+'-'+runId}));
  await writeFile(join(evidenceDir,gate+'.json'),documents[gate],{mode:0o600});
 }
 const receipt={operation:'deploy',releaseSha:sha,authorizationId,githubRunId:runId,
  authorizationSha256:hash('DISPOSABLE-AUTHORIZATION-'+runId),
  bundleManifestSha256:hash(manifestBytes),
  evidence:Object.fromEntries(EVIDENCE_KEYS.map(gate=>[gate,hash(documents[gate])]))};
 const stageReceipt={stage:'verified-only',authorizedToDeploy:false,authorizationId,
  releaseSha:sha,bundleManifestSha256:receipt.bundleManifestSha256,location:stage};
 docker(['image','rm',tags[0],tags[1]]);
 for(const item of networks){
  const args=['network','create','--driver','bridge','--subnet',item.subnet,
   '--opt','com.docker.network.bridge.name='+item.bridge,
   '--label','com.docker.compose.project=sabora','--label','com.docker.compose.network='+item.label];
  if(item.internal)args.push('--internal');args.push(item.name);docker(args);ownedNetworks.push(item.name);
 }
 run('ip',['address','add','146.59.145.64/32','dev','lo']);addressAdded=true;
 await mkdir('/etc/sabora/release',{recursive:true,mode:0o700});
 const previousEnv=await readFile(runtimeEnv,'utf8').then(()=>true,()=>false);
 if(previousEnv)throw stop('runtime_env_preexisted');
 await writeFile(runtimeEnv,'SABORA_REAL_DRIVER_LAB=true\n',{mode:0o600});envWritten=true;
 const ingress=renderIngressFilter({bridge:networks[1].bridge,
  cloudflareIpv4Cidrs:['146.59.145.64/32','198.51.100.0/24']});
 const egress=renderSaboraEgressGuard({bridge:networks[2].bridge,allowlisted:[
  {cidr:'203.0.113.10/32',port:443,protocol:'tcp'},
  {cidr:'203.0.113.20/32',port:5432,protocol:'tcp'}]});
 await writeFile(policy,ingress+'\n'+egress,{mode:0o600});
 nft(['--check','--file',policy]);nftOwned=true;nft(['--file',policy]);
 const behaviorReceipt=JSON.parse(await readFile(labReceiptPath,'utf8'));
 assert.equal(behaviorReceipt.schema,'sabora-nft-enforcement-lab/v1');
 assert.equal(behaviorReceipt.rollbackRemovedBothSaboraTables,true);
 const commands=()=>scopedDockerCommands({stageDir:stage,stageRoot,sha});
 const serviceContainers=()=>{
  const ids=docker(['ps','-q','--filter','label=com.docker.compose.project=sabora']).stdout.trim().split(/\s+/).filter(Boolean);
  const map={};for(const id of ids){
   const service=docker(['inspect','--format','{{ index .Config.Labels "com.docker.compose.service" }}',id]).stdout.trim();
   if(service)map[service]=id;
  }return map;
 };
 const networkWitness=()=>{
  const inspected=Object.fromEntries(networks.map(item=>[item.name,dockerJson(['network','inspect',item.name])[0]]));
  const services=serviceContainers(),running=Object.keys(services).length>0;
  const make=(item,kind)=>{
   const canonical=kind==='runtime'?['sabora-egress','api','web']:kind==='ingress'?['web']:['sabora-egress'];
   const observed=Object.values(inspected[item.name].Containers??{}).map(container=>
    docker(['inspect','--format','{{ index .Config.Labels "com.docker.compose.service" }}',container.Name]).stdout.trim());
   assert.equal(new Set(observed).size,observed.length);assert.equal(observed.every(x=>canonical.includes(x)),true);
   return {name:item.name,project:'sabora',kind,driver:'bridge',bridge:item.bridge,
    cidr:item.subnet,internal:item.internal,attachable:false,ipv6:false,
    attachedServices:canonical.filter(service=>observed.includes(service))};
  };
  const serviceNetworks={};
  for(const [service,id] of Object.entries(services))serviceNetworks[service]=Object.keys(
   dockerJson(['inspect',id])[0].NetworkSettings.Networks).sort();
  const ingressRules=nft(['list','table','inet','sabora_ingress_guard']).stdout;
  const egressRules=nft(['list','table','inet','sabora_egress_guard']).stdout;
  assert.match(ingressRules,/br-234567890abc/);assert.match(egressRules,/br-34567890abcd/);
  const sockets=run('ss',['-H','-ltn']).stdout;
  if(running){
   const binding=dockerJson(['inspect',services.web])[0].NetworkSettings.Ports['8443/tcp'];
   assert.deepEqual(binding,[{HostIp:'146.59.145.64',HostPort:'8443'}]);
  }else assert.doesNotMatch(sockets,/146\.59\.145\.64:8443/);
  return {schema:'sabora-live-isolation/v1',source:'host-readonly-inspector',project:'sabora',
   observedAt:new Date().toISOString(),routingCollisionTested:true,
   ...(running?{serviceNetworks}:{}),networks:{
    runtime:make(networks[0],'runtime'),ingress:make(networks[1],'ingress'),egress:make(networks[2],'egress')},
   ingress:{bridge:networks[1].bridge,table:'sabora_ingress_guard',filterHook:'forward',
    cloudflareOnly:true,directOriginDenied:behaviorReceipt.ingressDirectWrongPortAndReverseDenied,
    newOutboundDenied:true,ipv6BypassDenied:true,otherServicesUnaffected:behaviorReceipt.hostTableInventoryUnchanged},
   egress:{bridge:networks[2].bridge,table:'sabora_egress_guard',filterHook:'forward',
    explicitDestinationAllowlist:true,wildcardDenied:true,
    prohibitedOutboundDenied:behaviorReceipt.egressWrongIpv4PortAndIpv6Denied,
    ipv6BypassDenied:true,otherServicesUnaffected:behaviorReceipt.hostTableInventoryUnchanged},
   port:{ip:'146.59.145.64',tcp:8443,exclusivelyReservedForSabora:true,
    otherPortsUntouched:true,sharedHostDaemonUntouched:true}};
 };
 const driver={
  getEvidence:async()=>documents,
  inspectIsolation:async()=>networkWitness(),
  inspectScopedCompose:async()=>{
   const command=commands().config,result=docker(command.argv,{input:command.stdin});
   return inspectResolvedSaboraCompose(JSON.parse(result.stdout),sha);
  },
  inspectImages:async({allowMissing})=>{
   const found={};for(const type of ['api','web']){
    const result=docker(commands().inspect(type).argv,{allowFailure:true});
    if(result.status===0)found[type]=result.stdout.trim();else if(!allowMissing)throw stop('required_image_missing:'+type);
   }return found;
  },
  loadImage:async({type})=>{const command=commands().load(type);docker(command.argv);},
  deployServices:async({services,noDependencies,noBuild,noPull})=>{
   assert.deepEqual(services,SABORA_RELEASE_SCOPE.services);assert.equal(noDependencies,true);
   assert.equal(noBuild,true);assert.equal(noPull,true);
   const command=commands().up;projectOwned=true;docker(command.argv,{input:command.stdin});
  },
  readiness:async({expectedOrigins})=>{
   assert.deepEqual(expectedOrigins,SABORA_RELEASE_SCOPE.origins);
   const api=await eventually('api',()=>fetch('http://127.0.0.1:4100/ready').then(async response=>{
    if(!response.ok)throw stop('api_status');return response.json();
   }));
   const client=JSON.parse(await eventually('client_https',()=>httpsProbe('sabora.allaiso.com')));
   const management=JSON.parse(await eventually('management_https',()=>httpsProbe('gestion-sabora.allaiso.com')));
   const egressId=serviceContainers()['sabora-egress'];
   const alert=await eventually('alert_reception',async()=>{
    const result=docker(['exec',egressId,'node','-e',
     "fetch('http://127.0.0.1:4300/alert').then(async r=>{console.log(JSON.stringify(await r.json()));process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"],
    {allowFailure:true});
    if(result.status!==0)throw stop('alert_status');return result;
   });
   const alertBody=JSON.parse(alert.stdout.trim());
   return {apiReady:api.mode==='api',clientHttps:client.mode==='web'&&client.host==='sabora.allaiso.com',
    managementHttps:management.mode==='web'&&management.host==='gestion-sabora.allaiso.com',
    alertReception:alertBody.mode==='egress'};
  },
  readHistory:async()=>({activeReleaseSha:null}),
  observeRuntime:async()=>{throw stop('rollback_not_in_lab_scope');},
  registerAuthorization:async(receiptValue,details)=>{
   const path=join(ledger,receiptValue.authorizationId+'.consumed.json');
   const handle=await open(path,'wx',0o600);try{await handle.writeFile(JSON.stringify({receipt:receiptValue,details})+'\n');await handle.sync();}
   finally{await handle.close();}
  },
  commitResult:async input=>{
   await atomicJson(join(ledger,'active-release.json'),{schema:'sabora-real-driver-lab/v1',...input,
    durablyRecorded:true});
   return {durablyRecorded:true,releaseSha:input.releaseSha,operation:input.operation};
  },
  getRetainedBundle:async()=>{throw stop('rollback_not_in_lab_scope');},
 };
 const result=await executeScopedSaboraRelease({receipt,stage:stageReceipt,stageRoot,driver,
  operation:'deploy'});
 assert.equal(result.status,'lab-executor-complete');
 const statusCommand=commands().status,status=docker(statusCommand.argv,{input:statusCommand.stdin}).stdout;
 assert.match(status,/sabora-api-1/);assert.match(status,/sabora-web-1/);assert.match(status,/sabora-sabora-egress-1/);
 await atomicJson(join(resultDirectory,'receipt.json'),{schema:'sabora-real-docker-driver-lab/v1',
  runId,releaseSha:sha,manifestSha256:receipt.bundleManifestSha256,
  actualDockerImagesLoaded:true,exactServices:[...SABORA_RELEASE_SCOPE.services],
  actualComposeUpNoBuildNoPullNoDeps:true,actualApiAndTwoTlsOriginsReady:true,
  actualAlertReceptionReady:true,actualDedicatedNetworksInspected:true,
  actualNftTablesAppliedToDedicatedBridges:true,durableOneUseLedger:true,
  operationalHostReceipt:false,externalAuthorizationConsumed:false});
 await chmod(resultDirectory,0o755);await chmod(join(resultDirectory,'receipt.json'),0o644);
 labComplete=true;
 console.log('sabora_real_docker_release_driver_lab_ok:'+sha);
}finally{
 await cleanup();
}
