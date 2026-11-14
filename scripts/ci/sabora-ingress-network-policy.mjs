// A pure, non-mutating candidate for exclusive Sabora ingress enforcement.
// MUST NOT be applied before the bridge and Cloudflare source ranges are
// independently verified, and the shared-host rollback has been rehearsed.
export const INGRESS_SPEC=Object.freeze({
 network:'sabora_ingress_filtered',
 cidr:'172.28.240.0/24',
 gateway:'172.28.240.1',
 port:8443,
 publicIp:'146.59.145.64',
 project:'sabora'
});
function stop(reason){throw Error('sabora_ingress_stop:'+reason);}
function toNum(ip){
 const parts=ip.split('.');
 if(parts.length!==4||parts.some(x=>!/^(0|[1-9][0-9]{0,2})$/.test(x)||Number(x)>255))stop('invalid_ipv4');
 return parts.reduce((v,x)=>(v*256+Number(x)),0);
}
function cidr(value){
 if(typeof value!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}\/(?:[0-9]|[12][0-9]|3[0-2])$/.test(value))stop('invalid_cidr');
 const [ip,bits]=value.split('/');const n=Number(bits);
 const mask=n===0?0:((0xffffffff << (32-n))>>>0);
 const first=(toNum(ip)&mask)>>>0, last=(first | (~mask>>>0))>>>0;
 return {first,last};
}
function overlaps(a,b){const x=cidr(a),y=cidr(b);return x.first<=y.last&&y.first<=x.last;}
export function checkIngressAddressSpace(routes,network=INGRESS_SPEC.cidr){
 if(!Array.isArray(routes))stop('routes_required');
 if(network!==INGRESS_SPEC.cidr)stop('unapproved_network_cidr');
 for(const route of routes){
  const dst=typeof route==='string'?route:route?.dst;
  if(typeof dst!=='string')stop('invalid_route');
  if(dst==='default')continue;
  if(dst.includes(':'))continue;
  const range=dst.includes('/')?dst:dst+'/32';
  if(overlaps(network,range))stop('existing_route_overlaps_sabora_ingress');
 }
 return {candidateCidr:network,routeCount:routes.length,overlap:false,verifiedOnlyAtSnapshot:true};
}
export function renderIngressFilter({bridge,cloudflareIpv4Cidrs}){
 if(typeof bridge!=='string'||!/^br-[a-f0-9]{12}$/.test(bridge))stop('invalid_bridge_identity');
 if(!Array.isArray(cloudflareIpv4Cidrs)||cloudflareIpv4Cidrs.length<2||cloudflareIpv4Cidrs.length>80)
  stop('cloudflare_ranges_missing');
 const entries=[];
 for(const iprange of cloudflareIpv4Cidrs){
  const parsed=cidr(iprange);
  if(parsed.first===0||iprange==='0.0.0.0/0')stop('unrestricted_cloudflare_range');
  if(entries.includes(iprange))stop('duplicate_cloudflare_range');
  entries.push(iprange);
 }
 return 'table inet sabora_ingress_guard {\n'+
  ' set cf4 { type ipv4_addr; flags interval; elements = { '+entries.join(', ')+' } }\n'+
  ' chain sabora_forward { type filter hook forward priority -40; policy accept;\n'+
  '  oifname "'+bridge+'" ct state new ip saddr @cf4 meta l4proto tcp tcp dport 8443 accept\n'+
  '  oifname "'+bridge+'" ct state new drop\n'+
  '  iifname "'+bridge+'" ct state new drop\n'+
  ' }\n}\n';
}
