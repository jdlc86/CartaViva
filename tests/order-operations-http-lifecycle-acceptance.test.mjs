// Acceptance harness for the HTTP kitchen → waiter line lifecycle.
// Deliberately in-memory: durable PG17 and SQL permission tests are separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createOrderOperationsCoordinator} from '../apps/api/src/order-operations-coordinator.mjs';
import {registerOrderOperationsHttp} from '../apps/api/src/order-operations-http.mjs';
import {createAuthenticatedOrderOperationsGateway} from '../apps/management/src/order-operations-authenticated-gateway.js';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const actor='10000000-0000-4000-8000-000000000001';
const line='30000000-0000-4000-8000-000000000003';
const order='20000000-0000-4000-8000-000000000002';
const notif='50000000-0000-4000-8000-000000000005';
const roles=new Set(['kitchen','waiter','admin']);
function fixture(){
 const state={status:'confirmed',events:[],notification:null,transitions:0,transactions:0};
 const repository={
  async verifyMembership(_query,{actorId,role}){
   if(!roles.has(role))throw Error('order_operations_forbidden');
   return {actorId,role};
  },
  async listBoard(_query,{role,status}){
   const visible=role==='admin'||
    (role==='kitchen'&&state.status!=='picked_up')||
    (role==='waiter'&&['ready','picked_up'].includes(state.status));
   return {version:1,role,items:visible&&(!status||status===state.status)?
    [{orderId:order,lineId:line,status:state.status,
      notification:state.notification}]:[],nextCursor:null};
  },
  async transitionLine(_query,{role,lineId,targetStatus,correlationId,capability}){
   if(lineId!==line||capability.actorId!==actor||
      capability.targetStatus!==targetStatus||
      capability.correlationId!==correlationId)
    throw Error('order_operations_forbidden');
   const existing=state.events.find(x=>x.correlationId===correlationId);
   if(existing){
    if(existing.targetStatus!==targetStatus)
     throw Error('line_transition_idempotency_conflict');
    return {...existing.result,repeated:true};
   }
   const next={confirmed:'preparing',preparing:'ready',ready:'picked_up'}[state.status];
   if(targetStatus!==next||
      (role==='kitchen'&&targetStatus==='picked_up')||
      (role==='waiter'&&targetStatus!=='picked_up'))
    throw Error('invalid_line_transition');
   const previousStatus=state.status;
   state.status=targetStatus;
   if(targetStatus==='ready')state.notification={id:notif,acknowledgedAt:null};
   if(targetStatus==='picked_up')state.notification={id:notif,acknowledgedAt:'2026-10-25T12:00:00.000Z'};
   state.transitions++;
   const result={version:1,orderId:order,lineId:line,previousStatus,
    currentStatus:targetStatus,repeated:false,
    eventId:'40000000-0000-4000-8000-000000000004',
    notificationId:targetStatus==='preparing'?null:notif};
   state.events.push({correlationId,targetStatus,result});
   return result;
  },
  async listHistory(_query,{role}){
   return {version:1,role,events:state.events.map(e=>({
    fromStatus:e.result.previousStatus,toStatus:e.targetStatus
   }))};
  }
 };
 const operations=createOrderOperationsCoordinator({
  repository,issueTransitionCapability:input=>({...input}),
  withTransaction:async work=>{state.transactions++;return work(async()=>({rows:[]}));},
 });
 const app=Fastify();
 registerOrderOperationsHttp(app,{
  forRoles:allowed=>async(request,reply)=>{
   const role=request.headers['x-test-role'];
   if(!allowed.includes(role))return reply.code(403).send({error:'forbidden'});
   request.verifiedIdentity={userId:actor};
   request.verifiedStaff={userId:actor,role};
  },operations,
 });
 const board=role=>app.inject({method:'GET',
  url:'/api/v1/operations/order-lines',headers:{'x-test-role':role}});
 const transition=(role,targetStatus,correlationId)=>app.inject({
  method:'POST',url:`/api/v1/operations/order-lines/${line}/transitions`,
  headers:{'x-test-role':role},payload:{targetStatus,correlationId},
 });
 return {app,state,board,transition};
}
test('HTTP confirmed → preparing → ready → picked_up with notification and idempotent retry',async t=>{
 const f=fixture();t.after(()=>f.app.close());
 assert.equal((await f.board('kitchen')).json().items[0].status,'confirmed');
 assert.deepEqual((await f.board('waiter')).json().items,[]);
 let r=await f.transition('kitchen','preparing','prep_first_001');
 assert.equal(r.statusCode,201);
 assert.equal(r.json().currentStatus,'preparing');
 r=await f.transition('kitchen','ready','ready_first_001');
 assert.equal(r.statusCode,201);
 assert.equal(r.json().notificationId,notif);
 assert.equal(f.state.notification.acknowledgedAt,null);
 assert.equal((await f.board('waiter')).json().items[0].status,'ready');
 r=await f.transition('waiter','picked_up','pickup_first_001');
 assert.equal(r.statusCode,201);
 assert.equal(r.json().currentStatus,'picked_up');
 assert.ok(f.state.notification.acknowledgedAt);
 assert.deepEqual((await f.board('kitchen')).json().items,[]);
 assert.equal((await f.board('waiter')).json().items[0].status,'picked_up');
 const repeat=await f.transition('waiter','picked_up','pickup_first_001');
 assert.equal(repeat.statusCode,200);
 assert.equal(repeat.json().repeated,true);
 assert.equal(f.state.transitions,3);
 const history=await f.app.inject({method:'GET',
  url:`/api/v1/operations/orders/${order}/history`,
  headers:{'x-test-role':'admin'}});
 assert.equal(history.statusCode,200);
 assert.deepEqual(history.json().events.map(x=>x.toStatus),
  ['preparing','ready','picked_up']);
});
test('HTTP rejects unauthorized transitions and correlation conflicts without state change',async t=>{
 const f=fixture();t.after(()=>f.app.close());
 assert.equal((await f.transition('waiter','ready','denied_first_001')).statusCode,403);
 assert.equal((await f.transition('kitchen','picked_up','denied_second_001')).statusCode,403);
 assert.equal((await f.transition('kitchen','ready','wrong_order_001')).statusCode,409);
 assert.equal((await f.transition('kitchen','preparing','same_key_001')).statusCode,201);
 assert.equal((await f.transition('kitchen','ready','same_key_001')).statusCode,409);
 assert.equal((await f.transition('unknown','ready','denied_third_001')).statusCode,403);
 assert.equal(f.state.status,'preparing');
 assert.equal(f.state.transitions,1);
 assert.equal(f.state.notification,null);
});

