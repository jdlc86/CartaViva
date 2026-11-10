import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerCustomerOrderConfirmationFromPoolCandidate} from '../apps/api/src/customer-order-confirmation-pool-composition-candidate.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const endpoint='/api/v1/customer/orders/confirm';
const secretKey='only-for-isolated-integration-tests-long-secret-key';
const input={tableId:'00000000-0000-4000-8000-000000000001',visitId:'visit-1',basketId:'basket-1',
 actorId:'actor-1',itemId:'123e4567-e89b-12d3-a456-426614174000',
 selection:{extras:[]},quantity:1,requestKey:'request-001',
 qrToken:'q'.repeat(48),customerSessionToken:'s'.repeat(48)};
test('Fastify pool composition rejects forged price without checkout',async t=>{
 let checkouts=0;
 const app=Fastify();t.after(()=>app.close());
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  pool:{connect:async()=>{checkouts++;throw Error('unexpected checkout');}},
  secretKey
 });
 const r=await app.inject({method:'POST',url:endpoint,
  payload:{...input,totalCents:1}});
 assert.equal(r.statusCode,400);
 assert.deepEqual(r.json(),{error:'invalid_confirmation_input'});
 assert.equal(checkouts,0);
});
test('Fastify pool composition rolls back and returns 403 on forbidden visit',async t=>{
 const events=[];
 const app=Fastify();t.after(()=>app.close());
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  secretKey,pool:{connect:async()=>({
   query:async(sql)=>{
    events.push(sql);
    if(sql==='BEGIN'||sql==='ROLLBACK')return {rows:[]};
    return {rows:[]};
   },
   release:error=>events.push(error?'discard':'clean')
  })}
 });
 const r=await app.inject({method:'POST',url:endpoint,payload:input});
 assert.equal(r.statusCode,403);
 assert.deepEqual(r.json(),{error:'order_context_forbidden'});
 assert.equal(events[0],'BEGIN');
 assert.ok(events.includes('ROLLBACK'));
 assert.equal(events.includes('COMMIT'),false);
 assert.equal(events.at(-1),'clean');
});
test('Fastify pool composition hides database error and rolls back',async t=>{
 const events=[];
 const app=Fastify();t.after(()=>app.close());
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  secretKey,pool:{connect:async()=>({
   query:async sql=>{
    events.push(sql);
    if(sql!=='BEGIN'&&sql!=='ROLLBACK')
     throw Error('postgres://internal:private@database');
    return {rows:[]};
   },
   release:error=>events.push(error?'discard':'clean')
  })}
 });
 const r=await app.inject({method:'POST',url:endpoint,payload:input});
 assert.equal(r.statusCode,503);
 assert.deepEqual(r.json(),{error:'order_confirmation_unavailable'});
 assert.equal(r.body.includes('private'),false);
 assert.ok(events.includes('ROLLBACK'));
 assert.equal(events.includes('COMMIT'),false);
});
test('pool composition fails closed before registering route with missing dependencies',()=>{
 const app=Fastify();
 assert.throws(()=>registerCustomerOrderConfirmationFromPoolCandidate(app,{
  pool:{connect:async()=>({})},secretKey:'short'
 }),/invalid_customer_order_pool_composition/);
 return app.close();
});

test('Fastify pool composition rejects invalid trusted visit row and rolls back',async t=>{
 const events=[];
 const app=Fastify();t.after(()=>app.close());
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  secretKey,pool:{connect:async()=>({
   query:async sql=>{
    events.push(sql);
    if(sql.includes('FROM sabora.dining_tables AS t'))return {rows:[{
     table_id:input.tableId,session_id:'00000000-0000-4000-8000-000000000002',
     visit_id:input.visitId,actor_id:input.actorId,
     customer_alias:'Valid alias',customer_identifier:'invalid-private-id'
    }]};
    return {rows:[]};
   },
   release:error=>events.push(error?'discard':'clean')
  })}
 });
 const r=await app.inject({method:'POST',url:endpoint,payload:input});
 assert.equal(r.statusCode,503);
 assert.deepEqual(r.json(),{error:'order_confirmation_unavailable'});
 assert.equal(r.body.includes('invalid-private-id'),false);
 assert.ok(events.includes('ROLLBACK'));
 assert.equal(events.includes('COMMIT'),false);
 assert.equal(events.at(-1),'clean');
});
test('Fastify pool composition rejects malformed connection before SQL',async t=>{
 let discarded=0;
 const app=Fastify();t.after(()=>app.close());
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  secretKey,pool:{connect:async()=>({release:()=>{discarded++;}})}
 });
 const r=await app.inject({method:'POST',url:endpoint,payload:input});
 assert.equal(r.statusCode,503);
 assert.deepEqual(r.json(),{error:'order_confirmation_unavailable'});
 assert.equal(discarded,1);
});

