import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createM3ManagementCapabilityIssuer} from '../apps/api/src/m3-management-capability.mjs';
import {createRequire} from 'node:module';
import {validateM5AnnouncementDraft,createM5CommunicationsRepositories,
 registerM5CommunicationsHttp,createM5CommunicationsStream} from '../apps/api/src/m5-communications.mjs';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=require('fastify');
const actor=randomUUID();
const verified={verifiedIdentity:{userId:actor},verifiedStaff:{userId:actor,role:'admin'}};
const draft=(overrides={})=>({title:'Menú especial',body:'Aviso propio 🌿',emoji:'🌿',image:null,imageLicense:null,
 priority:'ALTA',schedule:{mode:'weekly',startDate:'2026-11-08',endDate:null,
 weekdays:[1,2,5],startTime:'09:00',endTime:'22:00',timeZone:'Europe/Madrid'},...overrides});

test('content + schedule boundaries preserve optional images, weekdays and IANA zones without HTML injection',()=>{
 assert.doesNotThrow(()=>validateM5AnnouncementDraft(draft()));
 for(const wrong of [
  draft({image:'javascript:alert(1)',imageLicense:'Permiso'}),
  draft({priority:'CRITICA'}),
  draft({schedule:{...draft().schedule,weekdays:[]}}),
  draft({schedule:{...draft().schedule,startTime:'22:00',endTime:'09:00'}}),
  draft({schedule:{...draft().schedule,timeZone:'Zone/Unknown'}}),
  draft({body:'<iframe>\0<script>'}),
  draft({schedule:{...draft().schedule,weekdays:[1,1]}})
 ])assert.throws(()=>validateM5AnnouncementDraft(wrong),/invalid_comms/);
});

test('signed body size grows only for comms image upload; unrelated management stays at 64 KiB',()=>{
 const issue=createM3ManagementCapabilityIssuer({
  keyId:'sabora_cv014_blob_key',secret:Buffer.alloc(32,42),databaseRole:'sabora_cv014_admin_test'});
 const bigBody='a'.repeat(170000);
 assert.equal(issue({actorId:actor,staffRole:'admin',action:'comms.manage',
  requestId:randomUUID(),body:bigBody}).action,'comms.manage');
 assert.throws(()=>issue({actorId:actor,staffRole:'admin',action:'catalog.item_save',
  requestId:randomUUID(),body:bigBody}),/invalid_m3_management_capability_input/);
 assert.throws(()=>issue({actorId:actor,staffRole:'admin',action:'comms.manage',
  requestId:randomUUID(),body:'a'.repeat(200001)}),/invalid_m3_management_capability_input/);
});

test('one signed Fastify HTTP request traverses role gate → scoped repo, while waiter cannot mutate',async()=>{
 const observed=[];
 const issueCapability=input=>({actorId:input.actorId,staffRole:input.staffRole,action:input.action,
  requestId:input.requestId,bodyHashHex:'a'.repeat(64),signatureHex:'b'.repeat(64)});
 const repo=createM5CommunicationsRepositories({
  issueCapability,
  adminTx:fn=>fn(async(sql,params)=>{observed.push({sql,params});return {rows:[{result:
   sql.includes('read_admin')?{version:1,items:[]}:{id:randomUUID(),state:'draft',revision:1}}]};}),
  publicTx:fn=>fn(async sql=>{observed.push({sql});return {rows:[{result:{version:1,items:[]}}]};})
 });
 const app=Fastify();
 const roles=allowed=>async(req,reply)=>{
  const role=req.headers.authorization==='Bearer admin_test'?'admin':'waiter';
  if(!allowed.includes(role)){reply.code(403).send({error:'forbidden'});return;}
  req.verifiedIdentity={userId:actor};req.verifiedStaff={userId:actor,role};
 };
 registerM5CommunicationsHttp(app,{forRoles:roles,repositories:repo,
  stream:{subscribe:()=>()=>{}}});
 try{
  const noAuth=await app.inject({method:'GET',url:'/api/v1/admin/communications'});
  assert.equal(noAuth.statusCode,403);
  const empty=await app.inject({method:'GET',url:'/api/v1/public/communications'});
  assert.equal(empty.statusCode,200);
  const action={requestId:randomUUID(),operation:'save',payload:{id:null,revision:null,draft:draft()}};
  const blocked=await app.inject({method:'POST',url:'/api/v1/admin/communications/actions',
   payload:action});assert.equal(blocked.statusCode,403);
  const allowed=await app.inject({method:'POST',url:'/api/v1/admin/communications/actions',
   headers:{authorization:'Bearer admin_test'},payload:action});
  assert.equal(allowed.statusCode,200);
  assert.equal(observed.length,2);
  assert(observed[1].sql.includes('manage_communications_m5'));
  assert.equal(JSON.parse(observed[1].params[0]).action,'comms.manage');
 }finally{await app.close();}
});

test('PG notification and next boundary trigger one-shot updates; no interval or polling',async()=>{
 let callback;
 const log=[];
 const fakeClient={
  on(event,fn){if(event==='notification')callback=fn;return this;},
  removeListener(){return this;},query:async()=>({rows:[]}),release(){log.push('released');}
 };
 let next=Date.now()+2000,timer;
 const stream=await createM5CommunicationsStream({
  pool:{connect:async()=>fakeClient},
  readPublic:async()=>({nextTransitionAt:new Date(next).toISOString(),items:[]}),
  setTimer:(fn,delay)=>{log.push('one-shot:'+delay);timer=fn;return 1;},
  clearTimer:()=>log.push('clear')
 });
 try{
  const stop=stream.subscribe(()=>log.push('changed'));
  callback();
  await new Promise(resolve=>setImmediate(resolve));
  assert(log.some(x=>x.startsWith('one-shot:')));
  assert(log.includes('changed'));
  next=Date.now()+3000;timer();
  await new Promise(resolve=>setImmediate(resolve));
  assert(log.filter(x=>x.startsWith('one-shot:')).length>=2);
  stop();
 }finally{await stream.close();}
 assert(log.includes('released'));
});
