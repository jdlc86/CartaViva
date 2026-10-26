import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerProtectedHook} from '../apps/api/src/customer-protected-hook.mjs';

const token='A'.repeat(43);
const id='00000000-0000-4000-8000-000000000111';
const reply=()=>({status:200,payload:null,code(status){this.status=status;return this;},send(payload){this.payload=payload;return this;}});
test('customer auth boundary rejects absent, malformed and public identifiers before verifier',async()=>{
 let calls=0;
 const hook=createCustomerProtectedHook({verifyCustomerSession:async()=>{calls++;return {customerId:id};}});
 for(const authorization of [undefined,null,'SB-222222222222','Bearer SB-222222222222','bearer '+token,'Bearer '+token+' extra',42]){
  const r=reply();
  const req={headers:{authorization}};
  await hook(req,r);
  assert.equal(r.status,401);
  assert.deepEqual(r.payload,{error:'unauthorized'});
  assert.equal(req.customerIdentity,undefined);
 }
 assert.equal(calls,0);
});
test('verified customer UUID is the only attached request identity',async()=>{
 const hook=createCustomerProtectedHook({verifyCustomerSession:async value=>{
  assert.equal(value,token);
  return {customerId:id,publicId:'SB-222222222222',alias:'Ana',company:'Example'};
 }});
 const req={headers:{authorization:'Bearer '+token}};
 const r=reply();
 await hook(req,r);
 assert.equal(r.status,200);
 assert.deepEqual(req.customerIdentity,{customerId:id});
 assert.equal(Object.isFrozen(req.customerIdentity),true);
 assert.equal(req.customerIdentity.publicId,undefined);
});
test('unknown, expired, revoked or malformed verifier responses fail closed',async()=>{
 for(const identity of [null,undefined,{}, {customerId:'SB-222222222222'},{customerId:'not-uuid'},{customerId:123}]){
  const hook=createCustomerProtectedHook({verifyCustomerSession:async()=>identity});
  const req={headers:{authorization:'Bearer '+token}};
  const r=reply();
  await hook(req,r);
  assert.equal(r.status,401);
  assert.equal(req.customerIdentity,undefined);
 }
});
test('verification failure is not converted into authenticated success',async()=>{
 const hook=createCustomerProtectedHook({verifyCustomerSession:async()=>{throw Error('database unavailable');}});
 const response=reply();
 await hook({headers:{authorization:'Bearer '+token}},response);
 assert.equal(response.status,503);
 assert.deepEqual(response.payload,{error:'authentication_unavailable'});
 assert.throws(()=>createCustomerProtectedHook(),/invalid_customer_auth_verifier/);
});
