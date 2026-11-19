// Read-only inspector. Addresses only the nominated Sabora networks, endpoints,
// tables and containers. Allocation-wide facts require an independent signed
// reservation; the release account cannot produce or update that evidence.
import {stableStringify,SABORA_RELEASE_SCOPE} from '../ci/sabora-release-governor.mjs';
import {sha256,releaseStop as stop} from './sabora-release-protected-store.mjs';
const same=(a,b)=>stableStringify(a)===stableStringify(b);
export const NETWORK_NAMES=Object.freeze({runtime:'sabora_sabora_runtime_internal',ingress:'sabora_ingress_filtered',egress:'sabora_egress_filtered'});
const SERVICES={runtime:['sabora-egress','api','web'],ingress:['web'],egress:['sabora-egress']};
// Ignore only kernel-assigned handles and counters; all semantic nft JSON
// fields (rule order, hooks, priorities, matches and verdicts) remain pinned.
export function canonicalNft(value){
 if(Array.isArray(value))return value.filter(v=>!v.metainfo).map(canonicalNft);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
  .filter(([key])=>!['handle','packets','bytes'].includes(key)).map(([key,item])=>[key,canonicalNft(item)]));
 return value;
}
export function inspectLocalIsolation({run,policy,reservation,now=Date.now()}){
 if(!reservation||reservation.schema!=='sabora-allocation-reservation/v1'||reservation.project!=='sabora'||
  reservation.host!==SABORA_RELEASE_SCOPE.host||reservation.networkPolicySha256!==sha256(stableStringify(policy))||
  !same(reservation.networkNames,NETWORK_NAMES)||reservation.port!==8443||
  reservation.scope!=='all-active-and-inactive-allocations-and-routes'||
  !Number.isFinite(Date.parse(reservation.exclusiveUntil))||Date.parse(reservation.exclusiveUntil)<=now||
  Date.parse(reservation.observedAt)>now||!Number.isFinite(Date.parse(reservation.observedAt)))
  stop('allocation_reservation_unavailable');
 const json=(bin,args)=>{try{return JSON.parse(run(bin,args).stdout);}catch{stop('inspector_invalid_response');}};
 const networks={},serviceNetworks={},containerIds={};
 for(const [kind,name] of Object.entries(NETWORK_NAMES)){
  const reply=json('docker',['network','inspect',name]);
  if(!Array.isArray(reply)||reply.length!==1)stop('exclusive_network_missing');
  const net=reply[0],approved=policy.networks[kind];
  if(net.Name!==name||net.Driver!=='bridge'||net.Scope!=='local'||net.EnableIPv6!==false||
   net.Attachable!==false||net.Internal!==(kind==='runtime')||net.Ingress===true||
   net.Labels?.['com.docker.compose.project']!=='sabora'||
   net.Labels?.['io.sabora.managed-by']!=='release-provisioner-v1'||
   net.Id!==reservation.networkIds[kind]||net.Options?.['com.docker.network.bridge.name']!==approved.bridge||
   !same(net.IPAM.Config,[{Subnet:approved.cidr,Gateway:approved.gateway}])||
   net.IPAM.Driver!=='default'||Object.keys(net.Options??{}).some(k=>k!=='com.docker.network.bridge.name'))
   stop('network_identity_or_policy_changed');
  const attached=[];
  for(const [id,endpoint] of Object.entries(net.Containers??{})){
   // Reject an unexpected endpoint by its network metadata, without inspecting
   // the container or data of another project.
   const match=/^sabora-(sabora-egress|api|web)-1$/.exec(endpoint.Name??'');
   if(!match||!SERVICES[kind].includes(match[1]))stop('foreign_network_endpoint');
   const service=match[1];
   if(containerIds[service]&&containerIds[service]!==id)stop('duplicate_service_identity');
   containerIds[service]=id;attached.push(service);
  }
  networks[kind]={name,project:'sabora',kind,driver:net.Driver,bridge:approved.bridge,cidr:approved.cidr,
   internal:net.Internal,attachable:net.Attachable,ipv6:net.EnableIPv6,
   attachedServices:SERVICES[kind].filter(s=>attached.includes(s))};
 }
 for(const [service,id] of Object.entries(containerIds)){
  const info=json('docker',['container','inspect','sabora-'+service+'-1'])[0];
  if(info?.Id!==id||info.Config?.Labels?.['com.docker.compose.project']!=='sabora'||
   info.Config.Labels['com.docker.compose.service']!==service||
   info.Config.Labels['io.sabora.managed-by']!=='release-controller-v1')stop('container_ownership_unproven');
  serviceNetworks[service]=Object.keys(info.NetworkSettings.Networks).sort();
  if(service==='web'){
   if(!same(info.HostConfig.PortBindings,{'8443/tcp':[{HostIp:SABORA_RELEASE_SCOPE.host,HostPort:'8443'}]}))stop('runtime_port_changed');
  }else if(Object.keys(info.HostConfig.PortBindings??{}).length)stop('runtime_api_port_exposed');
 }
 for(const [kind,table] of [['ingress','sabora_ingress_guard'],['egress','sabora_egress_guard']]){
  const actual=json('nft',['--json','list','table','inet',table]);
  const semantic=canonicalNft(actual);
  if(sha256(stableStringify(semantic))!==policy.nftSha256[kind])stop('nft_policy_changed');
  const chains=semantic.nftables.filter(v=>v.chain).map(v=>v.chain);
  if(chains.length!==1||chains[0].hook!=='forward'||chains[0].type!=='filter'||
   chains[0].prio!==(kind==='ingress'?-40:-45)||chains[0].policy!=='accept')stop('nft_hook_mismatch');
  const rules=semantic.nftables.filter(v=>v.rule).map(v=>v.rule);
  if(!rules.length||rules.some(rule=>!Array.isArray(rule.expr)||!rule.expr.some(expr=>
   expr.match?.op==='=='&&['iifname','oifname'].includes(expr.match.left?.meta?.key)&&expr.match.right===policy.networks[kind].bridge)||
   rule.expr.some(expr=>Object.keys(expr).some(key=>!['match','accept','drop','counter'].includes(key)))))
   stop('nft_rule_escapes_exclusive_bridge');
  if(!rules.some(rule=>rule.expr.some(expr=>Object.hasOwn(expr,'drop'))))stop('nft_default_deny_absent');
 }
 // Inspect only routing metadata, never foreign container configuration.
 const routes=json('ip',['-j','-4','route','show']);
 const ownBridges=new Set(Object.values(networks).map(n=>n.bridge));
 const number=ip=>ip.split('.').reduce((n,p)=>n*256+Number(p),0);
 const range=value=>{const [ip,prefix='32']=value.split('/'),bits=Number(prefix),width=2**(32-bits),n=number(ip);return [Math.floor(n/width)*width,Math.floor(n/width)*width+width-1];};
 for(const route of routes){
  if(!route.dst||route.dst==='default'||ownBridges.has(route.dev))continue;
  const [a,b]=range(route.dst);
  if(Object.values(networks).some(n=>{const [x,y]=range(n.cidr);return a<=y&&x<=b;}))stop('route_collision');
 }
 const sockets=run('ss',['-H','-ltn','sport = :8443']).stdout;
 if(!containerIds.web&&sockets.trim())stop('publication_port_occupied');
 if(sockets.trim().split('\n').filter(Boolean).some(line=>line.trim().split(/\s+/)[3]!==SABORA_RELEASE_SCOPE.host+':8443'))stop('publication_listener_scope_changed');
 // Behavior comes from authenticated independent network dossiers, not from
 // presence of table names. Equality above binds those tests to current rules.
 return {schema:'sabora-live-isolation/v1',source:'host-readonly-inspector',project:'sabora',
  observedAt:new Date(now).toISOString(),routingCollisionTested:true,networks,serviceNetworks,
  ingress:{bridge:networks.ingress.bridge,table:'sabora_ingress_guard',filterHook:'forward',
   cloudflareOnly:true,directOriginDenied:true,newOutboundDenied:true,ipv6BypassDenied:true,otherServicesUnaffected:true},
  egress:{bridge:networks.egress.bridge,table:'sabora_egress_guard',filterHook:'forward',
   explicitDestinationAllowlist:true,wildcardDenied:true,prohibitedOutboundDenied:true,ipv6BypassDenied:true,otherServicesUnaffected:true},
  port:{ip:SABORA_RELEASE_SCOPE.host,tcp:8443,exclusivelyReservedForSabora:true,otherPortsUntouched:true,sharedHostDaemonUntouched:true}};
}
