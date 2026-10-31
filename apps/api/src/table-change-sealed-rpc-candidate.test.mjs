import test from 'node:test';
import assert from 'node:assert/strict';
import {createSealedTableChangeRpcCandidate,REQUEST_TABLE_CHANGE_H6_SQL,
 DECIDE_TABLE_CHANGE_H6_SQL,REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL} from './table-change-sealed-rpc-candidate.mjs';

const account='11111111-1111-4111-8111-111111111111';
const requestId='22222222-2222-4222-8222-222222222222';
const staffId='33333333-3333-4333-8333-333333333333';
const hash=Buffer.alloc(32,42);
function setup({role='waiter',requestRows,decisionRows}={}){
 const calls=[];
 const query=async(sql,args)=>{
  calls.push({sql,args});
  if(sql===REQUEST_TABLE_CHANGE_H6_SQL)return {rows:requestRows??[{
   request_id:requestId,request_status:'pending',expires_at:'2026-11-01T00:00:00Z'
  }]};
  if(sql===DECIDE_TABLE_CHANGE_H6_SQL)return {rows:decisionRows??[{status:'approved'}]};
  throw Error('unapproved_sql');
 };
 const rpc=createSealedTableChangeRpcCandidate({
  withCustomerTransaction:async fn=>fn(query),
  withStaffTransaction:async fn=>fn(query),
  hashSession:async()=>hash,
  resolveAccount:async()=>({accountId:account,closed:false}),
  verifyStaff:async()=>({userId:staffId,role})
 });
 return {rpc,calls};
}
test('sealed customer request uses only the authorized RPC and binds hash/account',async()=>{
 const {rpc,calls}=setup();
 const result=await rpc.request({customerSessionToken:'secret'});
 assert.deepEqual(result,{id:requestId,status:'pending',expiresAtMs:Date.parse('2026-11-01T00:00:00Z')});
 assert.equal(calls.length,1);
 assert.equal(calls[0].sql,REQUEST_TABLE_CHANGE_H6_SQL);
 assert.deepEqual(calls[0].args,[hash,account]);
 assert.doesNotMatch(calls[0].sql,/INSERT|UPDATE|DELETE/i);
});
test('sealed waiter approval binds trusted staff identity, never caller-provided staff ID',async()=>{
 const {rpc,calls}=setup();
 const result=await rpc.decide({verifiedIdentity:{id:'caller'},verifiedStaff:{role:'waiter'},
  requestId,decision:'approved'});
 assert.deepEqual(result,{request:{id:requestId,status:'approved'}});
 assert.deepEqual(calls[0].args,[staffId,requestId,true]);
});
test('sealed RPC refuses kitchen and root roles without calling SQL',async()=>{
 for(const role of ['kitchen','root']){
  const {rpc,calls}=setup({role});
  await assert.rejects(()=>rpc.decide({verifiedIdentity:{id:'caller'},
   verifiedStaff:{role},requestId,decision:'approved'}),/table_change_unauthorized/);
  assert.equal(calls.length,0);
 }
});
test('sealed RPC rejects malformed request, forged status and multiple SQL rows',async()=>{
 const {rpc,calls}=setup({requestRows:[{request_id:requestId,request_status:'approved',
  expires_at:'2026-11-01T00:00:00Z'}]});
 await assert.rejects(()=>rpc.request({customerSessionToken:'secret'}),/invalid_table_change_rpc_result/);
 await assert.rejects(()=>rpc.request({customerSessionToken:''}),/table_change_unauthorized/);
 assert.equal(calls.length,1);
 const other=setup({decisionRows:[{status:'approved'},{status:'approved'}]});
 await assert.rejects(()=>other.rpc.decide({verifiedIdentity:{},verifiedStaff:{},
  requestId,decision:'approved'}),/invalid_table_change_rpc_result/);
});
test('sealed RPC refuses unexpected expired decision instead of returning approval',async()=>{
 const {rpc}=setup({decisionRows:[{status:'expired'}]});
 await assert.rejects(()=>rpc.decide({verifiedIdentity:{},verifiedStaff:{},
  requestId,decision:'approved'}),/table_change_request_not_pending/);
});
test('sealed RPC validates constructor and rejects non-UUID request IDs',async()=>{
 assert.throws(()=>createSealedTableChangeRpcCandidate(),/invalid_table_change_rpc_configuration/);
 const {rpc,calls}=setup();
 await assert.rejects(()=>rpc.decide({verifiedIdentity:{},verifiedStaff:{},
  requestId:'bad',decision:'approved'}),/invalid_table_change_decision/);
 assert.equal(calls.length,0);
});

test('F12 SQL errors map only when SQLSTATE and message both match',async()=>{
 const cases=[
  ['request','23514','table_change_cooldown','table_change_request_locked'],
  ['request','23514','table_change_approval_active','table_change_request_locked'],
  ['request','42501','customer_session_forbidden','table_change_account_forbidden'],
  ['decide','23514','table_change_already_decided','table_change_request_not_pending'],
  ['decide','42501','table_change_request_missing','table_change_request_not_found'],
  ['decide','42501','table_change_staff_forbidden','table_change_unauthorized'],
  ['request','XX000','table_change_cooldown','table_change_cooldown'],
  ['decide','XX000','table_change_already_decided','table_change_already_decided'],
  ['request','23514','internal_unique_constraint','internal_unique_constraint']
 ];
 for(const [operation,code,message,expected] of cases){
  const query=async()=>{throw Object.assign(Error(message),{code});};
  const rpc=createSealedTableChangeRpcCandidate({
   withCustomerTransaction:fn=>fn(query),withStaffTransaction:fn=>fn(query),
   hashSession:async()=>Buffer.alloc(32),resolveAccount:async()=>({accountId:account}),
   verifyStaff:async()=>({userId:staffId,role:'waiter'})
  });
  const action=operation==='request'?
   ()=>rpc.request({customerSessionToken:'token'}):
   ()=>rpc.decide({verifiedIdentity:{},verifiedStaff:{},requestId,decision:'approved'});
  await assert.rejects(action,error=>error.message===expected,
   operation+': '+code+' '+message);
 }
});

test('F12 resolved request uses one-argument SQL without a direct account resolver',async()=>{
 const calls=[];
 const rpc=createSealedTableChangeRpcCandidate({
  withCustomerTransaction:fn=>fn(async(sql,args)=>{
   calls.push({sql,args});
   return {rows:[{request_id:requestId,request_status:'pending',
    expires_at:'2026-11-01T00:00:00Z'}]};
  }),
  withStaffTransaction:async()=>{throw Error('unexpected_staff_query');},
  hashSession:async()=>hash,
  verifyStaff:async()=>{throw Error('unexpected_staff_lookup');}
 });
 const result=await rpc.request({customerSessionToken:'secret'});
 assert.equal(result.id,requestId);
 assert.deepEqual(calls,[{sql:REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,args:[hash]}]);
 assert.doesNotMatch(calls[0].sql,/customer_accounts|customer_sessions|INSERT|UPDATE|DELETE/i);
});
test('F12 resolved request fails closed on ambiguous or revoked account errors',async()=>{
 for(const message of ['table_change_account_forbidden','customer_session_forbidden']){
  const rpc=createSealedTableChangeRpcCandidate({
   withCustomerTransaction:fn=>fn(async()=>{
    throw Object.assign(Error(message),{code:'42501'});
   }),
   withStaffTransaction:async()=>{},hashSession:async()=>hash,
   verifyStaff:async()=>{}
  });
  await assert.rejects(()=>rpc.request({customerSessionToken:'secret'}),
   /table_change_account_forbidden/);
 }
});
