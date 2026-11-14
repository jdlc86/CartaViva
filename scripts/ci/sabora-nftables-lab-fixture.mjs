// Fixture-only syntax gate. Never run "nft -f" against any persistent host.
// RFC 5737 IPs are documentation examples, NOT real service destinations.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderIngressFilter} from './sabora-ingress-network-policy.mjs';
import {renderSaboraEgressGuard} from './sabora-egress-network-policy.mjs';
export function renderLabPolicies(){
 return renderIngressFilter({bridge:'br-0123456789ab',
  cloudflareIpv4Cidrs:['198.51.100.0/25','198.51.100.128/25']})+'\n'+
 renderSaboraEgressGuard({bridge:'br-abcdef123456',allowlisted:[
  {cidr:'203.0.113.10/32',port:443,protocol:'tcp'},
  {cidr:'203.0.113.20/32',port:5432,protocol:'tcp'}]});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  if(process.argv.length!==3||!process.argv[2].startsWith('/'))
   throw Error('sabora_nft_lab_stop:absolute_output_required');
  writeFileSync(process.argv[2],renderLabPolicies(),{flag:'wx',mode:0o600});
  process.stdout.write('sabora_nft_fixture_written\n');
 }catch(error){
  process.stderr.write(String(error.message).replace(/[^A-Za-z0-9:_-]/g,'_')+'\n');
  process.exitCode=1;
 }
}
