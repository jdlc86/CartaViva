import {createECDH,createHash,ECDH} from 'node:crypto';
import https from 'node:https';
import tls from 'node:tls';
import {generateRequestDetails} from 'web-push';
import {preflightStaffRestrictedIdentity} from './staff-durable-admin-identity-preflight.mjs';

export const FLOOR_PUSH_HOSTS=Object.freeze(['fcm.googleapis.com','web.push.apple.com']);
const OWNER='sabora_floor_push_fn_owner';
const MANAGE='sabora.manage_floor_push_candidate(uuid,text,text,text,text)';
const CLAIM='sabora.claim_floor_push_candidate()';
const READ='sabora.read_floor_push_candidate(text,uuid,uuid,uuid)';
const FINISH='sabora.finish_floor_push_candidate(text,uuid,uuid)';
const EXPIRE='sabora.expire_floor_push_device_candidate(uuid,text,text,text)';
export const FLOOR_PUSH_ROUTINES=Object.freeze([MANAGE,CLAIM,READ,FINISH,EXPIRE]);
const PATH='/api/v1/operations/floor-push';
const invalid=()=>Error('invalid_floor_push_config');

export function parseFloorPushEndpoint(endpoint){
 if(typeof endpoint!=='string'||endpoint.length>2048)return null;
 let url;
 try{url=new URL(endpoint);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||
    url.href!==endpoint||!FLOOR_PUSH_HOSTS.includes(url.hostname))return null;
 const pattern=url.hostname===FLOOR_PUSH_HOSTS[0]?/^\/fcm\/send\/[A-Za-z0-9_:-]+$/:/^\/[A-Za-z0-9_-]+$/;
 return pattern.test(url.pathname)?url:null;
}

function decodeKey(value,size){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))return null;
 const key=Buffer.from(value,'base64url');
 return key.length===size&&key.toString('base64url')===value?key:null;
}

function validSubscriptionKeys(p256dh,auth){
 const key=decodeKey(p256dh,65);
 if(!key||key[0]!==4||!decodeKey(auth,16))return false;
 try{return ECDH.convertKey(key,'prime256v1').equals(key);}catch{return false;}
}

export function createFloorPushSender({connectHost,ports,vapid,request=https.request,tlsConnect=tls.connect}={}){
 if(!/^[a-z][a-z0-9-]{0,62}$/.test(connectHost??'')||Object.keys(ports??{}).length!==FLOOR_PUSH_HOSTS.length||
  FLOOR_PUSH_HOSTS.some(host=>!Number.isSafeInteger(ports[host])||ports[host]<1024||ports[host]>65535)||
  new Set(Object.values(ports)).size!==FLOOR_PUSH_HOSTS.length||
  !/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(vapid?.subject??''))throw invalid();
 const privateKey=decodeKey(vapid.privateKey,32),publicKey=decodeKey(vapid.publicKey,65);
 const curve=createECDH('prime256v1');
 if(!privateKey||!publicKey)throw invalid();
 try{curve.setPrivateKey(privateKey);}catch{throw invalid();}
 if(!curve.getPublicKey().equals(publicKey))throw invalid();
 const agents=new Map(FLOOR_PUSH_HOSTS.map(host=>{
  const agent=new https.Agent({keepAlive:false,maxSockets:4});
  agent.createConnection=(_options,callback)=>tlsConnect({host:connectHost,port:ports[host],servername:host,
   rejectUnauthorized:true,minVersion:'TLSv1.2',ALPNProtocols:['http/1.1']},callback);
  return [host,agent];
 }));
 return async ({endpoint,p256dh,auth},{kind,tag,occurrence})=>{
  const url=parseFloorPushEndpoint(endpoint);
  if(!url||!validSubscriptionKeys(p256dh,auth))return 'gone';
  const details=generateRequestDetails({endpoint,keys:{p256dh,auth}},JSON.stringify({kind,tag,occurrence}),{
   vapidDetails:vapid,TTL:0,topic:tag,urgency:'high',contentEncoding:'aes128gcm'});
  return new Promise((resolve,reject)=>{
   const req=request({method:'POST',hostname:url.hostname,port:443,path:url.pathname,
    headers:details.headers,signal:AbortSignal.timeout(5000),agent:agents.get(url.hostname)},response=>{
     response.once('error',reject);
     response.once('end',()=>resolve([404,410].includes(response.statusCode)?'gone':
      response.statusCode>=200&&response.statusCode<300?'accepted':'failed'));
     response.resume();
    });
   req.once('error',reject);req.end(details.body);
  });
 };
}

