import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createTableChangeService} from './table-change-service.mjs';
import {registerTableChangeStaffHttp} from './table-change-http-candidate.mjs';
import {registerCustomerProductionFlowHttp} from './customer-production-http.mjs';

const requireApi=createRequire(new URL('../package.json',import.meta.url));
const Fastify=requireApi('fastify');
const requestId='10000000-0000-4000-8000-000000000001';
const sourceTableId='10000000-0000-4000-8000-000000000002';
const cookie='__Secure-sabora_customer='+'s'.repeat(43);
const origin='https://sabora.example';
const nowMs=Date.parse('2026-10-31T12:00:00Z');

test('F12 customer-to-waiter HTTP lifecycle shares one service and approval never transfers an account',async()=>{
 const calls=[];
 let current=null;
 const store={transaction:async(operation,handler)=>handler({
  lockCustomerAccount:async token=>{
   assert.equal(token,'s'.repeat(43));
   return {accountId:'internal-account',customerId:'internal-customer',
    visitId:'visit_1234567890123456',tableId:sourceTableId,closed:false};
  },
  serverNowMs:async()=>nowMs,
  expirePendingRequests:async()=>{},
  lockApprovedRequest:async()=>null,
  latestRequest:async()=>current,
  configuredWindowMs:async()=>90000,
  insertRequest:async input=>{
   calls.push({operation:'request',input});
   current={id:requestId,status:'pending',sourceTableId,
    createdAtMs:nowMs,expiresAtMs:nowMs+90000,
    accountId:input.accountId,customerId:input.customerId};
   return current;
  },
  requireWaiter:async({verifiedIdentity,verifiedStaff})=>{
   assert.equal(verifiedIdentity.id,'staff-1');
   assert.equal(verifiedStaff.role,'waiter');
   return {id:'staff-1',role:'waiter'};
  },
  lockRequest:async id=>id===requestId?current:null,
  recordDecision:async({request,staffId})=>{
   calls.push({operation:'decide',staffId});
   current={...request,accountId:'internal-account',customerId:'internal-customer'};
   return {request:current};
  },
  applyTransfer:async()=>{throw Error('transfer_must_not_occur_on_approval');}
 })};
 const service=createTableChangeService({store});
 const cookieAuth={
  requireSameOrigin(request,reply){
   if(request.headers.origin!==origin){reply.code(403).send({error:'origin_not_allowed'});return false;}
   return true;
  },
  authenticate:async(request,reply)=>{
   if(request.headers.cookie!==cookie){reply.code(401).send({error:'unauthorized'});return;}
   request.customerIdentity={publicId:'SB-23456789ABCD',alias:'Ana',company:null};
  },
  logout:async()=>{}
 };
 const app=Fastify({logger:false});
 registerCustomerProductionFlowHttp(app,{cookieAuth,tableChange:service,
  flow:{authorizeVisit:async()=>{},quote:async()=>{},confirm:async()=>{}}});
 registerTableChangeStaffHttp(app,{
  forRoles:roles=>async(request,reply)=>{
   if(request.headers['x-test-role']!=='waiter'||!roles.includes('waiter'))
    return reply.code(403).send({error:'forbidden'});
   request.verifiedIdentity={id:'staff-1'};
   request.verifiedStaff={id:'staff-1',role:'waiter'};
  },service
 });
 await app.ready();
 try{
  const customerHeaders={cookie,origin,'content-type':'application/json'};
  const unauthorized=await app.inject({method:'POST',url:'/api/v1/customer/table-change/requests',
   headers:{origin,'content-type':'application/json'},payload:{}});
  assert.equal(unauthorized.statusCode,401);
  const request=await app.inject({method:'POST',url:'/api/v1/customer/table-change/requests',
   headers:customerHeaders,payload:{}});
  assert.equal(request.statusCode,201);
  assert.deepEqual(request.json(),{id:requestId,status:'pending',sourceTableId,
   createdAtMs:nowMs,expiresAtMs:nowMs+90000});
  const duplicate=await app.inject({method:'POST',url:'/api/v1/customer/table-change/requests',
   headers:customerHeaders,payload:{}});
  assert.equal(duplicate.statusCode,409);
  const denied=await app.inject({method:'POST',url:'/api/v1/operations/table-change/decisions',
   headers:{'content-type':'application/json','x-test-role':'kitchen'},
   payload:{requestId,decision:'approved'}});
  assert.equal(denied.statusCode,403);
  const approved=await app.inject({method:'POST',url:'/api/v1/operations/table-change/decisions',
   headers:{'content-type':'application/json','x-test-role':'waiter'},
   payload:{requestId,decision:'approved'}});
  assert.equal(approved.statusCode,200);
  assert.deepEqual(approved.json(),{requestId,status:'approved'});
  assert.equal(current.status,'approved');
  assert.equal(current.destinationTableId,undefined);
  assert.deepEqual(calls.map(call=>call.operation),['request','decide']);
  assert.equal(request.body.includes('internal-account'),false);
  assert.equal(approved.body.includes('internal-customer'),false);
 }finally{await app.close();}
});
