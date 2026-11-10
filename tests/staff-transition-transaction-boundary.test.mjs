import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffTableTransitionCoordinator,createStaffTableTransitionSqlAdapter} from '../apps/api/src/staff-table-transition-coordinator.mjs';
import {createVerifiedStaffSessionResolver} from '../apps/api/src/verified-staff-session-resolver.mjs';

const actorId='11111111-1111-4111-8111-111111111111';
const tableId='22222222-2222-4222-8222-222222222222';
const sessionId='33333333-3333-4333-8333-333333333333';
const credential='c'.repeat(64);
const request={credential,tableId,target:'open'};

function transactionHarness({rows=[],verify=async()=>({verified:true,subject:actorId,audienceValid:true,issuerValid:true,notExpired:true}),failTransition=false}={}){
 const events=[];
 let committed=false;
 const resolveStaffSession=createVerifiedStaffSessionResolver({verifyBearer:verify});
 const transition=createStaffTableTransitionSqlAdapter();
 const withTransaction=async callback=>{
  events.push('BEGIN');
  const query=async (sql,args)=>{
   if(sql.includes('FROM sabora.staff_members')){
    events.push('membership');
    assert.match(sql,/FOR SHARE/);
    assert.deepEqual(args,[actorId]);
    return {rows};
   }
   if(sql.includes('transition_table_ordering_candidate')){
    events.push('transition');
    assert.deepEqual(args,[actorId,tableId,'open',null]);
    if(failTransition)throw Error('db_transition_failed');
    return {rows:[{table_id:tableId,ordering_state:'open',session_id:sessionId}]};
   }
   throw Error('unexpected_sql');
  };
  try{
   const result=await callback(query);
   committed=true;
   events.push('COMMIT');
   return result;
  }catch(error){events.push('ROLLBACK');throw error;}
 };
 return {run:createStaffTableTransitionCoordinator({withTransaction,resolveStaffSession,transition}),events,get committed(){return committed;}};
}

test('verified waiter transitions under same transaction and row-locked membership',async()=>{
 const h=transactionHarness({rows:[{user_id:actorId,role:'waiter',state:'active'}]});
 assert.deepEqual(await h.run(request),{tableId,orderingState:'open',sessionId});
 assert.deepEqual(h.events,['BEGIN','membership','transition','COMMIT']);
 assert.equal(h.committed,true);
});

for(const rows of [[],[{user_id:actorId,role:'kitchen',state:'active'}],
 [{user_id:actorId,role:'waiter',state:'suspended'}],
 [{user_id:'44444444-4444-4444-8444-444444444444',role:'waiter',state:'active'}]]){
 test('revoked or contradictory membership cannot transition or commit',async()=>{
  const h=transactionHarness({rows});
  await assert.rejects(h.run(request),/staff_session_forbidden|invalid_staff_session_db_response/);
  assert.deepEqual(h.events,['BEGIN','membership','ROLLBACK']);
  assert.equal(h.committed,false);
 });
}

test('invalid signed bearer never reads membership or mutates table',async()=>{
 const h=transactionHarness({verify:async()=>({verified:false})});
 await assert.rejects(h.run(request),/staff_session_forbidden/);
 assert.deepEqual(h.events,['BEGIN','ROLLBACK']);
 assert.equal(h.committed,false);
});

test('database transition failure rolls back instead of returning success',async()=>{
 const h=transactionHarness({rows:[{user_id:actorId,role:'admin',state:'active'}],failTransition:true});
 await assert.rejects(h.run(request),/db_transition_failed/);
 assert.deepEqual(h.events,['BEGIN','membership','transition','ROLLBACK']);
 assert.equal(h.committed,false);
});

test('SQL adapter rejects inconsistent result and does not fabricate success',async()=>{
 const adapter=createStaffTableTransitionSqlAdapter();
 await assert.rejects(adapter(async()=>({rows:[]}),{actorId,tableId,target:'open',pauseUntil:null}),
  /invalid_staff_transition_sql_result/);
 await assert.rejects(adapter(async()=>({rows:[{},{}]}),{actorId,tableId,target:'open',pauseUntil:null}),
  /invalid_staff_transition_sql_result/);
});
