import test from 'node:test';
import assert from 'node:assert/strict';
import {createTableChangePostgresStore} from './table-change-postgres-store.mjs';

test('request adapter delegates account ownership and transaction to injected H6 runner',async()=>{
 const calls=[];
 const store=createTableChangePostgresStore({
  withTransaction:async handler=>handler(async(sql,args)=>{
   calls.push({sql,args});
   if(sql.includes('clock_timestamp'))return {rows:[{now:'2026-10-30T12:00:00.000Z'}]};
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
});

test('adapter rejects missing transaction, account resolver or staff verifier',()=>{
 assert.throws(()=>createTableChangePostgresStore({withTransaction:async()=>{}}),/invalid_table_change_store/);
});

test('transfer consumes approval and changes binding only in a shared transaction',async()=>{
 const statements=[];
 const store=createTableChangePostgresStore({
  withTransaction:async run=>run(async(sql,args)=>{
   statements.push({sql,args});
   if(sql.startsWith('SELECT id,table_id,state FROM sabora.customer_accounts'))
    return {rows:[{id:'a1',table_id:'t1',state:'open'}]};
   if(sql.includes("status='consumed'"))return {rows:[{id:'r1'}]};
   return {rows:[]};
  }),
  resolveAccount:async()=>({}),verifyStaff:async()=>({})
 });
 await store.transaction('request',tx=>tx.applyTransfer({
  accountId:'a1',orderId:'o1',request:{id:'r1',sourceTableId:'t1',destinationTableId:'t2'}
 }));
 assert.deepEqual(statements.map(x=>x.sql.split(' ')[0]),['SELECT','UPDATE','UPDATE']);
 assert.equal(statements[1].args[4],'t1');
});
test('transfer refuses an origin mismatch before consuming the approval',async()=>{
 const statements=[];
 const store=createTableChangePostgresStore({
  withTransaction:async run=>run(async(sql,args)=>{
   statements.push(sql);
   return {rows:[{id:'a1',table_id:'different',state:'open'}]};
  }),
  resolveAccount:async()=>({}),verifyStaff:async()=>({})
 });
 await assert.rejects(()=>store.transaction('request',tx=>tx.applyTransfer({
  accountId:'a1',orderId:'o1',request:{id:'r1',sourceTableId:'t1',destinationTableId:'t2'}
 })),/table_change_origin_conflict/);
 assert.equal(statements.length,1);
});
