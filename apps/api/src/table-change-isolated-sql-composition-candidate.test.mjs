import test from 'node:test';
import assert from 'node:assert/strict';
import {createIsolatedTableChangeSqlCandidate,createVerifiedIsolatedTableChangeSqlCandidate,createVerifiedTableChangeB3Candidate,createIsolatedB3ConfirmationTransaction,B3_CONFIRMATION_SQL,createIsolatedB3H6ReadTransaction,createB3CustomerConfirmationFlowCandidate,createVerifiedTableChangeB3CustomerFlowCandidate,B3_CUSTOMER_FLOW_SQL,B3_CUSTOMER_FLOW_EXACT_SET_SQL,B3_H6_LOGIN_SURFACE_SQL,B3_H6_READ_SQL,F12_CUSTOMER_SQL,F12_OPERATIONS_SQL}
 from './table-change-isolated-sql-composition-candidate.mjs';
import {PERSIST_H6_TRANSFER_ORDER_SQL,PERSIST_H6_ORDER_SQL,READ_H6_ROUND_SQL,READ_H6_PAYMENT_POLICY_SQL} from './customer-production-flow.mjs';
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

function h6ReadPool({extraRole=false,directExecute=false}={}){
 const calls=[];
 return {calls,async connect(){return {async query(sql,args){
  calls.push({sql,args});
  if(sql.includes('current_user AS effective_role'))return {rows:[{
   effective_role:'h6_read_login',login_role:'h6_read_login',can_login:true,
   inherit_role:false,superuser:false,bypass_rls:false,create_db:false,
   create_role:false,replication:false,database_create:false,schema_create:false,
   direct_relations:false,direct_sequences:false,role_set:[true,false,false]
  }]};
  if(sql===B3_H6_LOGIN_SURFACE_SQL)return {rows:[{
   set_roles:extraRole?['sabora_h6_customer_runtime','sabora_b3_confirmation_runtime']:
    ['sabora_h6_customer_runtime'],
   executable_functions:directExecute?['sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)']:[]
  }]};
  if(sql.includes('aclexplode('))return {rows:[{names:[
   'confirm_customer_round_h6_candidate','read_customer_payment_policy_h6_candidate',
   'read_customer_round_h6_candidate','read_customer_event_backlog_h6_candidate'
  ]}]};
  if(['BEGIN','COMMIT','ROLLBACK','SET LOCAL ROLE sabora_h6_customer_runtime'].includes(sql))return {rows:[]};
  if(sql===READ_H6_ROUND_SQL||sql===READ_H6_PAYMENT_POLICY_SQL)return {rows:[{round_id:requestId}]};
  throw Error('unexpected_h6_read_sql');
 },release(){}};}};
}

