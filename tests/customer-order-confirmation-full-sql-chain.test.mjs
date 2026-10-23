import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildCatalogLineEvidence} from '../apps/api/src/catalog-line-evidence.mjs';
import {registerCustomerOrderConfirmationFromPoolCandidate} from '../apps/api/src/customer-order-confirmation-pool-composition-candidate.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const quoteId='00000000-0000-4000-8000-000000000004';
const orderId='00000000-0000-4000-8000-000000000005';
const itemId='123e4567-e89b-12d3-a456-426614174000';
const snapshot={name:'Plato',category:'Segundos',priceCents:1000,
 allergens:[],options:[],extras:[],discount:null};
const input={tableId,visitId:'visit-1',basketId:'basket-1',
 actorId:'actor-1',itemId,selection:{extras:[]},quantity:1,
 requestKey:'request-001',qrToken:'q'.repeat(48),
 customerSessionToken:'s'.repeat(48)};
const evidence=buildCatalogLineEvidence({
 itemId,publishedRevision:1,snapshot,selection:input.selection,quantity:1
});
test('Fastify confirms and replays order via real repository, SQL transaction and ledger writer',async t=>{
 const statements=[];
 let attempts=0;
 let writes=0;
 let commits=0;
 const pool={connect:async()=>({
  query:async(sql,params)=>{
   statements.push(sql);
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'){
    if(sql==='COMMIT')commits++;
    return {rows:[]};
   }
   if(sql.includes('FROM sabora.dining_tables AS t'))return {rows:[{
    table_id:tableId,session_id:sessionId,visit_id:input.visitId,
    actor_id:input.actorId,customer_alias:'Ana',
    customer_identifier:'SB-23456789ABCD'
   }]};
   if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[{}]};
   if(sql.includes('FROM sabora.catalog_confirmation_attempts')&&sql.includes('FOR UPDATE'))
    return {rows:attempts?[{
     request_fingerprint:storedFingerprint,order_id:orderId
    }]:[]};
   if(sql.includes('FROM sabora.catalog_items'))return {rows:[{
    published_revision:1,published_snapshot:snapshot,
    withdrawn_at:null,sold_out:false
   }]};
   if(sql.includes('FROM sabora.catalog_displayed_quotes'))return {rows:[{
    id:quoteId,published_revision:1,subtotal_cents:1000,
    discount_cents:0,total_cents:1000,evidence
   }]};
   if(sql.includes('SELECT first_confirmed_at,grouping_window_seconds'))
    return {rows:[{first_confirmed_at:null,grouping_window_seconds:300}]};
   if(sql.includes('INSERT INTO sabora.orders')){
    writes++;
    assert.equal(params[0],orderId);
    assert.equal(JSON.parse(params[6]).totalCents,1000);
    return {rows:[{id:orderId,grouping:'first',first_timestamp_written:true}]};
   }
   if(sql.includes('INSERT INTO sabora.catalog_confirmation_attempts')){
    attempts++;
    storedFingerprint=params[7];
    assert.equal(params[10],orderId);
    return {rows:[{order_id:orderId}]};
   }
   throw Error('unexpected_sql_statement');
  },
  release:()=>{}
 })};
 let storedFingerprint;
 const app=Fastify();t.after(()=>app.close());
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  pool,secretKey:'isolated-test-only-long-server-side-secret-key',
  clock:()=>1792600000000,newOrderId:()=>orderId
 });
 const first=await app.inject({method:'POST',
  url:'/api/v1/customer/orders/confirm',payload:input});
 assert.equal(first.statusCode,201,first.body);
 assert.deepEqual(first.json(),{status:'confirmed',orderId});
 assert.equal(writes,1);
 assert.equal(attempts,1);
 assert.equal(commits,1);
 // The replay fingerprint is persisted in the ledger's bound parameters.
 const ledgerSql=statements.find(x=>x.includes('INSERT INTO sabora.catalog_confirmation_attempts'));
 assert.ok(ledgerSql);
 assert.equal(typeof storedFingerprint,'string');
 const second=await app.inject({method:'POST',
  url:'/api/v1/customer/orders/confirm',payload:input});
 assert.equal(second.statusCode,200,second.body);
 assert.deepEqual(second.json(),{status:'replayed',orderId});
 assert.equal(writes,1);
 assert.equal(attempts,1);
 assert.equal(commits,2);
});
