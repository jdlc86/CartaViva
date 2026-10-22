import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogOrderConfirmationPoolCandidate} from '../apps/api/src/catalog-order-confirmation-candidate.mjs';
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

const evidence=buildCatalogLineEvidence({itemId,publishedRevision:1,snapshot,selection:input.selection,quantity:1});

function harness({failLedger=false,closed=false,commitFails=false,rollbackFails=false,
 soldOut=false,quoteExpired=false,rotatedQr=false,corruptStage=null}={}){
 const statements=[],events=[];
 let releases=0,connects=0,storedAttempt=null,visitClosed=closed;
 const client={
  async query(sql,args=[]){
   statements.push({sql,args});
   if(corruptStage&&sql!=='BEGIN'&&sql!=='COMMIT'&&sql!=='ROLLBACK'&&
      ((corruptStage==='visit'&&sql.includes('customer_table_visits'))||
       (corruptStage==='advisory'&&sql.includes('pg_advisory_xact_lock'))||
       (corruptStage==='catalog'&&sql.includes('FROM sabora.catalog_items'))||
       (corruptStage==='quote'&&sql.includes('FROM sabora.catalog_displayed_quotes'))||
       (corruptStage==='table'&&sql.includes('FROM sabora.dining_tables')&&sql.includes('FOR UPDATE'))||
       (corruptStage==='order'&&sql.includes('INSERT INTO sabora.orders'))||
       (corruptStage==='ledger'&&sql.includes('INSERT INTO sabora.catalog_confirmation_attempts'))))
    return {rows:[Object.assign(Object.create({unexpected:true}),{order_id:orderId})]};
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'){
    events.push(sql);
    if(sql==='COMMIT'&&commitFails)throw Error('commit_uncertain');
    if(sql==='ROLLBACK'&&rollbackFails)throw Error('rollback_failed');
    return {rows:[]};
   }
   if(sql.includes('FROM sabora.dining_tables')&&sql.includes('customer_table_visits'))
    return {rows:(visitClosed||rotatedQr)?[]:[{table_id:tableId,session_id:sessionId,
     visit_id:input.visitId,actor_id:input.actorId,
     customer_alias:'Cliente',customer_identifier:'SB-23456789ABCD'}]};
   if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]};
   if(sql.includes('FROM sabora.catalog_confirmation_attempts'))return {rows:storedAttempt?[storedAttempt]:[]};
   if(sql.includes('FROM sabora.catalog_items'))return {rows:[{
    published_revision:'1',published_snapshot:snapshot,withdrawn_at:null,sold_out:soldOut}]};
   if(sql.includes('FROM sabora.catalog_displayed_quotes'))return {rows:quoteExpired?[]:[{
    id:quoteId,published_revision:'1',subtotal_cents:'1000',
    discount_cents:'0',total_cents:'1000',evidence}]};
   if(sql.includes('FROM sabora.dining_tables')&&sql.includes('FOR UPDATE'))
    return {rows:[{first_confirmed_at:null,grouping_window_seconds:300}]};
   if(sql.includes('INSERT INTO sabora.orders'))return {rows:[{id:orderId,grouping:'first',first_timestamp_written:true}]};
   if(sql.includes('INSERT INTO sabora.catalog_confirmation_attempts')){
    if(failLedger)throw Error('ledger_failure');
    storedAttempt={request_fingerprint:args[7],order_id:orderId};
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
  get connects(){return connects;},revokeVisit(){visitClosed=true;}};
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

test('uncertain commit discards the PostgreSQL client rather than returning it to pool',async()=>{
 const h=harness({commitFails:true});
 await assert.rejects(h.confirm(input),/commit_uncertain/);
 assert.deepEqual(h.events,['BEGIN','COMMIT','ROLLBACK','DISCARD']);
 assert.equal(h.releases,1);
});
test('failed rollback discards the PostgreSQL client after ledger error',async()=>{
 const h=harness({failLedger:true,rollbackFails:true});
 await assert.rejects(h.confirm(input),error=>
  error.message==='ledger_failure'&&error.rollbackError?.message==='rollback_failed');
 assert.deepEqual(h.events,['BEGIN','ROLLBACK','DISCARD']);
 assert.equal(h.releases,1);
});

test('pool candidate replays the same confirmed request without duplicate order or ledger writes',async()=>{
 const h=harness();
 assert.equal((await h.confirm(input)).status,'confirmed');
 assert.equal((await h.confirm(input)).status,'replayed');
 assert.equal(h.connects,2);
 assert.equal(h.releases,2);
 assert.equal(h.statements.filter(s=>s.sql.includes('INSERT INTO sabora.orders')).length,1);
 assert.equal(h.statements.filter(s=>s.sql.includes('INSERT INTO sabora.catalog_confirmation_attempts')).length,1);
 assert.deepEqual(h.events,['BEGIN','COMMIT','RELEASE','BEGIN','COMMIT','RELEASE']);
});

