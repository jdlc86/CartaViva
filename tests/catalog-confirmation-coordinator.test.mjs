import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogConfirmationCoordinator} from '../apps/api/src/catalog-confirmation-coordinator.mjs';
import {issueCatalogRepriceAcceptance} from '../apps/api/src/catalog-reprice-acceptance.mjs';
import {buildCatalogLineEvidence} from '../apps/api/src/catalog-line-evidence.mjs';

const secretKey='only-for-isolated-unit-tests-a-long-server-key';
const snapshot={name:'Plato',category:'Segundos',priceCents:1000,allergens:[],
 options:[],extras:[],discount:null};
const input={tableId:'table-1',visitId:'visit-1',basketId:'basket-1',
 actorId:'actor-1',itemId:'123e4567-e89b-12d3-a456-426614174000',
 selection:{extras:[]},quantity:1,
 requestKey:'request-001',acceptanceToken:null,
 qrToken:'q'.repeat(48),customerSessionToken:'s'.repeat(48)};
const displayed=buildCatalogLineEvidence({itemId:input.itemId,publishedRevision:1,
 snapshot,selection:input.selection,quantity:1});
const make=(overrides={})=>{
 const calls=[];
 const db={
  lockContext:async()=>{calls.push('context');return {authorized:true,canOrder:true,tableId:input.tableId,visitId:input.visitId,actorId:input.actorId,basketId:input.basketId,sessionId:'session-1'};},
  lookupIdempotency:async()=>{calls.push('replay');return null;},
  lockCatalog:async()=>{calls.push('catalog');return {publishedRevision:1,snapshot,available:true};},
  loadPreviousQuote:async()=>{calls.push('previous');return {quoteId:'00000000-0000-4000-8000-000000000004',evidence:displayed,publishedRevision:1,subtotalCents:1000,discountCents:0,totalCents:1000};},
  persist:async(_query,args)=>{calls.push('persist');assert.equal(args.quoteId,'00000000-0000-4000-8000-000000000004');return {orderId:'00000000-0000-4000-8000-000000000005',evidence:args.evidence};},
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
   return {requestFingerprint:savedFingerprint,result:{orderId:'00000000-0000-4000-8000-000000000005'}};
  }
 });
 const result=await confirm(input);
 assert.equal(result.status,'replayed');
 assert.equal(result.result.orderId,'00000000-0000-4000-8000-000000000005');
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
   quoteId:'00000000-0000-4000-8000-000000000004',evidence:{...displayed,publishedRevision:2},publishedRevision:2,subtotalCents:1000,discountCents:0,totalCents:1000
  };}
 });
 const result=await confirm(input);
 assert.equal(result.status,'acceptance_required');
 assert.deepEqual(calls,['BEGIN','context','replay','catalog','previous','COMMIT']);
});

test('previous quote without trusted identifier cannot be persisted',async()=>{
 const {confirm,calls}=make({loadPreviousQuote:async()=>{calls.push('previous');return {
  publishedRevision:1,subtotalCents:1000,discountCents:0,totalCents:1000
 };}});
 await assert.rejects(confirm(input),/order_previous_quote_unavailable/);
 assert.deepEqual(calls,['BEGIN','context','replay','catalog','previous','ROLLBACK']);
});

test('changed quantity cannot silently reuse a displayed quote',async()=>{
 const {confirm,calls}=make();
 await assert.rejects(confirm({...input,quantity:2}),/order_displayed_quote_invalid/);
 assert.deepEqual(calls,['BEGIN','context','replay','catalog','previous','ROLLBACK']);
});
test('corrupt stored evidence is rejected even if amounts look correct',async()=>{
 const {confirm}=make({loadPreviousQuote:async()=>({
  quoteId:'00000000-0000-4000-8000-000000000004',publishedRevision:1,subtotalCents:1000,
  discountCents:0,totalCents:1000,evidence:{...displayed,totalCents:999}
 })});
 await assert.rejects(confirm(input),/order_displayed_quote_invalid/);
});

test('a replay is forbidden when locked visit scope is inconsistent',async()=>{
 for(const field of ['tableId','visitId','actorId','basketId','sessionId']){
  const {confirm,calls}=make({lockContext:async()=>{
   calls.push('context');
   const context={authorized:true,canOrder:true,tableId:input.tableId,visitId:input.visitId,
    actorId:input.actorId,basketId:input.basketId,sessionId:'session-1'};
   context[field]=field==='sessionId'?'':'other-scope';
   return context;
  }});
  await assert.rejects(confirm(input),/order_context_forbidden/);
  assert.deepEqual(calls,['BEGIN','context','ROLLBACK']);
 }
});

test('untrusted accessor cannot execute before transaction',async()=>{
 const {confirm,calls}=make();
 let getterCalls=0;
 const request={...input};
 Object.defineProperty(request,'tableId',{enumerable:true,get(){getterCalls++;throw Error('getter_executed');}});
 await assert.rejects(confirm(request),/invalid_confirmation_input/);
 assert.equal(getterCalls,0);
 assert.deepEqual(calls,[]);
});

test('nested accessor and cyclic selection fail closed before transaction',async()=>{
 const {confirm,calls}=make();
 const selection={extras:[]};
 Object.defineProperty(selection,'injected',{enumerable:true,get(){throw Error('nested_getter_executed');}});
 await assert.rejects(confirm({...input,selection}),/invalid_confirmation_input/);
 const cyclic={extras:[]};
 cyclic.self=cyclic;
 await assert.rejects(confirm({...input,selection:cyclic}),/invalid_confirmation_input/);
 assert.deepEqual(calls,[]);
});

