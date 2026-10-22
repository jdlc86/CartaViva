import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogConfirmationRepository} from '../apps/api/src/catalog-confirmation-repository.mjs';

const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const orderId='00000000-0000-4000-8000-000000000003';
const itemId='00000000-0000-4000-8000-000000000004';
const contextArgs={tableId,visitId:'visit-ci',actorId:'actor-ci',basketId:'basket-ci',
 qrToken:'q'.repeat(64),customerSessionToken:'s'.repeat(64)};
const scope={authorized:true,canOrder:true,tableId,sessionId,
 visitId:'visit-ci',actorId:'actor-ci',basketId:'basket-ci',
 customerAlias:'Cliente',customerIdentifier:'SB-23456789ABCD'};
test('composition cannot be created without an explicit durable writer',()=>{
 assert.throws(()=>createCatalogConfirmationRepository(),/invalid_catalog_confirmation_writer/);
 assert.throws(()=>createCatalogConfirmationRepository({persist:null}),/invalid_catalog_confirmation_writer/);
});
test('candidate composition locks visit before scoped replay and never exposes secrets in replay SQL',async()=>{
 const statements=[];
 const repository=createCatalogConfirmationRepository({persist:async()=>({orderId})});
 const query=async(sql,parameters)=>{
  statements.push({sql,parameters});
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]};
  if(sql.includes('FROM sabora.dining_tables'))return {rows:[{
   table_id:tableId,session_id:sessionId,visit_id:'visit-ci',actor_id:'actor-ci',
   customer_alias:'Cliente',customer_identifier:'SB-23456789ABCD'
  }]};
  if(sql.includes('FROM sabora.catalog_confirmation_attempts'))return {rows:[]};
  throw Error('unexpected_sql');
 };
 const context=await repository.lockContext(query,contextArgs);
 assert.deepEqual(context,scope);
 const replay=await repository.lookupIdempotency(query,{
  context,requestKey:'request-001',requestFingerprint:'fingerprint'
 });
 assert.equal(replay,null);
 assert.match(statements[0].sql,/FOR UPDATE OF t FOR SHARE OF v,s/);
 assert.match(statements[1].sql,/pg_advisory_xact_lock/);
 assert.match(statements[2].sql,/FOR UPDATE/);
 assert.equal(statements[0].parameters[3],contextArgs.qrToken);
 assert.equal(statements[0].parameters[4],contextArgs.customerSessionToken);
 assert.equal(JSON.stringify(statements.slice(1)).includes(contextArgs.qrToken),false);
 assert.equal(JSON.stringify(statements.slice(1)).includes(contextArgs.customerSessionToken),false);
});
test('candidate writer rejects unauthorized scope before invoking persistence',async()=>{
 let called=0;
 const repository=createCatalogConfirmationRepository({persist:async()=>{
  called++;return {orderId};
 }});
 await assert.rejects(repository.persist(async()=>({rows:[]}),{
  context:{...scope,authorized:false},requestKey:'request-001'
 }),/invalid_catalog_confirmation_writer_scope/);
 assert.equal(called,0);
 const result=await repository.persist(async()=>({rows:[]}),{
  context:scope,itemId,requestKey:'request-001',requestFingerprint:'fingerprint',
  quoteId:orderId,evidence:{totalCents:1000},acceptanceVerified:false,
  requiresAcceptance:false
 });
 assert.deepEqual(result,{orderId});
 assert.equal(called,1);
});

test('candidate writer rejects malformed economic scope and unverified reprice without SQL',async()=>{
 let called=0;
 const repository=createCatalogConfirmationRepository({persist:async()=>{called++;return {orderId};}});
 const args={context:scope,requestKey:'request-001',requestFingerprint:'fingerprint',
  quoteId:orderId,evidence:{totalCents:1000},acceptanceVerified:false,
  requiresAcceptance:false};
 for(const patch of [
  {context:{...scope,canOrder:false}},
  {context:{...scope,sessionId:'invalid'}},
  {context:{...scope,visitId:'invalid visit'}},
  {requestKey:'short'},
  {requestFingerprint:'x'.repeat(17000)},
  {quoteId:'invalid'},
  {evidence:null},
  {acceptanceVerified:'yes'},
  {requiresAcceptance:true},
  {requiresAcceptance:'false'}
 ]){
  await assert.rejects(repository.persist(async()=>({rows:[]}),{...args,...patch}),
   /invalid_catalog_confirmation_writer_scope/);
 }
 assert.equal(called,0);
});
