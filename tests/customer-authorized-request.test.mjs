import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthorizedCustomerRequestReader,validateCustomerConfirmationRequest}
 from '../packages/customer-consent/src/customer-authorized-request.mjs';
const context={authorized:true,canOrder:true,tableId:'table_1',visitId:'visit_1',
 actorId:'actor_1',qrToken:'q'.repeat(32),customerSessionToken:'s'.repeat(32)};
const basket={confirmable:true,basketId:'basket_1',itemId:'dish_1',quantity:2,
 selection:{extras:['cheese']}};
const key='request_12345678';
test('authorized session and basket produce backend-compatible confirmation request',async()=>{
 const reader=createAuthorizedCustomerRequestReader({
  readContext:async()=>context,readBasket:async()=>basket,createRequestKey:()=>key});
 const request=await reader();
 assert.equal(request.tableId,'table_1');
 assert.equal(request.actorId,'actor_1');
 assert.equal(request.quantity,2);
 assert.equal(request.requestKey,key);
 assert.equal(Object.isFrozen(request),true);
 assert.equal(Object.hasOwn(request,'alias'),false);
});
test('untrusted local alias is never a substitute for session authorization',async()=>{
 for(const altered of [
  {...context,authorized:false},{...context,canOrder:false},
  {...context,customerSessionToken:undefined},{...context,actorId:'Ana'}
 ]){
  const reader=createAuthorizedCustomerRequestReader({
   readContext:()=>altered,readBasket:()=>basket,createRequestKey:()=>key});
  if(altered.authorized===false||altered.canOrder===false||
     altered.customerSessionToken===undefined)
   await assert.rejects(reader(),/customer_session_not_authorized|invalid_customer_confirmation_request/);
  else assert.equal((await reader()).actorId,'Ana');
 }
});
test('missing basket readiness blocks confirmation without generating a request key',async()=>{
 let generated=0;
 const reader=createAuthorizedCustomerRequestReader({
  readContext:()=>context,readBasket:()=>({...basket,confirmable:false}),
  createRequestKey:()=>{generated++;return key;}});
 await assert.rejects(reader(),/customer_session_not_authorized/);
 assert.equal(generated,0);
});
test('rejects missing ids, invalid quantities, tokens and unsupported fields',()=>{
 const base={...context,...basket,requestKey:key};
 delete base.authorized;delete base.canOrder;delete base.confirmable;
 for(const changed of [
  {...base,actorId:''},{...base,quantity:0},{...base,qrToken:'short'},
  {...base,customerSessionToken:'short'},{...base,requestKey:'x'},
  {...base,alias:'fake'},{...base,selection:{constructor:'bad'}}
 ])assert.throws(()=>validateCustomerConfirmationRequest(changed),
  /invalid_customer_confirmation_request/);
});

test('accessor and cyclic basket selections fail before JSON serialization',()=>{
 const base={...context,...basket,requestKey:key};
 delete base.authorized;delete base.canOrder;delete base.confirmable;
 const accessor={};
 Object.defineProperty(accessor,'extras',{enumerable:true,get(){throw Error('getter_executed');}});
 assert.throws(()=>validateCustomerConfirmationRequest({...base,selection:accessor}),
  /invalid_customer_confirmation_request/);
 const cycle={};cycle.self=cycle;
 assert.throws(()=>validateCustomerConfirmationRequest({...base,selection:cycle}),
  /invalid_customer_confirmation_request/);
});

test('top-level accessors are rejected without executing and selection is snapshotted',()=>{
 const base={...context,...basket,requestKey:key};
 delete base.authorized;delete base.canOrder;delete base.confirmable;
 Object.defineProperty(base,'actorId',{enumerable:true,get(){throw Error('getter_executed');}});
 assert.throws(()=>validateCustomerConfirmationRequest(base),
  /invalid_customer_confirmation_request/);
 const safe={...context,...basket,requestKey:key};
 delete safe.authorized;delete safe.canOrder;delete safe.confirmable;
 const validated=validateCustomerConfirmationRequest(safe);
 safe.selection.extras.push('untrusted_mutation');
 assert.deepEqual(validated.selection.extras,[]);
});