test('symbol, hidden, sparse array and dangerous nested keys are rejected',async()=>{
 const {confirm,calls}=make();
 const symbol={...input};
 symbol[Symbol('actorId')]='forged';
 await assert.rejects(confirm(symbol),/invalid_confirmation_input/);
 const hidden={...input};
 Object.defineProperty(hidden,'actorIdOverride',{value:'forged',enumerable:false});
 await assert.rejects(confirm(hidden),/invalid_confirmation_input/);
 const sparse={...input,selection:{extras:new Array(2)}};
 await assert.rejects(confirm(sparse),/invalid_confirmation_input/);
 const dangerous=JSON.parse('{"extras":[],"__proto__":{"admin":true}}');
 await assert.rejects(confirm({...input,selection:dangerous}),/invalid_confirmation_input/);
 assert.deepEqual(calls,[]);
});

test('oversized confirmation payload and acceptance token fail before transaction',async()=>{
 const {confirm,calls}=make();
 await assert.rejects(confirm({...input,selection:{extras:[],note:'x'.repeat(17000)}}),
  /invalid_confirmation_input/);
 await assert.rejects(confirm({...input,acceptanceToken:'x'.repeat(4097)}),
  /invalid_confirmation_input/);
 await assert.rejects(confirm({...input,acceptanceToken:{token:'forged'}}),
  /invalid_confirmation_input/);
 assert.deepEqual(calls,[]);
});

test('a normal bounded confirmation still reaches the same locked workflow',async()=>{
 const {confirm,calls}=make();
 const result=await confirm({...input});
 assert.equal(result.status,'confirmed');
 assert.deepEqual(calls,['BEGIN','context','replay','catalog','previous','persist','COMMIT']);
});

test('confirmation refuses missing or malformed live visit credentials before SQL',async()=>{
 const {confirm,calls}=make();
 for(const overrides of [
  {qrToken:undefined},{qrToken:'short'},{customerSessionToken:undefined},
  {customerSessionToken:'short'}
 ]){
  await assert.rejects(confirm({...input,...overrides}),/invalid_confirmation_input/);
 }
 assert.deepEqual(calls,[]);
});

test('confirmation forwards live credentials only to locked context and not replay fingerprint',async()=>{
 const calls=[];
 let captured;
 const {confirm}=make({lockContext:async(_query,args)=>{
  captured=args;calls.push('context');
  return {authorized:true,canOrder:true,tableId:input.tableId,visitId:input.visitId,
   actorId:input.actorId,basketId:input.basketId,sessionId:'session-1'};
 },lookupIdempotency:async(_query,args)=>{
  assert.equal(args.requestFingerprint.includes(input.qrToken),false);
  assert.equal(args.requestFingerprint.includes(input.customerSessionToken),false);
  assert.equal(JSON.stringify(args).includes(input.qrToken),false);
  return null;
 }});
 const result=await confirm(input);
 assert.equal(result.status,'confirmed');
 assert.equal(captured.qrToken,input.qrToken);
 assert.equal(captured.customerSessionToken,input.customerSessionToken);
});

test('acceptance token is optional for unchanged published prices',async()=>{
 const {confirm,calls}=make();
 const {acceptanceToken,...withoutAcceptance}=input;
 const result=await confirm(withoutAcceptance);
 assert.equal(result.status,'confirmed');
 assert.deepEqual(calls,['BEGIN','context','replay','catalog','previous','persist','COMMIT']);
});

test('missing required session credential is rejected before transaction',async()=>{
 const {confirm,calls}=make();
 const {customerSessionToken,...withoutSession}=input;
 await assert.rejects(confirm(withoutSession),/invalid_confirmation_input/);
 assert.deepEqual(calls,[]);
});

test('corrupt replay order identifiers abort without catalog reads or persistence',async()=>{
 for(const orderId of [null,undefined,'', 'not-a-uuid',123,{},[],false]){
  const {confirm,calls}=make({lookupIdempotency:async()=>{
   calls.push('replay');
   return {requestFingerprint:JSON.stringify({}),result:{orderId}};
  }});
  await assert.rejects(confirm(input),/order_idempotency_conflict/);
  assert.deepEqual(calls,['BEGIN','context','replay','ROLLBACK']);
 }
});

test('matching replay fingerprint still rejects a malformed persisted result',async()=>{
 let fingerprint;
 const {confirm,calls}=make({lookupIdempotency:async(_query,args)=>{
  calls.push('replay');
  fingerprint=args.requestFingerprint;
  return {requestFingerprint:fingerprint,result:{orderId:'invalid-order-id'}};
 }});
 await assert.rejects(confirm(input),/order_idempotency_conflict/);
 assert.deepEqual(calls,['BEGIN','context','replay','ROLLBACK']);
});

test('malformed trusted quote ID aborts before decision and persistence',async()=>{
 for(const quoteId of ['quote-1','',null,undefined,{},false]){
  const {confirm,calls}=make({loadPreviousQuote:async()=>{
   calls.push('previous');
   return {quoteId,evidence:displayed,publishedRevision:1,
    subtotalCents:1000,discountCents:0,totalCents:1000};
  }});
  await assert.rejects(confirm(input),/order_previous_quote_unavailable/);
  assert.deepEqual(calls,['BEGIN','context','replay','catalog','previous','ROLLBACK']);
 }
});

test('malformed writer order ID aborts transaction without confirmed response',async()=>{
 for(const orderId of ['order-1','',null,undefined,{},false]){
  const {confirm,calls}=make({persist:async()=>{
   calls.push('persist');return {orderId};
  }});
  await assert.rejects(confirm(input),/invalid_order_persistence_result/);
  assert.deepEqual(calls,['BEGIN','context','replay','catalog','previous','persist','ROLLBACK']);
 }
});
