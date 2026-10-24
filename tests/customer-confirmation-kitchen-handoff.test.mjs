// Cross-layer customer confirmation → kitchen projection contract.
// This deliberately models the durable transaction boundary without
// claiming the separate staff operations PR is mounted or activated.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createCatalogConfirmationCoordinator} from '../apps/api/src/catalog-confirmation-coordinator.mjs';
import {registerCustomerOrderConfirmationRoute} from '../apps/api/src/customer-order-confirmation-http-candidate.mjs';
import {buildCatalogLineEvidence} from '../apps/api/src/catalog-line-evidence.mjs';
import {issueCatalogRepriceAcceptance} from '../apps/api/src/catalog-reprice-acceptance.mjs';

const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const orderId='00000000-0000-4000-8000-000000000055';
const itemId='123e4567-e89b-12d3-a456-426614174000';
const quoteId='00000000-0000-4000-8000-000000000044';
const secretKey='test-only-transactional-kitchen-handoff-secret';
const snapshot={name:'Plato confirmado',category:'Segundos',priceCents:1000,
 allergens:[],options:[],extras:[],discount:null};
const input={tableId:'table-1',visitId:'visit-1',basketId:'basket-1',
 actorId:'actor-1',itemId,selection:{extras:[]},quantity:1,
 requestKey:'request-001',qrToken:'q'.repeat(48),
 customerSessionToken:'s'.repeat(48)};
const evidence=buildCatalogLineEvidence({itemId,publishedRevision:1,
 snapshot,selection:input.selection,quantity:1});

function fixture({forbidden=false,failAfterKitchenProjection=false,publishedRevision=1,nowMs=1792600000000,contextActorId=input.actorId,contextBasketId=input.basketId}={}){
 const state={orders:[],lines:[],notifications:[],events:[],ledger:[]};
 let transactions=0;
 let rollbacks=0;
 const clone=()=>structuredClone(state);
 const restore=before=>{
  for(const key of Object.keys(state))state[key]=before[key];
 };
 const repository={
  async lockContext(){
   if(forbidden)return {authorized:false};
   return {authorized:true,canOrder:true,tableId:input.tableId,
    sessionId:'session-1',visitId:input.visitId,basketId:contextBasketId,
    actorId:contextActorId};
  },
  async lookupIdempotency(_query,{requestKey,requestFingerprint}){
   const row=state.ledger.find(row=>row.requestKey===requestKey);
   return row?{requestFingerprint:row.requestFingerprint,
    result:{orderId:row.orderId}}:null;
  },
  async lockCatalog(){return {publishedRevision,snapshot,available:true};},
  async loadPreviousQuote(){return {quoteId,evidence,publishedRevision:1,
   subtotalCents:1000,discountCents:0,totalCents:1000};},
  async persist(_query,{requestKey,requestFingerprint}){
   state.orders.push({id:orderId});
   // Models the PostgreSQL orders → order_lines trigger.
   state.lines.push({orderId,status:'confirmed'});
   if(failAfterKitchenProjection)throw Error('private_db_failure');
   state.ledger.push({requestKey,requestFingerprint,orderId});
   return {orderId,kitchenReceived:true,receiptAt:'private'};
  }
 };
 const confirm=createCatalogConfirmationCoordinator({
  repository,secretKey,clock:()=>nowMs,
  withTransaction:async work=>{
   transactions++;
   const before=clone();
   try{return await work(async()=>{});}
   catch(error){rollbacks++;restore(before);throw error;}
  }
 });
 const app=Fastify();
 registerCustomerOrderConfirmationRoute(app,{confirm});
 const send=(payload=input)=>app.inject({
  method:'POST',url:'/api/v1/customer/orders/confirm',payload
 });
 return {app,state,send,get transactions(){return transactions;},
  get rollbacks(){return rollbacks;}};
}

