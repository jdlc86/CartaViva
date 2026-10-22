import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogOrderConfirmationPoolCandidate} from '../apps/api/src/catalog-order-confirmation-candidate.mjs';

const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const itemId='00000000-0000-4000-8000-000000000003';
const quoteId='00000000-0000-4000-8000-000000000004';
const orderId='00000000-0000-4000-8000-000000000005';
const snapshot={name:'Plato CI',category:'Primeros',priceCents:1000,
 allergens:[],options:[],extras:[],discount:null};
const input={tableId,visitId:'visit-ci',basketId:'basket-ci',actorId:'actor-ci',
 itemId,selection:{options:{},extras:[]},quantity:1,requestKey:'request-001',
 qrToken:'q'.repeat(64),customerSessionToken:'s'.repeat(64)};

function harness({failLedger=false,closed=false}={}){
 const statements=[],events=[];
 let releases=0,connects=0;
 const client={
  async query(sql,args=[]){
   statements.push({sql,args});
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'){
    events.push(sql);return {rows:[]};
   }
   if(sql.includes('FROM sabora.dining_tables')&&sql.includes('customer_table_visits'))
    return {rows:closed?[]:[{table_id:tableId,session_id:sessionId,
     visit_id:input.visitId,actor_id:input.actorId,
     customer_alias:'Cliente',customer_identifier:'SB-23456789ABCD'}]};
   if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]};
   if(sql.includes('FROM sabora.catalog_confirmation_attempts'))return {rows:[]};
   if(sql.includes('FROM sabora.catalog_items'))return {rows:[{
    published_revision:'1',published_snapshot:snapshot,withdrawn_at:null,sold_out:false}]};
   if(sql.includes('FROM sabora.catalog_displayed_quotes'))return {rows:[{
    id:quoteId,published_revision:'1',subtotal_cents:'1000',
    discount_cents:'0',total_cents:'1000',evidence:{
     schemaVersion:1,itemId,publishedRevision:1,itemName:'Plato CI',
     category:'Primeros',quantity:1,basePriceCents:1000,options:[],
     extras:[],subtotalCents:1000,discountCents:0,totalCents:1000,
     allergens:[],discount:null
    }}]};
   if(sql.includes('FROM sabora.dining_tables')&&sql.includes('FOR UPDATE'))
    return {rows:[{first_confirmed_at:null,grouping_window_seconds:300}]};
   if(sql.includes('INSERT INTO sabora.orders'))return {rows:[{id:orderId,grouping:'first'}]};
   if(sql.includes('INSERT INTO sabora.catalog_confirmation_attempts')){
    if(failLedger)throw Error('ledger_failure');
    return {rows:[{order_id:orderId}]};
   }
   throw Error('unexpected_sql');
  },
  release(error){releases++;events.push(error?'DISCARD':'RELEASE');}
 };
 const confirm=createCatalogOrderConfirmationPoolCandidate({
  pool:{async connect(){connects++;return client;}},
  newOrderId:()=>orderId,secretKey:'test-secret-with-more-than-32-bytes-only',
  clock:()=>1792600000000
 });
 return {confirm,events,statements,get releases(){return releases;},
  get connects(){return connects;}};
}

test('injected pool candidate commits once and releases the checked-out client',async()=>{
 const h=harness();
 const result=await h.confirm(input);
 assert.equal(result.status,'confirmed');
 assert.equal(result.result.orderId,orderId);
 assert.deepEqual(h.events,['BEGIN','COMMIT','RELEASE']);
 assert.equal(h.connects,1);
 assert.equal(h.releases,1);
 assert.ok(h.statements.some(s=>s.sql.includes('INSERT INTO sabora.orders')));
 assert.ok(h.statements.some(s=>s.sql.includes('INSERT INTO sabora.catalog_confirmation_attempts')));
});
test('ledger error rolls back the order transaction and releases the same client',async()=>{
 const h=harness({failLedger:true});
 await assert.rejects(h.confirm(input),/ledger_failure/);
 assert.deepEqual(h.events,['BEGIN','ROLLBACK','RELEASE']);
 assert.equal(h.connects,1);
 assert.equal(h.releases,1);
});
test('revoked visit denies before order insertion and rolls back',async()=>{
 const h=harness({closed:true});
 await assert.rejects(h.confirm(input),/order_context_forbidden/);
 assert.deepEqual(h.events,['BEGIN','ROLLBACK','RELEASE']);
 assert.equal(h.statements.some(s=>s.sql.includes('INSERT INTO sabora.orders')),false);
});
