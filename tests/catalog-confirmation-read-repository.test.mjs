import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogConfirmationReadRepository} from '../apps/api/src/catalog-confirmation-read-repository.mjs';
const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const itemId='00000000-0000-4000-8000-000000000003';
const quoteId='00000000-0000-4000-8000-000000000004';
const orderId='00000000-0000-4000-8000-000000000005';
const context={tableId,sessionId,visitId:'visit-1',basketId:'basket-1',actorId:'actor-1'};
const repo=createCatalogConfirmationReadRepository();
test('scoped idempotency lookup binds all six fields and locks existing row',async()=>{
 const calls=[];
 const result=await repo.lookupIdempotency(async(sql,args)=>{
  calls.push({sql,args});return {rows:[{request_fingerprint:'fingerprint',order_id:orderId}]};
 },{context,requestKey:'request-001'});
 assert.deepEqual(result,{requestFingerprint:'fingerprint',result:{orderId}});
 assert.deepEqual(calls[0].args,[tableId,sessionId,'visit-1','basket-1','actor-1','request-001']);
 assert.match(calls[0].sql,/FOR UPDATE/);
 assert.doesNotMatch(calls[0].sql,/request-001/);
});
test('missing idempotency record is not a replay',async()=>{
 assert.equal(await repo.lookupIdempotency(async()=>({rows:[]}),
  {context,requestKey:'request-001'}),null);
});
test('catalog locks publication and refuses sold out or withdrawn',async()=>{
 for(const extra of [{sold_out:true,withdrawn_at:null},
   {sold_out:false,withdrawn_at:'2026-10-22'}]){
  const result=await repo.lockCatalog(async(sql,args)=>{
   assert.match(sql,/FOR SHARE/);assert.deepEqual(args,[itemId]);
   return {rows:[{published_revision:'4',published_snapshot:{priceCents:1000},...extra}]};
  },{context,itemId});
  assert.equal(result.available,false);
 }
 const active=await repo.lockCatalog(async()=>({rows:[{
  published_revision:'4',published_snapshot:{priceCents:1000},withdrawn_at:null,sold_out:false
 }]}),{context,itemId});
 assert.equal(active.available,true);
 assert.equal(active.publishedRevision,4);
});
test('trusted previous quote is scoped, unexpired, locked and checked',async()=>{
 const quote=await repo.loadPreviousQuote(async(sql,args)=>{
  assert.match(sql,/expires_at>clock_timestamp\(\)/);
  assert.match(sql,/FOR SHARE/);
  assert.deepEqual(args,[tableId,sessionId,'visit-1','basket-1','actor-1',itemId]);
  return {rows:[{id:quoteId,published_revision:'3',subtotal_cents:'1200',
   discount_cents:'200',total_cents:'1000',evidence:{schemaVersion:1}}]};
 },{context,itemId});
 assert.deepEqual(quote,{quoteId,evidence:{schemaVersion:1},publishedRevision:3,subtotalCents:1200,
  discountCents:200,totalCents:1000});
});
test('no quote and malformed economic record fail closed',async()=>{
 assert.equal(await repo.loadPreviousQuote(async()=>({rows:[]}),{context,itemId}),null);
 await assert.rejects(repo.loadPreviousQuote(async()=>({rows:[{
  id:quoteId,published_revision:'3',subtotal_cents:'1200',
  discount_cents:'200',total_cents:'1001'
 }]}),{context,itemId}),/invalid_catalog_repository_response/);
 await assert.rejects(repo.loadPreviousQuote(async()=>({rows:[{
  id:quoteId,published_revision:'3',subtotal_cents:'9007199254740993',
  discount_cents:'0',total_cents:'9007199254740993'
 }]}),{context,itemId}),/invalid_catalog_repository_response/);
});
test('invalid scopes and unexpected duplicate rows never pass',async()=>{
 const query=async()=>({rows:[]});
 await assert.rejects(repo.loadPreviousQuote(query,{context:{...context,actorId:'bad value'},itemId}),
  /invalid_catalog_repository_scope/);
 await assert.rejects(repo.lookupIdempotency(query,{context,requestKey:'short'}),
  /invalid_catalog_repository_scope/);
 await assert.rejects(repo.lockCatalog(async()=>({rows:[{},{}]}),{context,itemId}),
  /invalid_catalog_repository_response/);
});
