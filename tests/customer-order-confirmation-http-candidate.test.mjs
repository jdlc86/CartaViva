import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerCustomerOrderConfirmationRoute} from '../apps/api/src/customer-order-confirmation-http-candidate.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const id='00000000-0000-4000-8000-000000000005';
const create=confirm=>{
 const app=Fastify();
 registerCustomerOrderConfirmationRoute(app,{confirm});
 return app;
};
test('customer confirmation returns minimal DTO and idempotent replay without evidence',async t=>{
 let count=0;
 const app=create(async()=>({status:++count===1?'confirmed':'replayed',
  result:{orderId:id,evidence:{private:'never expose'}}}));
 t.after(()=>app.close());
 for(const [status,code] of [['confirmed',201],['replayed',200]]){
  const r=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
   payload:{requestKey:'request-001'}});
  assert.equal(r.statusCode,code);
  assert.deepEqual(r.json(),{status,orderId:id});
  assert.equal(r.headers['cache-control'],'no-store');
  assert.equal(r.headers['x-content-type-options'],'nosniff');
  assert.equal(r.body.includes('private'),false);
 }
});
test('customer confirmation does not leak acceptance token or private pricing evidence',async t=>{
 const app=create(async()=>({status:'acceptance_required',
  decision:{requiresAcceptance:true,token:'secret-acceptance',evidence:{private:1}}}));
 t.after(()=>app.close());
 const r=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
  payload:{requestKey:'request-001'}});
 assert.equal(r.statusCode,409);
 assert.deepEqual(r.json(),{error:'acceptance_required'});
 assert.equal(r.body.includes('secret'),false);
});
test('customer confirmation maps known failures and hides unexpected backend details',async t=>{
 let message='order_context_forbidden';
 const app=create(async()=>{throw Error(message);});
 t.after(()=>app.close());
 for(const [error,code,publicError] of [
  ['invalid_confirmation_input',400,'invalid_confirmation_input'],
  ['order_context_forbidden',403,'order_context_forbidden'],
  ['order_idempotency_conflict',409,'order_idempotency_conflict'],
  ['order_catalog_unavailable',409,'order_confirmation_conflict'],
  ['order_previous_quote_unavailable',409,'order_confirmation_conflict'],
  ['order_displayed_quote_invalid',409,'order_confirmation_conflict'],
  ['postgres://private:secret@localhost',503,'order_confirmation_unavailable']
 ]){
  message=error;
  const r=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
   payload:{requestKey:'request-001'}});
  assert.equal(r.statusCode,code);
  assert.deepEqual(r.json(),{error:publicError});
  assert.equal(r.body.includes('private'),false);
 }
});
test('customer confirmation rejects invalid shape before calling domain',async t=>{
 let calls=0;
 const app=create(async()=>{calls++;return {status:'confirmed',result:{orderId:id}};});
 t.after(()=>app.close());
 for(const payload of [[],null,'hello',42]){
  const r=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
   payload,headers:{'content-type':'application/json'}});
  assert.ok([400,415].includes(r.statusCode));
 }
 assert.equal(calls,0);
});
test('customer confirmation fails closed on malformed domain response',async t=>{
 const app=create(async()=>({status:'confirmed',result:{orderId:'bad',secret:'hidden'}}));
 t.after(()=>app.close());
 const r=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
  payload:{requestKey:'request-001'}});
 assert.equal(r.statusCode,503);
 assert.deepEqual(r.json(),{error:'order_confirmation_unavailable'});
});
test('candidate route is not registered with missing confirmation dependency',()=>{
 let called=false;
 assert.throws(()=>registerCustomerOrderConfirmationRoute({post:()=>{called=true;}}),
  /invalid_customer_order_route_configuration/);
 assert.equal(called,false);
});

