import test from 'node:test';
import assert from 'node:assert/strict';
import { issueCustomerSession } from '../apps/api/src/customer-session.mjs';
import { createCustomerSessionRevoker } from '../apps/api/src/customer-session-revoker.mjs';

const token=issueCustomerSession({random:()=>Buffer.alloc(32,31)}).token;
test('revocation matches only live, unrevoked session by hash',async()=>{
 let called;
 const revoke=createCustomerSessionRevoker({query:async(sql,params)=>{
  called={sql,params};
  return {rows:[{revoked:true}]};
 }});
 assert.equal(await revoke(token),true);
 assert.match(called.sql,/sabora\.revoke_customer_session_hash\(\$1::bytea\)/);
 assert.equal(called.params[0].length,32);
});
test('repeated revocation and invalid token fail closed',async()=>{
 const revoke=createCustomerSessionRevoker({query:async()=>({rows:[{revoked:false}]})});
 assert.equal(await revoke(token),false);
 const never=createCustomerSessionRevoker({query:()=>{throw Error('unexpected query');}});
 assert.equal(await never('SB-222222222222'),false);
});
test('revocation propagates database failure and rejects corrupt results',async()=>{
 const failed=createCustomerSessionRevoker({query:async()=>{throw Error('database down');}});
 await assert.rejects(failed(token),/database down/);
 const bad=createCustomerSessionRevoker({query:async()=>({rowCount:2})});
 await assert.rejects(bad(token),/invalid_customer_revocation_result/);
 assert.throws(()=>createCustomerSessionRevoker({}),/invalid_customer_session_query/);
});
