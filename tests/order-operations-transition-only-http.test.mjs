import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerOrderOperationsHttp} from '../apps/api/src/order-operations-http.mjs';
const Fastify=createRequire(new URL('../apps/api/package.json',import.meta.url))('fastify');
const actor='10000000-0000-4000-8000-000000000001';
const line='30000000-0000-4000-8000-000000000003';
function setup({transitionOnly=true}={}){
 const app=Fastify();
 const calls=[];
 const operations={
  async listBoard(){calls.push('board');return {items:[]};},
  async listHistory(){calls.push('history');return {events:[]};},
  async transitionLine(context,input){
   calls.push('transition');
   assert.equal(context.verifiedIdentity.userId,actor);
   assert.equal(input.lineId,line);
   return {repeated:false,currentStatus:'preparing'};
  },
 };
 registerOrderOperationsHttp(app,{
  transitionOnly,operations,
  forRoles:roles=>async(request,reply)=>{
   if(!roles.includes('kitchen'))return reply.code(403).send({error:'forbidden'});
   request.verifiedIdentity={userId:actor};
   request.verifiedStaff={userId:actor,role:'kitchen'};
  },
 });
 return {app,calls};
}
test('transition-only surface mounts POST but never board or history',async t=>{
 const {app,calls}=setup();t.after(()=>app.close());
 await app.ready();
 assert.equal(app.hasRoute({method:'POST',url:'/api/v1/operations/order-lines/:lineId/transitions'}),true);
 assert.equal(app.hasRoute({method:'GET',url:'/api/v1/operations/order-lines'}),false);
 assert.equal(app.hasRoute({method:'GET',url:'/api/v1/operations/orders/:orderId/history'}),false);
 assert.equal((await app.inject('/api/v1/operations/order-lines')).statusCode,404);
 assert.equal((await app.inject(`/api/v1/operations/orders/${line}/history`)).statusCode,404);
 const response=await app.inject({method:'POST',
  url:`/api/v1/operations/order-lines/${line}/transitions`,
  payload:{targetStatus:'preparing',correlationId:'transition_only_001'}});
 assert.equal(response.statusCode,201,response.body);
 assert.deepEqual(calls,['transition']);
});
test('default full HTTP surface remains unchanged',async t=>{
 const {app}=setup({transitionOnly:false});t.after(()=>app.close());
 await app.ready();
 assert.equal(app.hasRoute({method:'GET',url:'/api/v1/operations/order-lines'}),true);
 assert.equal(app.hasRoute({method:'GET',url:'/api/v1/operations/orders/:orderId/history'}),true);
});
test('transition-only option is strictly boolean',async()=>{
 const app=Fastify();
 try{
  assert.throws(()=>registerOrderOperationsHttp(app,{
   transitionOnly:'yes',forRoles:()=>async()=>{},
   operations:{listBoard(){},listHistory(){},transitionLine(){}},
  }),/invalid_order_operations_http_config/);
 }finally{await app.close();}
});
