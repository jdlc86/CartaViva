import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from '../apps/api/node_modules/fastify/fastify.js';
import {registerAdminTablesReadRoute} from '../apps/api/src/admin-tables-read-route.mjs';
const userId='cafe0000-0000-4000-8000-000000000001';
function appWith({authorize=true,query=async()=>({rows:[]})}={}){
 const app=Fastify();
 registerAdminTablesReadRoute(app,{query,forRoles:roles=>{
  assert.deepEqual(roles,['admin','waiter']);
  return [async(req,reply)=>{
   if(!authorize)return reply.code(403).send({error:'forbidden'});
   req.verifiedIdentity={userId};
   req.verifiedStaff={userId,role:'admin'};
  }];
 }});
 return app;
}
test('administrative table HTTP candidate returns versioned empty state',async()=>{
 const app=appWith();
 try{
  const r=await app.inject('/api/v1/admin/tables?limit=10&afterNumber=0');
  assert.equal(r.statusCode,200);
  assert.deepEqual(r.json(),{version:1,items:[],nextAfterNumber:null});
  assert.equal(r.headers['cache-control'],'no-store');
 }finally{await app.close();}
});
test('administrative table HTTP candidate rejects unauthorized and untrusted query',async()=>{
 let calls=0;
 const app=appWith({authorize:false,query:async()=>{calls++;return {rows:[]};}});
 try{
  const r=await app.inject('/api/v1/admin/tables');
  assert.equal(r.statusCode,403);
  assert.equal(calls,0);
 }finally{await app.close();}
 const valid=appWith({query:async()=>{calls++;return {rows:[]};}});
 try{
  for(const url of ['/api/v1/admin/tables?role=admin',
   '/api/v1/admin/tables?limit=101','/api/v1/admin/tables?limit=1.5',
   '/api/v1/admin/tables?afterNumber=-1']){
   const r=await valid.inject(url);
   assert.equal(r.statusCode,400);
  }
  assert.equal(calls,0);
 }finally{await valid.close();}
});
test('administrative table HTTP candidate hides database errors',async()=>{
 const app=appWith({query:async()=>{throw Error('sensitive database details');}});
 try{
  const r=await app.inject('/api/v1/admin/tables');
  assert.equal(r.statusCode,503);
  assert.deepEqual(r.json(),{error:'admin_projection_unavailable'});
 }finally{await app.close();}
});
