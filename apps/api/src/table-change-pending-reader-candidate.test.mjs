import test from 'node:test';
import assert from 'node:assert/strict';
import {createPendingTableChangeReader,PENDING_TABLE_CHANGES_SQL}
 from './table-change-pending-reader-candidate.mjs';
const staffId='33333333-3333-4333-8333-333333333333';
const requestId='22222222-2222-4222-8222-222222222222';
test('F12 pending reader binds only verified active staff ID to sealed SQL',async()=>{
 const calls=[];
 const reader=createPendingTableChangeReader({
  withTransaction:fn=>fn(async(sql,args)=>{
   calls.push({sql,args});
   return {rows:[{request_id:requestId,source_table_number:7,
    expires_at:new Date('2026-11-02T12:00:00Z'),
    account_id:'never-exposed'}]};
  }),
  verifyStaff:async({verifiedIdentity,verifiedStaff})=>{
   assert.equal(verifiedIdentity.id,'verified');
   assert.equal(verifiedStaff.role,'waiter');
   return {userId:staffId,role:'waiter'};
  }
 });
 assert.deepEqual(await reader.listPending({
  verifiedIdentity:{id:'verified'},verifiedStaff:{role:'waiter'}
 }),[{requestId,sourceTableNumber:7,expiresAt:'2026-11-02T12:00:00.000Z'}]);
 assert.deepEqual(calls,[{sql:PENDING_TABLE_CHANGES_SQL,args:[staffId]}]);
});
test('F12 pending reader denies kitchen and malformed SQL rows',async()=>{
 let calls=0;
 const reader=createPendingTableChangeReader({
  withTransaction:fn=>fn(async()=>{calls++;return {rows:[]};}),
  verifyStaff:async()=>({userId:staffId,role:'kitchen'})
 });
 await assert.rejects(reader.listPending({
  verifiedIdentity:{id:'verified'},verifiedStaff:{role:'kitchen'}
 }),/table_change_unauthorized/);
 assert.equal(calls,0);
 const malformed=createPendingTableChangeReader({
  withTransaction:fn=>fn(async()=>({rows:[{
   request_id:requestId,source_table_number:0,expires_at:'2026-11-02T12:00:00Z'
  }]})),
  verifyStaff:async()=>({userId:staffId,role:'admin'})
 });
 await assert.rejects(malformed.listPending({
  verifiedIdentity:{id:'verified'},verifiedStaff:{role:'admin'}
 }),/invalid_pending_projection/);
});
