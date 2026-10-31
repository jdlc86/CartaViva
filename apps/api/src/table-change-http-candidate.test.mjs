import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerTableChangeStaffHttp} from './table-change-http-candidate.mjs';
const requireApi=createRequire(new URL('../package.json',import.meta.url));
const Fastify=requireApi('fastify');
const id='10000000-0000-4000-8000-000000000001';
const route='/api/v1/operations/table-change/decisions';
function setup({role='waiter',failure=null}={}){
 const calls=[];
 const app=Fastify({logger:false});
 registerTableChangeStaffHttp(app,{
  forRoles:roles=>async(request,reply)=>{
   if(!roles.includes(role))return reply.code(403).send({error:'forbidden'});
   request.verifiedIdentity={id:'staff-1'};
   request.verifiedStaff={id:'staff-1',role};
  },
  service:{decide:async input=>{
   calls.push(input);
   if(failure)throw Error(failure);
   return {request:{id:input.requestId,status:input.decision}};
  }}
 });
 return {app,calls};
}
const post=(app,payload,headers={'content-type':'application/json'})=>
 app.inject({method:'POST',url:route,headers,payload});
test('F12 staff decision requires waiter/admin and rejects kitchen',async()=>{
 for(const role of ['waiter','admin','kitchen']){
  const {app,calls}=setup({role});
  await app.ready();
  try{
   const response=await post(app,{requestId:id,decision:'approved'});
   assert.equal(response.statusCode,role==='kitchen'?403:200);
   if(role!=='kitchen')assert.deepEqual(response.json(),{requestId:id,status:'approved'});
   assert.equal(calls.length,role==='kitchen'?0:1);
   if(calls.length)assert.deepEqual(calls[0],{
    verifiedIdentity:{id:'staff-1'},verifiedStaff:{id:'staff-1',role},
    requestId:id,decision:'approved'});
  }finally{await app.close();}
 }
});
test('F12 decision rejects destination, reason, invalid ID and invalid decision before service',async()=>{
 const {app,calls}=setup();
 await app.ready();
 try{
  for(const payload of [
   {requestId:id,decision:'approved',destinationTableId:id},
   {requestId:id,decision:'rejected',reason:'x'},
   {requestId:'forged',decision:'approved'},
   {requestId:id,decision:'pending'},
   {requestId:id,decision:'approved',staffId:'forged'},[]
  ]){
   const response=await post(app,payload);
   assert.equal(response.statusCode,400);
   assert.deepEqual(response.json(),{error:'invalid_table_change_decision'});
  }
  assert.equal(calls.length,0);
  const unsupported=await post(app,'{}',{'content-type':'text/plain'});
  assert.equal(unsupported.statusCode,415);
 }finally{await app.close();}
});
test('F12 decision maps expiry, missing request and staff revocation without leaking SQL errors',async()=>{
 for(const [failure,status,error] of [
  ['table_change_request_not_pending',409,'table_change_request_not_pending'],
  ['table_change_request_not_found',404,'table_change_request_not_found'],
  ['table_change_unauthorized',403,'forbidden'],
  ['secret_internal_sql_error',503,'table_change_unavailable']
 ]){
  const {app}=setup({failure});await app.ready();
  try{
   const response=await post(app,{requestId:id,decision:'rejected'});
   assert.equal(response.statusCode,status);
   assert.deepEqual(response.json(),{error});
   assert.equal(response.headers['cache-control'],'no-store');
   assert.equal(response.body.includes('secret_internal_sql_error'),false);
  }finally{await app.close();}
 }
});

test('F12 decision response never exposes private store metadata',async()=>{
 const app=Fastify({logger:false});
 registerTableChangeStaffHttp(app,{
  forRoles:()=>async request=>{request.verifiedIdentity={id:'staff-1'};
   request.verifiedStaff={id:'staff-1',role:'waiter'};},
  service:{decide:async input=>({request:{
   id:input.requestId,status:input.decision,customerId:'private-customer',
   accountId:'private-account',sourceTableId:'private-table',
   visitKey:'private-visit',decidedBy:'private-staff'},
   secret:'private-secret'})}
 });
 await app.ready();
 try{
  const response=await post(app,{requestId:id,decision:'approved'});
  assert.equal(response.statusCode,200);
  assert.deepEqual(response.json(),{requestId:id,status:'approved'});
  assert.equal(response.body.includes('private-'),false);
 }finally{await app.close();}
});
test('F12 decision fails closed on inconsistent persisted result',async()=>{
 const app=Fastify({logger:false});
 registerTableChangeStaffHttp(app,{
  forRoles:()=>async request=>{request.verifiedIdentity={id:'staff-1'};
   request.verifiedStaff={id:'staff-1',role:'waiter'};},
  service:{decide:async()=>({request:{id, status:'pending'}})}
 });
 await app.ready();
 try{
  const response=await post(app,{requestId:id,decision:'approved'});
  assert.equal(response.statusCode,503);
  assert.deepEqual(response.json(),{error:'table_change_unavailable'});
 }finally{await app.close();}
});
