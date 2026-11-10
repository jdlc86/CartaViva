import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogConfirmationRepository} from '../apps/api/src/catalog-confirmation-repository.mjs';

const args={
 context:{authorized:true,canOrder:true,
  tableId:'11111111-1111-4111-8111-111111111111',
  sessionId:'22222222-2222-4222-8222-222222222222',
  visitId:'visit_123',basketId:'basket_123',actorId:'actor_123'},
 requestKey:'request_123',requestFingerprint:'fingerprint',
 quoteId:'33333333-3333-4333-8333-333333333333',
 evidence:{schemaVersion:1},requiresAcceptance:false,acceptanceVerified:false
};

test('repository refuses a fabricated acceptance when no reprice was required',async()=>{
 let writes=0;
 const repository=createCatalogConfirmationRepository({persist:async()=>{
  writes++;
  return {orderId:'44444444-4444-4444-8444-444444444444'};
 }});
 await assert.rejects(repository.persist(async()=>{},{
  ...args,requiresAcceptance:false,acceptanceVerified:true
 }),/invalid_catalog_confirmation_writer_scope/);
 await assert.rejects(repository.persist(async()=>{},{
  ...args,requiresAcceptance:true,acceptanceVerified:false
 }),/invalid_catalog_confirmation_writer_scope/);
 assert.equal(writes,0);
 await repository.persist(async()=>{},args);
 await repository.persist(async()=>{},{
  ...args,requiresAcceptance:true,acceptanceVerified:true
 });
 assert.equal(writes,2);
});
