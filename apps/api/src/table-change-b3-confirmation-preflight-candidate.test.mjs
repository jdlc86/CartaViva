import test from 'node:test';
import assert from 'node:assert/strict';
import {assertB3ConfirmationCapabilities,B3_CONFIRMATION_IDENTITY_SQL,
 B3_CONFIRMATION_FUNCTION_SQL} from './table-change-b3-confirmation-preflight-candidate.mjs';
const role='sabora_b3_confirmation_runtime',login='b3_confirmation_login';
const signatures=[
 'sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)',
 'sabora.resubmit_customer_order_revision_h6_candidate(bytea,uuid,text,text,text,uuid,integer,text,jsonb,boolean)'
];
function fixture({extra=[],loginGrants=[],badIdentity=false}={}){
 const calls=[];let discarded;
 return {calls,get discarded(){return discarded;},async connect(){return {
  async query(sql,args){
   calls.push([sql,args]);
   if(sql===B3_CONFIRMATION_IDENTITY_SQL)return {rows:[{
    effective_role:login,login_role:login,can_login:true,inherit_role:false,
    superuser:false,bypass_rls:false,create_db:false,create_role:false,
    replication:false,database_create:false,schema_create:false,
    can_set_confirmation:true,direct_relations:badIdentity,direct_sequences:false,
    all_set_roles:[role]
   }]};
   if(sql===B3_CONFIRMATION_FUNCTION_SQL)return {rows:[{
    names:args[0]===role?[...signatures,...extra]:loginGrants
   }]};
   throw Error('unexpected SQL');
  },release(value){discarded=value;}
 };}};
}
test('B3 exact transfer role and login pass independent capability checks',async()=>{
 const pool=fixture();
 const result=await assertB3ConfirmationCapabilities({pool,expectedLogin:login});
 assert.deepEqual(result,{validated:true,login,capability:role});
 assert.equal(pool.calls.length,3);
 assert.equal(pool.discarded,false);
});
test('B3 refuses any additional function, inherited login grant or direct table access',async()=>{
 for(const config of [
  {extra:['sabora.confirm_customer_round_h6_candidate(bytea)']},
  {loginGrants:[signatures[0]]},{badIdentity:true}
 ]){
  const pool=fixture(config);
  await assert.rejects(()=>assertB3ConfirmationCapabilities({pool,expectedLogin:login}),
   /invalid_b3_confirmation_capabilities:/);
  assert.equal(pool.discarded,true);
 }
});
test('B3 rejects invalid login and broken SQL without leaking details',async()=>{
 await assert.rejects(()=>assertB3ConfirmationCapabilities({
  pool:fixture(),expectedLogin:'invalid-name!'}),/invalid_b3_confirmation_capabilities:input/);
 const pool={async connect(){return {async query(){throw Error('private credential');},release(){}};}};
 await assert.rejects(()=>assertB3ConfirmationCapabilities({pool,expectedLogin:login}),
  error=>error.message==='invalid_b3_confirmation_capabilities:query');
});
