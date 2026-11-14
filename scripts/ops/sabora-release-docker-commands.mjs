// Sabora-exclusive Docker Compose commands. Not installed on VPS.
// This file has no general command interface: all invocations use exact
// image names, three nominated services, project sabora and two signed files.
import {SABORA_RELEASE_SCOPE} from '../ci/sabora-release-governor.mjs';
import {resolve,sep} from 'node:path';
const SHA=/^[0-9a-f]{40}$/;
function stop(code){throw Error('sabora_docker_command_stop:'+code);}
const exact=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const rel=(base,p)=>p.startsWith(base+sep)&&p.split(sep).length===base.split(sep).length+1;
export function saboraImageOverride(sha){
 if(!SHA.test(sha))stop('invalid_release_sha');
 return 'name: sabora\nservices:\n'+
 '  api:\n    image: sabora-api:'+sha+'\n'+
 '  sabora-egress:\n    image: sabora-api:'+sha+'\n'+
 '  web:\n    image: sabora-web:'+sha+'\n';
}
export function scopedDockerCommands({stageDir,stageRoot,sha,
 envFile='/etc/sabora/release/runtime.env'}){
 if(!SHA.test(sha)||typeof stageDir!=='string'||typeof stageRoot!=='string'||
   !rel(resolve(stageRoot),resolve(stageDir))||
   envFile!=='/etc/sabora/release/runtime.env')stop('unapproved_filesystem_scope');
 const file=(name)=>resolve(stageDir,name);
 const files=['--project-name','sabora','--env-file',envFile,
  '--file',file('operational.yml'),'--file',file('web.yml'),'--file','-'];
 const override=saboraImageOverride(sha);
 const services=[...SABORA_RELEASE_SCOPE.services];
 const config=Object.freeze({argv:['compose',...files,'config','--format','json'],stdin:override});
 const up=Object.freeze({argv:['compose',...files,'up','--detach','--no-deps',
   '--no-build','--pull','never','--wait','--wait-timeout','90',...services],stdin:override});
 const inspect=type=>{
  if(!['api','web'].includes(type))stop('invalid_image_type');
  return Object.freeze({argv:['image','inspect','sabora-'+type+':'+sha,
   '--format','{{.Id}}'],stdin:null});
 };
 const load=type=>{
  if(!['api','web'].includes(type))stop('invalid_image_type');
  return Object.freeze({argv:['image','load','--input',file(type+'.tar')],stdin:null});
 };
 const status=Object.freeze({argv:['compose',...files,'ps','--format','json'],stdin:override});
 return Object.freeze({config,up,inspect,load,status,images:{
  api:'sabora-api:'+sha,web:'sabora-web:'+sha}});
}
function servicesOnly(c){
 if(!c||c.name!=='sabora'||!c.services||typeof c.services!=='object'||
  Object.keys(c.services).sort().join('|')!=='api|sabora-egress|web')stop('foreign_compose_services');
 return c.services;
}
const networks=(v)=>Array.isArray(v)?v:Object.keys(v??{});
function port(p,host,target){
 return p&&p.protocol==='tcp'&&Number(p.target)===target&&
  String(p.published)===String(target)&&p.host_ip===host;
}
export function inspectResolvedSaboraCompose(c,sha){
 if(!SHA.test(sha))stop('invalid_sha');
 const services=servicesOnly(c);
 const api=services.api,gate=services['sabora-egress'],web=services.web;
 const specs=[
  [api,['sabora_runtime_internal'],'sabora-api:'+sha],
  [gate,['sabora_runtime_internal','sabora_egress_allowlisted'],'sabora-api:'+sha],
  [web,['sabora_runtime_internal','sabora_ingress_filtered'],'sabora-web:'+sha]
 ];
 for(const [service,allowed,img] of specs){
  if(!service||service.image!==img||service.read_only!==true||
    service.privileged===true||service.network_mode||service.container_name||
    service.devices||service.links||service.depends_on||service.pid||service.ipc||
    !Array.isArray(service.cap_drop)||!service.cap_drop.includes('ALL')||
    networks(service.networks).slice().sort().join('|')!==allowed.slice().sort().join('|'))
   stop('unsafe_compose_service');
 }
 if((api.ports??[]).length!==0||
    !Array.isArray(web.ports)||web.ports.length!==1||
    !port(web.ports[0],'146.59.145.64',8443)||
    (gate.ports??[]).length!==0||
    !api.healthcheck||!web.healthcheck)
  stop('unapproved_publication_ports');
 const nw=c.networks??{};
 if(nw.sabora_runtime_internal?.name!=='sabora_sabora_runtime_internal'||
   nw.sabora_runtime_internal?.internal!==true||
   nw.sabora_ingress_filtered?.name!=='sabora_ingress_filtered'||
   nw.sabora_ingress_filtered?.external!==true||
   nw.sabora_egress_allowlisted?.name!=='sabora_egress_filtered'||
   nw.sabora_egress_allowlisted?.external!==true||
   Object.keys(nw).sort().join('|')!=='sabora_egress_allowlisted|sabora_ingress_filtered|sabora_runtime_internal')
  stop('unapproved_network_attachment');
 return Object.freeze({project:'sabora',releaseSha:sha,
   services:[...SABORA_RELEASE_SCOPE.services],
   publicTcpPorts:['146.59.145.64:8443'],
   loopbackTcpPorts:[],
   externalNetworks:['sabora_ingress_filtered','sabora_egress_filtered'],
   internalNetwork:'sabora_sabora_runtime_internal',
   unsafeOptionsPresent:false,unknownServicesPresent:false,healthchecksEnabled:true});
}
