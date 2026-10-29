import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVerifiedRestaurantFlowCandidate} from './restaurant-flow-candidate-app.mjs';
import {CUSTOMER_PRODUCTION_PREFLIGHT_SQL,CUSTOMER_PRODUCTION_FUNCTION_PREFLIGHT_SQL,
 CUSTOMER_PRODUCTION_EXACT_FUNCTIONS_SQL} from './customer-production-sql-preflight.mjs';

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

function acceptedPool(role,kind){
 const state={checks:0,releases:0};
 return {options:{user:role},state,query:async()=>({rows:[]}),
  connect:async()=>({release:()=>{state.releases++;},query:async sql=>{
   state.checks++;
   if(kind.startsWith('customer')){
    if(sql===CUSTOMER_PRODUCTION_PREFLIGHT_SQL)return {rows:[{
     effective_role:role,login_role:role,can_login:true,inherit_role:false,
     superuser:false,bypass_rls:false,create_db:false,create_role:false,
     replication:false,database_create:false,schema_create:false,
     direct_relation_access:false,direct_sequence_access:false,
     registration_set:kind==='customer_registration',
     session_set:kind==='customer_session',flow_set:kind==='customer_flow'
    }]};
    if(sql===CUSTOMER_PRODUCTION_FUNCTION_PREFLIGHT_SQL)
     return {rows:[{login_execute:false,capability_execute:true}]};
    if(sql===CUSTOMER_PRODUCTION_EXACT_FUNCTIONS_SQL)return {rows:[{exact:true}]};
    throw Error('unexpected_customer_preflight_sql');
   }
   return {rows:[{
    current_role:role,session_role:role,superuser:false,bypass_rls:false,
    can_login:true,inherits_roles:false,can_create_role:false,can_create_db:false,
    can_replicate:false,has_role_memberships:false,has_role_grantees:false,
    connection_limit:-1,password_valid_until:null,schema_usage:true,
    schema_create:false,database_create:false,candidate_rpc_execute:false,
    authorized_rpc_execute:kind==='operations',
    authorized_board_rpc_execute:kind==='operations',
    authorized_history_rpc_execute:kind==='operations',
    unsafe_actor_rpc_execute:0,accessible_private_tables:kind==='staff'?1:0,
    staff_reader_exact_columns:kind==='staff',
    accessible_private_sequences:0,
    accessible_private_definer_routines:kind==='operations'?3:0,
    candidate_is_invoker:true,forced_rls_transition_requests:1,
    authorized_is_definer:true,authorized_owner:'sabora_order_operations_fn_owner',
    authorized_search_path_locked:true,authorized_board_is_definer:true,
    authorized_board_owner:'sabora_order_operations_fn_owner',
    authorized_board_search_path_locked:true,authorized_history_is_definer:true,
    authorized_history_owner:'sabora_order_operations_fn_owner',
    authorized_history_search_path_locked:true,authorized_owner_is_sealed:true,
    authorized_owner_memberships:0,forced_rls_signing_keys:1
   }]};
  }})};
}
function acceptedOptions(){
 const registrationPool=acceptedPool('sabora_customer_registration_ci','customer_registration');
 const sessionPool=acceptedPool('sabora_customer_session_ci','customer_session');
 const flowPool=acceptedPool('sabora_customer_flow_ci','customer_flow');
 const staffPool=acceptedPool('sabora_staff_reader_ci','staff');
 const operationsPool=acceptedPool('sabora_operations_ci','operations');
 return {customer:{registrationPool,sessionPool,flowPool,
  expectedRegistrationLogin:registrationPool.options.user,
  expectedSessionLogin:sessionPool.options.user,
  expectedFlowLogin:flowPool.options.user,
  allowedOrigin:'https://sabora.example',
  secretKey:'test-only-restaurant-flow-secret-'.repeat(2)},
 operations:{staffPool,operationsPool,staffRole:staffPool.options.user,
  operationsRole:operationsPool.options.user,issuer:'https://issuer.example',
  getTrustedKeys:async()=>[],issueTransitionCapability:()=>({}),
  issueReadCapability:()=>({})}};
}
test('combined H3/H4 candidate mounts all customer and staff routes only after five successful preflights',async t=>{
 const opts=acceptedOptions();
 const app=await createVerifiedRestaurantFlowCandidate(opts);
 t.after(()=>app.close());
 for(const [method,url] of [
  ['GET','/health'],['GET','/ready'],
  ['POST','/api/v1/customer/register'],['GET','/api/v1/customer/session'],
  ['POST','/api/v1/customer/visits'],['POST','/api/v1/customer/quotes'],
  ['POST','/api/v1/customer/orders/confirm'],
  ['GET','/api/v1/operations/order-lines'],
  ['POST','/api/v1/operations/order-lines/:lineId/transitions'],
  ['GET','/api/v1/operations/orders/:orderId/history']
 ])assert.equal(app.hasRoute({method,url}),true,url);
 assert.equal((await app.inject('/ready')).statusCode,200);
 const anonymous=await app.inject({method:'GET',url:'/api/v1/operations/order-lines'});
 assert.ok([401,403].includes(anonymous.statusCode));
 const noCookie=await app.inject({method:'POST',
  url:'/api/v1/customer/orders/confirm',
  headers:{origin:'https://sabora.example','content-type':'application/json'},
  payload:{tableId:'not-authorized'}});
 assert.equal(noCookie.statusCode,401);
 for(const pool of [opts.customer.registrationPool,opts.customer.sessionPool,
  opts.customer.flowPool,opts.operations.staffPool,opts.operations.operationsPool]){
  assert.ok(pool.state.checks>=2);
  assert.ok(pool.state.releases>0);
  assert.ok(pool.state.releases<=pool.state.checks);
 }
});
test('combined readiness detects post-start H4 role drift and never leaks SQL details',async t=>{
 const opts=acceptedOptions();
 const app=await createVerifiedRestaurantFlowCandidate(opts);
 t.after(()=>app.close());
 assert.equal((await app.inject('/ready')).statusCode,200);
 const operationsConnect=opts.operations.operationsPool.connect;
 opts.operations.operationsPool.connect=async()=>{throw Error('private_postgres_credentials_971001');};
 const denied=await app.inject('/ready');
 assert.equal(denied.statusCode,503);
 assert.deepEqual(denied.json(),{status:'unavailable'});
 assert.doesNotMatch(denied.body,/private_postgres_credentials/);
 assert.equal((await app.inject('/health')).statusCode,200);
 opts.operations.operationsPool.connect=operationsConnect;
 assert.equal((await app.inject('/ready')).statusCode,200);
 const staffConnect=opts.operations.staffPool.connect;
 opts.operations.staffPool.connect=async()=>{throw Error('private_staff_role_971001');};
 const staffDenied=await app.inject('/ready');
 assert.equal(staffDenied.statusCode,503);
 assert.deepEqual(staffDenied.json(),{status:'unavailable'});
 opts.operations.staffPool.connect=staffConnect;
 assert.equal((await app.inject('/ready')).statusCode,200);
});
test('combined H3/H4 candidate rejects H4 identity drift without returning partially mounted H3 app',async()=>{
 const opts=acceptedOptions();
 opts.operations.operationsPool.connect=async()=>{throw Error('private_operations_db_secret');};
 await assert.rejects(createVerifiedRestaurantFlowCandidate(opts),/private_operations_db_secret/);
 assert.ok(opts.customer.registrationPool.state.releases>0);
 assert.ok(opts.customer.sessionPool.state.releases>0);
 assert.ok(opts.customer.flowPool.state.releases>0);
});
