import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedStaffSessionResolver} from '../apps/api/src/verified-staff-session-resolver.mjs';
const subject='00000000-0000-4000-8000-000000008911';
const credential='x'.repeat(64);
const claims={verified:true,subject,audienceValid:true,issuerValid:true,notExpired:true};
test('cryptographically verified subject is checked against active DB staff',async()=>{
 const resolve=createVerifiedStaffSessionResolver({verifyBearer:async token=>{
  assert.equal(token,credential);return claims;
 }});
 const result=await resolve(async(sql,args)=>{
  assert.match(sql,/state='active' FOR SHARE/);
  assert.deepEqual(args,[subject]);
  assert.doesNotMatch(sql,new RegExp(credential));
  return {rows:[{user_id:subject,role:'waiter',state:'active'}]};
 },{credential});
 assert.deepEqual(result,{authenticated:true,active:true,actorId:subject,role:'waiter'});
});
test('invalid issuer, audience, expiration or signature never touches database',async()=>{
 for(const field of ['verified','audienceValid','issuerValid','notExpired']){
  const resolve=createVerifiedStaffSessionResolver({verifyBearer:async()=>({...claims,[field]:false})});
  const result=await resolve(async()=>{throw Error('unexpected database access');},{credential});
  assert.deepEqual(result,{authenticated:false,active:false});
 }
});
test('suspended, absent and contradictory staff records are fail-closed',async()=>{
 const resolve=createVerifiedStaffSessionResolver({verifyBearer:async()=>claims});
 assert.deepEqual(await resolve(async()=>({rows:[]}),{credential}),
  {authenticated:true,active:false});
 await assert.rejects(resolve(async()=>({rows:[{user_id:subject,role:'waiter',state:'suspended'}]}),
  {credential}),/invalid_staff_session_db_response/);
 await assert.rejects(resolve(async()=>({rows:[{},{}]}),{credential}),
  /invalid_staff_session_db_response/);
});
