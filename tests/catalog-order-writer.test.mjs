import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogOrderWriter} from '../apps/api/src/catalog-order-writer.mjs';

const ids={tableId:'00000000-0000-4000-8000-000000000001',
 sessionId:'00000000-0000-4000-8000-000000000002',
 itemId:'00000000-0000-4000-8000-000000000003',
 quoteId:'00000000-0000-4000-8000-000000000004',
 orderId:'00000000-0000-4000-8000-000000000005'};
const context={tableId:ids.tableId,sessionId:ids.sessionId,
 visitId:'visit_1',basketId:'basket_1',actorId:'actor_1',
 authorized:true,canOrder:true,customerAlias:'Cliente',customerIdentifier:'SB-23456789ABCD'};
const evidence={schemaVersion:1,itemId:ids.itemId,publishedRevision:1,
 itemName:'Plato',category:'Primeros',quantity:2,basePriceCents:1000,
 selected:[],allergens:[],discount:null,unitSubtotalCents:1000,
 unitDiscountCents:0,subtotalCents:2000,discountCents:0,totalCents:2000};
const args={context,evidence,quoteId:ids.quoteId,requestKey:'request_001',
 requestFingerprint:'fingerprint',requiresAcceptance:false,acceptanceVerified:false};

test('candidate writes legacy kitchen projection and economic ledger on one query',async()=>{
 const calls=[];
 const query=async(sql,params)=>{
  calls.push({sql,params});
  if(calls.length===1)return {rows:[{first_confirmed_at:null,grouping_window_seconds:300}]};
  if(calls.length===2)return {rows:[{id:ids.orderId,grouping:'first',first_timestamp_written:true}]};
  return {rows:[{order_id:ids.orderId}]};
 };
 const writer=createCatalogOrderWriter({newOrderId:()=>ids.orderId});
 assert.deepEqual(await writer.persist(query,args),{orderId:ids.orderId});
 assert.equal(calls.length,3);
 assert.match(calls[1].sql,/INSERT INTO sabora.orders/);
 assert.match(calls[0].sql,/FOR UPDATE/);
 assert.match(calls[1].sql,/UPDATE sabora.dining_tables/);
 assert.deepEqual(JSON.parse(calls[1].params[7]),
  [{category:'starter',name:'Plato',quantity:2}]);
 assert.deepEqual(JSON.parse(calls[1].params[6]),evidence);
 assert.equal(calls[1].params[3],context.customerAlias);
 assert.equal(calls[1].params[4],context.customerIdentifier);
 assert.match(calls[2].sql,/INSERT INTO sabora.catalog_confirmation_attempts/);
 assert.equal(calls[2].params[10],ids.orderId);
});

test('candidate fails closed on lost table or invalid identity before ledger',async()=>{
 const calls=[];
 const writer=createCatalogOrderWriter({newOrderId:()=>ids.orderId});
 await assert.rejects(writer.persist(async(sql,params)=>{
  calls.push(sql);return {rows:[]};
 },args),/catalog_order_context_changed/);
 assert.equal(calls.length,1);
 for(const patch of [
  {context:{...context,authorized:false}},
  {context:{...context,canOrder:false}},
  {context:{...context,sessionId:'wrong'}},
  {context:{...context,customerAlias:undefined}},
  {context:{...context,customerAlias:'A'.repeat(81)}},
  {context:{...context,customerAlias:'Control'+String.fromCharCode(10)+'line'}},
  {context:{...context,customerAlias:'   '}},
  {context:{...context,customerIdentifier:'ID123'}},
  {evidence:{...evidence,category:'invented'}},
  {evidence:{...evidence,quantity:0}},
  {quoteId:'bad'}
 ]){
  await assert.rejects(writer.persist(async()=>{throw Error('query_called');},
   {...args,...patch}),/invalid_catalog_order_writer_scope/);
 }
});

test('ledger rejection propagates to caller transaction rather than reporting success',async()=>{
 let calls=0;
 const writer=createCatalogOrderWriter({newOrderId:()=>ids.orderId});
 await assert.rejects(writer.persist(async()=>{
  calls++;
  if(calls===1)return {rows:[{first_confirmed_at:null,grouping_window_seconds:300}]};
  if(calls===2)return {rows:[{id:ids.orderId,grouping:'first',first_timestamp_written:true}]};
  throw Error('ledger_rejected');
 },args),/ledger_rejected/);
 assert.equal(calls,3);
});

