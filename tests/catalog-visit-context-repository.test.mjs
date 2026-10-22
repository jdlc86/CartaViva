import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogVisitContextRepository} from '../apps/api/src/catalog-visit-context-repository.mjs';
const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const input={tableId,visitId:'visit-ci',actorId:'actor-ci',basketId:'basket-ci',
 qrToken:'q'.repeat(64),customerSessionToken:'s'.repeat(64)};
const lock=createCatalogVisitContextRepository().lockContext;
const profile={customer_alias:'Cliente',customer_identifier:'SB-23456789ABCD'};
test('locked authorization binds QR, bearer session and durable visit',async()=>{
 const result=await lock(async(sql,args)=>{
  assert.match(sql,/FOR UPDATE OF t FOR SHARE OF v,s,p/);
  assert.match(sql,/JOIN sabora.customer_profiles AS p ON p.id=v.customer_id/);
  assert.match(sql,/v\.authorized_qr_version=t\.qr_version/);
  assert.match(sql,/t\.ordering_state='open'/);
  assert.match(sql,/t\.ordering_state='paused'/);
  assert.match(sql,/t\.pause_until<=clock_timestamp\(\)/);
  assert.match(sql,/v\.expires_at>clock_timestamp\(\)/);
  assert.match(sql,/s\.expires_at>clock_timestamp\(\)/);
  assert.match(sql,/v\.revoked_at IS NULL/);
  assert.match(sql,/s\.revoked_at IS NULL/);
  assert.match(sql,/qr_token_hash=sha256/);
  assert.match(sql,/s\.token_hash=sha256/);
  assert.deepEqual(args,[tableId,'visit-ci','actor-ci',input.qrToken,input.customerSessionToken]);
  assert.doesNotMatch(sql,new RegExp(input.qrToken));
  return {rows:[{table_id:tableId,session_id:sessionId,visit_id:'visit-ci',actor_id:'actor-ci',...profile}]};
 },input);
 assert.deepEqual(result,{authorized:true,canOrder:true,tableId,sessionId,
  visitId:'visit-ci',actorId:'actor-ci',basketId:'basket-ci',
  customerAlias:'Cliente',customerIdentifier:'SB-23456789ABCD'});
});
test('expired, revoked or rotated credentials return forbidden scope',async()=>{
 const result=await lock(async()=>({rows:[]}),input);
 assert.deepEqual(result,{authorized:false,canOrder:false});
});
test('malformed tokens and contradictory identities fail closed',async()=>{
 for(const patch of [{qrToken:'bad'},{customerSessionToken:'bad'},
  {visitId:'not valid'},{tableId:'bad'}]){
  await assert.rejects(lock(async()=>{throw Error('should not query');},{...input,...patch}),
   /invalid_catalog_visit_context/);
 }
 await assert.rejects(lock(async()=>({rows:[{
  table_id:tableId,session_id:sessionId,visit_id:'other',actor_id:'actor-ci'
 }]}),input),/invalid_catalog_visit_response/);
 await assert.rejects(lock(async()=>({rows:[{},{}]}),input),
  /invalid_catalog_visit_response/);
});

test('closed or currently paused table is forbidden (no matching SQL row)',async()=>{
 for(const state of ['closed','paused']){
  const result=await lock(async sql=>{
   assert.match(sql,/t\.ordering_state='open'/);
   return {rows:[]};
  },input);
  assert.deepEqual(result,{authorized:false,canOrder:false},state);
 }
});

test('profile identity is rejected if alias or public identifier is malformed',async()=>{
 for(const profilePatch of [
  {customer_alias:' '.repeat(3)},
  {customer_alias:'A'.repeat(81)},
  {customer_alias:'Control\nline'},
  {customer_identifier:'SB-INVALID'},
  {customer_identifier:null}
 ]){
  await assert.rejects(lock(async()=>({rows:[{
   table_id:tableId,session_id:sessionId,visit_id:'visit-ci',actor_id:'actor-ci',
   ...profile,...profilePatch
  }]}),input),/invalid_catalog_visit_response/);
 }
});

test('visit authorization refuses accessor-backed credentials before getter execution or SQL',async()=>{
 let getters=0,sqlCalls=0;
 const query=async()=>{sqlCalls++;throw Error('unexpected_SQL');};
 const accessor={...input};
 Object.defineProperty(accessor,'qrToken',{enumerable:true,
  get(){getters++;throw Error('credential_getter');}});
 const inherited=Object.assign(Object.create({inherited:true}),input);
 const dangerous={...input};
 Object.defineProperty(dangerous,'__proto__',{enumerable:true,value:'injected'});
 for(const args of [accessor,inherited,dangerous]){
  await assert.rejects(lock(query,args),/invalid_catalog_visit_context/);
 }
 assert.equal(getters,0);
 assert.equal(sqlCalls,0);
});
