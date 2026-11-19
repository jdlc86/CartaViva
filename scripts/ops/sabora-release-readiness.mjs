import https from 'node:https';
import {X509Certificate,createPrivateKey,randomBytes} from 'node:crypto';
import {protectedBytes,sha256,releaseStop as stop,exactKeys} from './sabora-release-protected-store.mjs';
import {verifySignedDocument} from './sabora-release-evidence.mjs';
import {stableStringify,SABORA_RELEASE_SCOPE} from '../ci/sabora-release-governor.mjs';
const ROOT='/etc/sabora/release/';
export function verifyTlsMaterial(config){
 if(!exactKeys(config,['certificateSha256','keySha256','originCaSha256','publicCaSha256']))stop('tls_policy_invalid');
 const cert=protectedBytes('/srv/sabora/tls/origin.crt'),key=protectedBytes('/srv/sabora/tls/origin.key');
 if(sha256(cert)!==config.certificateSha256||sha256(key)!==config.keySha256)stop('tls_material_changed');
 const certificate=new X509Certificate(cert);
 if(!certificate.checkPrivateKey(createPrivateKey(key))||Date.parse(certificate.validTo)<=Date.now()||
  Date.parse(certificate.validFrom)>Date.now()||SABORA_RELEASE_SCOPE.origins.some(origin=>!certificate.checkHost(new URL(origin).hostname)))
  stop('tls_pair_hostname_or_time');
 return true;
}
async function probe(url,{address,ca}={}){
 return new Promise((resolve,reject)=>{
  const hostname=new URL(url).hostname;
  const req=https.request(url,{method:'GET',servername:hostname,rejectUnauthorized:true,ca,timeout:5000,
   ...(address?{lookup:(_name,_options,cb)=>cb(null,address,4)}:{})},res=>{
   let count=0;res.on('data',b=>{count+=b.length;if(count>1048576)res.destroy(Error('response_limit'));});
   const peer=res.socket.remoteAddress,ray=res.headers['cf-ray'];
   res.on('error',reject);res.on('end',()=>res.statusCode===200?resolve({peer,ray}):reject(Error('https_status')));
  });const deadline=setTimeout(()=>req.destroy(Error('https_deadline')),7000);
  req.on('close',()=>clearTimeout(deadline));req.on('timeout',()=>req.destroy(Error('https_timeout')));req.on('error',reject);req.end();
 });
}
export async function checkReleaseReadiness({installation,run,releaseSha}){
 const {config,environment}=installation;verifyTlsMaterial(config.tls);
 const ca=protectedBytes(ROOT+'origin-ca.pem');
 if(sha256(ca)!==config.tls.originCaSha256)stop('origin_ca_changed');
 let publicCa;
 if(environment==='production'){
  if(config.tls.publicCaSha256!==null)stop('public_chain_must_use_system_roots');
 }else{
  publicCa=protectedBytes(ROOT+'lab-public-ca.pem');
  if(sha256(publicCa)!==config.tls.publicCaSha256)stop('lab_ca_changed');
 }
 const api=run('docker',['exec','sabora-api-1','node','-e',
  "fetch('http://127.0.0.1:4100/ready',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],{timeout:10000});
 if(api.status!==0)stop('api_not_ready');
 for(const origin of SABORA_RELEASE_SCOPE.origins){
  await probe(origin+'/',{address:SABORA_RELEASE_SCOPE.host,ca});
  const publicResult=await probe(origin+'/',{ca:publicCa});
  if(environment==='production'){
   const numeric=ip=>ip.split('.').reduce((value,n)=>value*256+Number(n),0);
   const peer=publicResult.peer?.replace(/^::ffff:/,'');
   const approved=typeof peer==='string'&&/^\d+\.\d+\.\d+\.\d+$/.test(peer)&&
    config.networkPolicy.cloudflareIpv4Cidrs.some(cidr=>{const [ip,bits]=cidr.split('/'),width=2**(32-Number(bits));return Math.floor(numeric(peer)/width)===Math.floor(numeric(ip)/width);});
   if(!approved||peer===SABORA_RELEASE_SCOPE.host||typeof publicResult.ray!=='string'||!/^[-A-Za-z0-9]{10,100}$/.test(publicResult.ray))stop('public_cloudflare_path_unproven');
  }
 }
 if(!exactKeys(config.alert,['url','receiverIdentitySha256'])||config.alert.receiverIdentitySha256!==config.expected.alertReceiverIdentitySha256)
  stop('alert_configuration');
 const url=new URL(config.alert.url);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)stop('alert_endpoint_scope');
 const event={schema:'sabora-release-postcheck/v1',project:'sabora',releaseSha,
  correlation:randomBytes(32).toString('hex'),at:new Date().toISOString()};
 const body=stableStringify(event);
 // This process runs inside the nominated gateway, hence its real allowlist.
 // A successful sender HTTP response is insufficient: ACK must be signed by
 // the separately provisioned receiver key and match these exact event bytes.
 const sender="const https=require('node:https');const [url,body,ca]=process.argv.slice(1);"+
  "const q=https.request(url,{method:'POST',ca:ca||undefined,rejectUnauthorized:true,timeout:5000,"+
  "headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}},r=>{"+
  "let b='';r.on('data',x=>{b+=x;if(b.length>16384)r.destroy(Error('limit'))});"+
  "r.on('error',()=>process.exit(1));r.on('end',()=>{if(r.statusCode!==200)process.exit(1);process.stdout.write(b)})});"+
  "q.on('error',()=>process.exit(1));q.on('timeout',()=>q.destroy());q.end(body);";
 const received=run('docker',['exec','sabora-sabora-egress-1','node','-e',sender,
  config.alert.url,body,publicCa?.toString('utf8')??''],{timeout:10000}).stdout;
 const ack=verifySignedDocument(Buffer.from(received),config.alertKey,'sabora-alert-reception/v1');
 if(!exactKeys(ack,['schema','project','releaseSha','correlation','receivedSha256','receivedAt'])||
  ack.project!=='sabora'||ack.releaseSha!==releaseSha||ack.correlation!==event.correlation||
  ack.receivedSha256!==sha256(body)||!Number.isFinite(Date.parse(ack.receivedAt))||
  Math.abs(Date.now()-Date.parse(ack.receivedAt))>30000)stop('alert_reception_unproven');
 return {apiReady:true,clientHttps:true,managementHttps:true,alertReception:true,
  originTlsVerified:true,publicTlsVerified:true,alertCorrelation:event.correlation,ackSha256:sha256(received)};
}