test('B3 gate rejects shared pool and refuses unverified transfer EXECUTE',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const args={customerPool:customer,operationsPool:operations,h6ReadPool:h6ReadPool(),expectedH6ReadLogin:'h6_read_login',
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
 const base={customerPool:customer,operationsPool:operations,confirmationPool:confirmation,h6ReadPool:h6ReadPool(),expectedH6ReadLogin:'h6_read_login',
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
   if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||
      sql==='SET LOCAL ROLE sabora_b3_confirmation_runtime')return {rows:[]};
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
  h6ReadPool:h6ReadPool(),expectedH6ReadLogin:'h6_read_login',
  expectedCustomerLogin:'f12_customer_login',expectedOperationsLogin:'f12_operations_login',
  expectedConfirmationLogin:'b3_confirmation_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  createConfirmationFlow:async({withConfirmationTransaction,withH6ReadTransaction})=>{
   assert.equal(typeof withH6ReadTransaction,'function');
   constructed++;
   assert.equal(typeof withConfirmationTransaction,'function');
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
   h6ReadPool:h6ReadPool(),expectedH6ReadLogin:'h6_read_login',
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


test('B3 confirmation writer executes only transfer SQL under a local capability role',async()=>{
 assert.deepEqual(B3_CONFIRMATION_SQL,[PERSIST_H6_TRANSFER_ORDER_SQL]);
 const confirmation=pool(PERSIST_H6_TRANSFER_ORDER_SQL,[{persisted_order_id:requestId}]);
 const transaction=createIsolatedB3ConfirmationTransaction({confirmationPool:confirmation});
 await assert.rejects(()=>transaction(query=>query(PERSIST_H6_ORDER_SQL,[])),
  /role_scoped_sql_not_allowed/);
 assert.deepEqual(confirmation.calls.map(x=>x.sql),['BEGIN',
  'SET LOCAL ROLE sabora_b3_confirmation_runtime','ROLLBACK']);
 assert.equal(confirmation.destroyed,true);
 confirmation.calls.length=0;
 const row=await transaction(query=>query(PERSIST_H6_TRANSFER_ORDER_SQL,[]));
 assert.equal(row.rows[0].persisted_order_id,requestId);
 assert.deepEqual(confirmation.calls.map(x=>x.sql),['BEGIN',
  'SET LOCAL ROLE sabora_b3_confirmation_runtime',PERSIST_H6_TRANSFER_ORDER_SQL,'COMMIT']);
});


test('B3 verified factory passes only sealed transaction and denies legacy H6 SQL',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const confirmation=b3ConfirmationPool();
 let exposed;
 const service=await createVerifiedTableChangeB3Candidate({
  customerPool:customer,operationsPool:operations,confirmationPool:confirmation,
  h6ReadPool:h6ReadPool(),expectedH6ReadLogin:'h6_read_login',
  expectedCustomerLogin:'f12_customer_login',expectedOperationsLogin:'f12_operations_login',
  expectedConfirmationLogin:'b3_confirmation_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  createConfirmationFlow:async capabilities=>{
   exposed=capabilities;
   return {confirm:async()=>capabilities.withConfirmationTransaction(
    query=>query(PERSIST_H6_ORDER_SQL,[]))};
  }
 });
 assert.deepEqual(Object.keys(exposed),['withConfirmationTransaction','withH6ReadTransaction']);
 await assert.rejects(()=>service.confirmation.confirm(),/role_scoped_sql_not_allowed/);
 assert.deepEqual(confirmation.calls.slice(3).map(x=>x.sql),[
  'BEGIN','SET LOCAL ROLE sabora_b3_confirmation_runtime','ROLLBACK']);
});


test('B3 H6 read capability allows only replay and policy queries',async()=>{
 assert.deepEqual(B3_H6_READ_SQL,[READ_H6_ROUND_SQL,READ_H6_PAYMENT_POLICY_SQL]);
 const h6=h6ReadPool();
 const withRead=createIsolatedB3H6ReadTransaction({h6ReadPool:h6});
 await assert.rejects(()=>withRead(query=>query(PERSIST_H6_TRANSFER_ORDER_SQL,[])),
  /role_scoped_sql_not_allowed/);
 assert.deepEqual(h6.calls.map(x=>x.sql),['BEGIN',
  'SET LOCAL ROLE sabora_h6_customer_runtime','ROLLBACK']);
 h6.calls.length=0;
 await withRead(query=>query(READ_H6_ROUND_SQL,[]));
 assert.deepEqual(h6.calls.map(x=>x.sql),['BEGIN',
  'SET LOCAL ROLE sabora_h6_customer_runtime',READ_H6_ROUND_SQL,'COMMIT']);
});


test('B3 four-way composition rejects shared H6 reader identity and pool before checkout',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const confirmation=b3ConfirmationPool();
 const reader=h6ReadPool();
 let constructed=0;
 const args={customerPool:customer,operationsPool:operations,confirmationPool:confirmation,
  h6ReadPool:reader,expectedCustomerLogin:'f12_customer_login',
  expectedOperationsLogin:'f12_operations_login',expectedConfirmationLogin:'b3_confirmation_login',
  expectedH6ReadLogin:'h6_read_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  createConfirmationFlow:async()=>{constructed++;return {confirm:async()=>{}};}};
 for(const shared of [customer,operations,confirmation]){
  await assert.rejects(()=>createVerifiedTableChangeB3Candidate({
   ...args,h6ReadPool:shared
  }),/invalid_b3_isolated_composition/);
 }
 for(const login of ['f12_customer_login','f12_operations_login','b3_confirmation_login']){
  await assert.rejects(()=>createVerifiedTableChangeB3Candidate({
   ...args,expectedH6ReadLogin:login
  }),/invalid_b3_isolated_composition/);
 }
 assert.equal(constructed,0);
 assert.equal(customer.calls.length,0);
 assert.equal(operations.calls.length,0);
 assert.equal(confirmation.calls.length,0);
 assert.equal(reader.calls.length,0);
});

