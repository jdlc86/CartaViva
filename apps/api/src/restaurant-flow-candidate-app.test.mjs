import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVerifiedRestaurantFlowCandidate} from './restaurant-flow-candidate-app.mjs';

const pool=name=>({options:{user:name},connect:async()=>{throw Error('test_sql_unavailable');}});
const options=()=>({
 customer:{
  registrationPool:pool('customer_register'),sessionPool:pool('customer_session'),
  flowPool:pool('customer_flow'),
  expectedRegistrationLogin:'customer_register',expectedSessionLogin:'customer_session',
  expectedFlowLogin:'customer_flow',allowedOrigin:'https://sabora.example',
  secretKey:'test-only-not-for-production-'.repeat(2)
 },
 operations:{
  staffPool:pool('staff_reader'),operationsPool:pool('operations'),
  staffRole:'staff_reader',operationsRole:'operations',
  issuer:'https://issuer.example',getTrustedKeys:async()=>[],
  issueTransitionCapability:()=>({}),issueReadCapability:()=>({})
 }
});
test('restaurant H3/H4 app rejects absent dependencies before any listener',async()=>{
 await assert.rejects(createVerifiedRestaurantFlowCandidate(),/invalid_restaurant_flow_configuration/);
});
test('restaurant app rejects shared pool before any SQL checkout',async()=>{
 const opts=options();let connections=0;
 for(const p of [opts.customer.registrationPool,opts.customer.sessionPool,opts.customer.flowPool,
  opts.operations.staffPool,opts.operations.operationsPool])p.connect=async()=>{connections++;throw Error('unexpected_sql');};
 opts.operations.staffPool=opts.customer.sessionPool;
 await assert.rejects(createVerifiedRestaurantFlowCandidate(opts),/restaurant_flow_pool_isolation_required/);
 assert.equal(connections,0);
});
test('restaurant app rejects shared SQL role before any SQL checkout',async()=>{
 const opts=options();let connections=0;
 for(const p of [opts.customer.registrationPool,opts.customer.sessionPool,opts.customer.flowPool,
  opts.operations.staffPool,opts.operations.operationsPool])p.connect=async()=>{connections++;throw Error('unexpected_sql');};
 opts.operations.staffRole=opts.customer.expectedSessionLogin;
 await assert.rejects(createVerifiedRestaurantFlowCandidate(opts),/restaurant_flow_role_isolation_required/);
 assert.equal(connections,0);
});
test('restaurant app closes on first SQL failure without leaking credentials',async()=>{
 const opts=options();
 await assert.rejects(createVerifiedRestaurantFlowCandidate(opts),
  /invalid_customer_production_sql_capabilities/);
});
test('restaurant factory remains opt-in and never listens or reads deployment env',()=>{
 const source=readFileSync(new URL('./restaurant-flow-candidate-app.mjs',import.meta.url),'utf8');
 const server=readFileSync(new URL('./server.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.listen\(|process\.env|DATABASE_URL|new Pool\(/);
 assert.doesNotMatch(server,/restaurant-flow-candidate-app/);
});
