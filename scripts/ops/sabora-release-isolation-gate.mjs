// Strict read-only Sabora host isolation witness.
// Every field must come from an independent, trusted on-host inspector;
// nothing from SSH payload/CI is a valid witness. This validator never
// installs networks, changes firewall or inspects unrelated containers.
import {SABORA_RELEASE_SCOPE} from '../ci/sabora-release-governor.mjs';
const RFC=/^br-[0-9a-f]{12}$/;
const CIDR=/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}\/(?:[0-9]|[12][0-9]|3[0-2])$/;
function stop(reason){throw Error('sabora_live_isolation_stop:'+reason);}
const exactly=(a,b)=>Array.isArray(a)&&a.length===b.length&&
 a.every((value,i)=>value===b[i]);
function range(cidr){
 const [host,bits]=cidr.split('/');
 const octets=host.split('.').map(Number),width=Number(bits);
 if(octets.length!==4||octets.some(n=>!Number.isInteger(n)||n<0||n>255)||
   !Number.isInteger(width)||width<1||width>30)stop('unusable_address_space');
 const value=octets.reduce((x,n)=>((x<<8)|n)>>>0,0);
 const mask=(0xffffffff << (32-width))>>>0;
 const first=(value&mask)>>>0,last=(first|(~mask>>>0))>>>0;
 if(value!==first)stop('noncanonical_address_space');
 return {first,last};
}
function overlaps(a,b){return a.first<=b.last&&b.first<=a.last;}

function checkNet(n,name,kind,internal,phase){
 const allowed=kind==='runtime'?['sabora-egress','api','web']:
   kind==='ingress'?['web']:['sabora-egress'];
 const attachments=n?.attachedServices;
 const safe=Array.isArray(attachments)&&new Set(attachments).size===attachments.length&&
   attachments.every(v=>allowed.includes(v))&&
   (phase==='preflight'||exactly(attachments,allowed));
 if(!n||n.name!==name||n.project!=='sabora'||n.kind!==kind||
    n.driver!=='bridge'||n.internal!==internal||
    n.attachable!==false||n.ipv6!==false||
    !RFC.test(n.bridge)||!CIDR.test(n.cidr)||!safe)
   stop('untrusted_'+kind+'_network');
 return n.bridge;
}
export function assertLiveSaboraIsolation(witness,now=Date.now(),phase='running'){
 if(!['preflight','running'].includes(phase))stop('invalid_inspection_phase');
 if(!witness||witness.schema!=='sabora-live-isolation/v1'||
    witness.project!=='sabora'||witness.source!=='host-readonly-inspector'||
    !Number.isFinite(Date.parse(witness.observedAt))||
    Math.abs(now-Date.parse(witness.observedAt))>120000)
   stop('missing_or_stale_host_witness');
 const network=witness.networks;
 if(!network||!network.runtime||!network.ingress||!network.egress)
  stop('missing_networks');
 const bridges=[
  checkNet(network.runtime,'sabora_sabora_runtime_internal','runtime',true,phase),
  checkNet(network.ingress,'sabora_ingress_filtered','ingress',false,phase),
  checkNet(network.egress,'sabora_egress_filtered','egress',false,phase)
 ];
 const ranges=[network.runtime.cidr,network.ingress.cidr,network.egress.cidr].map(range);
 if(new Set(bridges).size!==3||ranges.some((x,j)=>ranges.some((y,k)=>j<k&&overlaps(x,y))))
  stop('shared_bridge_or_address_space');
 // This evidence must be measured independently of the SSH request; no
 // interface in Sabora may overlap a non-Sabora kernel route or inactive
 // Docker allocation. The code cannot manufacture that measurement.
 if(witness.routingCollisionTested!==true)stop('address_space_collisions_unverified');
 const connections=witness.serviceNetworks;
 const expected={
  api:['sabora_sabora_runtime_internal'],
  web:['sabora_ingress_filtered','sabora_sabora_runtime_internal'],
  'sabora-egress':['sabora_egress_filtered','sabora_sabora_runtime_internal']
 };
 if(phase==='running'){
  if(!connections||Object.keys(connections).sort().join('|')!=='api|sabora-egress|web'||
   Object.entries(expected).some(([name,allowed])=>!exactly(
     Array.isArray(connections[name])?connections[name].slice().sort():null,allowed)))
    stop('service_attached_to_unapproved_network');
 }else if(connections&&Object.keys(connections).some(name=>
  !Object.hasOwn(expected,name)||!Array.isArray(connections[name])||
  connections[name].some(net=>!expected[name].includes(net))))
  stop('preflight_service_uses_other_network');
 const ingress=witness.ingress,egress=witness.egress,port=witness.port;
 if(!ingress||ingress.bridge!==network.ingress.bridge||
    ingress.table!=='sabora_ingress_guard'||ingress.filterHook!=='forward'||
    ingress.cloudflareOnly!==true||ingress.directOriginDenied!==true||
    ingress.newOutboundDenied!==true||ingress.ipv6BypassDenied!==true||
    ingress.otherServicesUnaffected!==true)
  stop('ingress_not_demonstrated');
 if(!egress||egress.bridge!==network.egress.bridge||
    egress.table!=='sabora_egress_guard'||egress.filterHook!=='forward'||
    egress.explicitDestinationAllowlist!==true||
    egress.wildcardDenied!==true||egress.prohibitedOutboundDenied!==true||
    egress.ipv6BypassDenied!==true||egress.otherServicesUnaffected!==true)
  stop('egress_not_demonstrated');
 if(!port||port.ip!==SABORA_RELEASE_SCOPE.host||port.tcp!==8443||
    port.exclusivelyReservedForSabora!==true||
    port.otherPortsUntouched!==true||port.sharedHostDaemonUntouched!==true)
  stop('port_or_shared_host_not_demonstrated');
 return Object.freeze({scope:'sabora',services:[...SABORA_RELEASE_SCOPE.services],
   bridges,exclusive:true,observedAt:witness.observedAt,changed:false});
}
