import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogConfirmationCoordinator} from '../apps/api/src/catalog-confirmation-coordinator.mjs';
import {createCatalogConfirmationRepository} from '../apps/api/src/catalog-confirmation-repository.mjs';
import {buildCatalogLineEvidence} from '../apps/api/src/catalog-line-evidence.mjs';

const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const itemId='00000000-0000-4000-8000-000000000003';
const quoteId='00000000-0000-4000-8000-000000000004';
const orderId='00000000-0000-4000-8000-000000000005';
const secretKey='isolated-test-only-32-byte-secret-not-production';
const snapshot={name:'Plato CI',category:'Primeros',priceCents:1000,
 allergens:[],options:[],extras:[],discount:null};
const input={tableId,visitId:'visit-ci',basketId:'basket-ci',actorId:'actor-ci',
 itemId,selection:{options:{},extras:[]},quantity:1,requestKey:'request-001',
 qrToken:'q'.repeat(64),customerSessionToken:'s'.repeat(64)};
const evidence=buildCatalogLineEvidence({itemId,publishedRevision:1,
 snapshot,selection:input.selection,quantity:1});

function fixture({revoked=false,soldOut=false,storedFingerprint=null,
 persistedFails=false,revision=1}={}){
 const statements=[],events=[];
 let persisted=0;
 const query=async(sql,args)=>{
  statements.push({sql,args});
  if(sql.includes('FROM sabora.dining_tables'))return {rows:revoked?[]:[{
   table_id:tableId,session_id:sessionId,visit_id:input.visitId,actor_id:input.actorId
  }]};
  if(sql.includes('FROM sabora.catalog_confirmation_attempts'))
   return {rows:storedFingerprint===null?[]:[{
    request_fingerprint:storedFingerprint,order_id:orderId
   }]};
  if(sql.includes('FROM sabora.catalog_items'))return {rows:[{
   published_revision:String(revision),published_snapshot:snapshot,
   withdrawn_at:null,sold_out:soldOut
  }]};
  if(sql.includes('FROM sabora.catalog_displayed_quotes'))return {rows:[{
   id:quoteId,published_revision:'1',subtotal_cents:'1000',
   discount_cents:'0',total_cents:'1000',evidence
  }]};
  throw Error('unexpected_sql');
 };
 const repository=createCatalogConfirmationRepository({
  persist:async(_query,args)=>{
   persisted++;
   if(persistedFails)throw Error('durable_writer_failed');
   assert.equal(args.context.sessionId,sessionId);
   assert.equal(args.quoteId,quoteId);
   assert.equal(args.evidence.totalCents,1000);
   assert.equal(args.acceptanceVerified,false);
   return {orderId};
  }
 });
 const confirm=createCatalogConfirmationCoordinator({
  repository,secretKey,clock:()=>1792600000000,
  withTransaction:async work=>{
   events.push('BEGIN');
   try{const result=await work(query);events.push('COMMIT');return result;}
   catch(error){events.push('ROLLBACK');throw error;}
  }
 });
 return {confirm,statements,events,get persisted(){return persisted;}};
}
test('real candidate reads and injected writer share authorized confirmation transaction',async()=>{
 const f=fixture();
 const result=await f.confirm(input);
 assert.equal(result.status,'confirmed');
 assert.equal(result.result.orderId,orderId);
 assert.deepEqual(f.events,['BEGIN','COMMIT']);
 assert.equal(f.persisted,1);
 assert.equal(f.statements.length,4);
 assert.match(f.statements[0].sql,/FOR SHARE OF t,v,s/);
 assert.match(f.statements[1].sql,/FOR UPDATE/);
 assert.match(f.statements[2].sql,/FOR SHARE/);
 assert.match(f.statements[3].sql,/FOR SHARE/);
 assert.equal(JSON.stringify(f.statements.slice(1)).includes(input.qrToken),false);
 assert.equal(JSON.stringify(f.statements.slice(1)).includes(input.customerSessionToken),false);
});
test('revoked visit fails before replay, catalog and writer',async()=>{
 const f=fixture({revoked:true});
 await assert.rejects(f.confirm(input),/order_context_forbidden/);
 assert.deepEqual(f.events,['BEGIN','ROLLBACK']);
 assert.equal(f.statements.length,1);
 assert.equal(f.persisted,0);
});
test('sold-out catalog fails before quote and writer',async()=>{
 const f=fixture({soldOut:true});
 await assert.rejects(f.confirm(input),/order_catalog_unavailable/);
 assert.deepEqual(f.events,['BEGIN','ROLLBACK']);
 assert.equal(f.statements.length,3);
 assert.equal(f.persisted,0);
});
test('revision change requires acceptance without writing an order',async()=>{
 const f=fixture({revision:2});
 const result=await f.confirm(input);
 assert.equal(result.status,'acceptance_required');
 assert.deepEqual(f.events,['BEGIN','COMMIT']);
 assert.equal(f.statements.length,4);
 assert.equal(f.persisted,0);
});
test('durable writer failure propagates and aborts transaction',async()=>{
 const f=fixture({persistedFails:true});
 await assert.rejects(f.confirm(input),/durable_writer_failed/);
 assert.deepEqual(f.events,['BEGIN','ROLLBACK']);
 assert.equal(f.persisted,1);
});
test('same scoped replay is returned before catalog and writer',async()=>{
 const first=fixture();
 await first.confirm(input);
 const replayFingerprint=first.statements[1].args && null;
 // Capture the canonical request identity through a scoped repository spy,
 // not from client-supplied monetary data.
 let fingerprint;
 const capture=createCatalogConfirmationRepository({persist:async()=>({orderId})});
 const original=capture.lookupIdempotency;
 const wrapped=Object.freeze({...capture,lookupIdempotency:async(query,args)=>{
  fingerprint=args.requestFingerprint;return original(query,args);
 }});
 const confirm=createCatalogConfirmationCoordinator({
  repository:wrapped,secretKey,clock:()=>1792600000000,
  withTransaction:async work=>work(async(sql,args)=>{
   if(sql.includes('FROM sabora.dining_tables'))return {rows:[{
    table_id:tableId,session_id:sessionId,visit_id:input.visitId,actor_id:input.actorId
   }]};
   if(sql.includes('FROM sabora.catalog_confirmation_attempts'))
    return {rows:[{request_fingerprint:fingerprint,order_id:orderId}]};
   throw Error('catalog must not be queried on replay');
  })
 });
 const result=await confirm(input);
 assert.equal(result.status,'replayed');
 assert.equal(result.result.orderId,orderId);
});
