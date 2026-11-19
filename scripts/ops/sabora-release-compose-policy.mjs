// Closed comparison of resolved Compose. Unknown properties fail rather than
// extending the root driver's authority. Source YAML hashes are also approved.
import {SABORA_RELEASE_SCOPE,stableStringify} from '../ci/sabora-release-governor.mjs';
import {releaseStop as stop,exactKeys} from './sabora-release-protected-store.mjs';
const same=(a,b)=>stableStringify(a)===stableStringify(b);
const API_HEALTH=['CMD','node','-e',"fetch('http://127.0.0.1:4100/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"];
const WEB_HEALTH=['CMD','caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'];
export const RELEASE_MOUNTS=Object.freeze({
 manifest:'/etc/sabora/runtime/activation.json',secrets:'/etc/sabora/runtime/secrets',
 egress:'/etc/sabora/runtime/egress-policy.json',tls:'/srv/sabora/tls'
});
export function immutableComposeOverride(manifest){
 let overlay='name: sabora\nservices:\n';
 for(const name of SABORA_RELEASE_SCOPE.services){
  const image=manifest.images[name==='web'?'web':'api'];
  if(!/^sha256:[0-9a-f]{64}$/.test(image.imageId)||!/^([0-9a-f]{40})$/.test(manifest.releaseSha))stop('compose_image_identity');
  overlay+='  '+name+':\n    image: '+image.imageId+'\n    build: !reset null\n    labels:\n'+
   '      io.sabora.release-sha: "'+manifest.releaseSha+'"\n      io.sabora.managed-by: release-controller-v1\n';
  if(name==='web')overlay+='    tmpfs: !override [/tmp, /data, /config]\n';
 }
 // Compose >=2.24.4. Never create the internal bridge as a release side effect.
 return overlay+'networks:\n  sabora_runtime_internal: !override\n'+
  '    name: sabora_sabora_runtime_internal\n    external: true\n';
}
export function validateClosedCompose(config,manifest,{mounts=RELEASE_MOUNTS,restaurantCode}={}){
 // Compose v2/v5 serialize absent defaults differently. Normalize only these
 // exact inert representations; never discard unknown security properties.
 config=structuredClone(config);
 for(const s of Object.values(config?.services??{})){
  if(s.entrypoint===null)delete s.entrypoint;
  if(s.command===null)delete s.command;
  if(typeof s.mem_limit==='string'&&/^[0-9]+$/.test(s.mem_limit))s.mem_limit=Number(s.mem_limit);
  for(const volume of s.volumes??[]){
   if(volume.bind===undefined||same(volume.bind,{})||same(volume.bind,{create_host_path:false}))volume.bind={create_host_path:true};
  }
 }
 for(const n of Object.values(config?.networks??{}))if(same(n.ipam,{}))delete n.ipam;
 if(!exactKeys(config,['name','services','networks'])||config.name!=='sabora'||
  !exactKeys(config.services,['api','sabora-egress','web']))stop('compose_top_level');
 const shared=['command','restart','stop_signal','stop_grace_period','environment','networks',
  'volumes','read_only','tmpfs','security_opt','mem_limit','cpus','pids_limit','cap_drop','init','logging','image','labels'];
 const nets={api:['sabora_runtime_internal'],'sabora-egress':['sabora_runtime_internal','sabora_egress_allowlisted'],
  web:['sabora_runtime_internal','sabora_ingress_filtered']};
 const envs={api:{NODE_ENV:'production',SABORA_OPERATIONAL_MANIFEST_FILE:'/run/sabora/activation.json',
  SABORA_OPERATIONAL_SECRETS_DIR:'/run/secrets/sabora',SABORA_OPERATIONAL_EGRESS_POLICY_FILE:'/run/sabora/egress-policy.json'},
  'sabora-egress':{NODE_ENV:'production',SABORA_EGRESS_POLICY_FILE:'/run/sabora/egress-policy.json'},
  web:{SABORA_INGRESS_BIND_IP:SABORA_RELEASE_SCOPE.host,SABORA_CLIENT_HOST:'sabora.allaiso.com',
   SABORA_MANAGEMENT_HOST:'gestion-sabora.allaiso.com',XDG_CONFIG_HOME:'/tmp/caddy-config',XDG_DATA_HOME:'/tmp/caddy-data'}};
 const volumes={api:[[mounts.manifest,'/run/sabora/activation.json'],[mounts.secrets,'/run/secrets/sabora'],[mounts.egress,'/run/sabora/egress-policy.json']],
  'sabora-egress':[[mounts.egress,'/run/sabora/egress-policy.json']],web:[[mounts.tls,'/run/sabora/tls']]};
 const resources={api:[536870912,1,150],'sabora-egress':[134217728,0.5,75],web:[268435456,0.5,100]};
 for(const name of SABORA_RELEASE_SCOPE.services){
  const s=config.services[name],web=name==='web',api=name==='api';
  const allowed=[...shared,...(web?['ports','user']:[]),...(web||api?['healthcheck']:[])];
  if(!s||Object.keys(s).some(k=>!allowed.includes(k)))stop('compose_unknown_service_property');
  if(s.image!==manifest.images[web?'web':'api'].imageId||s.read_only!==true||s.init!==true||s.restart!=='no'||
   s.stop_signal!=='SIGTERM'||s.stop_grace_period!=='20s'||!same(s.cap_drop,['ALL'])||
   !same(s.security_opt,['no-new-privileges:true'])||!same(s.tmpfs,web?['/tmp','/data','/config']:['/tmp'])||
   !same(s.environment,envs[name])||
   !same(s.labels,{'io.sabora.release-sha':manifest.releaseSha,'io.sabora.managed-by':'release-controller-v1'})||
   !same([s.mem_limit,Number(s.cpus),s.pids_limit],resources[name])||
   !same(s.logging,{driver:'json-file',options:{'max-size':'10m','max-file':'3'}}))stop('compose_service_policy');
  if(!exactKeys(s.networks,nets[name])||Object.values(s.networks).some(v=>v!==null&&(!exactKeys(v,['aliases'])||v.aliases.length)))
   stop('compose_network_options');
  if(!Array.isArray(s.volumes)||s.volumes.length!==volumes[name].length||s.volumes.some((v,i)=>
   !same(v,{type:'bind',source:volumes[name][i][0],target:volumes[name][i][1],read_only:true,bind:{create_host_path:true}})))
   stop('compose_mount_policy');
  const expectedCommand=api?['node','src/operational-server.mjs']:['node','src/sabora-egress-gateway.mjs'];
  if(web?(s.command!==undefined||s.user!=='10001:10001'):!same(s.command,expectedCommand))stop('compose_execution_policy');
  if(api||web){
   if(!same(s.healthcheck,{test:web?WEB_HEALTH:API_HEALTH,interval:'30s',timeout:'5s',retries:3,start_period:web?'15s':'20s'}))
    stop('compose_healthcheck_policy');
  }
  if(web&&(!Array.isArray(s.ports)||s.ports.length!==1||
   !same(s.ports[0],{mode:'ingress',host_ip:SABORA_RELEASE_SCOPE.host,target:8443,published:'8443',protocol:'tcp'})))
   stop('compose_publication_policy');
 }
 const expectedNetworks={sabora_runtime_internal:{name:'sabora_sabora_runtime_internal',external:true},
  sabora_ingress_filtered:{name:'sabora_ingress_filtered',external:true},
  sabora_egress_allowlisted:{name:'sabora_egress_filtered',external:true}};
 if(!same(config.networks,expectedNetworks))stop('compose_network_definitions');
 return {project:'sabora',releaseSha:manifest.releaseSha,services:[...SABORA_RELEASE_SCOPE.services],
  publicTcpPorts:[SABORA_RELEASE_SCOPE.host+':8443'],loopbackTcpPorts:[],
  externalNetworks:['sabora_ingress_filtered','sabora_egress_filtered'],internalNetwork:'sabora_sabora_runtime_internal',
  unsafeOptionsPresent:false,unknownServicesPresent:false,healthchecksEnabled:true};
}
