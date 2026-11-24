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
 assertOriginCertificateScope(certificate);
 if(!certificate.checkPrivateKey(createPrivateKey(key)))stop('tls_key_mismatch');
 return true;
}
export function assertOriginCertificateScope(certificate,now=Date.now()){
 // Same exact two DNS SANs and seven-day minimum life as the already
 // approved local sabora-origin-material-check.mjs. No wildcard/extra SAN.
 const names=certificate.subjectAltName?.split(',').map(item=>item.trim())??[];
 const expected=SABORA_RELEASE_SCOPE.origins.map(origin=>'DNS:'+new URL(origin).hostname);
 const from=Date.parse(certificate.validFrom),until=Date.parse(certificate.validTo);
 if(names.length!==2||new Set(names).size!==2||expected.some(name=>!names.includes(name))||
  !Number.isFinite(from)||!Number.isFinite(until)||now<from||now+7*86400000>=until)
  stop('tls_san_or_validity_window');
}
const PWA=Object.freeze([
 {kind:'client',origin:SABORA_RELEASE_SCOPE.origins[0],root:'/srv/sabora/client',id:'/sabora-client-app',title:'Sabora · Carta digital'},
 {kind:'management',origin:SABORA_RELEASE_SCOPE.origins[1],root:'/srv/sabora/management',id:'/sabora-management-app',title:'Sabora · Gestión'}
]);
const FILES=Object.freeze([['index.html','/'],['manifest.webmanifest','/manifest.webmanifest'],['sw.js','/sw.js']]);
export function validatePwaResponse(kind,file,body,expectedSha256){
 const app=PWA.find(item=>item.kind===kind);
 if(!app||!FILES.some(item=>item[0]===file)||!Buffer.isBuffer(body)||body.length===0||
  body.length>1048576||!(/^[0-9a-f]{64}$/).test(expectedSha256??'')||sha256(body)!==expectedSha256)
  stop('pwa_served_bytes_mismatch');
 if(file==='index.html'&&!body.toString('utf8').includes('<title>'+app.title+'</title>'))stop('pwa_html_identity');
 if(file==='manifest.webmanifest'){
  let manifest;try{manifest=JSON.parse(body.toString('utf8'));}catch{stop('pwa_manifest_invalid');}
  if(manifest?.id!==app.id||manifest.start_url!=='/'||manifest.scope!=='/'||manifest.display!=='standalone')
   stop('pwa_manifest_identity');
 }
}
async function probe(url,{address,ca}={}){
 return new Promise((resolve,reject)=>{
  const hostname=new URL(url).hostname;
  const req=https.request(url,{method:'GET',servername:hostname,rejectUnauthorized:true,ca,timeout:5000,
   family:4,autoSelectFamily:false,headers:{'Accept-Encoding':'identity','Cache-Control':'no-cache'},
   ...(address?{lookup:(_name,_options,cb)=>cb(null,address,4)}:{})},res=>{
   let count=0;const chunks=[];
   res.on('data',b=>{count+=b.length;if(count>1048576){res.destroy(Error('response_limit'));return;}chunks.push(b);});
   const peer=res.socket.remoteAddress,ray=res.headers['cf-ray'];
   res.on('error',reject);res.on('end',()=>res.statusCode===200&&
    (!res.headers['content-encoding']||res.headers['content-encoding']==='identity')?
    resolve({peer,ray,body:Buffer.concat(chunks)}):reject(Error('https_status_or_encoding')));
  });const deadline=setTimeout(()=>req.destroy(Error('https_deadline')),7000);
  req.on('close',()=>clearTimeout(deadline));req.on('timeout',()=>req.destroy(Error('https_timeout')));req.on('error',reject);req.end();
 });
}
export async function checkReleaseReadiness({installation,run,releaseSha}){
 const {config,environment}=installation;
 const v2=installation.installationSchema==='sabora-controller-installation/v2';
 verifyTlsMaterial(config.tls);
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
 // Read digests of the six fixed static files from the already inspected
 // immutable web container; never access customer files or other projects.
 const files=PWA.flatMap(app=>FILES.map(([file,path])=>({app,file,path,local:app.root+'/'+file})));
 const listed=run('docker',['exec','sabora-web-1','sha256sum',...files.map(item=>item.local)],{timeout:10000}).stdout.trim().split('\n');
 if(listed.length!==files.length)stop('pwa_local_inventory_invalid');
 const hashes=new Map();
 for(let i=0;i<files.length;i++){
  const match=/^([0-9a-f]{64})  (\/[A-Za-z0-9_./-]+)$/.exec(listed[i]);
  if(!match||match[2]!==files[i].local)stop('pwa_local_inventory_invalid');
  hashes.set(match[2],match[1]);
 }
 for(const [file] of FILES)if(hashes.get(PWA[0].root+'/'+file)===hashes.get(PWA[1].root+'/'+file))
  stop('pwa_origin_identity_not_distinct');
 await Promise.all(files.map(async item=>{
  const {app,file,path,local}=item;
  let direct,publicResult;
  try{
   [direct,publicResult]=await Promise.all([probe(app.origin+path,{address:SABORA_RELEASE_SCOPE.host,ca}),
    probe(app.origin+path,{ca:publicCa})]);
  }catch{stop('pwa_https_probe_failed');}
  validatePwaResponse(app.kind,file,direct.body,hashes.get(local));
  validatePwaResponse(app.kind,file,publicResult.body,hashes.get(local));
  if(environment==='production'){
   const numeric=ip=>ip.split('.').reduce((value,n)=>value*256+Number(n),0);
   const peer=publicResult.peer?.replace(/^::ffff:/,'');
   const approved=typeof peer==='string'&&/^\d+\.\d+\.\d+\.\d+$/.test(peer)&&
    config.networkPolicy.cloudflareIpv4Cidrs.some(cidr=>{const [ip,bits]=cidr.split('/'),width=2**(32-Number(bits));return Math.floor(numeric(peer)/width)===Math.floor(numeric(ip)/width);});
   if(!approved||peer===SABORA_RELEASE_SCOPE.host||typeof publicResult.ray!=='string'||!/^[-A-Za-z0-9]{10,100}$/.test(publicResult.ray))stop('public_cloudflare_path_unproven');
  }
 }));
 if(!exactKeys(config.alert,v2?['url']:['url','receiverIdentitySha256'])||
   (!v2&&config.alert.receiverIdentitySha256!==config.expected.alertReceiverIdentitySha256))
  stop('alert_configuration');
 const url=new URL(config.alert.url);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)stop('alert_endpoint_scope');
 const event={schema:'sabora-release-postcheck/v1',project:'sabora',releaseSha,
  correlation:randomBytes(32).toString('hex'),at:new Date().toISOString()};
 const body=stableStringify(event);
 // This process runs inside the nominated gateway, hence its real allowlist.
 // An HTTP 200 alone is insufficient. V2 requires a fresh correlated ACK over
 // authenticated TLS, matching exact bytes; V1 used a separate signer key.
 const sender="const https=require('node:https');const [url,body,ca]=process.argv.slice(1);"+
  "const q=https.request(url,{method:'POST',ca:ca||undefined,rejectUnauthorized:true,timeout:5000,"+
  "headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}},r=>{"+
  "let b='';r.on('data',x=>{b+=x;if(b.length>16384)r.destroy(Error('limit'))});"+
  "r.on('error',()=>process.exit(1));r.on('end',()=>{if(r.statusCode!==200)process.exit(1);process.stdout.write(b)})});"+
  "q.on('error',()=>process.exit(1));q.on('timeout',()=>q.destroy());q.end(body);";
 const received=run('docker',['exec','sabora-sabora-egress-1','node','-e',sender,
  config.alert.url,body,publicCa?.toString('utf8')??''],{timeout:10000}).stdout;
 let ack;
 if(v2){
  try{ack=JSON.parse(received);}catch{stop('alert_ack_not_json');}
  if(!exactKeys(ack,['schema','project','releaseSha','correlation','receivedSha256','receivedAt'])||
    ack.schema!=='sabora-alert-reception/v2')stop('alert_ack_v2_shape');
 }else{
  ack=verifySignedDocument(Buffer.from(received),config.alertKey,'sabora-alert-reception/v1');
 }
 if(!exactKeys(ack,['schema','project','releaseSha','correlation','receivedSha256','receivedAt'])||
  ack.project!=='sabora'||ack.releaseSha!==releaseSha||ack.correlation!==event.correlation||
  ack.receivedSha256!==sha256(body)||!Number.isFinite(Date.parse(ack.receivedAt))||
  Math.abs(Date.now()-Date.parse(ack.receivedAt))>30000)stop('alert_reception_unproven');
 return {apiReady:true,clientHttps:true,managementHttps:true,alertReception:true,
  originTlsVerified:true,publicTlsVerified:true,pwaIdentityAndBytesVerified:true,alertCorrelation:event.correlation,ackSha256:sha256(received)};
}