export function createFloorPushComposition({pool,expectedLogin,origin,publicKey,send,observeFailure=()=>{}}={}){
 if(typeof pool?.query!=='function'||typeof pool.connect!=='function'||typeof send!=='function'||
    !/^sabora_[a-z0-9_]{1,55}$/.test(expectedLogin??'')||!decodeKey(publicKey,65))throw invalid();
 const readiness=()=>preflightStaffRestrictedIdentity({pool,role:expectedLogin,
  routines:FLOOR_PUSH_ROUTINES.map(signature=>[signature,OWNER]),
  tables:['floor_push_subscriptions','floor_push_schedule','staff_members','waiter_calls','pickup_tasks','dining_tables'],
  requiredTriggers:[['waiter_calls','floor_push_waiter_call',false],['pickup_tasks','floor_push_pickup',false],
   ['dining_tables','floor_push_occupation',false],['staff_members','floor_push_membership',false]]});
 const claim=()=>pool.query('SELECT * FROM sabora.claim_floor_push_candidate()');
 const read=(args,id)=>pool.query('SELECT * FROM sabora.read_floor_push_candidate($1,$2,$3,$4)',[...args,id]);
 const report=()=>{try{observeFailure(Error('floor_push_delivery_failed'));}catch{}};
 let closed=false,running=false,timer,task;

 async function run(){
  const {rows:jobs}=await claim();
  await Promise.all(jobs.map(async ({kind,signal_id,revision,fence})=>{
   const args=[kind,signal_id,fence];
   const {rows:devices}=await read(args,null);
   const tag=createHash('sha256').update(`${kind}:${signal_id}`).digest('base64url').slice(0,32);
   for(const device of devices){
    if(closed)return;
    try{
     const {rows:[current]}=await read(args,device.id);
     if(!current)continue;
     const result=await send(current,{kind,tag,occurrence:kind==='pickup'?String(revision):fence});
     if(result==='gone')await pool.query('SELECT sabora.expire_floor_push_device_candidate($1,$2,$3,$4)',
      [current.id,current.endpoint,current.p256dh,current.auth]);
     else if(result!=='accepted')report();
    }catch{report();}
   }
   if(!closed&&kind==='pickup')await pool.query('SELECT sabora.finish_floor_push_candidate($1,$2,$3)',args);
  }));
 }

 function tick(){
  if(!running||closed)return Promise.resolve();
  if(task)return task;
  clearTimeout(timer);
  task=run().catch(report).finally(()=>{
   task=undefined;
   if(!closed){timer=setTimeout(tick,1000);timer.unref();}
  });
  return task;
 }

 return Object.freeze({readiness,tick,
  start(){if(closed||running)throw invalid();running=true;void tick();},
  async close(){closed=true;clearTimeout(timer);await task;},
  register(app,{forRoles}){
   const guard=forRoles(['waiter']);
   app.get(PATH,{preHandler:guard},async (_request,reply)=>reply.header('Cache-Control','no-store').send({publicKey}));
   app.post(PATH,{preHandler:guard,bodyLimit:4096},async (request,reply)=>{
    reply.header('Cache-Control','no-store');
    if(request.headers.origin!==origin)return reply.code(403).send({error:'floor_push_forbidden'});
    const {action,endpoint,p256dh,auth}=request.body??{};
    if(!['status','enable','disable'].includes(action)||!parseFloorPushEndpoint(endpoint)||
       (action==='enable'&&!validSubscriptionKeys(p256dh,auth)))
     return reply.code(400).send({error:'invalid_floor_push_subscription'});
    try{
     const result=await pool.query('SELECT sabora.manage_floor_push_candidate($1,$2,$3,$4,$5) AS enabled',
      [request.verifiedStaff.userId,action,endpoint,action==='enable'?p256dh:null,action==='enable'?auth:null]);
     if(action==='enable'&&!result.rows[0].enabled)return reply.code(409).send({error:'floor_push_device_assigned'});
     return reply.send({enabled:result.rows[0].enabled});
    }catch(error){return reply.code(error?.code==='42501'?403:503).send({error:'floor_push_unavailable'});}
   });
  }
 });
}
