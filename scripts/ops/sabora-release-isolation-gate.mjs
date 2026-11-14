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
function checkNet(n,name,kind,internal){
 if(!n||n.name!==name||n.project!=='sabora'||n.kind!==kind||
    n.driver!=='bridge'||n.internal!==internal||
    n.attachable!==false||n.ipv6!==false||
    !RFC.test(n.bridge)||!CIDR.test(n.cidr)||
    !exactly(n.attachedServices,kind==='runtime'?
      ['sabora-egress','api','web']:kind==='ingress'?['web']:['sabora-egress']))
   stop('untrusted_'+kind+'_network');
 return n.bridge;
}
export function assertLiveSaboraIsolation(witness,now=Date.now()){
 if(!witness||witness.schema!=='sabora-live-isolation/v1'||
    witness.project!=='sabora'||witness.source!=='host-readonly-inspector'||
    !Number.isFinite(Date.parse(witness.observedAt))||
    Math.abs(now-Date.parse(witness.observedAt))>120000)
   stop('missing_or_stale_host_witness');
 const network=witness.networks;
 if(!network||!network.runtime||!network.ingress||!network.egress)
  stop('missing_networks');
 const bridges=[
  checkNet(network.runtime,'sabora_sabora_runtime_internal','runtime',true),
  checkNet(network.ingress,'sabora_ingress_filtered','ingress',false),
  checkNet(network.egress,'sabora_egress_filtered','egress',false)
 ];
 if(new Set(bridges).size!==3||new Set([
  network.runtime.cidr,network.ingress.cidr,network.egress.cidr]).size!==3)
  stop('shared_bridge_or_address_space');
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
