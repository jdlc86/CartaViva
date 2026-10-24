import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogConfirmationCoordinator} from '../apps/api/src/catalog-confirmation-coordinator.mjs';

// These are isolated adapter-boundary tests. They do not substitute for
// PostgreSQL 17 integration tests of QR rotation and visit state transitions.
const input=Object.freeze({
 tableId:'table_1',visitId:'visit_1',basketId:'basket_1',actorId:'actor_1',
 itemId:'item_1',selection:{},quantity:1,requestKey:'replay_key_0001',
 qrToken:'q'.repeat(48),customerSessionToken:'s'.repeat(48)
});
const orderId='11111111-1111-4111-8111-111111111111';

for(const [name,contextPatch] of [
 ['revoked QR',{authorized:false}],
 ['paused table',{canOrder:false}],
 ['closed visit',{authorized:false,canOrder:false}],
 ['mismatched visit',{visitId:'another_visit'}],
 ['mismatched actor',{actorId:'another_actor'}],
 ['mismatched basket',{basketId:'another_basket'}]
]){
 test(`confirmation rejects ${name} before idempotent replay`,async()=>{
  const calls=[];
  const context={authorized:true,canOrder:true,tableId:input.tableId,
   visitId:input.visitId,actorId:input.actorId,basketId:input.basketId,
   sessionId:'session_1',...contextPatch};
  const repository={
   async lockContext(){calls.push('context');return context;},
   async lookupIdempotency(){calls.push('replay');return {
    requestFingerprint:'ignored',result:{orderId}
   };},
   async lockCatalog(){calls.push('catalog');throw Error('unexpected_catalog');},
   async loadPreviousQuote(){calls.push('quote');throw Error('unexpected_quote');},
   async persist(){calls.push('persist');throw Error('unexpected_persist');}
  };
  const confirm=createCatalogConfirmationCoordinator({
   withTransaction:async fn=>fn(async()=>{}),repository,
   secretKey:'test-only-coordinator-secret-key-32',clock:()=>1
  });
  await assert.rejects(confirm(input),{message:'order_context_forbidden'});
  assert.deepEqual(calls,['context']);
 });
}

test('authorized context reaches idempotency lookup before catalog writes',async()=>{
 const calls=[];
 const context={authorized:true,canOrder:true,tableId:input.tableId,
  visitId:input.visitId,actorId:input.actorId,basketId:input.basketId,
  sessionId:'session_1'};
 const repository={
  async lockContext(){calls.push('context');return context;},
  async lookupIdempotency(){calls.push('replay');return null;},
  async lockCatalog(){calls.push('catalog');return null;},
  async loadPreviousQuote(){calls.push('quote');throw Error('unexpected_quote');},
  async persist(){calls.push('persist');throw Error('unexpected_persist');}
 };
 const confirm=createCatalogConfirmationCoordinator({
  withTransaction:async fn=>fn(async()=>{}),repository,
  secretKey:'test-only-coordinator-secret-key-32',clock:()=>1
 });
 await assert.rejects(confirm(input),{message:'order_catalog_unavailable'});
 assert.deepEqual(calls,['context','replay','catalog']);
});
