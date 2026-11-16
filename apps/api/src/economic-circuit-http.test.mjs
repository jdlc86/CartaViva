import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerEconomicCircuitHttp} from './economic-circuit-http.mjs';
import {createCustomerFlowTransport} from '../../client/src/customer-flow-transport.ts';

const requireApi=createRequire(new URL('../package.json',import.meta.url));
const Fastify=requireApi('fastify');
const origin='https://sabora.example';
const cookie='__Secure-sabora_customer='+'s'.repeat(43);
const tableId='61000000-0000-4000-8000-000000000001';
const sessionId='61000000-0000-4000-8000-000000000002';
const accountId='61000000-0000-4000-8000-000000000003';
const roundId='61000000-0000-4000-8000-000000000004';
const intentId='61000000-0000-4000-8000-000000000005';
const staffId='61000000-0000-4000-8000-000000000006';
const visitId='economic_visit_0001';
const requestKey='economic_request_0001';

const fixture=()=>({version:2,notice:'Operational consumption only',items:[{
 accountId,customerCode:'SB-23456789ABCD',customerAlias:'Ana',own:true,
 netConsumptionCents:2200,outstandingCents:2200,
 rounds:[{roundId,amountCents:2200}]
}],pendingSettlements:[{intentId,requestKey,channel:'stripe',
 state:'stripe_authorization_unknown',amountCents:2200,
 createdAt:'2026-11-15T10:00:00.000Z',allocations:[{roundId,amountCents:2200}]}]});

function createApp(){
 const calls=[];
 const app=Fastify({logger:false});
 const cookieAuth={
  requireSameOrigin(request,reply){
   if(request.headers.origin!==origin){reply.code(403).send({error:'origin_not_allowed'});return false;}
   return true;
  },
  async authenticate(request,reply){
   if(request.headers.cookie!==cookie)return reply.code(401).send({error:'unauthorized'});
   request.customerIdentity={publicId:'SB-23456789ABCD'};
  }
 };
 const customer={
  async consumption(value){calls.push({kind:'consumption',value});return fixture();},
  async create(value){
   calls.push({kind:'create',value});
   return {version:2,intentId,channel:value.channel,state:value.channel==='stripe'
    ?'stripe_authorization_requested':'external_pending',amountCents:2200,repeated:false,
    ...(value.channel==='stripe'?{authorizationKey:'h6_auth_economic_http_0001'}:{})};
  }
 };
 const service={async authorizeAndCapture(value){calls.push({kind:'provider',value});
  return {...value,state:'stripe_captured'};}};
 const staffRepository={
  async read(value){calls.push({kind:'read',value});return {version:2,items:[]};},
  async verifyExternal(value,input){calls.push({kind:'verify',value,input});
   return {version:2,intentId,state:'external_verified',repeated:false};},
  async closeTable(value,input){calls.push({kind:'close',value,input});
   return {version:2,tableId,sessionId,state:'settled',repeated:false};}
 };
 const forRoles=roles=>async(request,reply)=>{
  const role=request.headers['x-test-role'];
  if(!roles.includes(role))return reply.code(403).send({error:'forbidden'});
  request.verifiedIdentity={userId:staffId};request.verifiedStaff={userId:staffId,role};
 };
 registerEconomicCircuitHttp(app,{cookieAuth,forRoles,customer,staffRepository,service});
 return {app,calls};
}

test('economic HTTP and actual PWA transport recover the same durable request without private detail',async()=>{
 const {app,calls}=createApp();await app.ready();
 try{
  const transport=createCustomerFlowTransport({fetchImpl:async(path,init)=>{
   const result=await app.inject({method:init.method,url:path,
    headers:{...init.headers,cookie,origin},payload:init.body});
   return new Response(result.body,{status:result.statusCode,
    headers:{'content-type':result.headers['content-type']??'application/json'}});
  }});
  const value=await transport.economicConsumption({tableId,visitId});
  assert.equal(value.pendingSettlements[0].requestKey,requestKey);
  assert.deepEqual(value.pendingSettlements[0].allocations,[{roundId,amountCents:2200}]);
  assert.equal(JSON.stringify(value).includes('order'),false);
  assert.equal(calls[0].value.customerSessionToken,'s'.repeat(43));

  const captured=await transport.createEconomicSettlement({tableId,visitId,requestKey,
   channel:'stripe',allocations:[{roundId,amountCents:2200}]});
  assert.equal(captured.state,'stripe_captured');
  assert.deepEqual(calls.map(x=>x.kind),['consumption','create','provider']);

  const denied=await app.inject({method:'POST',url:'/api/v1/customer/economic/consumption',
   headers:{cookie,origin:'https://attacker.example','content-type':'application/json'},
   payload:{tableId,visitId}});
  assert.equal(denied.statusCode,403);
  assert.equal(calls.length,3);
 }finally{await app.close();}
});

test('economic HTTP keeps external verification and table closure as signed operational acts',async()=>{
 const {app,calls}=createApp();await app.ready();
 const staffHeaders={'content-type':'application/json','x-test-role':'waiter'};
 try{
  const external=await app.inject({method:'POST',url:'/api/v1/customer/economic/settlements',
   headers:{cookie,origin,'content-type':'application/json'},payload:{tableId,visitId,
    requestKey:'economic_external_0001',channel:'external',allocations:[{roundId,amountCents:2200}]}});
  assert.equal(external.statusCode,201);
  assert.equal(external.json().state,'external_pending');
  assert.equal(calls.some(x=>x.kind==='provider'),false,'external channel must not call a money API');

  const verified=await app.inject({method:'POST',
   url:`/api/v1/operations/economic/settlements/${intentId}/external-verification`,
   headers:staffHeaders,payload:{correlationId:'economic_verify_0001',verifiedOutsideSabora:true}});
  assert.equal(verified.statusCode,200);
  assert.equal(verified.json().state,'external_verified');

  const closed=await app.inject({method:'POST',
   url:`/api/v1/operations/economic/tables/${tableId}/sessions/${sessionId}/close`,
   headers:staffHeaders,payload:{correlationId:'economic_close_0001',operationalOnly:true}});
  assert.equal(closed.statusCode,200);
  assert.equal(closed.json().state,'settled');
  assert.deepEqual(calls.find(x=>x.kind==='close').input,{tableId,sessionId,
   correlationId:'economic_close_0001'});

  const kitchen=await app.inject({method:'POST',
   url:`/api/v1/operations/economic/tables/${tableId}/sessions/${sessionId}/close`,
   headers:{...staffHeaders,'x-test-role':'kitchen'},
   payload:{correlationId:'economic_close_0002',operationalOnly:true}});
  assert.equal(kitchen.statusCode,403);
 }finally{await app.close();}
});