test('Fastify injected pool confirms order and ledger in one transaction',async t=>{
 const {buildCatalogLineEvidence}=await import('../apps/api/src/catalog-line-evidence.mjs');
 const orderId='00000000-0000-4000-8000-000000000005';
 const quoteId='00000000-0000-4000-8000-000000000004';
 const snapshot={name:'Plato',category:'Segundos',priceCents:1000,
  allergens:[],options:[],extras:[],discount:null};
 const evidence=buildCatalogLineEvidence({
  itemId:input.itemId,publishedRevision:1,snapshot,
  selection:input.selection,quantity:input.quantity
 });
 const events=[];
 const app=Fastify();t.after(()=>app.close());
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  secretKey,newOrderId:()=>orderId,clock:()=>1792600000000,
  pool:{connect:async()=>({
   query:async(sql,params)=>{
    events.push(sql);
    if(sql.includes('FROM sabora.dining_tables AS t'))return {rows:[{
     table_id:input.tableId,session_id:'00000000-0000-4000-8000-000000000002',
     visit_id:input.visitId,actor_id:input.actorId,
     customer_alias:'Cliente',
     customer_identifier:'SB-222222222222'
    }]};
    if(sql.includes('FROM sabora.catalog_confirmation_attempts'))return {rows:[]};
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
    if(sql.includes('INSERT INTO sabora.orders'))return {rows:[{
     id:orderId,grouping:'first',first_timestamp_written:true
    }]};
    if(sql.includes('INSERT INTO sabora.catalog_confirmation_attempts'))
     return {rows:[{order_id:orderId}]};
    return {rows:[]};
   },
   release:error=>events.push(error?'discard':'clean')
  })}
 });
 const r=await app.inject({method:'POST',url:endpoint,payload:input});
 assert.equal(r.statusCode,201);
 assert.deepEqual(r.json(),{status:'confirmed',orderId});
 const orderIndex=events.findIndex(sql=>sql.includes('INSERT INTO sabora.orders'));
 const ledgerIndex=events.findIndex(sql=>sql.includes(
  'INSERT INTO sabora.catalog_confirmation_attempts'));
 assert.ok(orderIndex>0);
 assert.ok(ledgerIndex>orderIndex);
 assert.ok(events.indexOf('COMMIT')>ledgerIndex);
 assert.equal(events.includes('ROLLBACK'),false);
 assert.equal(events.at(-1),'clean');
});

test('Fastify pool transaction rolls back order when economic ledger insert fails',async t=>{
 const {buildCatalogLineEvidence}=await import('../apps/api/src/catalog-line-evidence.mjs');
 const orderId='00000000-0000-4000-8000-000000000005';
 const snapshot={name:'Plato',category:'Segundos',priceCents:1000,
  allergens:[],options:[],extras:[],discount:null};
 const evidence=buildCatalogLineEvidence({
  itemId:input.itemId,publishedRevision:1,snapshot,
  selection:input.selection,quantity:input.quantity
 });
 const events=[];
 const app=Fastify();t.after(()=>app.close());
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  secretKey,newOrderId:()=>orderId,clock:()=>1792600000000,
  pool:{connect:async()=>({
   query:async sql=>{
    events.push(sql);
    if(sql.includes('FROM sabora.dining_tables AS t'))return {rows:[{
     table_id:input.tableId,
     session_id:'00000000-0000-4000-8000-000000000002',
     visit_id:input.visitId,actor_id:input.actorId,
     customer_alias:'Cliente',customer_identifier:'SB-222222222222'
    }]};
    if(sql.includes('FROM sabora.catalog_confirmation_attempts'))return {rows:[]};
    if(sql.includes('FROM sabora.catalog_items'))return {rows:[{
     published_revision:1,published_snapshot:snapshot,
     withdrawn_at:null,sold_out:false
    }]};
    if(sql.includes('FROM sabora.catalog_displayed_quotes'))return {rows:[{
     id:'00000000-0000-4000-8000-000000000004',
     published_revision:1,subtotal_cents:1000,
     discount_cents:0,total_cents:1000,evidence
    }]};
    if(sql.includes('SELECT first_confirmed_at,grouping_window_seconds'))
     return {rows:[{first_confirmed_at:null,grouping_window_seconds:300}]};
    if(sql.includes('INSERT INTO sabora.orders'))return {rows:[{
     id:orderId,grouping:'first',first_timestamp_written:true
    }]};
    if(sql.includes('INSERT INTO sabora.catalog_confirmation_attempts'))
     throw Error('private-ledger-constraint-failure');
    return {rows:[]};
   },
   release:error=>events.push(error?'discard':'clean')
  })}
 });
 const r=await app.inject({method:'POST',url:endpoint,payload:input});
 assert.equal(r.statusCode,503);
 assert.deepEqual(r.json(),{error:'order_confirmation_unavailable'});
 assert.equal(r.body.includes('private-ledger'),false);
 const orderIndex=events.findIndex(sql=>sql.includes('INSERT INTO sabora.orders'));
 const ledgerIndex=events.findIndex(sql=>sql.includes(
  'INSERT INTO sabora.catalog_confirmation_attempts'));
 assert.ok(orderIndex>0);
 assert.ok(ledgerIndex>orderIndex);
 assert.ok(events.indexOf('ROLLBACK')>ledgerIndex);
 assert.equal(events.includes('COMMIT'),false);
 assert.equal(events.at(-1),'clean');
});
