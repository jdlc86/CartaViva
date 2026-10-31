import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createSealedTableChangeRpcCandidate,REQUEST_TABLE_CHANGE_H6_SQL,
 DECIDE_TABLE_CHANGE_H6_SQL} from './table-change-sealed-rpc-candidate.mjs';
import {registerCustomerProductionFlowHttp} from './customer-production-http.mjs';
import {registerTableChangeStaffHttp} from './table-change-http-candidate.mjs';

const requireApi=createRequire(new URL('../package.json',import.meta.url));
const Fastify=requireApi('fastify');
const requestId='22222222-2222-4222-8222-222222222222';
const accountId='11111111-1111-4111-8111-111111111111';
const staffId='33333333-3333-4333-8333-333333333333';
const cookie='__Secure-sabora_customer='+'s'.repeat(43);
const origin='https://sabora.example';
const expiry='2026-11-01T00:00:00Z';
const requestPath='/api/v1/customer/table-change/requests';
const decisionPath='/api/v1/operations/table-change/decisions';

test('F12 sealed RPC HTTP request/decision contract preserves permissions, cooldown and privacy',async()=>{
 const sqlCalls=[];
 let state='none';
 const query=async(sql,args)=>{
  sqlCalls.push({sql,args});
  if(sql===REQUEST_TABLE_CHANGE_H6_SQL){
   if(state!=='none')throw Object.assign(Error('table_change_cooldown'),{code:'23514'});
   state='pending';
   return {rows:[{request_id:requestId,request_status:state,expires_at:expiry}]};
  }
  if(sql===DECIDE_TABLE_CHANGE_H6_SQL){
   if(state!=='pending')throw Object.assign(Error('table_change_already_decided'),{code:'23514'});
   state=args[2]?'approved':'rejected';
   return {rows:[{status:state}]};
  }
  throw Error('unexpected_query');
 };
 const service=createSealedTableChangeRpcCandidate({
  withCustomerTransaction:fn=>fn(query),withStaffTransaction:fn=>fn(query),
  hashSession:async token=>{
   assert.equal(token,'s'.repeat(43));
   return Buffer.alloc(32,17);
  },
  resolveAccount:async()=>({accountId,closed:false}),
  verifyStaff:async({verifiedIdentity,verifiedStaff})=>{
   assert.equal(verifiedIdentity.id,'staff-authenticated');
   assert.equal(verifiedStaff.role,'waiter');
   return {userId:staffId,role:'waiter'};
  }
 });
 const cookieAuth={
  requireSameOrigin(request,reply){
   if(request.headers.origin!==origin){reply.code(403).send({error:'origin_not_allowed'});return false;}
   return true;
  },
  async authenticate(request,reply){
   if(request.headers.cookie!==cookie)return reply.code(401).send({error:'unauthorized'});
   request.customerIdentity={publicId:'SB-23456789ABCD',alias:'Ana'};
  },
  logout:async()=>{}
 };
 const app=Fastify({logger:false});
 registerCustomerProductionFlowHttp(app,{cookieAuth,tableChange:service,
  flow:{authorizeVisit:async()=>{},quote:async()=>{},confirm:async()=>{}}});
 registerTableChangeStaffHttp(app,{service,
  forRoles:roles=>async(request,reply)=>{
   const role=request.headers['x-test-role'];
   if(!roles.includes(role))return reply.code(403).send({error:'forbidden'});
   request.verifiedIdentity={id:'staff-authenticated'};
   request.verifiedStaff={role};
  }
 });
 await app.ready();
 const customerHeaders={cookie,origin,'content-type':'application/json'};
 const decisionHeaders={'content-type':'application/json','x-test-role':'waiter'};
 try{
  const noCookie=await app.inject({method:'POST',url:requestPath,
   headers:{origin,'content-type':'application/json'},payload:{}});
  assert.equal(noCookie.statusCode,401);
  const badOrigin=await app.inject({method:'POST',url:requestPath,
   headers:{...customerHeaders,origin:'https://attacker.example'},payload:{}});
  assert.equal(badOrigin.statusCode,403);
  const invalid=await app.inject({method:'POST',url:requestPath,
   headers:customerHeaders,payload:{destinationTableId:accountId}});
  assert.equal(invalid.statusCode,400);
  assert.equal(sqlCalls.length,0);
  const requested=await app.inject({method:'POST',url:requestPath,
   headers:customerHeaders,payload:{}});
  assert.equal(requested.statusCode,201);
  assert.deepEqual(requested.json(),{id:requestId,status:'pending',expiresAtMs:Date.parse(expiry)});
  assert.equal(requested.body.includes(accountId),false);
  assert.equal(requested.headers['cache-control'],'no-store');
  const denied=await app.inject({method:'POST',url:decisionPath,
   headers:{...decisionHeaders,'x-test-role':'kitchen'},
   payload:{requestId,decision:'approved'}});
  assert.equal(denied.statusCode,403);
  const approved=await app.inject({method:'POST',url:decisionPath,
   headers:decisionHeaders,payload:{requestId,decision:'approved'}});
  assert.equal(approved.statusCode,200);
  assert.deepEqual(approved.json(),{requestId,status:'approved'});
  assert.equal(approved.body.includes(staffId),false);
  const replay=await app.inject({method:'POST',url:decisionPath,
   headers:decisionHeaders,payload:{requestId,decision:'approved'}});
  assert.equal(replay.statusCode,409,'known decided conflict maps to 409');
  const duplicate=await app.inject({method:'POST',url:requestPath,
   headers:customerHeaders,payload:{}});
  assert.equal(duplicate.statusCode,409,'known cooldown maps to 409');
  assert.equal(state,'approved','approval must not move the economic account');
  assert.deepEqual(sqlCalls.map(x=>x.sql),[
   REQUEST_TABLE_CHANGE_H6_SQL,DECIDE_TABLE_CHANGE_H6_SQL,
   DECIDE_TABLE_CHANGE_H6_SQL,REQUEST_TABLE_CHANGE_H6_SQL
  ]);
  assert.deepEqual(sqlCalls[1].args,[staffId,requestId,true]);
 }finally{await app.close();}
});