test('B3 four-way composition fails closed on H6 reader identity drift',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const confirmation=b3ConfirmationPool();
 const reader=h6ReadPool();
 let constructed=0;
 await assert.rejects(()=>createVerifiedTableChangeB3Candidate({
  customerPool:customer,operationsPool:operations,confirmationPool:confirmation,
  h6ReadPool:reader,expectedCustomerLogin:'f12_customer_login',
  expectedOperationsLogin:'f12_operations_login',expectedConfirmationLogin:'b3_confirmation_login',
  expectedH6ReadLogin:'wrong_h6_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  createConfirmationFlow:async()=>{constructed++;return {confirm:async()=>{}};}
 }),/invalid_h6_sql_capabilities:identity-policy/);
 assert.equal(constructed,0);
 assert.equal(reader.calls.length,1);
 assert.equal(customer.calls.some(x=>x.sql==='BEGIN'),false);
 assert.equal(operations.calls.some(x=>x.sql==='BEGIN'),false);
});


test('B3 verified factory keeps writer and H6 reader capabilities separate end to end',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 // The writer fixture must also answer the B3 preflight; reuse the strict B3
 // fixture for the actual verified factory and test SQL rejection on both sides.
 const writer=b3ConfirmationPool();
 const reader=h6ReadPool();
 const service=await createVerifiedTableChangeB3Candidate({
  customerPool:customer,operationsPool:operations,confirmationPool:writer,
  h6ReadPool:reader,expectedCustomerLogin:'f12_customer_login',
  expectedOperationsLogin:'f12_operations_login',expectedConfirmationLogin:'b3_confirmation_login',
  expectedH6ReadLogin:'h6_read_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  createConfirmationFlow:async({withConfirmationTransaction,withH6ReadTransaction})=>({
   confirm:async()=>{
    const policy=await withH6ReadTransaction(query=>query(READ_H6_PAYMENT_POLICY_SQL,[]));
    const replay=await withH6ReadTransaction(query=>query(READ_H6_ROUND_SQL,[]));
    await assert.rejects(()=>withConfirmationTransaction(query=>query(READ_H6_ROUND_SQL,[])),
     /role_scoped_sql_not_allowed/);
    await assert.rejects(()=>withH6ReadTransaction(query=>query(PERSIST_H6_TRANSFER_ORDER_SQL,[])),
     /role_scoped_sql_not_allowed/);
    return {policy:policy.rows.length,replay:replay.rows.length};
   }
  })
 });
 assert.deepEqual(await service.confirmation.confirm(),{policy:1,replay:1});
 assert.deepEqual(writer.calls.slice(3).map(x=>x.sql),[
  'BEGIN','SET LOCAL ROLE sabora_b3_confirmation_runtime','ROLLBACK']);
 assert.deepEqual(reader.calls.filter(x=>['BEGIN','COMMIT','ROLLBACK'].includes(x.sql)||
  x.sql.startsWith('SET LOCAL ROLE ')||
  [READ_H6_PAYMENT_POLICY_SQL,READ_H6_ROUND_SQL].includes(x.sql)).map(x=>x.sql),[
  'BEGIN','SET LOCAL ROLE sabora_h6_customer_runtime',READ_H6_PAYMENT_POLICY_SQL,'COMMIT',
  'BEGIN','SET LOCAL ROLE sabora_h6_customer_runtime',READ_H6_ROUND_SQL,'COMMIT',
  'BEGIN','SET LOCAL ROLE sabora_h6_customer_runtime','ROLLBACK']);
});


