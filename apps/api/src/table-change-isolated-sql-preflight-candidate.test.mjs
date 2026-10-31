import test from 'node:test';
import assert from 'node:assert/strict';
import {assertF12SqlIdentity,assertF12SqlCapabilities,F12_IDENTITY_SQL,F12_FUNCTION_SQL}
 from './table-change-isolated-sql-preflight-candidate.mjs';
const roles=['sabora_f12_customer_runtime','sabora_f12_operations_runtime'];
function mock(capability,{override={},names,queryError=false}={}){
 const calls=[];let released;
 const login=capability==='sabora_f12_customer_runtime'?'f12_customer_login':'f12_operations_login';
 const row={effective_role:login,login_role:login,can_login:true,inherit_role:false,
  superuser:false,bypass_rls:false,create_db:false,create_role:false,replication:false,
  database_create:false,schema_create:false,direct_relations:false,direct_sequences:false,
  role_set:roles.map(role=>role===capability),all_set_roles:[capability],...override};
 return {login,calls,get released(){return released;},async connect(){return {
  async query(sql,args){calls.push({sql,args});if(queryError)throw Error('connection');
   if(sql===F12_IDENTITY_SQL)return {rows:[row]};
   if(sql===F12_FUNCTION_SQL)return {rows:[{names:names??[
    capability==='sabora_f12_customer_runtime'?
     'sabora.request_customer_table_change_h6_resolved_candidate(bytea)':
     'sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)']}]};
   throw Error('unexpected');
  },release(discard){released=discard;}
 };}};
}
test('F12 preflight accepts only exact isolated login, SET membership and one RPC',async()=>{
 const customer=mock(roles[0]),operations=mock(roles[1]);
 assert.deepEqual(await assertF12SqlCapabilities({customerPool:customer,
  operationsPool:operations,expectedCustomerLogin:customer.login,
  expectedOperationsLogin:operations.login}),{validated:true});
 assert.equal(customer.released,false);assert.equal(operations.released,false);
 assert.deepEqual(customer.calls.map(x=>x.sql),[F12_IDENTITY_SQL,F12_FUNCTION_SQL]);
 assert.deepEqual(customer.calls[0].args,roles);
 assert.deepEqual(operations.calls[1].args,[operations.login]);
 assert.deepEqual(customer.calls[1].args,[customer.login]);
});
test('F12 preflight rejects elevated logins, wrong membership and broader RPC grants',async()=>{
 const cases=[
  {override:{superuser:true}},
  {override:{bypass_rls:true}},
  {override:{inherit_role:true}},
  {override:{direct_relations:true}},
  {override:{direct_sequences:true}},
  {override:{role_set:[true,true]}},
  {override:{role_set:[true]}},
  {override:{all_set_roles:[roles[0],roles[1]]}},
  {override:{all_set_roles:[]}},
  {names:['sabora.request_customer_table_change_h6_resolved_candidate(bytea)','sabora.extra_rpc()']},
  {names:['decide_customer_table_change_h6_candidate']},
  {queryError:true}
 ];
 for(const config of cases){const candidate=mock(roles[0],config);
  await assert.rejects(()=>assertF12SqlIdentity({pool:candidate,
   expectedLogin:candidate.login,capability:roles[0]}),
   error=>error.code==='F12_SQL_CAPABILITIES_REJECTED');
  assert.equal(candidate.released,true);
 }
});
test('F12 preflight rejects shared pools and logins before querying',async()=>{
 const candidate=mock(roles[0]);
 await assert.rejects(()=>assertF12SqlCapabilities({customerPool:candidate,
  operationsPool:candidate,expectedCustomerLogin:candidate.login,
  expectedOperationsLogin:'other_login'}),/invalid_f12_sql_capabilities:isolation/);
 assert.equal(candidate.calls.length,0);
});
