import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerCustomerProductionFlowHttp} from '../apps/api/src/customer-production-http.mjs';

const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const cookie='__Secure-sabora_customer='+'s'.repeat(43);

test('production customer HTTP flow requires cookie and same-origin then exposes only safe results',async()=>{
 const seen=[];
 const cookieAuth={
  requireSameOrigin(request,reply){if(request.headers.origin!=='https://sabora.example'){
   reply.code(403).send({error:'origin_not_allowed'});return false;}return true;},
  async authenticate(request,reply){if(request.headers.cookie!==cookie){reply.code(401).send({error:'unauthorized'});return;}
   request.customerIdentity={customerId:'internal',publicId:'SB-23456789ABCD',alias:'Ana',company:null};},
  async logout(_request,reply){return reply.send({revoked:true});}
 };
 const flow={
  authorizeVisit:async input=>{seen.push(input);return {tableId:input.tableId,
   visitId:'visit_key_0000001',basketId:'basket_key_000001',expiresAt:'2026-10-27T00:00:00.000Z'};},
  quote:async()=>({lines:[]}),
  confirm:async()=>({status:'confirmed',orderId:'10000000-0000-4000-8000-000000000001',grouping:'first'})
 };
 const app=Fastify({logger:false});registerCustomerProductionFlowHttp(app,{cookieAuth,flow});await app.ready();
 try{
  const missing=await app.inject({method:'POST',url:'/api/v1/customer/visits',
   headers:{origin:'https://sabora.example','content-type':'application/json'},
   payload:{tableId:'10000000-0000-4000-8000-000000000001',qrToken:'A'.repeat(43)}});
  assert.equal(missing.statusCode,401);
  const cross=await app.inject({method:'POST',url:'/api/v1/customer/visits',
   headers:{cookie,origin:'https://evil.example','content-type':'application/json'},payload:{}});
  assert.equal(cross.statusCode,403);assert.equal(seen.length,0);
  const success=await app.inject({method:'POST',url:'/api/v1/customer/visits',
   headers:{cookie,origin:'https://sabora.example','content-type':'application/json'},
   payload:{tableId:'10000000-0000-4000-8000-000000000001',qrToken:'A'.repeat(43)}});
  assert.equal(success.statusCode,201);
  assert.equal(seen[0].customerSessionToken,'s'.repeat(43));
  assert.equal(success.body.includes('internal'),false);
  assert.equal(success.body.includes('s'.repeat(43)),false);
  const session=await app.inject({url:'/api/v1/customer/session',headers:{cookie}});
  assert.deepEqual(session.json(),{authenticated:true,publicId:'SB-23456789ABCD',alias:'Ana',company:null});
 }finally{await app.close();}
});

test('acceptance challenge is explicit and does not persist internal evidence in HTTP response',async()=>{
 const cookieAuth={requireSameOrigin:()=>true,authenticate:async request=>{request.customerIdentity={
  customerId:'internal',publicId:'SB-23456789ABCD',alias:'Ana',company:null};},logout:async()=>{}};
 const flow={authorizeVisit:async()=>{},quote:async()=>{},confirm:async()=>({
  status:'acceptance_required',changes:[{itemId:'10000000-0000-4000-8000-000000000001',
   previousTotalCents:100,currentTotalCents:90,previousPublishedRevision:1,currentPublishedRevision:2}],
  acceptance:{token:'bv1.1000.'+'a'.repeat(64)+'.'+'b'.repeat(64),expiresAt:1000},
  privateEvidence:{secret:true}
 })};
 const app=Fastify({logger:false});registerCustomerProductionFlowHttp(app,{cookieAuth,flow});await app.ready();
 try{
  const result=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
   headers:{origin:'https://sabora.example','content-type':'application/json',cookie},payload:{}});
  assert.equal(result.statusCode,409);assert.equal(result.json().error,'acceptance_required');
  assert.equal(result.body.includes('privateEvidence'),false);
 }finally{await app.close();}
});

