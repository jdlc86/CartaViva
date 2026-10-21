import test from 'node:test';
import assert from 'node:assert/strict';
import { issueCustomerSession } from '../apps/api/src/customer-session.mjs';
import { createCustomerSessionVerifier, SESSION_LOOKUP_SQL } from '../apps/api/src/customer-session-verifier.mjs';

const token=issueCustomerSession({random:()=>Buffer.alloc(32,21)}).token;
const customer={customer_id:'00000000-0000-4000-8000-000000000111',public_id:'SB-222222222222',alias:'Ana',company:null};

test('session verification uses parameterized hash and enforces validity in SQL',async()=>{
 let seen;
 const verify=createCustomerSessionVerifier({query:async(sql,params)=>{
  seen={sql,params};
  return {rows:[customer]};
 }});
 assert.deepEqual(await verify(token),{customerId:customer.customer_id,publicId:customer.public_id,alias:'Ana',company:null});
 assert.equal(seen.sql,SESSION_LOOKUP_SQL);
 assert.match(seen.sql,/s\.revoked_at IS NULL/);
 assert.match(seen.sql,/s\.expires_at > now\(\)/);
 assert.match(seen.sql,/s\.token_hash = \$1/);
 assert.equal(seen.params.length,1);
 assert.equal(seen.params[0].length,32);
 assert.notEqual(seen.params[0].toString('utf8'),token);
});
test('malformed token is rejected without database access',async()=>{
 const verify=createCustomerSessionVerifier({query:()=>{throw Error('unexpected query');}});
 assert.equal(await verify('SB-222222222222'),null);
 assert.equal(await verify(''),null);
});
test('unknown or revoked or expired sessions return no customer',async()=>{
 const verify=createCustomerSessionVerifier({query:async()=>({rows:[]})});
 assert.equal(await verify(token),null);
});
test('database failure propagates and malformed results fail closed',async()=>{
 const failed=createCustomerSessionVerifier({query:async()=>{throw Error('database unavailable');}});
 await assert.rejects(failed(token),/database unavailable/);
 const malformed=createCustomerSessionVerifier({query:async()=>({rows:[{customer_id:null}]})});
 await assert.rejects(malformed(token),/invalid_customer_session_result/);
 assert.throws(()=>createCustomerSessionVerifier({}),/invalid_customer_session_query/);
});