test('writer persists trimmed trusted alias and keeps kitchen projection derived from evidence',async()=>{
 const calls=[];
 const writer=createCatalogOrderWriter({newOrderId:()=>ids.orderId});
 await writer.persist(async(sql,params)=>{
  calls.push({sql,params});
  if(calls.length===1)return {rows:[{first_confirmed_at:null,grouping_window_seconds:300}]};
  if(calls.length===2)return {rows:[{id:ids.orderId,grouping:'first',first_timestamp_written:true}]};
  return {rows:[{order_id:ids.orderId}]};
 },{...args,context:{...context,customerAlias:'  Cliente  '}});
 assert.equal(calls[1].params[3],'Cliente');
 assert.equal(calls[1].params[4],context.customerIdentifier);
 assert.equal(calls[1].params[5],context.visitId);
 assert.deepEqual(JSON.parse(calls[1].params[7]),
  [{category:'starter',name:evidence.itemName,quantity:evidence.quantity}]);
});

test('locked table state must be well-formed before an order or ledger INSERT',async()=>{
 const writer=createCatalogOrderWriter({newOrderId:()=>ids.orderId});
 const badRows=[
  null,{}, {first_confirmed_at:null,grouping_window_seconds:null},
  {first_confirmed_at:null,grouping_window_seconds:'300'},
  {first_confirmed_at:null,grouping_window_seconds:0},
  {first_confirmed_at:null,grouping_window_seconds:-1},
  {first_confirmed_at:null,grouping_window_seconds:1.5},
  {first_confirmed_at:'2026-10-22T12:00:00Z',grouping_window_seconds:300},
  {first_confirmed_at:new Date('invalid'),grouping_window_seconds:300}
 ];
 for(const bad of badRows){
  let queries=0;
  await assert.rejects(writer.persist(async()=>{
   queries++;
   return {rows:[bad]};
  },args),/invalid_catalog_order_table_state/);
  assert.equal(queries,1,'invalid occupancy must not reach INSERT');
 }
});

test('valid PostgreSQL timestamp from locked table is forwarded to grouping SQL',async()=>{
 const writer=createCatalogOrderWriter({newOrderId:()=>ids.orderId});
 const first=new Date('2026-10-22T12:00:00.000Z');
 const calls=[];
 const result=await writer.persist(async(sql,params)=>{
  calls.push({sql,params});
  if(calls.length===1)return {rows:[{first_confirmed_at:first,grouping_window_seconds:300}]};
  if(calls.length===2)return {rows:[{id:ids.orderId,grouping:'grouped',first_timestamp_written:false}]};
  return {rows:[{order_id:ids.orderId}]};
 },args);
 assert.equal(result.orderId,ids.orderId);
 assert.equal(calls[1].params[8],first);
 assert.equal(calls[1].params[9],300);
});

test('writer rejects inconsistent SQL grouping before immutable ledger INSERT',async()=>{
 const writer=createCatalogOrderWriter({newOrderId:()=>ids.orderId});
 for(const [first,grouping] of [
  [null,'grouped'],[null,'late'],[null,'unknown'],
  [new Date('2026-10-22T12:00:00Z'),'first'],
  [new Date('2026-10-22T12:00:00Z'),'unknown']
 ]){
  const statements=[];
  await assert.rejects(writer.persist(async sql=>{
   statements.push(sql);
   if(statements.length===1)return {rows:[{first_confirmed_at:first,grouping_window_seconds:300}]};
   return {rows:[{id:ids.orderId,grouping,first_timestamp_written:grouping==='first'}]};
  },args),/catalog_order_context_changed/);
  assert.equal(statements.length,2,'invalid grouping must not insert economic ledger');
 }
});

test('first-order timestamp update must be confirmed by SQL before ledger insert',async()=>{
 const writer=createCatalogOrderWriter({newOrderId:()=>ids.orderId});
 for(const [first,grouping,updated] of [
  [null,'first',false],
  [null,'first',null],
  [new Date('2026-10-22T12:00:00Z'),'grouped',true],
  [new Date('2026-10-22T12:00:00Z'),'late',undefined]
 ]){
  const statements=[];
  await assert.rejects(writer.persist(async sql=>{
   statements.push(sql);
   if(statements.length===1)return {rows:[{first_confirmed_at:first,grouping_window_seconds:300}]};
   return {rows:[{id:ids.orderId,grouping,first_timestamp_written:updated}]};
  },args),/catalog_order_context_changed/);
  assert.equal(statements.length,2,'no ledger insert on missing or contradictory timestamp update');
 }
});
