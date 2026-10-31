import test from 'node:test';
import assert from 'node:assert/strict';
import {createIsolatedTableChangeSqlCandidate,F12_CUSTOMER_SQL,F12_OPERATIONS_SQL}
 from './table-change-isolated-sql-composition-candidate.mjs';
import {REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,DECIDE_TABLE_CHANGE_H6_SQL}
 from './table-change-sealed-rpc-candidate.mjs';

const requestId='22222222-2222-4222-8222-222222222222';
const staffId='33333333-3333-4333-8333-333333333333';
const tokenHash=Buffer.alloc(32,7);
function pool(expectedSql,rows){
 const calls=[];let destroyed=null;
 return {calls,get destroyed(){return destroyed;},async connect(){return {
  async query(sql,args){calls.push({sql,args});
   if(sql===expectedSql)return {rows};
   if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('SET LOCAL ROLE '))return {rows:[]};
   throw Error('unexpected_sql');
  },release(discard){destroyed=discard;}
 };}};
}
const requestRow={request_id:requestId,request_status:'pending',expires_at:'2026-11-01T00:00:00Z'};
test('F12 isolated composition binds customer and waiter to distinct exact SQL capabilities',async()=>{
 assert.deepEqual(F12_CUSTOMER_SQL,[REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL]);
 assert.deepEqual(F12_OPERATIONS_SQL,[DECIDE_TABLE_CHANGE_H6_SQL]);
 const customer=pool(REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,[requestRow]);
 const operations=pool(DECIDE_TABLE_CHANGE_H6_SQL,[{status:'approved'}]);
 const service=createIsolatedTableChangeSqlCandidate({customerPool:customer,
  operationsPool:operations,hashSession:async()=>tokenHash,
  verifyStaff:async()=>({userId:staffId,role:'waiter'})});
 assert.equal((await service.request({customerSessionToken:'secret'})).status,'pending');
 assert.deepEqual(customer.calls.map(x=>x.sql),['BEGIN',
  'SET LOCAL ROLE sabora_f12_customer_runtime',REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,'COMMIT']);
 assert.deepEqual(customer.calls[2].args,[tokenHash]);
 assert.equal(customer.destroyed,false);
 assert.equal((await service.decide({verifiedIdentity:{},verifiedStaff:{role:'waiter'},
  requestId,decision:'approved'})).request.status,'approved');
 assert.deepEqual(operations.calls.map(x=>x.sql),['BEGIN',
  'SET LOCAL ROLE sabora_f12_operations_runtime',DECIDE_TABLE_CHANGE_H6_SQL,'COMMIT']);
 assert.deepEqual(operations.calls[2].args,[staffId,requestId,true]);
 assert.equal(operations.destroyed,false);
});
test('F12 isolated composition rejects shared pools and untrusted staff without SQL',async()=>{
 const shared=pool(REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,[requestRow]);
 assert.throws(()=>createIsolatedTableChangeSqlCandidate({customerPool:shared,
  operationsPool:shared,hashSession:async()=>tokenHash,verifyStaff:async()=>{}}),
 /invalid_f12_isolated_composition/);
 const customer=pool(REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,[requestRow]);
 const operations=pool(DECIDE_TABLE_CHANGE_H6_SQL,[{status:'approved'}]);
 const service=createIsolatedTableChangeSqlCandidate({customerPool:customer,
  operationsPool:operations,hashSession:async()=>tokenHash,
  verifyStaff:async()=>({userId:staffId,role:'kitchen'})});
 await assert.rejects(()=>service.decide({verifiedIdentity:{},verifiedStaff:{role:'kitchen'},
  requestId,decision:'approved'}),/table_change_unauthorized/);
 assert.deepEqual(operations.calls.map(x=>x.sql),['BEGIN',
  'SET LOCAL ROLE sabora_f12_operations_runtime','ROLLBACK']);
 assert.equal(operations.destroyed,true);
});
