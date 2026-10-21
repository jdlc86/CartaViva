import test from 'node:test';
import assert from 'node:assert/strict';
import { readCustomerSessionPoolConfig } from '../apps/api/src/customer-session-pool-config.mjs';
import { createCustomerSessionRuntime } from '../apps/api/src/customer-session-runtime.mjs';
import { issueCustomerSession } from '../apps/api/src/customer-session.mjs';

const env = {
 SABORA_CUSTOMER_SESSION_DB_HOST:'db.example.test',
 SABORA_CUSTOMER_SESSION_DB_NAME:'sabora',
 SABORA_CUSTOMER_SESSION_DB_USER:'sabora_customer_session_login',
 SABORA_CUSTOMER_SESSION_DB_PASSWORD:'test-secret',
 SABORA_CUSTOMER_SESSION_DB_CA_PEM:'-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----'
};
test('session pool config enforces separate login and TLS verification',()=>{
 const config=readCustomerSessionPoolConfig(env);
 assert.equal(config.user,'sabora_customer_session_login');
 assert.equal(config.ssl.rejectUnauthorized,true);
 assert.equal(config.max,3);
 assert.throws(()=>readCustomerSessionPoolConfig({...env,SABORA_CUSTOMER_SESSION_DB_USER:'postgres'}),/invalid_customer_session_pool_config/);
 assert.throws(()=>readCustomerSessionPoolConfig({...env,SABORA_CUSTOMER_SESSION_DB_CA_PEM:''}),/invalid_customer_session_pool_config/);
 assert.throws(()=>readCustomerSessionPoolConfig({...env,SABORA_CUSTOMER_SESSION_DB_PORT:'0'}),/invalid_customer_session_pool_config/);
});
test('runtime opens lazily, uses only RPCs, and closes its own pool',async()=>{
 let created=0,ended=0;
 const seen=[];
 class Pool {
  constructor(config){created++;assert.equal(config.user,env.SABORA_CUSTOMER_SESSION_DB_USER);}
  async connect() { return {
   query:async(sql,params)=>{seen.push({sql,params});return sql.includes('verify_customer_session_hash') ? {rows:[]} : {rows:[{revoked:false}]};},
   release(){}
  };}
  async end(){ended++;}
 }
 const runtime=createCustomerSessionRuntime({Pool,env});
 assert.equal(created,0);
 const operations=runtime.createOperations();
 assert.equal(created,1);
 const token=issueCustomerSession().token;
 assert.equal(await operations.verify(token),null);
 assert.equal(await operations.revoke(token),false);
 assert.equal(seen.length,8);
 assert.deepEqual(seen.map(x=>x.sql.includes('session_hash')?'RPC':x.sql),['BEGIN','SET LOCAL ROLE sabora_customer_session_runtime','RPC','COMMIT','BEGIN','SET LOCAL ROLE sabora_customer_session_runtime','RPC','COMMIT']);
 assert.ok(seen.filter(x=>x.sql.includes('session_hash')).every(x=>x.params[0].length===32));
 await runtime.close();
 assert.equal(ended,1);
 assert.throws(()=>runtime.open(),/runtime_closed/);
});

test('runtime close is single-flight and permanently terminal',async()=>{
 let resolveEnd,ends=0;
 class Pool {
  async connect(){return {query:async()=>({rows:[]}),release(){}};}
  end(){ends++;return new Promise(resolve=>{resolveEnd=resolve;});}
 }
 const runtime=createCustomerSessionRuntime({Pool,env});
 runtime.open();
 const first=runtime.close();
 const second=runtime.close();
 assert.throws(()=>runtime.open(),/runtime_closed/);
 await Promise.resolve();
 assert.equal(ends,1);
 resolveEnd();
 await Promise.all([first,second]);
 assert.equal(ends,1);
});
test('failed pool construction cannot be retried',()=>{
 let attempts=0;
 class Pool {constructor(){attempts++;throw Error('driver_down');}}
 const runtime=createCustomerSessionRuntime({Pool,env});
 assert.throws(()=>runtime.open(),/driver_down/);
 assert.throws(()=>runtime.open(),/runtime_closed/);
 assert.equal(attempts,1);
});
test('invalid driver instance fails closed and is cleaned up',async()=>{
 let ended=0;
 class Pool {end(){ended++;}}
 const runtime=createCustomerSessionRuntime({Pool,env});
 assert.throws(()=>runtime.open(),/invalid_customer_session_pool/);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ended,1);
 assert.throws(()=>runtime.open(),/runtime_closed/);
});
