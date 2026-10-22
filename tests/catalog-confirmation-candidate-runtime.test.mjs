import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogConfirmationCandidate} from '../apps/api/src/catalog-confirmation-candidate-runtime.mjs';

test('candidate composition rejects malformed input without checking out a connection',async()=>{
 let checkouts=0;
 const confirm=createCatalogConfirmationCandidate({
  pool:{async connect(){checkouts++;throw Error('unexpected_checkout');}},
  secretKey:'x'.repeat(32)
 });
 await assert.rejects(confirm({tableId:'invalid'}),/invalid_confirmation_input/);
 assert.equal(checkouts,0);
});

test('candidate composition fails closed if PostgreSQL pool or signing secret is absent',()=>{
 assert.throws(()=>createCatalogConfirmationCandidate({
  pool:{connect:async()=>{}},secretKey:'short'
 }),/invalid_confirmation_coordinator/);
 assert.throws(()=>createCatalogConfirmationCandidate({
  secretKey:'x'.repeat(32)
 }),/invalid_transaction_pool/);
});

test('candidate composition begins transaction and rolls back on forbidden visit',async()=>{
 const statements=[];
 let releases=0;
 const confirm=createCatalogConfirmationCandidate({
  pool:{async connect(){return {
   async query(sql){statements.push(sql);if(sql==='BEGIN'||sql==='ROLLBACK')return {rows:[]};
    return {rows:[]};},
   release(){releases++;}
  };}},
  secretKey:'x'.repeat(32)
 });
 await assert.rejects(confirm({
  tableId:'00000000-0000-4000-8000-000000000001',
  visitId:'visit_1',basketId:'basket_1',actorId:'actor_1',
  itemId:'00000000-0000-4000-8000-000000000003',
  selection:{},quantity:1,requestKey:'request_001',
  qrToken:'q'.repeat(32),customerSessionToken:'s'.repeat(32)
 }),/order_context_forbidden/);
 assert.equal(statements[0],'BEGIN');
 assert.equal(statements.at(-1),'ROLLBACK');
 assert.equal(statements.includes('COMMIT'),false);
 assert.equal(releases,1);
});

test('candidate composition rejects invalid UUID generator before any checkout',()=>{
 let checkouts=0;
 assert.throws(()=>createCatalogConfirmationCandidate({
  pool:{async connect(){checkouts++;throw Error('unexpected_checkout');}},
  secretKey:'x'.repeat(32),newOrderId:'not-a-function'
 }),/invalid_catalog_order_writer/);
 assert.equal(checkouts,0);
});

test('candidate composition propagates a failed BEGIN and discards connection',async()=>{
 const statements=[],releases=[];
 const confirm=createCatalogConfirmationCandidate({
  pool:{async connect(){return {
   async query(sql){statements.push(sql);throw Error('begin_failed');},
   release(error){releases.push(error);}
  };}},
  secretKey:'x'.repeat(32)
 });
 await assert.rejects(confirm({
  tableId:'00000000-0000-4000-8000-000000000001',
  visitId:'visit_1',basketId:'basket_1',actorId:'actor_1',
  itemId:'00000000-0000-4000-8000-000000000003',
  selection:{options:{},extras:[]},quantity:1,requestKey:'request_001',
  qrToken:'q'.repeat(32),customerSessionToken:'s'.repeat(32)
 }),/begin_failed/);
 assert.deepEqual(statements,['BEGIN']);
 assert.equal(releases.length,1);
 assert.match(releases[0].message,/begin_failed/);
});
