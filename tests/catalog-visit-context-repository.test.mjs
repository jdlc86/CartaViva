import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogVisitContextRepository} from '../apps/api/src/catalog-visit-context-repository.mjs';
const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const input={tableId,visitId:'visit-ci',actorId:'actor-ci',basketId:'basket-ci',
 qrToken:'q'.repeat(64),customerSessionToken:'s'.repeat(64)};
const lock=createCatalogVisitContextRepository().lockContext;
test('locked authorization binds QR, bearer session and durable visit',async()=>{
 const result=await lock(async(sql,args)=>{
  assert.match(sql,/FOR SHARE OF t,v,s/);
  assert.match(sql,/v\.authorized_qr_version=t\.qr_version/);
  assert.match(sql,/v\.expires_at>clock_timestamp\(\)/);
  assert.match(sql,/s\.expires_at>clock_timestamp\(\)/);
  assert.match(sql,/v\.revoked_at IS NULL/);
  assert.match(sql,/s\.revoked_at IS NULL/);
  assert.match(sql,/qr_token_hash=sha256/);
  assert.match(sql,/s\.token_hash=sha256/);
  assert.deepEqual(args,[tableId,'visit-ci','actor-ci',input.qrToken,input.customerSessionToken]);
  assert.doesNotMatch(sql,new RegExp(input.qrToken));
  return {rows:[{table_id:tableId,session_id:sessionId,visit_id:'visit-ci',actor_id:'actor-ci'}]};
 },input);
 assert.deepEqual(result,{authorized:true,canOrder:true,tableId,sessionId,
  visitId:'visit-ci',actorId:'actor-ci',basketId:'basket-ci'});
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
