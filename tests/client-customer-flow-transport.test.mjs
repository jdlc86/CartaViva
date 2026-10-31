import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerFlowTransport,CustomerFlowTransportError}
 from '../apps/client/src/customer-flow-transport.ts';

const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

test('customer PWA transport uses server-only same-origin cookies and never bearer tokens',async()=>{
 const calls=[];
 const transport=createCustomerFlowTransport({fetchImpl:async(path,init)=>{
  calls.push({path,init});
  if(path.endsWith('/session'))return json(200,{authenticated:true,publicId:'SB-23456789ABCD',alias:'Ana',company:null});
  if(path.endsWith('/register'))return json(201,{publicId:'SB-23456789ABCD',alias:'Ana',company:null});
  if(path.endsWith('/logout'))return json(200,{revoked:true});
  throw Error('unexpected');
 }});
 assert.equal((await transport.session()).alias,'Ana');
 assert.equal((await transport.register({alias:'Ana',company:null})).publicId,'SB-23456789ABCD');
 assert.equal(await transport.logout(),true);
 for(const call of calls){
  assert.equal(call.init.credentials,'same-origin');
  assert.equal(call.init.redirect,'error');
  assert.equal(call.init.headers.Authorization,undefined);
 }
});

test('customer PWA transport fails closed on malformed and rejected responses',async()=>{
 const transport=createCustomerFlowTransport({fetchImpl:async()=>json(401,{error:'unauthorized'})});
 await assert.rejects(transport.session(),error=>error instanceof CustomerFlowTransportError&&
  error.message==='unauthorized'&&error.status===401);
 const malformed=createCustomerFlowTransport({fetchImpl:async()=>json(200,{authenticated:true,publicId:'bad'})});
 await assert.rejects(malformed.session(),/customer_flow_unavailable/);
});

test('customer PWA visit transport accepts only the canonical QR V1 token',async()=>{
 const tableId='ca710000-0000-4000-8000-000000000001';
 const token='A'.repeat(43);const calls=[];
 const transport=createCustomerFlowTransport({fetchImpl:async(path,init)=>{
  calls.push({path,body:JSON.parse(init.body)});
  return json(201,{tableId,visitId:'10000000-0000-4000-8000-000000000007',
   basketId:'10000000-0000-4000-8000-000000000008',expiresAt:'2026-10-27T23:00:00.000Z'});
 }});
 assert.equal((await transport.authorizeVisit({tableId,qrToken:token})).tableId,tableId);
 assert.deepEqual(calls,[{path:'/api/v1/customer/visits',body:{tableId,qrToken:token}}]);
 for(const qrToken of ['A'.repeat(42),'A'.repeat(44),'A'.repeat(42)+'B','+'.repeat(43)])
  await assert.rejects(transport.authorizeVisit({tableId,qrToken}),/invalid_customer_visit_transport/);
 await assert.rejects(transport.authorizeVisit({tableId:tableId.toUpperCase(),qrToken:token}),
  /invalid_customer_visit_transport/);
 assert.equal(calls.length,1);
});

test('F12 PWA table-change request uses empty payload and never requires economic account ID',async()=>{
 const id='10000000-0000-4000-8000-000000000001';
 const table='10000000-0000-4000-8000-000000000002';
 const calls=[];
 const transport=createCustomerFlowTransport({fetchImpl:async(path,init)=>{
  calls.push({path,init});
  return json(201,{id,status:'pending',sourceTableId:table,
   createdAtMs:1000,expiresAtMs:91000,accountId:'private-account'});
 }});
 const result=await transport.requestTableChange();
 assert.deepEqual(result,{requestId:id,sourceTableId:table,status:'pending',
  createdAtMs:1000,expiresAtMs:91000});
 assert.deepEqual(calls.map(c=>[c.path,JSON.parse(c.init.body)]),
  [['/api/v1/customer/table-change/requests',{}]]);
 assert.equal(calls[0].init.credentials,'same-origin');
 assert.equal(Object.hasOwn(result,'accountId'),false);
});
test('F12 PWA rejects malformed table-change responses and propagates cooldown conflict',async()=>{
 const table='10000000-0000-4000-8000-000000000002';
 const bad=createCustomerFlowTransport({fetchImpl:async()=>json(201,{
  id:'invalid',status:'pending',sourceTableId:table,createdAtMs:1000,expiresAtMs:91000})});
 await assert.rejects(bad.requestTableChange(),/customer_flow_unavailable/);
 const locked=createCustomerFlowTransport({fetchImpl:async()=>json(409,{error:'table_change_request_locked'})});
 await assert.rejects(locked.requestTableChange(),error=>
  error instanceof CustomerFlowTransportError&&error.status===409&&
  error.message==='table_change_request_locked');
});
