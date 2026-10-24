import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerSessionScopedQuery } from '../apps/api/src/customer-session-scoped-query.mjs';
import { SESSION_LOOKUP_SQL } from '../apps/api/src/customer-session-verifier.mjs';
const hash=Buffer.alloc(32,7);
test('scoped query rejects arbitrary SQL before opening connection',async()=>{
 let connects=0;
 const query=createCustomerSessionScopedQuery({pool:{async connect(){connects++;}}});
 await assert.rejects(query('SELECT * FROM sabora.customer_sessions',[hash]),/not_allowed/);
 await assert.rejects(query(SESSION_LOOKUP_SQL,[Buffer.alloc(1)]),/invalid_customer_session_parameters/);
 assert.equal(connects,0);
});
test('scoped query rolls back and discards client on RPC failure',async()=>{
 const commands=[];const released=[];
 const query=createCustomerSessionScopedQuery({pool:{async connect(){return {
  async query(sql){commands.push(sql);if(sql===SESSION_LOOKUP_SQL)throw Error('db_down');},
  release(discard){released.push(discard);}
 };}}});
 await assert.rejects(query(SESSION_LOOKUP_SQL,[hash]),/db_down/);
 assert.deepEqual(commands,['BEGIN','SET LOCAL ROLE sabora_customer_session_runtime',SESSION_LOOKUP_SQL,'ROLLBACK']);
 assert.deepEqual(released,[true]);
});
test('scoped query returns connection only after successful COMMIT',async()=>{
 const commands=[];const released=[];
 const query=createCustomerSessionScopedQuery({pool:{async connect(){return {
  async query(sql){commands.push(sql);return {rows:[]};},
  release(discard){released.push(discard);}
 };}}});
 assert.deepEqual(await query(SESSION_LOOKUP_SQL,[hash]),{rows:[]});
 assert.deepEqual(commands,['BEGIN','SET LOCAL ROLE sabora_customer_session_runtime',SESSION_LOOKUP_SQL,'COMMIT']);
 assert.deepEqual(released,[false]);
});
