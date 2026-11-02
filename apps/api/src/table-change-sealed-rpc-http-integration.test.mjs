import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createSealedTableChangeRpcCandidate,REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,
 DECIDE_TABLE_CHANGE_H6_SQL} from './table-change-sealed-rpc-candidate.mjs';
import {registerCustomerProductionFlowHttp} from './customer-production-http.mjs';
import {registerTableChangeStaffHttp} from './table-change-http-candidate.mjs';
import {mountVerifiedTableChangeB3HttpCandidate} from './table-change-b3-http-composition-candidate.mjs';
import {createCustomerFlowTransport} from '../../client/src/customer-flow-transport.ts';

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
  if(sql===REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL){
   assert.deepEqual(args,[Buffer.alloc(32,17)],'resolved request must bind only the session hash');
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
  // Exercise the actual PWA transport against the real Fastify response shape,
  // not a hand-authored fixture with optional private account/table metadata.
  const transport=createCustomerFlowTransport({fetchImpl:async(path,init)=>{
   const result=await app.inject({method:init.method,url:path,
    headers:{...init.headers,cookie,origin},payload:init.body});
   return new Response(result.body,{status:result.statusCode,
    headers:{'content-type':result.headers['content-type']??'application/json'}});
  }});
  await assert.rejects(transport.requestTableChange(),error=>
   error.status===409&&error.message==='table_change_request_locked');

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
   REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,
   DECIDE_TABLE_CHANGE_H6_SQL,DECIDE_TABLE_CHANGE_H6_SQL,
   REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL
  ]);
  assert.deepEqual(sqlCalls[2].args,[staffId,requestId,true]);
 }finally{await app.close();}
});


test('F12 PWA receives minimal successful table-change receipt from sealed HTTP endpoint',async()=>{
 const query=async(sql,args)=>{
  assert.equal(sql,REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL);
  assert.deepEqual(args,[Buffer.alloc(32,17)]);
  return {rows:[{request_id:requestId,request_status:'pending',expires_at:expiry}]};
 };
 const service=createSealedTableChangeRpcCandidate({
  withCustomerTransaction:fn=>fn(query),withStaffTransaction:fn=>fn(query),
  hashSession:async()=>Buffer.alloc(32,17),
  verifyStaff:async()=>({userId:staffId,role:'waiter'})
 });
 const app=Fastify({logger:false});
 registerCustomerProductionFlowHttp(app,{
  cookieAuth:{
   requireSameOrigin(request,reply){
    if(request.headers.origin!==origin){reply.code(403).send({error:'origin_not_allowed'});return false;}
    return true;
   },
   async authenticate(request,reply){
    if(request.headers.cookie!==cookie)return reply.code(401).send({error:'unauthorized'});
    request.customerIdentity={publicId:'SB-23456789ABCD',alias:'Ana'};
   },
   logout:async()=>{}
  },
  tableChange:service,
  flow:{authorizeVisit:async()=>{},quote:async()=>{},confirm:async()=>{}}
 });
 await app.ready();
 try{
  const transport=createCustomerFlowTransport({fetchImpl:async(path,init)=>{
   const result=await app.inject({method:init.method,url:path,
    headers:{...init.headers,cookie,origin},payload:init.body});
   return new Response(result.body,{status:result.statusCode,
    headers:{'content-type':result.headers['content-type']??'application/json'}});
  }});
  assert.deepEqual(await transport.requestTableChange(),{
   requestId,status:'pending',expiresAtMs:Date.parse(expiry)
  });
 }finally{await app.close();}
});