test('B3 customer confirmation adapter validates inputs before exposing flow',async()=>{
 assert.throws(()=>createB3CustomerConfirmationFlowCandidate({
  withCustomerTransaction:async()=>{},secretKey:'short'
 }),/invalid_b3_customer_confirmation_adapter/);
 const factory=createB3CustomerConfirmationFlowCandidate({
  withCustomerTransaction:async()=>{},secretKey:'a'.repeat(48)
 });
 assert.throws(()=>factory({withConfirmationTransaction:async()=>{}}),
  /invalid_b3_customer_confirmation_adapter/);
 const flow=factory({withConfirmationTransaction:async()=>{},
  withH6ReadTransaction:async()=>{}});
 assert.deepEqual(Object.keys(flow),['confirm']);
 assert.equal(typeof flow.confirm,'function');
 assert.equal(Object.isFrozen(flow),true);
});


test('B3 five-identity candidate rejects any shared customer-flow pool or login before SQL',async()=>{
 assert.equal(B3_CUSTOMER_FLOW_SQL.length,6);
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const writer=b3ConfirmationPool();
 const reader=h6ReadPool();
 const args={customerPool:customer,operationsPool:operations,confirmationPool:writer,
  h6ReadPool:reader,expectedCustomerLogin:'f12_customer_login',
  expectedOperationsLogin:'f12_operations_login',expectedConfirmationLogin:'b3_confirmation_login',
  expectedH6ReadLogin:'h6_read_login',expectedFlowLogin:'flow_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  secretKey:'s'.repeat(48)};
 for(const shared of [customer,operations,writer,reader]){
  await assert.rejects(()=>createVerifiedTableChangeB3CustomerFlowCandidate({
   ...args,flowPool:shared
  }),/invalid_b3_customer_flow_isolation/);
 }
 await assert.rejects(()=>createVerifiedTableChangeB3CustomerFlowCandidate({
  ...args,flowPool:pool('not_used',[]),expectedFlowLogin:'b3_confirmation_login'
 }),/invalid_b3_customer_flow_isolation/);
 assert.equal(customer.calls.length,0);
 assert.equal(operations.calls.length,0);
 assert.equal(writer.calls.length,0);
 assert.equal(reader.calls.length,0);
});


function b3CustomerFlowPool({extraGrant=false,extraRole=false}={}){
 const calls=[];
 return {calls,async connect(){return {async query(sql,args){
  calls.push({sql,args});
  if(sql.includes('current_user AS effective_role'))return {rows:[{
   effective_role:'flow_login',login_role:'flow_login',can_login:true,
   inherit_role:false,superuser:false,bypass_rls:false,create_db:false,
   create_role:false,replication:false,database_create:false,schema_create:false,
   direct_relation_access:false,direct_sequence_access:false,
   registration_set:false,session_set:false,flow_set:true
  }]};
  if(sql===B3_CUSTOMER_FLOW_EXACT_SET_SQL)return {rows:[{roles:extraRole?
   ['sabora_customer_flow_runtime','sabora_b3_confirmation_runtime']:
   ['sabora_customer_flow_runtime']}]};
  if(sql.includes(' AS login_execute'))return {rows:[{login_execute:false,capability_execute:true}]};
  if(sql.includes(' AS exact'))return {rows:[{exact:!extraGrant}]};
  if(['BEGIN','COMMIT','ROLLBACK','SET LOCAL ROLE sabora_customer_flow_runtime'].includes(sql))
   return {rows:[]};
  throw Error('unexpected_customer_flow_sql');
 },release(){}};}};
}

test('B3 five-way verified candidate exposes real customer confirmation only after all preflights',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const writer=b3ConfirmationPool();
 const reader=h6ReadPool();
 const flow=b3CustomerFlowPool();
 const args={customerPool:customer,operationsPool:operations,confirmationPool:writer,
  h6ReadPool:reader,flowPool:flow,
  expectedCustomerLogin:'f12_customer_login',expectedOperationsLogin:'f12_operations_login',
  expectedConfirmationLogin:'b3_confirmation_login',expectedH6ReadLogin:'h6_read_login',
  expectedFlowLogin:'flow_login',hashSession:async()=>tokenHash,
  verifyStaff:async()=>({userId:staffId,role:'waiter'}),secretKey:'s'.repeat(48)};
 const service=await createVerifiedTableChangeB3CustomerFlowCandidate(args);
 assert.equal(typeof service.confirmation.confirm,'function');
 assert.equal(Object.isFrozen(service.confirmation),true);
 assert.equal(flow.calls.filter(x=>x.sql==='BEGIN').length,0);
 assert.equal(writer.calls.filter(x=>x.sql==='BEGIN').length,0);
 await assert.rejects(()=>createVerifiedTableChangeB3CustomerFlowCandidate({
  ...args,flowPool:b3CustomerFlowPool({extraGrant:true})
 }),/invalid_customer_production_sql_capabilities:function-surface/);
 assert.equal(customer.calls.filter(x=>x.sql==='BEGIN').length,0);
});


