import test from 'node:test';
import assert from 'node:assert/strict';
import {createIsolatedTableChangeSqlCandidate,createVerifiedIsolatedTableChangeSqlCandidate,createVerifiedTableChangeB3Candidate,F12_CUSTOMER_SQL,F12_OPERATIONS_SQL}
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

function preflightPool(capability,login,{deny=false}={}){
 const calls=[];
 return {calls,async connect(){return {async query(sql,args){
  calls.push({sql,args});
  if(sql.includes('current_user AS effective_role'))return {rows:[{
   effective_role:login,login_role:login,can_login:true,inherit_role:false,
   superuser:false,bypass_rls:false,create_db:false,create_role:false,
   replication:false,database_create:false,schema_create:false,
   direct_relations:false,direct_sequences:false,
   role_set:['sabora_f12_customer_runtime','sabora_f12_operations_runtime']
    .map(role=>role===capability),all_set_roles:[capability]
  }]};
  if(sql.includes('array_agg(p.oid::regprocedure'))return {rows:[{names:
   args[0]===login?(deny?['sabora.unexpected()']:[]):[
    capability==='sabora_f12_customer_runtime'?
     'sabora.request_customer_table_change_h6_resolved_candidate(bytea)':
     'sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)']}]};
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL ROLE '))
   return {rows:[]};
  if(sql===REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL)return {rows:[requestRow]};
  if(sql===DECIDE_TABLE_CHANGE_H6_SQL)return {rows:[{status:'approved'}]};
  throw Error('unexpected_sql');
 },release(){}};}};
}
test('F12 verified composition refuses privilege drift before issuing any business SQL',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login',{deny:true});
 await assert.rejects(()=>createVerifiedIsolatedTableChangeSqlCandidate({
  customerPool:customer,operationsPool:operations,
  expectedCustomerLogin:'f12_customer_login',expectedOperationsLogin:'f12_operations_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'})
 }),/invalid_f12_sql_capabilities:login-function-surface/);
 assert.equal(customer.calls.filter(x=>x.sql==='BEGIN').length,0);
 assert.equal(operations.calls.filter(x=>x.sql==='BEGIN').length,0);
});
test('F12 verified composition permits sealed RPC only after both logins pass',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const service=await createVerifiedIsolatedTableChangeSqlCandidate({
  customerPool:customer,operationsPool:operations,
  expectedCustomerLogin:'f12_customer_login',expectedOperationsLogin:'f12_operations_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'})
 });
 assert.equal((await service.request({customerSessionToken:'secret'})).status,'pending');
 assert.equal(customer.calls.filter(x=>x.sql==='BEGIN').length,1);
 assert.equal(operations.calls.filter(x=>x.sql==='BEGIN').length,0);
});

test('F12 verified composition rejects swapped login identities without business SQL',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','unexpected_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 await assert.rejects(()=>createVerifiedIsolatedTableChangeSqlCandidate({
  customerPool:customer,operationsPool:operations,
  expectedCustomerLogin:'f12_customer_login',expectedOperationsLogin:'f12_operations_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'})
 }),/invalid_f12_sql_capabilities:identity-policy/);
 assert.equal(customer.calls.some(x=>x.sql==='BEGIN'),false);
 assert.equal(operations.calls.length,0,'second pool must not be inspected after first fails');
});
test('F12 verified composition rejects identical expected logins before any query',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_shared_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_shared_login');
 await assert.rejects(()=>createVerifiedIsolatedTableChangeSqlCandidate({
  customerPool:customer,operationsPool:operations,
  expectedCustomerLogin:'f12_shared_login',expectedOperationsLogin:'f12_shared_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'})
 }),/invalid_f12_sql_capabilities:isolation/);
 assert.equal(customer.calls.length,0);
 assert.equal(operations.calls.length,0);
});

test('B3 gate rejects shared pool and refuses unverified transfer EXECUTE',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const args={customerPool:customer,operationsPool:operations,
  expectedCustomerLogin:'f12_customer_login',
  expectedOperationsLogin:'f12_operations_login',
  expectedConfirmationLogin:'b3_confirmation_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'})};
 let created=0;
 await assert.rejects(()=>createVerifiedTableChangeB3Candidate({
  ...args,confirmationPool:customer,
  createConfirmationFlow:async()=>{created++;return {confirm:async()=>{}};}
 }),/invalid_b3_isolated_composition/);
 const confirmationPool={async connect(){return {async query(){throw Error('no real PG17 capability');},
  release(){}};}};
 await assert.rejects(()=>createVerifiedTableChangeB3Candidate({
  ...args,confirmationPool,
  createConfirmationFlow:async()=>{created++;return {confirm:async()=>{}};}
 }),/invalid_b3_confirmation_capabilities:query/);
 assert.equal(created,0);
});


