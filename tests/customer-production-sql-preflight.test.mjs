import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCustomerProductionSqlCapabilities,CUSTOMER_PRODUCTION_PREFLIGHT_SQL,
 CUSTOMER_PRODUCTION_FUNCTION_PREFLIGHT_SQL,CUSTOMER_PRODUCTION_EXACT_FUNCTIONS_SQL}
 from '../apps/api/src/customer-production-sql-preflight.mjs';

const roleFor={registration:'sabora_customer_registration_runtime',
 session:'sabora_customer_session_runtime',flow:'sabora_customer_flow_runtime'};
const loginFor={registration:'sabora_customer_registration_login',
 session:'sabora_customer_session_login',flow:'sabora_customer_flow_login'};
function pool(kind,patch={}){
 const calls=[];
 const client={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql===CUSTOMER_PRODUCTION_PREFLIGHT_SQL)return {rows:[{effective_role:loginFor[kind],
   login_role:loginFor[kind],can_login:true,inherit_role:false,superuser:false,bypass_rls:false,
   create_db:false,create_role:false,replication:false,database_create:false,schema_create:false,
   registration_set:kind==='registration',session_set:kind==='session',flow_set:kind==='flow',
   direct_relation_access:false,direct_sequence_access:false,...patch}]};
  if(sql===CUSTOMER_PRODUCTION_FUNCTION_PREFLIGHT_SQL)return {rows:[{login_execute:false,capability_execute:true}]};
  if(sql===CUSTOMER_PRODUCTION_EXACT_FUNCTIONS_SQL)return {rows:[{exact:true}]};
  throw Error('unexpected_sql');
 },release:discard=>calls.push({release:discard})};
 return {connect:async()=>client,calls};
}
const args=(a=pool('registration'),b=pool('session'),c=pool('flow'))=>({
 registrationPool:a,sessionPool:b,flowPool:c,
 expectedRegistrationLogin:loginFor.registration,expectedSessionLogin:loginFor.session,
 expectedFlowLogin:loginFor.flow
});

test('production preflight accepts three distinct NOINHERIT logins with only their exact capability',async()=>{
 const value=await assertCustomerProductionSqlCapabilities(args());
 assert.deepEqual(value,{validated:true});assert.equal(Object.isFrozen(value),true);
});

test('production preflight rejects admin drift, direct data access and shared identities',async()=>{
 for(const patch of [{superuser:true},{bypass_rls:true},{inherit_role:true},
  {database_create:true},{schema_create:true},{direct_relation_access:true},
  {direct_sequence_access:true},{flow_set:true}]){
  await assert.rejects(assertCustomerProductionSqlCapabilities(args(pool('registration',patch))),
   /invalid_customer_production_sql_capabilities/);
 }
 const shared=pool('registration');
 await assert.rejects(assertCustomerProductionSqlCapabilities(args(shared,shared,pool('flow'))),
  /invalid_customer_production_sql_capabilities/);
});