test('B3 five-identity candidate rejects invalid bootstrap before querying PostgreSQL',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const writer=b3ConfirmationPool();
 const reader=h6ReadPool();
 const flow=b3CustomerFlowPool();
 const args={customerPool:customer,operationsPool:operations,confirmationPool:writer,
  h6ReadPool:reader,flowPool:flow,expectedCustomerLogin:'f12_customer_login',
  expectedOperationsLogin:'f12_operations_login',expectedConfirmationLogin:'b3_confirmation_login',
  expectedH6ReadLogin:'h6_read_login',expectedFlowLogin:'flow_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  secretKey:'s'.repeat(48)};
 for(const invalid of [{secretKey:'weak'},{clock:0},{newId:null},{hashSession:null},
  {verifyStaff:null}]){
  await assert.rejects(()=>createVerifiedTableChangeB3CustomerFlowCandidate({...args,...invalid}),
   /invalid_b3_customer_flow_configuration/);
 }
 for(const candidate of [customer,operations,writer,reader,flow])
  assert.equal(candidate.calls.length,0);
});


test('B3 fifth login rejects a second SET ROLE membership even when standard preflight passes',async()=>{
 const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
 const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
 const writer=b3ConfirmationPool();
 const reader=h6ReadPool();
 const flow=b3CustomerFlowPool({extraRole:true});
 await assert.rejects(()=>createVerifiedTableChangeB3CustomerFlowCandidate({
  customerPool:customer,operationsPool:operations,confirmationPool:writer,
  h6ReadPool:reader,flowPool:flow,expectedCustomerLogin:'f12_customer_login',
  expectedOperationsLogin:'f12_operations_login',expectedConfirmationLogin:'b3_confirmation_login',
  expectedH6ReadLogin:'h6_read_login',expectedFlowLogin:'flow_login',
  hashSession:async()=>tokenHash,verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  secretKey:'s'.repeat(48)
 }),/invalid_b3_customer_flow_set_roles/);
 assert.equal(flow.calls.some(x=>x.sql===B3_CUSTOMER_FLOW_EXACT_SET_SQL),true);
 for(const candidate of [customer,operations,writer,reader])
  assert.equal(candidate.calls.length,0);
});


test('B3 H6 reader login rejects extra SET ROLE or direct Sabora EXECUTE before constructing confirmation',async()=>{
 for(const invalid of [{extraRole:true},{directExecute:true}]){
  const customer=preflightPool('sabora_f12_customer_runtime','f12_customer_login');
  const operations=preflightPool('sabora_f12_operations_runtime','f12_operations_login');
  const writer=b3ConfirmationPool();
  const reader=h6ReadPool(invalid);
  let constructed=0;
  await assert.rejects(()=>createVerifiedTableChangeB3Candidate({
   customerPool:customer,operationsPool:operations,confirmationPool:writer,
   h6ReadPool:reader,expectedCustomerLogin:'f12_customer_login',
   expectedOperationsLogin:'f12_operations_login',expectedConfirmationLogin:'b3_confirmation_login',
   expectedH6ReadLogin:'h6_read_login',hashSession:async()=>tokenHash,
   verifyStaff:async()=>({userId:staffId,role:'waiter'}),
   createConfirmationFlow:async()=>{constructed++;return {confirm:async()=>{}};}
  }),/invalid_b3_h6_login_surface/);
  assert.equal(constructed,0);
  assert.equal(reader.calls.some(x=>x.sql===B3_H6_LOGIN_SURFACE_SQL),true);
  assert.equal(writer.calls.some(x=>x.sql==='BEGIN'),false);
 }
});
