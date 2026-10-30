import test from 'node:test';
import assert from 'node:assert/strict';
import {createTableChangeService} from './table-change-service.mjs';
import {createTableChangePostgresStore} from './table-change-postgres-store.mjs';

const NOW='2026-10-30T12:00:00.000Z';
const requestRow={
 id:'request-1',account_id:'account-1',customer_id:'customer-1',
 visit_key:'visit_1234567890123456',source_table_id:'table-1',
 status:'pending',created_at:NOW,expires_at:'2026-10-30T12:01:30.000Z'
};
function harness({decisionRows,insertRows}={}){
 const statements=[];
 const store=createTableChangePostgresStore({
  withTransaction:async handler=>handler(async(sql,args)=>{
   statements.push({sql,args});
   if(sql==='SELECT clock_timestamp() AS now')return {rows:[{now:NOW}]};
   if(sql.includes('table_change_response_seconds'))return {rows:[{table_change_response_seconds:90}]};
   if(sql.includes('ORDER BY created_at DESC'))return {rows:[]};
   if(sql.includes("status='approved' FOR UPDATE"))return {rows:[]};
   if(sql.includes('INSERT INTO sabora.customer_table_change_requests'))return {rows:insertRows??[requestRow]};
   if(sql.includes('WHERE id=$1 FOR UPDATE'))return {rows:[requestRow]};
   if(sql.startsWith('UPDATE sabora.customer_table_change_requests SET status=$2'))
    return {rows:decisionRows??[{...requestRow,status:args[1],decided_at:NOW,decided_by:args[2]}]};
   return {rows:[]};
  }),
  resolveAccount:async({customerSessionToken,lock})=>{
   assert.equal(customerSessionToken,'valid-session');
   assert.equal(lock,true);
   return {accountId:'account-1',customerId:'customer-1',
    visitId:'visit_1234567890123456',tableId:'table-1',closed:false};
  },
  verifyStaff:async()=>({id:'waiter-1',role:'waiter'})
 });
 return {service:createTableChangeService({store}),statements};
}
test('service and PostgreSQL adapter: request has no destination and waiter approval does not transfer',async()=>{
 const {service,statements}=harness();
 const created=await service.request({customerSessionToken:'valid-session'});
 assert.equal(created.status,'pending');
 assert.equal(created.sourceTableId,'table-1');
 assert.equal(created.destinationTableId,null);
 const result=await service.decide({verifiedIdentity:{id:'waiter-1'},
  verifiedStaff:{role:'waiter'},requestId:'request-1',decision:'approved'});
 assert.equal(result.request.status,'approved');
 assert.equal(result.request.destinationTableId,null);
 assert.equal(statements.filter(s=>s.sql.includes('INSERT INTO')).length,1);
 assert.equal(statements.filter(s=>s.sql.startsWith('UPDATE sabora.customer_accounts')).length,0);
 assert.equal(statements.filter(s=>s.sql.startsWith('UPDATE sabora.customer_table_change_requests SET status=$2')).length,1);
});
test('service and PostgreSQL adapter: stale decision fails closed after SQL rejects it',async()=>{
 const {service,statements}=harness({decisionRows:[]});
 await assert.rejects(()=>service.decide({verifiedIdentity:{id:'waiter-1'},
  verifiedStaff:{role:'waiter'},requestId:'request-1',decision:'approved'}),
  /table_change_request_not_pending/);
 assert.equal(statements.filter(s=>s.sql.startsWith('UPDATE sabora.customer_table_change_requests SET status=$2')).length,1);
});
test('service and PostgreSQL adapter: ineligible account cannot create a request',async()=>{
 const {service}=harness({insertRows:[]});
 await assert.rejects(()=>service.request({customerSessionToken:'valid-session'}),
  /table_change_request_locked/);
});
