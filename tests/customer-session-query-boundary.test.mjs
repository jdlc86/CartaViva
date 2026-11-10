import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerSessionQueryBoundary, SESSION_REVOKE_SQL } from '../apps/api/src/customer-session-query-boundary.mjs';
import { SESSION_LOOKUP_SQL } from '../apps/api/src/customer-session-verifier.mjs';
import { createCustomerSessionRevoker } from '../apps/api/src/customer-session-revoker.mjs';
import { createCustomerSessionVerifier } from '../apps/api/src/customer-session-verifier.mjs';
import { issueCustomerSession } from '../apps/api/src/customer-session.mjs';

const issued=issueCustomerSession({random:()=>Buffer.alloc(32,9)});
test('only pinned lookup and revoke SQL reach injected pool',async()=>{
 const seen=[];
 const query=createCustomerSessionQueryBoundary({pool:{query:async(sql,params)=>{seen.push({sql,params});return sql===SESSION_REVOKE_SQL?{rows:[{revoked:true}]}:{rows:[]};}}});
 assert.equal(await createCustomerSessionVerifier({query})(issued.token),null);
 assert.equal(await createCustomerSessionRevoker({query})(issued.token),true);
 assert.deepEqual(seen.map(x=>x.sql),[SESSION_LOOKUP_SQL,SESSION_REVOKE_SQL]);
 assert.ok(seen.every(x=>x.params.length===1&&x.params[0].equals(issued.tokenHash)));
});
test('arbitrary SQL, invalid hash, and missing pool fail closed',async()=>{
 let calls=0;
 const query=createCustomerSessionQueryBoundary({pool:{query:async()=>{calls++;return {rows:[]};}}});
 await assert.rejects(query('select * from sabora.customer_profiles',[issued.tokenHash]),/not_allowed/);
 await assert.rejects(query(SESSION_LOOKUP_SQL,['plaintext']),/invalid_customer_session_parameters/);
 await assert.rejects(query(SESSION_REVOKE_SQL,[Buffer.alloc(31)]),/invalid_customer_session_parameters/);
 assert.equal(calls,0);
 assert.throws(()=>createCustomerSessionQueryBoundary({}),/invalid_customer_session_pool/);
});
