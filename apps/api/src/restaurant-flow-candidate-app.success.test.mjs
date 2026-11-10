import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedRestaurantFlowCandidate} from './restaurant-flow-candidate-app.mjs';
import {CUSTOMER_PRODUCTION_PREFLIGHT_SQL,CUSTOMER_PRODUCTION_FUNCTION_PREFLIGHT_SQL,
 CUSTOMER_PRODUCTION_EXACT_FUNCTIONS_SQL} from './customer-production-sql-preflight.mjs';

const logins={catalog:'sabora_ci_catalog',registration:'sabora_ci_registration',session:'sabora_ci_session',
 flow:'sabora_ci_flow',staff:'sabora_ci_staff',operations:'sabora_ci_operations'};
function customerPool(kind){
 const role=logins[kind];
 return {options:{user:role},query:async()=>({rows:[]}),connect:async()=>({
  query:async sql=>{
   if(sql.includes('SELECT current_user AS role_name, session_user AS login_name'))
    return {rows:[{role_name:role,login_name:role}]};
   if(sql.includes('scoped_catalog_execute'))return {rows:[{
    effective_role:role,login_role:role,can_login:true,bypass_rls:false,superuser:false,
    create_db:false,create_role:false,replication:false,inherit_role:false,
    can_set_catalog_reader:true,direct_catalog_execute:false,scoped_catalog_execute:true
   }]};
   if(kind==='flow'&&sql.includes("pg_has_role(current_user, 'sabora_catalog_reader', 'SET')"))
    return {rows:[{effective_role:role,login_role:role,can_login:true,bypass_rls:false,
     superuser:false,create_db:false,create_role:false,replication:false,inherit_role:false,
     can_set_catalog_reader:false,direct_catalog_execute:false}]};
   if(sql===CUSTOMER_PRODUCTION_PREFLIGHT_SQL)return {rows:[{
    effective_role:role,login_role:role,can_login:true,inherit_role:false,
    superuser:false,bypass_rls:false,create_db:false,create_role:false,
    replication:false,database_create:false,schema_create:false,
    direct_relation_access:false,direct_sequence_access:false,
    registration_set:kind==='registration',session_set:kind==='session',flow_set:kind==='flow'
   }]};
   if(sql===CUSTOMER_PRODUCTION_FUNCTION_PREFLIGHT_SQL)
    return {rows:[{login_execute:false,capability_execute:true}]};
   if(sql===CUSTOMER_PRODUCTION_EXACT_FUNCTIONS_SQL)return {rows:[{exact:true}]};
   throw Error('unexpected_customer_preflight_query');
  },release(){}
 })};
}
function operationsPool(kind){
 const role=logins[kind],staff=kind==='staff';
 return {options:{user:role},query:async()=>({rows:[]}),connect:async()=>({
  query:async()=>({rows:[{
   current_role:role,session_role:role,superuser:false,bypass_rls:false,
   can_login:true,inherits_roles:false,can_create_role:false,can_create_db:false,
   can_replicate:false,has_role_memberships:false,has_role_grantees:false,
   connection_limit:-1,password_valid_until:null,schema_usage:true,
   schema_create:false,database_create:false,candidate_rpc_execute:false,
   authorized_rpc_execute:!staff,authorized_board_rpc_execute:!staff,
   authorized_history_rpc_execute:!staff,unsafe_actor_rpc_execute:0,
   accessible_private_tables:staff?1:0,staff_reader_exact_columns:staff,
   accessible_private_sequences:0,accessible_private_definer_routines:staff?0:3,
   candidate_is_invoker:true,forced_rls_transition_requests:1,
   authorized_is_definer:true,authorized_owner:'sabora_order_operations_fn_owner',
   authorized_search_path_locked:true,authorized_board_is_definer:true,
   authorized_board_owner:'sabora_order_operations_fn_owner',
   authorized_board_search_path_locked:true,authorized_history_is_definer:true,
   authorized_history_owner:'sabora_order_operations_fn_owner',
   authorized_history_search_path_locked:true,authorized_owner_is_sealed:true,
   authorized_owner_memberships:0,forced_rls_signing_keys:1
  }]}),release(){}
 })};
}
test('H3/H4 verified opt-in factory mounts catalog and both route families after six SQL identities pass',async t=>{
 const app=await createVerifiedRestaurantFlowCandidate({
  customer:{catalogReaderPool:customerPool('catalog'),registrationPool:customerPool('registration'),
   sessionPool:customerPool('session'),flowPool:customerPool('flow'),
   expectedCatalogLogin:logins.catalog,
   expectedRegistrationLogin:logins.registration,
   expectedSessionLogin:logins.session,expectedFlowLogin:logins.flow,
   allowedOrigin:'https://sabora.example',
   secretKey:'test-only-secret-not-production-'.repeat(2)},
  operations:{staffPool:operationsPool('staff'),operationsPool:operationsPool('operations'),
   staffRole:logins.staff,operationsRole:logins.operations,
   issuer:'https://issuer.example',getTrustedKeys:async()=>[],
   issueTransitionCapability:()=>({}),issueReadCapability:()=>({})}
 });
 t.after(()=>app.close());
 await app.ready();
 for(const [method,url] of [
  ['GET','/api/v1/catalog'],
  ['POST','/api/v1/customer/register'],['GET','/api/v1/customer/session'],
  ['POST','/api/v1/customer/visits'],['POST','/api/v1/customer/quotes'],
  ['POST','/api/v1/customer/orders/confirm'],
  ['GET','/api/v1/operations/order-lines'],
  ['POST','/api/v1/operations/order-lines/:lineId/transitions'],
  ['GET','/api/v1/operations/orders/:orderId/history']]){
  assert.equal(app.hasRoute({method,url}),true,url);
 }
 assert.equal((await app.inject('/ready')).statusCode,200);
 assert.equal((await app.inject({method:'GET',
  url:'/api/v1/operations/order-lines'})).statusCode,401);
 assert.equal((await app.inject({method:'POST',
  url:'/api/v1/customer/orders/confirm',
  headers:{origin:'https://sabora.example'},payload:{}})).statusCode,401);
});
