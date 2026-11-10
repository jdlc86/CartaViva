import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffSessionResolver} from '../apps/api/src/staff-session-resolver.mjs';
const userId='00000000-0000-4000-8000-000000008901';
const token='t'.repeat(64);
test('verified bearer and locked active staff membership',async()=>{
 const resolver=createStaffSessionResolver({verifyBearer:async value=>{
  assert.equal(value,token);return {verified:true,userId};
 }});
 const result=await resolver(async(sql,args)=>{
  assert.match(sql,/state='active' FOR SHARE/);
  assert.deepEqual(args,[userId]);
  assert.doesNotMatch(sql,new RegExp(token));
  return {rows:[{user_id:userId,role:'waiter',state:'active'}]};
 },{credential:token});
 assert.deepEqual(result,{authenticated:true,active:true,actorId:userId,role:'waiter'});
});
test('unverified bearer never queries staff membership',async()=>{
 const resolver=createStaffSessionResolver({verifyBearer:async()=>({verified:false,userId})});
 assert.deepEqual(await resolver(async()=>{throw Error('query forbidden');},{credential:token}),
  {authenticated:false,active:false});
});
test('valid identity with no active membership remains forbidden',async()=>{
 const resolver=createStaffSessionResolver({verifyBearer:async()=>({verified:true,userId})});
 assert.deepEqual(await resolver(async()=>({rows:[]}),{credential:token}),
  {authenticated:true,active:false});
});
test('mismatched membership, duplicated rows, malformed token fail closed',async()=>{
 const resolver=createStaffSessionResolver({verifyBearer:async()=>({verified:true,userId})});
 await assert.rejects(resolver(async()=>({rows:[{
  user_id:'00000000-0000-4000-8000-000000008999',role:'waiter',state:'active'
 }]}),{credential:token}),/invalid_staff_membership_result/);
 await assert.rejects(resolver(async()=>({rows:[{},{}]}),{credential:token}),
  /invalid_staff_membership_result/);
 await assert.rejects(resolver(async()=>{throw Error('query forbidden');},{credential:'short'}),
  /invalid_staff_session_lookup/);
});
