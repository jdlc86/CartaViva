import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogQuoteIssuer} from '../apps/api/src/catalog-quote-issuer.mjs';
const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const itemId='00000000-0000-4000-8000-000000000003';
const quoteId='00000000-0000-4000-8000-000000000004';
const input={tableId,visitId:'visit-1',basketId:'basket-1',actorId:'actor-1',
 itemId,selection:{options:[],extras:[]},quantity:1};
const snapshot={name:'Plato CI',category:'Primeros',allergens:[],priceCents:1000,
 options:[],extras:[],discount:null};
function fixture(overrides={}){
 const calls=[];
 const repository={
  async lockContext(_q,scope){calls.push('context');return {authorized:true,canOrder:true,
   tableId,sessionId,visitId:scope.visitId,basketId:scope.basketId,actorId:scope.actorId};},
  async lockCatalog(){calls.push('catalog');return {available:true,publishedRevision:1,snapshot};},
  async insertDisplayedQuote(_q,record){calls.push('insert');return {quoteId};},
  ...overrides
 };
 const issue=createCatalogQuoteIssuer({
  withTransaction:async fn=>{calls.push('BEGIN');try{
   const result=await fn(async()=>({rows:[]}));calls.push('COMMIT');return result;
  }catch(error){calls.push('ROLLBACK');throw error;}},
  repository,clock:()=>1700000000000
 });
 return {issue,calls};
}
test('authenticated quote issuance persists immutable evidence before commit',async()=>{
 const {issue,calls}=fixture({insertDisplayedQuote:async(_q,record)=>{
  calls.push('insert');
  assert.equal(record.context.sessionId,sessionId);
  assert.equal(record.evidence.totalCents,1000);
  assert.ok(Object.isFrozen(record.evidence));
  assert.equal(record.expiresAt,'2023-11-14T22:18:20.000Z');
  return {quoteId};
 }});
 const result=await issue(input);
 assert.equal(result.quoteId,quoteId);
 assert.deepEqual(calls,['BEGIN','context','catalog','insert','COMMIT']);
});
test('revoked or cross-table context blocks quote before catalog read',async()=>{
 for(const change of [{authorized:false},{tableId:sessionId},{actorId:'other'}]){
  const {issue,calls}=fixture({lockContext:async()=>({
   authorized:true,canOrder:true,tableId,sessionId,visitId:input.visitId,
   basketId:input.basketId,actorId:input.actorId,...change
  })});
  await assert.rejects(issue(input),/catalog_quote_context_forbidden/);
  assert.deepEqual(calls,['BEGIN','ROLLBACK']);
 }
});
test('sold out catalog cannot produce a displayed quote',async()=>{
 const {issue,calls}=fixture({lockCatalog:async()=>({available:false,publishedRevision:1,snapshot})});
 await assert.rejects(issue(input),/catalog_quote_unavailable/);
 assert.deepEqual(calls,['BEGIN','context','ROLLBACK']);
});
test('invalid selections and untrusted client prices never persist',async()=>{
 const {issue,calls}=fixture();
 await assert.rejects(issue({...input,priceCents:1}),/invalid_catalog_quote_input/);
 assert.deepEqual(calls,[]);
 await assert.rejects(issue({...input,selection:{options:[],extras:['fake']}}));
 assert.deepEqual(calls,['BEGIN','context','catalog','ROLLBACK']);
});
test('insert errors and malformed quote identifiers roll back',async()=>{
 const {issue,calls}=fixture({insertDisplayedQuote:async()=>({quoteId:'forged'})});
 await assert.rejects(issue(input),/invalid_catalog_quote_persistence/);
 assert.deepEqual(calls,['BEGIN','context','catalog','ROLLBACK']);
});