test('pool candidate rejects a conflicting idempotency key without writing again',async()=>{
 const h=harness();
 await h.confirm(input);
 await assert.rejects(h.confirm({...input,quantity:2}),/order_idempotency_conflict/);
 assert.equal(h.statements.filter(s=>s.sql.includes('INSERT INTO sabora.orders')).length,1);
 assert.equal(h.statements.filter(s=>s.sql.includes('INSERT INTO sabora.catalog_confirmation_attempts')).length,1);
 assert.deepEqual(h.events,['BEGIN','COMMIT','RELEASE','BEGIN','ROLLBACK','RELEASE']);
});

test('revoking the visit prevents replay of an already confirmed idempotency key',async()=>{
 const h=harness();
 assert.equal((await h.confirm(input)).status,'confirmed');
 h.revokeVisit();
 await assert.rejects(h.confirm(input),/order_context_forbidden/);
 assert.equal(h.statements.filter(s=>s.sql.includes('INSERT INTO sabora.orders')).length,1);
 assert.equal(h.statements.filter(s=>s.sql.includes('INSERT INTO sabora.catalog_confirmation_attempts')).length,1);
 assert.deepEqual(h.events,['BEGIN','COMMIT','RELEASE','BEGIN','ROLLBACK','RELEASE']);
});

test('rotated QR rejects confirmation before idempotency lookup or any write',async()=>{
 const h=harness({rotatedQr:true});
 await assert.rejects(h.confirm(input),/order_context_forbidden/);
 assert.equal(h.statements.some(s=>s.sql.includes('FROM sabora.catalog_confirmation_attempts')),false);
 assert.equal(h.statements.some(s=>s.sql.includes('INSERT INTO sabora.orders')),false);
 assert.deepEqual(h.events,['BEGIN','ROLLBACK','RELEASE']);
});

test('expired quote and sold-out catalog fail closed without order or ledger writes',async()=>{
 for(const config of [{quoteExpired:true},{soldOut:true}]){
  const h=harness(config);
  await assert.rejects(h.confirm(input),/order_previous_quote_unavailable|order_catalog_unavailable/);
  assert.equal(h.statements.some(s=>s.sql.includes('INSERT INTO sabora.orders')),false);
  assert.equal(h.statements.some(s=>s.sql.includes('INSERT INTO sabora.catalog_confirmation_attempts')),false);
  assert.deepEqual(h.events,['BEGIN','ROLLBACK','RELEASE']);
 }
});

test('untrusted economic and identity fields are rejected before checking out a pool client',async()=>{
 for(const injection of [
  {customerAlias:'Impostor'}, {customerIdentifier:'SB-23456789ABCD'},
  {company:'Fabricated'}, {priceCents:1}, {economicEvidence:{totalCents:1}},
  {publishedRevision:999}, {sessionId}
 ]){
  const h=harness();
  await assert.rejects(h.confirm({...input,...injection}),/invalid_confirmation_input/);
  assert.equal(h.connects,0);
  assert.deepEqual(h.events,[]);
 }
});

test('malicious accessor and cyclic selection fail before transaction checkout',async()=>{
 const getterInput={...input};
 Object.defineProperty(getterInput,'quantity',{enumerable:true,get(){throw Error('getter_executed');}});
 const cycle={};cycle.loop=cycle;
 for(const payload of [getterInput,{...input,selection:cycle}]){
  const h=harness();
  await assert.rejects(h.confirm(payload),/invalid_confirmation_input/);
  assert.equal(h.connects,0);
  assert.deepEqual(h.events,[]);
 }
});

test('malformed acceptance token is rejected before acquiring the database connection',async()=>{
 for(const acceptanceToken of [42,{},'x'.repeat(4097)]){
  const h=harness();
  await assert.rejects(h.confirm({...input,acceptanceToken}),/invalid_confirmation_input/);
  assert.equal(h.connects,0);
 }
});

test('all seven SQL response boundaries reject inherited rows and rollback atomically',async()=>{
 const stages=['visit','advisory','catalog','quote','table','order','ledger'];
 for(const stage of stages){
  const h=harness({corruptStage:stage});
  await assert.rejects(h.confirm(input),error=>{
   assert.ok(error instanceof Error,`missing domain error for ${stage}`);
   return true;
  });
  assert.deepEqual(h.events,['BEGIN','ROLLBACK','RELEASE'],stage);
  assert.equal(h.releases,1,stage);
  assert.equal(h.connects,1,stage);
  assert.equal(h.statements.some(x=>x.sql==='COMMIT'),false,stage);
  if(stage!=='ledger'){
   assert.equal(h.statements.some(x=>x.sql.includes('INSERT INTO sabora.catalog_confirmation_attempts')),false,stage);
  }
 }
});
