import test from 'node:test';
import assert from 'node:assert/strict';
import {createTableChangePostgresStore} from './table-change-postgres-store.mjs';

test('request adapter delegates account ownership and transaction to injected H6 runner',async()=>{
 const calls=[];
 const store=createTableChangePostgresStore({
  withTransaction:async handler=>handler(async(sql,args)=>{
   calls.push({sql,args});
   if(sql==='SELECT clock_timestamp() AS now')return {rows:[{now:'2026-10-30T12:00:00.000Z'}]};
   if(sql.includes('table_change_response_seconds'))return {rows:[{table_change_response_seconds:90}]};
   if(sql.includes('INSERT INTO'))return {rows:[{
    id:'r1',status:'pending',source_table_id:'t1',
    created_at:'2026-10-30T12:00:00.000Z',expires_at:'2026-10-30T12:01:30.000Z'
   }]};
   return {rows:[]};
  }),
  resolveAccount:async({customerSessionToken,lock})=>{
   assert.equal(customerSessionToken,'session');
   assert.equal(lock,true);
   return {accountId:'a1',customerId:'c1',visitId:'v1',tableId:'t1',closed:false};
  },
  verifyStaff:async()=>({id:'w1',role:'waiter'})
 });
 const result=await store.transaction('request',async tx=>{
  const account=await tx.lockCustomerAccount('session');
  const now=await tx.serverNowMs();
  await tx.expirePendingRequests(account.accountId,now);
  assert.equal(await tx.lockApprovedRequest(account.accountId),undefined);
  assert.equal(await tx.configuredWindowMs(),90000);
  return tx.insertRequest({...account,sourceTableId:account.tableId,createdAtMs:now,expiresAtMs:now+90000});
 });
 assert.equal(result.status,'pending');
 assert.equal(result.id,'r1');
 assert.ok(calls.some(x=>x.sql.includes("status='expired'")));
 assert.ok(calls.some(x=>x.sql.includes('INSERT INTO')));
 const insertion=calls.find(x=>x.sql.includes('INSERT INTO'));
 assert.match(insertion.sql,/WITH request_clock AS \(SELECT clock_timestamp\(\) AS at\)/);
 assert.match(insertion.sql,/e\.at\+make_interval/);
 assert.match(insertion.sql,/WHERE NOT EXISTS/);
 assert.match(insertion.sql,/JOIN sabora.customer_accounts a/);
 assert.match(insertion.sql,/a\.state='open'/);
 assert.match(insertion.sql,/a\.table_id=\$4/);
 assert.match(insertion.sql,/status='approved'/);
 assert.equal(insertion.args[4],90);
 const expiry=calls.find(x=>x.sql.includes("status='expired'"));
 assert.match(expiry.sql,/expires_at<=clock_timestamp\(\)/);
});

test('adapter rejects missing transaction, account resolver or staff verifier',()=>{
 assert.throws(()=>createTableChangePostgresStore({withTransaction:async()=>{}}),/invalid_table_change_store/);
});

test('transfer fails closed until account and pending deliveries can move atomically',async()=>{
 const calls=[];
 const store=createTableChangePostgresStore({
  withTransaction:async handler=>handler(async(sql,args)=>{calls.push({sql,args});return {rows:[]};}),
  resolveAccount:async()=>({}),verifyStaff:async()=>({})
 });
 await assert.rejects(()=>store.transaction('request',tx=>tx.applyTransfer({
  accountId:'a1',orderId:'o1',request:{id:'r1',sourceTableId:'t1',destinationTableId:'t2'}
 })),/table_change_transfer_not_integrated/);
 assert.equal(calls.length,0);
});

test('decision update enforces server deadline at write time',async()=>{
 let updateSql='';
 const store=createTableChangePostgresStore({
  withTransaction:async callback=>callback(async(sql,args)=>{
   if(sql.startsWith('UPDATE sabora.customer_table_change_requests SET status=$2')){
    updateSql=sql;
    return {rows:[{id:'r1',status:'approved',source_table_id:'t1',
     created_at:'2026-10-30T12:00:00Z',expires_at:'2026-10-30T12:01:30Z',
     decided_at:'2026-10-30T12:01:29Z'}]};
   }
   return {rows:[]};
  }),
  resolveAccount:async()=>({}),verifyStaff:async()=>({id:'w1',role:'waiter'})
 });
 await store.transaction('decide',tx=>tx.recordDecision({
  request:{id:'r1',status:'approved',decidedAtMs:1793361689000},staffId:'w1'
 }));
 assert.match(updateSql,/expires_at>clock_timestamp\(\)/);
 assert.match(updateSql,/decided_at=clock_timestamp\(\)/);
 assert.match(updateSql,/a\.state='open'/);
 assert.match(updateSql,/a\.table_id=sabora\.customer_table_change_requests\.source_table_id/);
 assert.doesNotMatch(updateSql,/to_timestamp\(/);
});

test('request race returns a domain conflict when INSERT yields no row',async()=>{
 const store=createTableChangePostgresStore({
  withTransaction:async handler=>handler(async()=>({rows:[]})),
  resolveAccount:async()=>({}),verifyStaff:async()=>({})
 });
 await assert.rejects(
  ()=>store.transaction('request',tx=>tx.insertRequest({
   accountId:'a1',customerId:'c1',visitId:'visit_1234567890123456',
   sourceTableId:'t1',createdAtMs:1000,expiresAtMs:91000
  })),
  /table_change_request_locked/
 );
});

test('decision race returns not-pending when deadline or account guard rejects UPDATE',async()=>{
 const store=createTableChangePostgresStore({
  withTransaction:async handler=>handler(async()=>({rows:[]})),
  resolveAccount:async()=>({}),verifyStaff:async()=>({})
 });
 await assert.rejects(
  ()=>store.transaction('decide',tx=>tx.recordDecision({
   request:{id:'r1',status:'approved'},staffId:'w1'
  })),
  /table_change_request_not_pending/
 );
});

test('request and decision reject ambiguous multi-row SQL results',async()=>{
 const store=createTableChangePostgresStore({
  withTransaction:async handler=>handler(async()=>({rows:[{id:'first'},{id:'second'}]})),
  resolveAccount:async()=>({}),verifyStaff:async()=>({})
 });
 await assert.rejects(()=>store.transaction('request',tx=>tx.insertRequest({
  accountId:'a1',customerId:'c1',visitId:'visit_1234567890123456',
  sourceTableId:'t1',createdAtMs:1000,expiresAtMs:91000
 })),/invalid_table_change_sql_result/);
 await assert.rejects(()=>store.transaction('decide',tx=>tx.recordDecision({
  request:{id:'r1',status:'rejected'},staffId:'w1'
 })),/invalid_table_change_sql_result/);
});

test('adapter never exposes transfer as an independent transaction operation',async()=>{
 let called=false;
 const store=createTableChangePostgresStore({
  withTransaction:async()=>{called=true;},
  resolveAccount:async()=>({}),verifyStaff:async()=>({})
 });
 await assert.rejects(()=>store.transaction('transfer',async()=>{}),/invalid_table_change_operation/);
 assert.equal(called,false);
});
