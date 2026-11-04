import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerVerifiedPendingTableChangeHttpCandidate}
 from './table-change-pending-http-composition-candidate.mjs';
import {F12_IDENTITY_SQL,F12_FUNCTION_SQL}
 from './table-change-isolated-sql-preflight-candidate.mjs';
import {PENDING_READER_ROLE,PENDING_READER_SIGNATURE}
 from './table-change-pending-reader-preflight-candidate.mjs';
import {PENDING_TABLE_CHANGES_SQL}
 from './table-change-pending-reader-candidate.mjs';
const requireApi=createRequire(new URL('../package.json',import.meta.url));
const Fastify=requireApi('fastify');
const login='sabora_f12_pending_login';
const staffId='33333333-3333-4333-8333-333333333333';
const requestId='22222222-2222-4222-8222-222222222222';
function fakePool({broad=false}={}){
 const calls=[];
 return {calls,connect:async()=>({
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql===F12_IDENTITY_SQL)return {rows:[{
    effective_role:login,login_role:login,can_login:true,inherit_role:false,
    superuser:false,bypass_rls:false,create_db:false,create_role:false,
    replication:false,database_create:false,schema_create:false,
    direct_relations:broad,direct_sequences:false,
    role_set:[true,true],all_set_roles:[PENDING_READER_ROLE]
   }]};
   if(sql===F12_FUNCTION_SQL)return {rows:[{names:args[0]===login?[]:
    [PENDING_READER_SIGNATURE]}]};
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||
    sql===`SET LOCAL ROLE ${PENDING_READER_ROLE}`)return {rows:[]};
   if(sql===PENDING_TABLE_CHANGES_SQL){
    assert.deepEqual(args,[staffId]);
    return {rows:[{request_id:requestId,source_table_number:4,
     expires_at:new Date('2026-11-02T12:00:00Z')}]};
   }
   throw Error('unexpected SQL');
  },
  release:()=>{}
 })};
}
test('F12 pending queue only mounts after preflight and reads through isolated role',async()=>{
 const app=Fastify({logger:false});
 const pool=fakePool();
 await registerVerifiedPendingTableChangeHttpCandidate({
  app,pendingPool:pool,expectedLogin:login,
  verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  forRoles:roles=>async(request,reply)=>{
   assert.deepEqual(roles,['admin','waiter']);
   request.verifiedIdentity={id:'verified'};
   request.verifiedStaff={role:'waiter'};
  }
 });
 await app.ready();
 try{
  const response=await app.inject({method:'GET',
   url:'/api/v1/operations/table-change/pending'});
  assert.equal(response.statusCode,200);
  assert.deepEqual(response.json(),{items:[{
   requestId,sourceTableNumber:4,expiresAt:'2026-11-02T12:00:00.000Z'
  }]});
  assert(pool.calls.some(call=>call.sql===`SET LOCAL ROLE ${PENDING_READER_ROLE}`));
 }finally{await app.close();}
});
test('F12 pending queue refuses mounting when login has direct table grants',async()=>{
 const app=Fastify({logger:false});
 await assert.rejects(registerVerifiedPendingTableChangeHttpCandidate({
  app,pendingPool:fakePool({broad:true}),expectedLogin:login,
  verifyStaff:async()=>({userId:staffId,role:'waiter'}),
  forRoles:()=>async()=>{}
 }),/invalid_pending_reader_capabilities/);
 await app.ready();
 try{
  const response=await app.inject({method:'GET',
   url:'/api/v1/operations/table-change/pending'});
  assert.equal(response.statusCode,404);
 }finally{await app.close();}
});
