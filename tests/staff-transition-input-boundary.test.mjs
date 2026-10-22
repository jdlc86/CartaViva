import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffTableTransitionCoordinator} from '../apps/api/src/staff-table-transition-coordinator.mjs';

const actorId='11111111-1111-4111-8111-111111111111';
const tableId='22222222-2222-4222-8222-222222222222';
const sessionId='33333333-3333-4333-8333-333333333333';

for(const input of [
 {credential:'x'.repeat(32),tableId,target:'open',actorId},
 {credential:'x'.repeat(32),tableId,target:'open',role:'root'},
 {credential:'x'.repeat(32),tableId,target:'open',__proto__:null,unexpected:true},
 {credential:'x'.repeat(32),tableId,target:'paused',pauseUntil:'not-a-date'},
 {credential:'x'.repeat(32),tableId,target:'closed',pauseUntil:'2026-10-22T00:00:00.000Z'},
]){
 test('staff transition rejects untrusted request before opening transaction',async()=>{
  let started=false;
  const run=createStaffTableTransitionCoordinator({
   withTransaction:async()=>{started=true;throw Error('must_not_start');},
   resolveStaffSession:async()=>({authenticated:true,active:true,actorId,role:'waiter'}),
   transition:async()=>({tableId,orderingState:'open',sessionId})
  });
  await assert.rejects(run(input),/invalid_staff_transition_request/);
  assert.equal(started,false);
 });
}
for(const role of ['cook','customer',null]){
 test('staff transition refuses unauthorized role without mutation',async()=>{
  let mutations=0;
  const run=createStaffTableTransitionCoordinator({
   withTransaction:async callback=>callback(async()=>({rows:[]})),
   resolveStaffSession:async()=>({authenticated:true,active:true,actorId,role}),
   transition:async()=>{mutations++;return {tableId,orderingState:'open',sessionId};}
  });
  await assert.rejects(run({credential:'x'.repeat(32),tableId,target:'open'}),/staff_session_forbidden/);
  assert.equal(mutations,0);
 });
}
