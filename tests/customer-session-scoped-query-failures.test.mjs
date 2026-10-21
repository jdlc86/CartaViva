import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerSessionScopedQuery } from '../apps/api/src/customer-session-scoped-query.mjs';
import { SESSION_LOOKUP_SQL } from '../apps/api/src/customer-session-verifier.mjs';
import { SESSION_REVOKE_SQL } from '../apps/api/src/customer-session-query-boundary.mjs';
const hash=Buffer.alloc(32,11);

for(const failure of ['BEGIN','SET LOCAL ROLE sabora_customer_session_runtime',SESSION_LOOKUP_SQL,'COMMIT']) {
 test('session scoped query discards client when '+(failure===SESSION_LOOKUP_SQL?'RPC':failure)+' fails',async()=>{
  const commands=[],released=[];
  const query=createCustomerSessionScopedQuery({pool:{async connect(){return {
   async query(sql){commands.push(sql);if(sql===failure)throw Error('injected_failure');return {rows:[]};},
   release(discard){released.push(discard);}
  };}}});
  await assert.rejects(query(SESSION_LOOKUP_SQL,[hash]),/injected_failure/);
  assert.deepEqual(released,[true]);
  assert.equal(commands.includes('COMMIT'),failure==='COMMIT');
  assert.equal(commands.includes('ROLLBACK'),failure!=='BEGIN');
 });
}
test('failed rollback preserves original error and discards client',async()=>{
 const released=[];
 const query=createCustomerSessionScopedQuery({pool:{async connect(){return {
  async query(sql){if(sql==='ROLLBACK')throw Error('rollback_failed');if(sql===SESSION_REVOKE_SQL)throw Error('original_failure');return {rows:[]};},
  release(discard){released.push(discard);}
 };}}});
 await assert.rejects(query(SESSION_REVOKE_SQL,[hash]),/original_failure/);
 assert.deepEqual(released,[true]);
});
test('failed pool.connect never executes privileged statements',async()=>{
 let called=0;
 const query=createCustomerSessionScopedQuery({pool:{async connect(){called++;throw Error('connect_failed');}}});
 await assert.rejects(query(SESSION_LOOKUP_SQL,[hash]),/connect_failed/);
 assert.equal(called,1);
});
test('invalid connected client is discarded without executing SQL',async()=>{
 let discarded=0;
 const query=createCustomerSessionScopedQuery({pool:{async connect(){return {release(force){if(force)discarded++;}};}}});
 await assert.rejects(query(SESSION_LOOKUP_SQL,[hash]),/invalid_customer_session_client/);
 assert.equal(discarded,1);
});
test('same pooled connection cannot retain SET LOCAL role across successful calls',async()=>{
 const commands=[],releases=[];
 const client={
  async query(sql){commands.push(sql);return {rows:[]};},
  release(discard){releases.push(discard);}
 };
 const query=createCustomerSessionScopedQuery({pool:{async connect(){return client;}}});
 await query(SESSION_LOOKUP_SQL,[hash]);
 await query(SESSION_REVOKE_SQL,[hash]);
 assert.deepEqual(releases,[false,false]);
 assert.deepEqual(commands.filter(x=>x==='BEGIN'),['BEGIN','BEGIN']);
 assert.deepEqual(commands.filter(x=>x==='SET LOCAL ROLE sabora_customer_session_runtime').length,2);
 assert.deepEqual(commands.filter(x=>x==='COMMIT').length,2);
});