test('malformed backend results remain an unavailable service, not a client validation error',async()=>{
 const cookieAuth={requireSameOrigin:()=>true,authenticate:async request=>{request.customerIdentity={
  customerId:'internal',publicId:'SB-23456789ABCD',alias:'Ana',company:null};},logout:async()=>{}};
 const flow={authorizeVisit:async()=>{throw Error('invalid_customer_flow_result');},
  quote:async()=>{},confirm:async()=>{}};
 const app=Fastify({logger:false});registerCustomerProductionFlowHttp(app,{cookieAuth,flow});await app.ready();
 try{
  const result=await app.inject({method:'POST',url:'/api/v1/customer/visits',
   headers:{origin:'https://sabora.example','content-type':'application/json',cookie},payload:{}});
  assert.equal(result.statusCode,503);
  assert.deepEqual(result.json(),{error:'customer_flow_unavailable'});
 }finally{await app.close();}
});

test('F12 confirmation rejects missing grant or conflicting economic binding without leaking internals',async()=>{
 const cookieAuth={requireSameOrigin:request=>request.headers.origin==='https://sabora.example',
  authenticate:async request=>{request.customerIdentity={
   customerId:'internal',publicId:'SB-23456789ABCD',alias:'Ana',company:null};},
  logout:async()=>{}};
 const denied=['table_change_approval_required','h6_account_binding_scope_conflict',
  'h6_multiple_open_accounts_ambiguous','h6_replay_account_scope_conflict'];
 for(const reason of denied){
  const flow={authorizeVisit:async()=>{},quote:async()=>{},
   confirm:async()=>{throw Error(reason);}};
  const app=Fastify({logger:false});
  registerCustomerProductionFlowHttp(app,{cookieAuth,flow});
  await app.ready();
  try{
   const result=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
    headers:{origin:'https://sabora.example','content-type':'application/json',cookie},
    payload:{}});
   assert.equal(result.statusCode,409,reason);
   assert.deepEqual(result.json(),{error:'table_change_confirmation_conflict'},reason);
   assert.equal(result.body.includes(reason),false,'do not expose SQL error detail');
  }finally{await app.close();}
 }
});

test('F12 request HTTP enforces authenticated same-origin empty-body contract and redacted cooldown',async()=>{
 const seen=[];
 const cookieAuth={
  requireSameOrigin(request,reply){if(request.headers.origin!=='https://sabora.example'){
   reply.code(403).send({error:'origin_not_allowed'});return false;}return true;},
  async authenticate(request,reply){if(request.headers.cookie!==cookie){
   reply.code(401).send({error:'unauthorized'});return;}
   request.customerIdentity={customerId:'internal',publicId:'SB-23456789ABCD',alias:'Ana',company:null};},
  logout:async()=>{}
 };
 let denied=false;
 const tableChange={request:async value=>{seen.push(value);if(denied)throw Error('table_change_request_locked');
  return {id:'request-1',status:'pending',sourceTableId:'table-A',
   createdAtMs:1000,expiresAtMs:91000,accountId:'private-account'};}};
 const flow={authorizeVisit:async()=>{},quote:async()=>{},confirm:async()=>{}};
 const app=Fastify({logger:false});
 registerCustomerProductionFlowHttp(app,{cookieAuth,flow,tableChange});
 await app.ready();
 const call=(headers,payload)=>app.inject({method:'POST',url:'/api/v1/customer/table-change/requests',
  headers,payload});
 const validHeaders={cookie,origin:'https://sabora.example','content-type':'application/json'};
 try{
  assert.equal((await call({origin:'https://sabora.example','content-type':'application/json'},{})).statusCode,401);
  assert.equal((await call({...validHeaders,origin:'https://evil.example'},{})).statusCode,403);
  assert.equal((await call({...validHeaders,'content-type':'text/plain'},'{}')).statusCode,415);
  for(const payload of [{destinationTableId:'table-B'},{reason:'moving'},{accountId:'forged'},[]]){
   const result=await call(validHeaders,payload);
   assert.equal(result.statusCode,400);
   assert.deepEqual(result.json(),{error:'invalid_customer_request'});
  }
  assert.equal(seen.length,0,'invalid requests must never invoke the store');
  const ok=await call(validHeaders,{});
  assert.equal(ok.statusCode,201);
  assert.equal(ok.headers['cache-control'],'no-store');
  assert.equal(Object.hasOwn(ok.json(),'accountId'),false);
  assert.deepEqual(seen,[{customerSessionToken:'s'.repeat(43)}]);
  denied=true;
  const cooldown=await call(validHeaders,{});
  assert.equal(cooldown.statusCode,409);
  assert.deepEqual(cooldown.json(),{error:'table_change_request_locked'});
  assert.equal(cooldown.body.includes('table-A'),false);
 }finally{await app.close();}
});