test('B3 composition rejects reused F12 login identities before any SQL or flow construction',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const confirmation=preflightPool('sabora_b3_confirmation_runtime','f12_customer_login');
 let constructed=0;
 const base={customerPool:customer,operationsPool:operations,confirmationPool:confirmation,
  expectedCustomerLogin:'f12_customer_login',expectedOperationsLogin:'f12_operations_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  createConfirmationFlow:async()=>{constructed++;return {confirm:async()=>{}};}};
 for(const reused of ['f12_customer_login','f12_operations_login']){
  await assert.rejects(()=>createVerifiedTableChangeB3Candidate({
   ...base,expectedConfirmationLogin:reused
  }),/invalid_b3_isolated_composition/);
 }
 assert.equal(customer.calls.length,0);
 assert.equal(operations.calls.length,0);
 assert.equal(confirmation.calls.length,0);
 assert.equal(constructed,0);
});


function b3ConfirmationPool({extraFunction=false,directLoginGrant=false}={}){
 const login='b3_confirmation_login',role='sabora_b3_confirmation_runtime';
 const signature='sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
 const calls=[];
 return {calls,async connect(){return {
  async query(sql,args){
   calls.push({sql,args});
   if(sql.includes('current_user AS effective_role'))return {rows:[{
    effective_role:login,login_role:login,can_login:true,inherit_role:false,
    superuser:false,bypass_rls:false,create_db:false,create_role:false,
    replication:false,database_create:false,schema_create:false,
    can_set_confirmation:true,direct_relations:false,direct_sequences:false,
    all_set_roles:[role]
   }]};
   if(sql.includes('array_agg(p.oid::regprocedure'))return {rows:[{names:
    args[0]===role?[signature,...(extraFunction?['sabora.unexpected()']:[])]:
     (directLoginGrant?[signature]:[])}]};
   throw Error('unexpected_b3_sql');
  },release(){}
 };}};
}

test('B3 full isolated composition validates all three identities before constructing confirmation',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const confirmation=b3ConfirmationPool();
 let constructed=0;
 const service=await createVerifiedTableChangeB3Candidate({
  customerPool:customer,operationsPool:operations,confirmationPool:confirmation,
  expectedCustomerLogin:'f12_customer_login',expectedOperationsLogin:'f12_operations_login',
  expectedConfirmationLogin:'b3_confirmation_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  createConfirmationFlow:async({pool})=>{
   constructed++;
   assert.equal(pool,confirmation);
   assert.equal(customer.calls.length,3);
   assert.equal(operations.calls.length,3);
   assert.equal(confirmation.calls.length,3);
   return {confirm:async()=>({status:'candidate_only'})};
  }
 });
 assert.equal(constructed,1);
 assert.equal((await service.tableChange.request({customerSessionToken:'secret'})).status,'pending');
 assert.deepEqual(await service.confirmation.confirm(),{status:'candidate_only'});
});

test('B3 full isolated composition never constructs confirmation on privilege drift',async()=>{
 for(const bad of [{extraFunction:true},{directLoginGrant:true}]){
  const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
  const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
  const confirmation=b3ConfirmationPool(bad);
  let constructed=0;
  await assert.rejects(()=>createVerifiedTableChangeB3Candidate({
   customerPool:customer,operationsPool:operations,confirmationPool:confirmation,
   expectedCustomerLogin:'f12_customer_login',expectedOperationsLogin:'f12_operations_login',
   expectedConfirmationLogin:'b3_confirmation_login',
   hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'}),
   createConfirmationFlow:async()=>{constructed++;return {confirm:async()=>{}};}
  }),/invalid_b3_confirmation_capabilities:/);
  assert.equal(constructed,0);
  assert.equal(customer.calls.some(x=>x.sql==='BEGIN'),false);
  assert.equal(operations.calls.some(x=>x.sql==='BEGIN'),false);
 }
});