test('HTTP confirmation delegates opaque QR and session to transactional coordinator',async t=>{
 const {createCatalogConfirmationCoordinator}=await import(
  '../apps/api/src/catalog-confirmation-coordinator.mjs');
 const {buildCatalogLineEvidence}=await import(
  '../apps/api/src/catalog-line-evidence.mjs');
 const snapshot={name:'Plato',category:'Segundos',priceCents:1000,
  allergens:[],options:[],extras:[],discount:null};
 const input={tableId:'table-1',visitId:'visit-1',basketId:'basket-1',
  actorId:'actor-1',itemId:'123e4567-e89b-12d3-a456-426614174000',
  selection:{extras:[]},quantity:1,requestKey:'request-001',
  acceptanceToken:null,qrToken:'q'.repeat(48),
  customerSessionToken:'s'.repeat(48)};
 const evidence=buildCatalogLineEvidence({itemId:input.itemId,
  publishedRevision:1,snapshot,selection:input.selection,quantity:1});
 const calls=[];
 const repository={
  lockContext:async(_query,args)=>{
   calls.push('lockContext');
   assert.equal(args.qrToken,input.qrToken);
   assert.equal(args.customerSessionToken,input.customerSessionToken);
   return {authorized:true,canOrder:true,tableId:input.tableId,
    visitId:input.visitId,basketId:input.basketId,actorId:input.actorId,
    sessionId:'session-1'};
  },
  lookupIdempotency:async()=>{calls.push('lookupIdempotency');return null;},
  lockCatalog:async()=>{calls.push('lockCatalog');return {
   publishedRevision:1,snapshot,available:true};},
  loadPreviousQuote:async()=>{calls.push('loadPreviousQuote');return {
   quoteId:'00000000-0000-4000-8000-000000000004',
   evidence,publishedRevision:1,subtotalCents:1000,
   discountCents:0,totalCents:1000};},
  persist:async()=>{calls.push('persist');return {
   orderId:id,evidence:{internalSecret:'never expose'}};}
 };
 const confirm=createCatalogConfirmationCoordinator({
  repository,secretKey:'isolated-test-only-long-server-side-secret-key',
  clock:()=>1792600000000,
  withTransaction:async work=>{
   calls.push('BEGIN');
   try{
    const result=await work(async()=>{});
    calls.push('COMMIT');
    return result;
   }catch(error){calls.push('ROLLBACK');throw error;}
  }
 });
 const app=create(confirm);t.after(()=>app.close());
 const r=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
  payload:input});
 assert.equal(r.statusCode,201);
 assert.deepEqual(r.json(),{status:'confirmed',orderId:id});
 assert.deepEqual(calls,['BEGIN','lockContext','lookupIdempotency',
  'lockCatalog','loadPreviousQuote','persist','COMMIT']);
 assert.equal(r.body.includes('internalSecret'),false);
});
test('HTTP confirmation never reads catalog or writes after forbidden visit',async t=>{
 const {createCatalogConfirmationCoordinator}=await import(
  '../apps/api/src/catalog-confirmation-coordinator.mjs');
 const calls=[];
 const confirm=createCatalogConfirmationCoordinator({
  secretKey:'isolated-test-only-long-server-side-secret-key',
  clock:()=>1792600000000,
  withTransaction:async work=>{
   calls.push('BEGIN');
   try{const result=await work(async()=>{});calls.push('COMMIT');return result;}
   catch(error){calls.push('ROLLBACK');throw error;}
  },
  repository:{
   lockContext:async()=>{calls.push('lockContext');return {authorized:false};},
   lookupIdempotency:async()=>{calls.push('lookupIdempotency');return null;},
   lockCatalog:async()=>{calls.push('lockCatalog');return null;},
   loadPreviousQuote:async()=>{calls.push('loadPreviousQuote');return null;},
   persist:async()=>{calls.push('persist');return null;}
  }
 });
 const app=create(confirm);t.after(()=>app.close());
 const r=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
  payload:{tableId:'table-1',visitId:'visit-1',basketId:'basket-1',
   actorId:'actor-1',itemId:'123e4567-e89b-12d3-a456-426614174000',
   selection:{extras:[]},quantity:1,requestKey:'request-001',
   qrToken:'q'.repeat(48),customerSessionToken:'s'.repeat(48)}});
 assert.equal(r.statusCode,403);
 assert.deepEqual(r.json(),{error:'order_context_forbidden'});
 assert.deepEqual(calls,['BEGIN','lockContext','ROLLBACK']);
});
