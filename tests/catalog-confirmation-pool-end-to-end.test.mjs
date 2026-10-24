import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogOrderConfirmationPoolCandidate} from '../apps/api/src/catalog-order-confirmation-candidate.mjs';
import {buildCatalogLineEvidence} from '../apps/api/src/catalog-line-evidence.mjs';
import {issueCatalogRepriceAcceptance} from '../apps/api/src/catalog-reprice-acceptance.mjs';

// Pool-level integration of the actual candidate factory, transaction wrapper,
// authorization/read repositories, order writer and confirmation ledger.
// This is a deterministic simulated SQL adapter, NOT a PostgreSQL 17 proof.
const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const itemId='00000000-0000-4000-8000-000000000003';
const quoteId='00000000-0000-4000-8000-000000000004';
const orderId='00000000-0000-4000-8000-000000000005';
const key='pool-integration-secret-at-least-32-bytes-long';
const now=1792600000000;
const snapshot={name:'Plato',category:'Primeros',priceCents:1000,
 allergens:[],options:[],extras:[],discount:null};
const input={tableId,visitId:'visit_pool',basketId:'basket_pool',
 actorId:'actor_pool',itemId,selection:{options:{},extras:[]},
 quantity:1,requestKey:'request_pool_001',
 qrToken:'q'.repeat(64),customerSessionToken:'s'.repeat(64)};
const quoteEvidence=buildCatalogLineEvidence({itemId,publishedRevision:1,
 snapshot,selection:input.selection,quantity:1});

function makePool({revoked=false,soldOut=false,failLedger=false,
 revision=1,priceCents=1000,existing=null,firstConfirmedAt=null,
 groupingWindowSeconds=300,orderIds=[orderId],clockMs=now}={}){
 const state={orders:[],attempts:existing?[existing]:[],first:firstConfirmedAt};
 const log=[];
 let releases=0;
 let connections=0;
 let nextOrder=0;
 const currentSnapshot={...snapshot,priceCents};
 const pool={
  async connect(){
   connections++;
   let stagedOrders=[],stagedAttempts=[],stagedFirst=state.first;
   let inTransaction=false;
   return {
    async query(sql,args){
     log.push({sql,args});
     if(sql==='BEGIN'){assert.equal(inTransaction,false);inTransaction=true;return {rows:[]};}
     if(sql==='COMMIT'){
      assert.equal(inTransaction,true);
      state.orders.push(...stagedOrders);
      state.attempts.push(...stagedAttempts);
      state.first=stagedFirst;
      inTransaction=false;
      return {rows:[]};
     }
     if(sql==='ROLLBACK'){
      stagedOrders=[];stagedAttempts=[];stagedFirst=state.first;
      inTransaction=false;
      return {rows:[]};
     }
     assert.equal(inTransaction,true,'all candidate SQL must run inside transaction');
     if(sql.includes('customer_table_visits'))return {rows:revoked?[]:[{
      table_id:tableId,session_id:sessionId,visit_id:input.visitId,
      actor_id:input.actorId,customer_alias:'Cliente',
      customer_identifier:'SB-23456789ABCD'}]};
     if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]};
     if(sql.includes('FROM sabora.catalog_confirmation_attempts')){
      const record=state.attempts.find(a=>a.requestKey===args[5]);
      return {rows:record?[{request_fingerprint:record.fingerprint,order_id:record.orderId}]:[]};
     }
     if(sql.includes('FROM sabora.catalog_items'))return {rows:[{
      published_revision:revision,published_snapshot:currentSnapshot,
      withdrawn_at:null,sold_out:soldOut}]};
     if(sql.includes('FROM sabora.catalog_displayed_quotes'))return {rows:[{
      id:quoteId,published_revision:1,subtotal_cents:1000,
      discount_cents:0,total_cents:1000,evidence:quoteEvidence}]};
     if(sql.includes('FROM sabora.dining_tables')&&sql.includes('FOR UPDATE'))
      return {rows:[{first_confirmed_at:stagedFirst,grouping_window_seconds:groupingWindowSeconds}]};
     if(sql.includes('INSERT INTO sabora.orders')){
      const grouping=stagedFirst===null?'first':
       clockMs<stagedFirst.getTime()+groupingWindowSeconds*1000?'grouped':'late';
      stagedOrders.push({id:args[0],grouping,items:JSON.parse(args[7])});
      if(grouping==='first')stagedFirst=new Date(clockMs);
      return {rows:[{id:args[0],grouping,first_timestamp_written:grouping==='first'}]};
     }
     if(sql.includes('INSERT INTO sabora.catalog_confirmation_attempts')){
      if(failLedger)throw Error('simulated_ledger_failure');
      stagedAttempts.push({requestKey:args[6],fingerprint:args[7],orderId:args[10]});
      return {rows:[{order_id:args[10]}]};
     }
     throw Error('unexpected_sql:'+sql.slice(0,100));
    },
    release(){releases++;}
   };
  }
 };
 const confirm=createCatalogOrderConfirmationPoolCandidate({
  pool,secretKey:key,clock:()=>clockMs,
  newOrderId:()=>orderIds[nextOrder++] ?? orderId
 });
 return {confirm,state,log,get releases(){return releases;},
  get connections(){return connections;}};
}

