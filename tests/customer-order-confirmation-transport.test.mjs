import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const requireClient=createRequire(new URL('../apps/client/package.json',import.meta.url));
const ts=requireClient('typescript');
const source=await readFile(new URL('../apps/client/src/order-confirmation-transport.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,
 target:ts.ScriptTarget.ES2022}}).outputText;
const {confirmCustomerOrder}=await import('data:text/javascript;base64,'+
 Buffer.from(js).toString('base64'));
const orderId='00000000-0000-4000-8000-000000000005';
const payload={tableId:'00000000-0000-4000-8000-000000000001',
 visitId:'visit-001',basketId:'basket-001',actorId:'actor-001',
 itemId:'00000000-0000-4000-8000-000000000003',selection:{},quantity:1,
 requestKey:'request-001',qrToken:'q'.repeat(32),
 customerSessionToken:'s'.repeat(32)};
const response=(status,body,contentType='application/json')=>({
 status,headers:{get:name=>name==='content-type'?contentType:null},
 json:async()=>body
});
test('client confirmation sends one credential-free POST and accepts minimal 201',async()=>{
 const calls=[];
 const result=await confirmCustomerOrder({
  payload,fetchImpl:async(url,options)=>{
   calls.push({url,options});return response(201,{status:'confirmed',orderId});
  }
 });
 assert.deepEqual(result,{status:'confirmed',orderId});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'/api/v1/customer/orders/confirm');
 assert.equal(calls[0].options.credentials,'omit');
 assert.equal(calls[0].options.cache,'no-store');
 assert.equal(calls[0].options.redirect,'error');
 assert.equal(calls[0].options.method,'POST');
 assert.deepEqual(JSON.parse(calls[0].options.body),payload);
});
test('client confirmation accepts exact replay and explicit acceptance rejection',async()=>{
 assert.deepEqual(await confirmCustomerOrder({payload,
  fetchImpl:async()=>response(200,{status:'replayed',orderId})}),
  {status:'replayed',orderId});
 assert.deepEqual(await confirmCustomerOrder({payload,
  fetchImpl:async()=>response(409,{error:'acceptance_required'})}),
  {status:'rejected',error:'acceptance_required'});
});
test('client confirmation fails closed on inconsistent status, unexpected fields or media',async()=>{
 for(const [status,body,type] of [
  [201,{status:'replayed',orderId},'application/json'],
  [200,{status:'confirmed',orderId},'application/json'],
  [201,{status:'confirmed',orderId,privateEvidence:'leak'},'application/json'],
  [409,{error:'order_context_forbidden'},'application/json'],
  [503,{error:'acceptance_required'},'application/json'],
  [201,{status:'confirmed',orderId},'text/html'],
  [201,{status:'confirmed',orderId:'not-uuid'},'application/json']
 ]){
  assert.deepEqual(await confirmCustomerOrder({payload,
   fetchImpl:async()=>response(status,body,type)}),{status:'unavailable'});
 }
});
test('client confirmation never automatically retries transport failure',async()=>{
 let calls=0;
 assert.deepEqual(await confirmCustomerOrder({payload,
  fetchImpl:async()=>{calls++;throw Error('network');}}),{status:'unavailable'});
 assert.equal(calls,1);
});
test('client confirmation blocks external or ambiguous endpoint before network',async()=>{
 for(const endpoint of ['https://external.test/order','//external.test/order',
  '/api/v1/customer/orders/confirm?debug=true','/api#fragment']){
  let calls=0;
  await assert.rejects(()=>confirmCustomerOrder({payload,endpoint,
   fetchImpl:async()=>{calls++;return response(201,{status:'confirmed',orderId});}}),
   /invalid_customer_confirmation_transport/);
  assert.equal(calls,0);
 }
});

test('client confirmation rejects forged prices and incomplete authorization before POST',async()=>{
 for(const malicious of [
  {...payload,totalCents:1},{...payload,priceCents:1},
  {...payload,publishedRevision:99},
  {...payload,requestKey:'short'},
  {...payload,qrToken:'short'},
  {...payload,customerSessionToken:'short'},
  Object.fromEntries(Object.entries(payload).filter(([key])=>key!=='visitId'))
 ]){
  let calls=0;
  await assert.rejects(()=>confirmCustomerOrder({payload:malicious,
   fetchImpl:async()=>{calls++;return response(201,{status:'confirmed',orderId});}}),
   /invalid_customer_confirmation_transport/);
  assert.equal(calls,0);
 }
});

test('client confirmation forwards AbortSignal without retrying an aborted request',async()=>{
 const controller=new AbortController();
 let calls=0;
 const result=await confirmCustomerOrder({payload,signal:controller.signal,
  fetchImpl:async(_url,options)=>{
   calls++;
   assert.equal(options.signal,controller.signal);
   controller.abort();
   throw Error('aborted');
  }});
 assert.deepEqual(result,{status:'unavailable'});
 assert.equal(calls,1);
});
test('client confirmation maps every documented rejection to its exact HTTP status',async()=>{
 for(const [status,error] of [
  [400,'invalid_confirmation_input'],
  [403,'order_context_forbidden'],
  [409,'order_idempotency_conflict'],
  [409,'order_confirmation_conflict'],
  [409,'acceptance_required'],
  [503,'order_confirmation_unavailable']
 ]){
  assert.deepEqual(await confirmCustomerOrder({payload,
   fetchImpl:async()=>response(status,{error})}),{status:'rejected',error});
 }
});
test('client confirmation does not expose unexpected private server responses',async()=>{
 for(const data of [
  {error:'order_confirmation_unavailable',stack:'internal'},
  {error:'database_password'},
  {status:'confirmed',orderId,sessionToken:'private'},
  null,[],{status:'confirmed',orderId:null}
 ]){
  assert.deepEqual(await confirmCustomerOrder({payload,
   fetchImpl:async()=>response(503,data)}),{status:'unavailable'});
 }
});