test('HTTP confirmation and identical replay create only one confirmed kitchen line',async t=>{
 const f=fixture();t.after(()=>f.app.close());
 const first=await f.send();
 assert.equal(first.statusCode,201);
 assert.deepEqual(first.json(),{status:'confirmed',orderId});
 assert.deepEqual(f.state.lines,[{orderId,status:'confirmed'}]);
 assert.equal(f.state.notifications.length,0);
 assert.equal(f.state.events.length,0);
 const replay=await f.send();
 assert.equal(replay.statusCode,200);
 assert.deepEqual(replay.json(),{status:'replayed',orderId});
 assert.equal(f.state.orders.length,1);
 assert.equal(f.state.lines.length,1);
 assert.equal(f.state.ledger.length,1);
 assert.equal(f.transactions,2);
 assert.equal(replay.body.includes('kitchenReceived'),false);
});

test('same correlation with different basket contents cannot create another kitchen line',async t=>{
 const f=fixture();t.after(()=>f.app.close());
 assert.equal((await f.send()).statusCode,201);
 const changed=await f.send({...input,quantity:2});
 assert.equal(changed.statusCode,409);
 assert.deepEqual(changed.json(),{error:'order_idempotency_conflict'});
 assert.equal(f.state.orders.length,1);
 assert.equal(f.state.lines.length,1);
 assert.equal(f.rollbacks,1);
});

test('ledger failure after kitchen trigger rolls back order and kitchen line',async t=>{
 const f=fixture({failAfterKitchenProjection:true});t.after(()=>f.app.close());
 const response=await f.send();
 assert.equal(response.statusCode,503);
 assert.deepEqual(response.json(),{error:'order_confirmation_unavailable'});
 assert.deepEqual(f.state,{orders:[],lines:[],notifications:[],events:[],ledger:[]});
 assert.equal(f.rollbacks,1);
});

test('revoked visit rejects replay before reading or writing kitchen projection',async t=>{
 const f=fixture({forbidden:true});t.after(()=>f.app.close());
 const response=await f.send();
 assert.equal(response.statusCode,403);
 assert.deepEqual(response.json(),{error:'order_context_forbidden'});
 assert.deepEqual(f.state.lines,[]);
 assert.equal(f.state.ledger.length,0);
 assert.equal(f.rollbacks,1);
});

test('changed published revision cannot reach kitchen without explicit acceptance',async t=>{
 const f=fixture({publishedRevision:2});t.after(()=>f.app.close());
 const response=await f.send();
 assert.equal(response.statusCode,409);
 assert.equal(response.json().error,'acceptance_required');
 assert.equal(response.json().repricing.schemaVersion,1);
 assert.equal(response.json().repricing.previousTotalCents,1000);
 assert.equal(response.json().repricing.currentTotalCents,1000);
 assert.equal(response.json().repricing.differenceCents,0);
 assert.deepEqual(f.state,{orders:[],lines:[],notifications:[],events:[],ledger:[]});
 assert.equal(f.transactions,1);
 assert.equal(f.rollbacks,0);
});

test('signed acceptance for the new revision permits one confirmed kitchen line',async t=>{
 const f=fixture({publishedRevision:2});t.after(()=>f.app.close());
 const {token}=issueCatalogRepriceAcceptance({
  basketId:input.basketId,actorId:input.actorId,secretKey,
  nowMs:1792600000000,itemId,publishedRevision:2,
  snapshot,selection:input.selection,quantity:1
 });
 const response=await f.send({...input,acceptanceToken:token});
 assert.equal(response.statusCode,201);
 assert.deepEqual(response.json(),{status:'confirmed',orderId});
 assert.deepEqual(f.state.lines,[{orderId,status:'confirmed'}]);
 assert.equal(f.state.ledger.length,1);
 assert.equal(f.state.notifications.length,0);
});

