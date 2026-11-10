import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogQuoteInsertRepository} from '../apps/api/src/catalog-quote-insert-repository.mjs';
const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const itemId='00000000-0000-4000-8000-000000000003';
const quoteId='00000000-0000-4000-8000-000000000004';
const context={tableId,sessionId,visitId:'visit-1',basketId:'basket-1',
 actorId:'actor-1',authorized:true,canOrder:true};
const evidence={itemId,publishedRevision:1,subtotalCents:1200,discountCents:200,
 totalCents:1000,selected:[],quantity:1};
const expiresAt='2026-10-22T20:00:00.000Z';
const repo=createCatalogQuoteInsertRepository();
test('inserts only bound context and trusted economic evidence',async()=>{
 let called=0;
 const result=await repo.insertDisplayedQuote(async(sql,args)=>{
  called++;
  assert.match(sql,/INSERT INTO sabora.catalog_displayed_quotes/);
  assert.match(sql,/RETURNING id/);
  assert.equal(args.length,12);
  assert.deepEqual(args.slice(0,6),[tableId,sessionId,'visit-1','basket-1','actor-1',itemId]);
  assert.deepEqual(args.slice(6,10),[1,1200,200,1000]);
  assert.deepEqual(JSON.parse(args[10]),evidence);
  assert.equal(args[11],expiresAt);
  assert.doesNotMatch(sql,/actor-1|visit-1|basket-1/);
  return {rows:[{id:quoteId}]};
 },{context,evidence,expiresAt});
 assert.deepEqual(result,{quoteId});assert.equal(called,1);
 assert.ok(Object.isFrozen(result));
});
test('forbidden context or malformed economics cannot reach SQL',async()=>{
 const query=()=>{throw Error('must not query');};
 for(const change of [{authorized:false},{canOrder:false},{sessionId:'wrong'},
  {actorId:'bad actor'}]){
  await assert.rejects(repo.insertDisplayedQuote(query,{
   context:{...context,...change},evidence,expiresAt}),/invalid_catalog_quote_insert/);
 }
 for(const change of [{totalCents:999},{subtotalCents:9007199254740992},
  {discountCents:-1},{publishedRevision:0},{itemId:'fake'}]){
  await assert.rejects(repo.insertDisplayedQuote(query,{
   context,evidence:{...evidence,...change},expiresAt}),/invalid_catalog_quote_insert/);
 }
 await assert.rejects(repo.insertDisplayedQuote(query,{context,evidence,expiresAt:'invalid'}),
  /invalid_catalog_quote_insert/);
});
test('unexpected database responses fail closed',async()=>{
 for(const rows of [[],[{},{}],[{id:'not-uuid'}]]){
  await assert.rejects(repo.insertDisplayedQuote(async()=>({rows}),
   {context,evidence,expiresAt}),/invalid_catalog_quote_insert_result/);
 }
});