test('B3 HTTP A-to-B approval is inert until confirmed checkout and replay is economically idempotent',async()=>{
 const events=[];
 const economic={table:'A',accountId,amount:1200,rounds:1,approval:'none'};
 const query=async(sql,args)=>{
  if(sql===REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL){
   if(economic.approval!=='none')throw Error('table_change_request_locked');
   economic.approval='pending';events.push('request');
   return {rows:[{request_id:requestId,request_status:'pending',expires_at:expiry}]};
  }
  if(sql===DECIDE_TABLE_CHANGE_H6_SQL){
   if(economic.approval!=='pending')throw Error('table_change_already_decided');
   economic.approval=args[2]?'approved':'rejected';events.push('decision');
   return {rows:[{status:economic.approval}]};
  }
  throw Error('unexpected_sql');
 };
 const tableChange=createSealedTableChangeRpcCandidate({
  withCustomerTransaction:fn=>fn(query),withStaffTransaction:fn=>fn(query),
  hashSession:async()=>Buffer.alloc(32,17),
  verifyStaff:async()=>({userId:staffId,role:'waiter'})
 });
 const flow={authorizeVisit:async()=>({}),quote:async()=>({}),
  confirm:async({requestKey})=>{
   if(economic.approval!=='approved')throw Error('table_change_approval_required');
   if(requestKey!=='b3_confirm_request_0001')throw Error('invalid_customer_flow_input');
   if(economic.table==='A'){
    economic.table='B';economic.amount+=700;economic.rounds++;events.push('checkout');
   }else events.push('replay');
   return {status:'confirmed',orderId:'44444444-4444-4444-8444-444444444444',
    grouping:'first',accountId:economic.accountId,
    roundId:'55555555-5555-4555-8555-555555555555',amountCents:700,
    paymentMode:'pay_at_end',roundState:'grouping'};
  }
 };
 const cookieAuth={
  requireSameOrigin(request,reply){if(request.headers.origin!==origin){reply.code(403).send({error:'origin_not_allowed'});return false;}return true;},
  async authenticate(request,reply){if(request.headers.cookie!==cookie)return reply.code(401).send({error:'unauthorized'});request.customerIdentity={publicId:'SB-23456789ABCD',alias:'Ana'};},
  logout:async()=>{}
 };
 const app=Fastify({logger:false});
 registerCustomerProductionFlowHttp(app,{cookieAuth,flow,tableChange});
 registerTableChangeStaffHttp(app,{service:tableChange,
  forRoles:roles=>async(request,reply)=>{
   const role=request.headers['x-test-role'];
   if(!roles.includes(role))return reply.code(403).send({error:'forbidden'});
   request.verifiedIdentity={id:'staff-authenticated'};
   request.verifiedStaff={role};
  }});
 await app.ready();
 const headers={cookie,origin,'content-type':'application/json'};
 const confirm=()=>app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
  headers,payload:{requestKey:'b3_confirm_request_0001'}});
 try{
  const before=await confirm();
  assert.equal(before.statusCode,409);
  assert.deepEqual(economic,{table:'A',accountId,amount:1200,rounds:1,approval:'none'});
  const requested=await app.inject({method:'POST',url:requestPath,headers,payload:{}});
  assert.equal(requested.statusCode,201);
  const kitchen=await app.inject({method:'POST',url:decisionPath,
   headers:{'content-type':'application/json','x-test-role':'kitchen'},
   payload:{requestId,decision:'approved'}});
  assert.equal(kitchen.statusCode,403);
  assert.equal(economic.approval,'pending');
  const approved=await app.inject({method:'POST',url:decisionPath,
   headers:{'content-type':'application/json','x-test-role':'waiter'},
   payload:{requestId,decision:'approved'}});
  assert.equal(approved.statusCode,200);
  assert.deepEqual(economic,{table:'A',accountId,amount:1200,rounds:1,approval:'approved'});
  const first=await confirm();
  assert.equal(first.statusCode,201);
  assert.equal(first.json().accountId,accountId);
  assert.equal(economic.table,'B');
  assert.equal(economic.amount,1900);
  assert.equal(economic.rounds,2);
  const replay=await confirm();
  assert.equal(replay.statusCode,201);
  assert.equal(replay.json().orderId,first.json().orderId);
  assert.equal(economic.amount,1900);
  assert.equal(economic.rounds,2);
  assert.deepEqual(events,['request','decision','checkout','replay']);
 }finally{await app.close();}
});

test('B3 opt-in HTTP composition fails closed without five verified SQL identities',async()=>{
 const app=Fastify({logger:false});
 const cookieAuth={authenticate:async()=>{},requireSameOrigin:()=>true,logout:async()=>{}};
 try{
  await assert.rejects(mountVerifiedTableChangeB3HttpCandidate(app,{
   cookieAuth,forRoles:()=>async()=>{}
  }),/invalid_b3_customer_flow_isolation/);
  await app.ready();
  const customer=await app.inject({method:'POST',
   url:'/api/v1/customer/table-change/requests',payload:{}});
  const decision=await app.inject({method:'POST',
   url:'/api/v1/operations/table-change/decisions',payload:{}});
  const confirm=await app.inject({method:'POST',
   url:'/api/v1/customer/orders/confirm',payload:{}});
  assert.equal(customer.statusCode,404);
  assert.equal(decision.statusCode,404);
  assert.equal(confirm.statusCode,404);
 }finally{await app.close();}
});
