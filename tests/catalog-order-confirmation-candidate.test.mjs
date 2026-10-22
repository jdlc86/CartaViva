import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogOrderConfirmationCandidate} from '../apps/api/src/catalog-order-confirmation-candidate.mjs';
import {buildCatalogLineEvidence} from '../apps/api/src/catalog-line-evidence.mjs';

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
const evidence=buildCatalogLineEvidence({itemId,publishedRevision:1,
 snapshot,selection:input.selection,quantity:1});

function fixture({revoked=false,failLedger=false,soldOut=false}={}){
 const statements=[],events=[];
 const query=async(sql,args)=>{
  statements.push({sql,args});
  if(sql.includes('FROM sabora.dining_tables')&&sql.includes('customer_table_visits'))
   return {rows:revoked?[]:[{table_id:tableId,session_id:sessionId,
    visit_id:input.visitId,actor_id:input.actorId,
    customer_alias:'Cliente',customer_identifier:'SB-23456789ABCD'}]};
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]};
  if(sql.includes('FROM sabora.catalog_confirmation_attempts'))return {rows:[]};
  if(sql.includes('FROM sabora.catalog_items'))return {rows:[{
   published_revision:'1',published_snapshot:snapshot,withdrawn_at:null,
   sold_out:soldOut}]};
  if(sql.includes('FROM sabora.catalog_displayed_quotes'))return {rows:[{
   id:quoteId,published_revision:'1',subtotal_cents:'1000',
   discount_cents:'0',total_cents:'1000',evidence}]};
  if(sql.includes('FROM sabora.dining_tables')&&sql.includes('FOR UPDATE'))
   return {rows:[{first_confirmed_at:null,grouping_window_seconds:300}]};
  if(sql.includes('INSERT INTO sabora.orders'))return {rows:[{id:orderId,grouping:'first',first_timestamp_written:true}]};
  if(sql.includes('INSERT INTO sabora.catalog_confirmation_attempts')){
   if(failLedger)throw Error('ledger_failure');
   return {rows:[{order_id:orderId}]};
  }
  throw Error('unexpected_sql');
 };
 const confirm=createCatalogOrderConfirmationCandidate({
  newOrderId:()=>orderId,secretKey:'test-secret-with-more-than-32-bytes-only',
  clock:()=>1792600000000,
  withTransaction:async work=>{
   events.push('BEGIN');
   try{const result=await work(query);events.push('COMMIT');return result;}
   catch(error){events.push('ROLLBACK');throw error;}
  }
 });
 return {confirm,statements,events};
}

test('candidate confirms with one transaction and kitchen projection plus ledger',async()=>{
 const f=fixture();
 const result=await f.confirm(input);
 assert.equal(result.status,'confirmed');
 assert.equal(result.result.orderId,orderId);
 assert.deepEqual(f.events,['BEGIN','COMMIT']);
 const order=f.statements.find(s=>s.sql.includes('INSERT INTO sabora.orders'));
 const ledger=f.statements.find(s=>s.sql.includes('INSERT INTO sabora.catalog_confirmation_attempts'));
 assert.ok(order);
 assert.ok(ledger);
 assert.deepEqual(JSON.parse(order.args[7]),[{category:'starter',name:'Plato CI',quantity:1}]);
 assert.equal(order.args[3],'Cliente');
 assert.equal(order.args[4],'SB-23456789ABCD');
 assert.equal(ledger.args[10],orderId);
 assert.ok(f.statements.indexOf(order)<f.statements.indexOf(ledger));
});

test('candidate never writes when visit revoked or catalog sold out',async()=>{
 for(const config of [{revoked:true},{soldOut:true}]){
  const f=fixture(config);
  await assert.rejects(f.confirm(input),/order_context_forbidden|order_catalog_unavailable/);
  assert.deepEqual(f.events,['BEGIN','ROLLBACK']);
  assert.equal(f.statements.some(s=>s.sql.includes('INSERT INTO sabora.orders')),false);
 }
});

test('candidate ledger failure aborts the enclosing transaction',async()=>{
 const f=fixture({failLedger:true});
 await assert.rejects(f.confirm(input),/ledger_failure/);
 assert.deepEqual(f.events,['BEGIN','ROLLBACK']);
 assert.equal(f.statements.some(s=>s.sql.includes('INSERT INTO sabora.orders')),true);
});