test('forged acceptance cannot produce an order or kitchen line',async t=>{
 const f=fixture({publishedRevision:2});t.after(()=>f.app.close());
 const response=await f.send({...input,acceptanceToken:'forged'});
 assert.notEqual(response.statusCode,201);
 assert.equal(f.state.orders.length,0);
 assert.equal(f.state.lines.length,0);
 assert.equal(f.state.ledger.length,0);
});

test('expired repricing acceptance never reaches kitchen or ledger',async t=>{
 const issuedAt=1792600000000;
 const f=fixture({publishedRevision:2,nowMs:issuedAt+300001});
 t.after(()=>f.app.close());
 const {token}=issueCatalogRepriceAcceptance({
  basketId:input.basketId,actorId:input.actorId,secretKey,
  nowMs:issuedAt,itemId,publishedRevision:2,
  snapshot,selection:input.selection,quantity:1
 });
 const response=await f.send({...input,acceptanceToken:token});
 assert.equal(response.statusCode,409);
 assert.equal(response.json().error,'acceptance_required');
 assert.equal(response.json().repricing.schemaVersion,1);
 assert.equal(response.json().repricing.previousTotalCents,1000);
 assert.equal(response.json().repricing.currentTotalCents,1000);
 assert.equal(response.json().repricing.differenceCents,0);
 assert.equal(f.state.orders.length,0);
 assert.equal(f.state.lines.length,0);
 assert.equal(f.state.ledger.length,0);
});

test('repricing token is not transferable to another basket or actor',async t=>{
 const {token}=issueCatalogRepriceAcceptance({
  basketId:input.basketId,actorId:input.actorId,secretKey,
  nowMs:1792600000000,itemId,publishedRevision:2,
  snapshot,selection:input.selection,quantity:1
 });
 for(const changes of [{basketId:'basket-other'},{actorId:'actor-other'}]){
  const f=fixture({publishedRevision:2,
   contextActorId:changes.actorId??input.actorId,
   contextBasketId:changes.basketId??input.basketId});t.after(()=>f.app.close());
  const response=await f.send({...input,...changes,acceptanceToken:token});
  assert.equal(response.statusCode,409);
  assert.equal(response.json().error,'acceptance_required');
 assert.equal(response.json().repricing.schemaVersion,1);
 assert.equal(response.json().repricing.previousTotalCents,1000);
 assert.equal(response.json().repricing.currentTotalCents,1000);
 assert.equal(response.json().repricing.differenceCents,0);
  assert.equal(f.state.orders.length,0);
  assert.equal(f.state.lines.length,0);
  assert.equal(f.state.ledger.length,0);
 }
});

test('public repricing DTO supports explicit acceptance and then one kitchen projection',async t=>{
 const f=fixture({publishedRevision:2});t.after(()=>f.app.close());
 const first=await f.send();
 assert.equal(first.statusCode,409);
 const response=first.json();
 assert.deepEqual(Object.keys(response).sort(),['error','repricing']);
 assert.deepEqual(Object.keys(response.repricing).sort(),[
  'acceptanceToken','currentPublishedRevision','currentTotalCents',
  'differenceCents','expiresAt','previousPublishedRevision',
  'previousTotalCents','schemaVersion'].sort());
 assert.equal(response.repricing.previousPublishedRevision,1);
 assert.equal(response.repricing.currentPublishedRevision,2);
 assert.equal(response.repricing.previousTotalCents,1000);
 assert.equal(response.repricing.currentTotalCents,1000);
 assert.equal(response.repricing.differenceCents,0);
 assert.equal(response.repricing.schemaVersion,1);
 assert.equal(f.state.orders.length,0);
 const accepted=await f.send({...input,acceptanceToken:response.repricing.acceptanceToken});
 assert.equal(accepted.statusCode,201);
 assert.deepEqual(accepted.json(),{status:'confirmed',orderId});
 assert.equal(f.state.orders.length,1);
 assert.equal(f.state.lines.length,1);
 assert.equal(f.state.ledger.length,1);
});
