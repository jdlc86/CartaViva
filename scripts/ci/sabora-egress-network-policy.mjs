// Pure nftables candidate for a PREPROVISIONED, exclusively Sabora egress
// bridge. No firewall is altered by this module; destinations must be
// independently approved and measured against provider DNS/ACL requirements.
export const EGRESS_SPEC=Object.freeze({project:'sabora',network:'sabora_egress_filtered',
 table:'sabora_egress_guard'});
const BR=/^br-[a-f0-9]{12}$/;
function stop(reason){throw Error('sabora_egress_stop:'+reason);}
function v4(value){
 if(typeof value!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}\/(?:[0-9]|[12][0-9]|3[0-2])$/.test(value))
  stop('invalid_cidr');
 const [ip,c]=value.split('/'),oct=ip.split('.').map(Number),bits=Number(c);
 if(oct.some(x=>x<0||x>255)||bits<8||bits>32)stop('invalid_or_unrestricted_cidr');
 const n=oct.reduce((a,x)=>((a<<8)|x)>>>0,0);
 const mask=(0xffffffff << (32-bits))>>>0;
 if(((n&mask)>>>0)!==n||oct.every(x=>x===0))stop('noncanonical_or_unrestricted_range');
 return value;
}
export function renderSaboraEgressGuard({bridge,allowlisted}){
 if(typeof bridge!=='string'||!BR.test(bridge))stop('invalid_bridge');
 if(!Array.isArray(allowlisted)||allowlisted.length<2||allowlisted.length>100)
  stop('real_allowlist_required');
 const entries=[],unique=new Set();
 for(const item of allowlisted){
  if(!item||item.protocol!=='tcp'||!Number.isInteger(item.port)||item.port<1||item.port>65535)
   stop('unapproved_transport');
  const cidr=v4(item.cidr),key=cidr+':'+item.port;
  if(unique.has(key))stop('duplicate_destination');
  unique.add(key);
  entries.push('  iifname "'+bridge+'" ct state new ip daddr '+cidr+
   ' tcp dport '+item.port+' accept');
 }
 return 'table inet sabora_egress_guard {\n'+
  ' chain sabora_egress_forward { type filter hook forward priority -45; policy accept;\n'+
  '  iifname "'+bridge+'" ct state established,related accept\n'+
  entries.join('\n')+'\n'+
  '  iifname "'+bridge+'" drop\n'+
  '  oifname "'+bridge+'" ct state new drop\n'+
  ' }\n}\n';
}
