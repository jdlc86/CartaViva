import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffTableTransitionCoordinator,createStaffTableTransitionSqlAdapter}
 from '../apps/api/src/staff-table-transition-coordinator.mjs';
const actorId='00000000-0000-4000-8000-000000008901';
const tableId='00000000-0000-4000-8000-000000008902';
const sessionId='00000000-0000-4000-8000-000000008903';
const credential='c'.repeat(64);
function fixture(overrides={}){
 const calls=[];
 const coordinator=createStaffTableTransitionCoordinator({
  withTransaction:async fn=>{calls.push('BEGIN');try{
   const result=await fn(async()=>({rows:[]}));calls.push('COMMIT');return result;
  }catch(e){calls.push('ROLLBACK');throw e;}},
  resolveStaffSession:async(_q,{credential:c})=>{
   calls.push('session');assert.equal(c,credential);
   return {authenticated:true,active:true,actorId};
  },
  transition:async(_q,args)=>{calls.push('transition');
   assert.equal(args.actorId,actorId);
   return {tableId,orderingState:args.target,sessionId};},
  ...overrides
 });
 return {coordinator,calls};
}
test('actor is derived only from trusted session within same transaction',async()=>{
 const {coordinator,calls}=fixture();
 const result=await coordinator({credential,tableId,target:'open'});
 assert.deepEqual(result,{tableId,orderingState:'open',sessionId});
 assert.deepEqual(calls,['BEGIN','session','transition','COMMIT']);
});
test('caller cannot supply actor or role and skip session check',async()=>{
 const {coordinator,calls}=fixture();
 await assert.rejects(coordinator({credential,tableId,target:'open',
  actorId:'00000000-0000-4000-8000-000000008999'}),/invalid_staff_transition_request|staff_session_forbidden/);
 // Future request schemas must explicitly reject unknown fields.
});
test('revoked staff session cannot reach transition',async()=>{
 const {coordinator,calls}=fixture({resolveStaffSession:async()=>({
  authenticated:true,active:false,actorId
 })});
 await assert.rejects(coordinator({credential,tableId,target:'closed'}),/staff_session_forbidden/);
 assert.deepEqual(calls,['BEGIN','ROLLBACK']);
});
test('invalid states and pause timestamps fail before transaction',async()=>{
 const {coordinator,calls}=fixture();
 for(const args of [{target:'delete'},{target:'open',pauseUntil:'2026-10-22T00:00:00.000Z'},
  {target:'paused',pauseUntil:'invalid'}]){
  await assert.rejects(coordinator({credential,tableId,...args}),/invalid_staff_transition_request/);
 }
 assert.deepEqual(calls,[]);
});
test('SQL adapter binds authenticated actor and table as parameters',async()=>{
 const adapter=createStaffTableTransitionSqlAdapter();
 const result=await adapter(async(sql,args)=>{
  assert.match(sql,/transition_table_ordering_candidate\(\$1::uuid,\$2::uuid/);
  assert.deepEqual(args,[actorId,tableId,'paused','2026-10-22T20:00:00.000Z']);
  assert.doesNotMatch(sql,new RegExp(actorId));
  return {rows:[{table_id:tableId,ordering_state:'paused',session_id:sessionId}]};
 },{actorId,tableId,target:'paused',pauseUntil:'2026-10-22T20:00:00.000Z'});
 assert.deepEqual(result,{tableId,orderingState:'paused',sessionId});
});
