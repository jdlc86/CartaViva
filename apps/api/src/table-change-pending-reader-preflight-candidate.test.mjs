import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPendingReaderCapabilities,PENDING_READER_ROLE,PENDING_READER_SIGNATURE}
 from './table-change-pending-reader-preflight-candidate.mjs';
import {F12_IDENTITY_SQL,F12_FUNCTION_SQL}
 from './table-change-isolated-sql-preflight-candidate.mjs';
const login='sabora_f12_pending_login';
const valid={
 effective_role:login,login_role:login,can_login:true,inherit_role:false,
 superuser:false,bypass_rls:false,create_db:false,create_role:false,
 replication:false,database_create:false,schema_create:false,
 direct_relations:false,direct_sequences:false,role_set:[true,true],
 all_set_roles:[PENDING_READER_ROLE]
};
function pool({identity=valid,loginNames=[],roleNames=[PENDING_READER_SIGNATURE]}={}){
 const calls=[],released=[];
 return {calls,released,connect:async()=>({
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql===F12_IDENTITY_SQL)return {rows:[identity]};
   if(sql===F12_FUNCTION_SQL&&args[0]===login)return {rows:[{names:loginNames}]};
   if(sql===F12_FUNCTION_SQL&&args[0]===PENDING_READER_ROLE)
    return {rows:[{names:roleNames}]};
   throw Error('unexpected SQL');
  },
  release:broken=>released.push(broken)
 })};
}
test('F12 pending reader preflight accepts only isolated one-function reader',async()=>{
 const p=pool();
 assert.deepEqual(await assertPendingReaderCapabilities({
  pool:p,expectedLogin:login
 }),{validated:true,login});
 assert.equal(p.calls.length,3);
 assert.deepEqual(p.calls[0].args,[PENDING_READER_ROLE,PENDING_READER_ROLE]);
 assert.deepEqual(p.released,[false]);
});
test('F12 pending reader preflight rejects direct grants, inherited grants and broad RPCs',async()=>{
 for(const candidate of [
  {identity:{...valid,direct_relations:true}},
  {identity:{...valid,all_set_roles:[PENDING_READER_ROLE,'other']}},
  {identity:{...valid,role_set:[false,false]}},
  {identity:{...valid,inherit_role:true}},
  {loginNames:[PENDING_READER_SIGNATURE]},
  {roleNames:[PENDING_READER_SIGNATURE,'sabora.private(uuid)']},
  {roleNames:[]}
 ]){
  const p=pool(candidate);
  await assert.rejects(assertPendingReaderCapabilities({
   pool:p,expectedLogin:login
  }),/invalid_pending_reader_capabilities/);
  assert.deepEqual(p.released,[true]);
 }
});