// Integration of the actual management PWA transport with H4 HTTP routes.
// Identity is injected by this in-memory harness only; SQL identity and PG17
// are separately exercised in the restricted PostgreSQL integration suites.
test('management PWA transport drives H4 kitchen-to-sala HTTP lifecycle',async t=>{
 const f=fixture();t.after(()=>f.app.close());
 const requests=[];
 function gateway(role){
  return createAuthenticatedOrderOperationsGateway({
   getAccessToken:async()=>`ci_valid_management_bearer_${role}_971001`,
   fetchImpl:async(path,options)=>{
    requests.push({role,path,credentials:options.credentials,
     bearer:options.headers.get('authorization')});
    const response=await f.app.inject({method:options.method,url:path,
     headers:{'x-test-role':role,'accept':'application/json',
      ...(options.body?{'content-type':'application/json'}:{})},
     ...(options.body?{payload:options.body}:{})});
    return new Response(response.body,{status:response.statusCode,headers:{
     'content-type':response.headers['content-type']||'application/json'}});
   }
  });
 }
 const kitchen=gateway('kitchen'),sala=gateway('waiter');
 assert.equal((await kitchen.listBoard()).items[0].status,'confirmed');
 assert.deepEqual((await sala.listBoard()).items,[]);
 const prep=await kitchen.transitionLine({lineId:line,targetStatus:'preparing',
  correlationId:'pwa_kitchen_prepare_971001'});
 assert.equal(prep.currentStatus,'preparing');
 const ready=await kitchen.transitionLine({lineId:line,targetStatus:'ready',
  correlationId:'pwa_kitchen_ready_971001'});
 assert.equal(ready.notificationId,notif);
 assert.equal((await sala.listBoard()).items[0].status,'ready');
 const pickup=await sala.transitionLine({lineId:line,targetStatus:'picked_up',
  correlationId:'pwa_sala_pickup_971001'});
 assert.equal(pickup.currentStatus,'picked_up');
 const repeated=await sala.transitionLine({lineId:line,targetStatus:'picked_up',
  correlationId:'pwa_sala_pickup_971001'});
 assert.equal(repeated.repeated,true);
 assert.equal(f.state.transitions,3);
 assert.equal((await sala.listHistory({orderId:order})).events.length,3);
 assert.ok(requests.length>=8);
 for(const request of requests){
  assert.equal(request.credentials,'omit');
  assert.match(request.bearer,/^Bearer ci_valid_management_bearer_/);
  assert.match(request.path,/^\/api\/v1\/operations\//);
 }
 kitchen.revoke();sala.revoke();
 await assert.rejects(kitchen.listBoard(),/order_operations_auth_unavailable/);
 await assert.rejects(sala.listBoard(),/order_operations_auth_unavailable/);
});
