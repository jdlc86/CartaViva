import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogConfirmationCoordinator} from '../apps/api/src/catalog-confirmation-coordinator.mjs';
import {issueCatalogRepriceAcceptance} from '../apps/api/src/catalog-reprice-acceptance.mjs';

const secretKey='only-for-isolated-unit-tests-a-long-server-key';
const snapshot={name:'Plato',category:'Segundos',priceCents:1000,allergens:[],
 options:[],extras:[],discount:null};
const input={tableId:'table-1',visitId:'visit-1',basketId:'basket-1',
 actorId:'actor-1',itemId:'123e4567-e89b-12d3-a456-426614174000',
 selection:{extras:[]},quantity:1,
 requestKey:'request-001',acceptanceToken:null};
const make=(overrides={})=>{
 const calls=[];
 const db={
  lockContext:async()=>{calls.push('context');return {authorized:true,canOrder:true};},
  lookupIdempotency:async()=>{calls.push('replay');return null;},
  lockCatalog:async()=>{calls.push('catalog');return {publishedRevision:1,snapshot,available:true};},
  loadPreviousQuote:async()=>{calls.push('previous');return {publishedRevision:1,subtotalCents:1000,discountCents:0,totalCents:1000};},
  persist:async(_query,args)=>{calls.push('persist');return {orderId:'order-1',evidence:args.evidence};},
  ...overrides
 };
 const confirm=createCatalogConfirmationCoordinator({
  withTransaction:async work=>{calls.push('BEGIN');try{const result=await work(async()=>{});calls.push('COMMIT');return result;}catch(e){calls.push('ROLLBACK');throw e;}},
  repository:db,secretKey,clock:()=>1792600000000
 });
 return {calls,confirm};
};
test('authorizes and locks before replay/catalog; persists immutable evidence once',async()=>{
 const {confirm,calls}=make();
 const result=await confirm(input);
 assert.equal(result.status,'confirmed');
 assert.equal(result.result.evidence.totalCents,1000);
 assert.deepEqual(calls,['BEGIN','context','replay','catalog','previous','persist','COMMIT']);
});
test('idempotent replay bypasses catalog and never writes again',async()=>{
 let savedFingerprint;
 const {confirm,calls}=make({
  lookupIdempotency:async(_q,{requestFingerprint})=>{
   calls.push('replay');
   savedFingerprint??=requestFingerprint;
   return {requestFingerprint:savedFingerprint,result:{orderId:'existing'}};
  }
 });
 const result=await confirm(input);
 assert.equal(result.status,'replayed');
 assert.equal(result.result.orderId,'existing');
 assert.deepEqual(calls,['BEGIN','context','replay','COMMIT']);
});
test('mismatched idempotency payload is rejected before catalog read',async()=>{
 const {confirm,calls}=make({
  lookupIdempotency:async()=>({requestFingerprint:'other',result:{orderId:'old'}})
 });
 await assert.rejects(confirm(input),/order_idempotency_conflict/);
 assert.deepEqual(calls,['BEGIN','context','ROLLBACK']);
});
test('changed revision requires explicit acceptance; no persistence before consent',async()=>{
 const {confirm,calls}=make({
  lockCatalog:async()=>{calls.push('catalog');return {publishedRevision:2,snapshot,available:true};}
 });
 const result=await confirm(input);
 assert.equal(result.status,'acceptance_required');
 assert.equal(result.decision.requiresAcceptance,true);
 assert.deepEqual(calls,['BEGIN','context','replay','catalog','previous','COMMIT']);
});
test('signed acceptance for current revision permits persistence',async()=>{
 const token=issueCatalogRepriceAcceptance({
  basketId:input.basketId,actorId:input.actorId,secretKey,nowMs:1792600000000,
  itemId:input.itemId,publishedRevision:2,snapshot,selection:input.selection,quantity:1
 }).token;
 const {confirm}=make({lockCatalog:async()=>({publishedRevision:2,snapshot,available:true})});
 const result=await confirm({...input,acceptanceToken:token});
 assert.equal(result.status,'confirmed');
});
test('unauthorized visit aborts before replay and any catalog access',async()=>{
 const {confirm,calls}=make({lockContext:async()=>({authorized:false,canOrder:false})});
 await assert.rejects(confirm(input),/order_context_forbidden/);
 assert.deepEqual(calls,['BEGIN','ROLLBACK']);
});
test('unavailable catalog aborts and no persistence occurs',async()=>{
 const {confirm,calls}=make({lockCatalog:async()=>({publishedRevision:1,snapshot,available:false})});
 await assert.rejects(confirm(input),/order_catalog_unavailable/);
 assert.deepEqual(calls,['BEGIN','context','replay','ROLLBACK']);
});
test('repository write failure rolls back and does not return confirmation',async()=>{
 const {confirm,calls}=make({persist:async()=>{calls.push('persist');throw Error('db_failed');}});
 await assert.rejects(confirm(input),/db_failed/);
 assert.deepEqual(calls,['BEGIN','context','replay','catalog','previous','persist','ROLLBACK']);
});
test('rejects client-supplied prices and unexpected fields before transaction',async()=>{
 const {confirm,calls}=make();
 await assert.rejects(confirm({...input,totalCents:1}),/invalid_confirmation_input/);
 await assert.rejects(confirm({...input,requestKey:'short'}),/invalid_confirmation_input/);
 assert.deepEqual(calls,[]);
});

test('browser cannot forge the previous quote to bypass reprice acceptance',async()=>{
 const {confirm,calls}=make();
 await assert.rejects(confirm({...input,previous:{
  publishedRevision:1,subtotalCents:1000,discountCents:0,totalCents:1000
 }}),/invalid_confirmation_input/);
 assert.deepEqual(calls,[]);
});
test('missing or malformed trusted previous quote aborts before persistence',async()=>{
 const {confirm,calls}=make({loadPreviousQuote:async()=>null});
 await assert.rejects(confirm(input),/order_previous_quote_unavailable/);
 assert.deepEqual(calls,['BEGIN','context','replay','catalog','ROLLBACK']);
});
test('a trusted previous revision mismatch requires consent despite client silence',async()=>{
 const {confirm,calls}=make({
  loadPreviousQuote:async()=>{calls.push('previous');return {
   publishedRevision:2,subtotalCents:1000,discountCents:0,totalCents:1000
  };}
 });
 const result=await confirm(input);
 assert.equal(result.status,'acceptance_required');
 assert.deepEqual(calls,['BEGIN','context','replay','catalog','previous','COMMIT']);
});
