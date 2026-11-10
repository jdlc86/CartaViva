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

test('staff transition rejects accessor properties without executing them',async()=>{
 let accessed=false;
 const input={credential:'x'.repeat(32),tableId,target:'open'};
 Object.defineProperty(input,'actorId',{enumerable:true,get(){accessed=true;throw Error('getter_executed');}});
 const run=createStaffTableTransitionCoordinator({
  withTransaction:async()=>{throw Error('transaction_started');},
  resolveStaffSession:async()=>{throw Error('resolver_started');},
  transition:async()=>{throw Error('mutation_started');}
 });
 await assert.rejects(run(input),/invalid_staff_transition_request/);
 assert.equal(accessed,false);
});

test('staff transition rejects inherited credentials and forged prototype',async()=>{
 const input=Object.create({credential:'x'.repeat(32)});
 Object.assign(input,{tableId,target:'open'});
 const run=createStaffTableTransitionCoordinator({
  withTransaction:async()=>{throw Error('transaction_started');},
  resolveStaffSession:async()=>{throw Error('resolver_started');},
  transition:async()=>{throw Error('mutation_started');}
 });
 await assert.rejects(run(input),/invalid_staff_transition_request/);
});

test('staff transition rejects symbol and non-enumerable payload fields',async()=>{
 for(const extra of ['symbol','hidden']){
  const input={credential:'x'.repeat(32),tableId,target:'open'};
  if(extra==='symbol')input[Symbol('actorId')]=actorId;
  else Object.defineProperty(input,'actorId',{value:actorId,enumerable:false});
  const run=createStaffTableTransitionCoordinator({
   withTransaction:async()=>{throw Error('transaction_started');},
   resolveStaffSession:async()=>{throw Error('resolver_started');},
   transition:async()=>{throw Error('mutation_started');}
  });
  await assert.rejects(run(input),/invalid_staff_transition_request/);
 }
});

test('staff transition accepts null-prototype plain data and uses verified actor',async()=>{
 const calls=[];
 const input=Object.assign(Object.create(null),{credential:'x'.repeat(32),tableId,target:'open'});
 const run=createStaffTableTransitionCoordinator({
  withTransaction:async callback=>{calls.push('transaction');return callback(async()=>({rows:[]}));},
  resolveStaffSession:async()=>{calls.push('verify');return {authenticated:true,active:true,actorId,role:'waiter'};},
  transition:async(_query,scope)=>{calls.push('transition');assert.deepEqual(scope,{actorId,tableId,target:'open',pauseUntil:null});return {tableId,orderingState:'open',sessionId};}
 });
 assert.deepEqual(await run(input),{tableId,orderingState:'open',sessionId});
 assert.deepEqual(calls,['transaction','verify','transition']);
});
