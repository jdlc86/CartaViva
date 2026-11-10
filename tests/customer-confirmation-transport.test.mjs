import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerOrderConfirmationTransport} from '../packages/customer-consent/src/customer-confirmation-transport.mjs';
const orderId='11111111-1111-4111-8111-111111111111';
const request={requestKey:'request-001',basketId:'basket-1'};
const mock=(status,result)=>async()=>({status,json:async()=>result});
test('transport sends one no-store same-origin POST and preserves idempotency key',async()=>{
 const calls=[];
 const submit=createCustomerOrderConfirmationTransport({fetchImpl:async(...args)=>{
  calls.push(args);return {status:201,json:async()=>({status:'confirmed',orderId})};
 }});
 assert.deepEqual(await submit(request),{status:'confirmed',orderId});
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],'/api/v1/customer/orders/confirm');
 assert.equal(calls[0][1].method,'POST');
 assert.equal(calls[0][1].credentials,'same-origin');
 assert.equal(calls[0][1].cache,'no-store');
 assert.equal(calls[0][1].redirect,'error');
 assert.equal(JSON.parse(calls[0][1].body).requestKey,request.requestKey);
});
test('transport preserves bounded repricing challenge for explicit UI consent',async()=>{
 const result={error:'acceptance_required',repricing:{schemaVersion:1}};
 const submit=createCustomerOrderConfirmationTransport({fetchImpl:mock(409,result)});
 assert.deepEqual(await submit(request),result);
});
test('network ambiguity cannot claim success or regenerate correlation key',async()=>{
 const submit=createCustomerOrderConfirmationTransport({fetchImpl:async()=>{throw Error('offline');}});
 await assert.rejects(submit(request),/confirmation_network_unknown/);
 assert.equal(request.requestKey,'request-001');
});
test('invalid success response and unexpected status fail closed',async()=>{
 for(const [status,result] of [
  [201,{status:'confirmed',orderId:'not-a-uuid'}],
  [200,{status:'replayed',orderId}],
  [200,{status:'confirmed',orderId}],
  [201,{status:'replayed',orderId}],
  [302,{error:'redirect'}],
  [201,{status:'replayed',orderId:'not-a-uuid'}]
 ]){
  const submit=createCustomerOrderConfirmationTransport({fetchImpl:mock(status,result)});
  if(status===200&&result.status==='replayed')assert.deepEqual(await submit(request),result);
  else await assert.rejects(submit(request),/confirmation_unexpected_response/);
 }
});
test('unknown backend errors are hidden behind generic failure',async()=>{
 const submit=createCustomerOrderConfirmationTransport({fetchImpl:mock(503,{error:'private_db_error',sql:'secret'})});
 assert.deepEqual(await submit(request),{error:'order_confirmation_unavailable'});
});