test('pool candidate commits order, kitchen projection and ledger in one transaction',async()=>{
 const f=makePool();
 const result=await f.confirm(input);
 assert.equal(result.status,'confirmed');
 assert.equal(result.result.orderId,orderId);
 assert.equal(f.state.orders.length,1);
 assert.equal(f.state.attempts.length,1);
 assert.deepEqual(f.state.orders[0].items,[{category:'starter',name:'Plato',quantity:1}]);
 assert.equal(f.state.first instanceof Date,true);
 assert.equal(f.releases,1);
 assert.equal(f.connections,1);
 assert.equal(f.log[0].sql,'BEGIN');
 assert.equal(f.log.at(-1).sql,'COMMIT');
 assert.equal(f.log.filter(x=>x.sql==='COMMIT').length,1);
});
test('pool candidate replays durable attempt without a second order or catalog read',async()=>{
 const f=makePool();
 await f.confirm(input);
 const firstReadCount=f.log.filter(x=>x.sql.includes('FROM sabora.catalog_items')).length;
 const result=await f.confirm(input);
 assert.equal(result.status,'replayed');
 assert.equal(result.result.orderId,orderId);
 assert.equal(f.state.orders.length,1);
 assert.equal(f.state.attempts.length,1);
 assert.equal(f.log.filter(x=>x.sql.includes('FROM sabora.catalog_items')).length,firstReadCount);
 assert.equal(f.releases,2);
});
test('pool candidate rolls back order, ledger and first occupancy when ledger fails',async()=>{
 const f=makePool({failLedger:true});
 await assert.rejects(f.confirm(input),/simulated_ledger_failure/);
 assert.equal(f.state.orders.length,0);
 assert.equal(f.state.attempts.length,0);
 assert.equal(f.state.first,null);
 assert.equal(f.log.at(-1).sql,'ROLLBACK');
 assert.equal(f.releases,1);
});
test('pool candidate refuses revoked visits and unavailable catalog without writes',async()=>{
 for(const settings of [{revoked:true},{soldOut:true}]){
  const f=makePool(settings);
  await assert.rejects(f.confirm(input),/order_context_forbidden|order_catalog_unavailable/);
  assert.equal(f.state.orders.length,0);
  assert.equal(f.state.attempts.length,0);
  assert.equal(f.log.at(-1).sql,'ROLLBACK');
  assert.equal(f.releases,1);
 }
});
test('pool candidate requires signed reprice consent and preserves atomicity',async()=>{
 const f=makePool({revision:2,priceCents:900});
 const first=await f.confirm(input);
 assert.equal(first.status,'acceptance_required');
 assert.equal(f.state.orders.length,0);
 assert.equal(f.state.attempts.length,0);
 const acceptanceToken=issueCatalogRepriceAcceptance({
  basketId:input.basketId,actorId:input.actorId,itemId,
  publishedRevision:2,snapshot:{...snapshot,priceCents:900},
  selection:input.selection,quantity:1,secretKey:key,nowMs:now
 }).token;
 const confirmed=await f.confirm({...input,acceptanceToken});
 assert.equal(confirmed.status,'confirmed');
 assert.equal(f.state.orders.length,1);
 assert.equal(f.state.attempts.length,1);
 assert.equal(f.releases,2);
});
test('pool candidate refuses mismatched replay fingerprint before catalog and writer',async()=>{
 const f=makePool();
 await f.confirm(input);
 await assert.rejects(f.confirm({...input,quantity:2}),/order_idempotency_conflict/);
 assert.equal(f.state.orders.length,1);
 assert.equal(f.state.attempts.length,1);
 assert.equal(f.log.at(-1).sql,'ROLLBACK');
 assert.equal(f.releases,2);
});

test('pool candidate classifies a subsequent confirmation inside grouping window',async()=>{
 const first=new Date(now-1000);
 const f=makePool({firstConfirmedAt:first});
 const result=await f.confirm(input);
 assert.equal(result.status,'confirmed');
 assert.equal(f.state.orders[0].grouping,'grouped');
 assert.equal(f.state.first,first);
 assert.equal(f.state.attempts.length,1);
});
test('pool candidate classifies confirmation at grouping deadline as late',async()=>{
 const first=new Date(now-300000);
 const f=makePool({firstConfirmedAt:first});
 const result=await f.confirm(input);
 assert.equal(result.status,'confirmed');
 assert.equal(f.state.orders[0].grouping,'late');
 assert.equal(f.state.first,first);
 assert.equal(f.state.attempts.length,1);
});
test('pool candidate never persists a forged quote when previous price differs',async()=>{
 const f=makePool({revision:2,priceCents:1100});
 const response=await f.confirm(input);
 assert.equal(response.status,'acceptance_required');
 assert.equal(f.state.orders.length,0);
 assert.equal(f.state.attempts.length,0);
 assert.equal(f.state.first,null);
 assert.equal(f.log.at(-1).sql,'COMMIT');
});
test('pool candidate releases its transaction after an invalid idempotency replay',async()=>{
 const f=makePool({existing:{
  requestKey:input.requestKey,fingerprint:'another_fingerprint',orderId
 }});
 await assert.rejects(f.confirm(input),/order_idempotency_conflict/);
 assert.equal(f.log.at(-1).sql,'ROLLBACK');
 assert.equal(f.state.orders.length,0);
 assert.equal(f.releases,1);
});
