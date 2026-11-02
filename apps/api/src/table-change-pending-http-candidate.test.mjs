import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerTableChangeStaffPendingHttp} from './table-change-http-candidate.mjs';
const requireApi=createRequire(new URL('../package.json',import.meta.url));
const Fastify=requireApi('fastify');
const id='10000000-0000-4000-8000-000000000001';
const path='/api/v1/operations/table-change/pending';
function setup({role='waiter',rows=[],failure=null}={}){
 const calls=[];
 const app=Fastify({logger:false});
 registerTableChangeStaffPendingHttp(app,{
  forRoles:roles=>async(request,reply)=>{
   if(!roles.includes(role))return reply.code(403).send({error:'forbidden'});
   request.verifiedIdentity={id:'verified-staff'};
   request.verifiedStaff={role};
  },
  service:{listPending:async input=>{
   calls.push(input);
   if(failure)throw Error(failure);
   return rows;
  }}
 });
 return {app,calls};
}
test('F12 staff pending queue requires waiter/admin, rejects kitchen',async()=>{
 for(const role of ['waiter','admin','kitchen']){
  const {app,calls}=setup({role,rows:[{
   requestId:id,sourceTableNumber:7,expiresAt:'2026-11-02T12:00:00Z',
   customerId:'private-customer',accountId:'private-account'
  }]});
  await app.ready();
  try{
   const response=await app.inject({method:'GET',url:path});
   assert.equal(response.statusCode,role==='kitchen'?403:200);
   if(role!=='kitchen'){
    assert.deepEqual(response.json(),{items:[{
     requestId:id,sourceTableNumber:7,expiresAt:'2026-11-02T12:00:00Z'
    }]});
    assert.equal(response.body.includes('private-'),false);
    assert.deepEqual(calls,[{verifiedIdentity:{id:'verified-staff'},verifiedStaff:{role}}]);
    assert.equal(response.headers['cache-control'],'no-store');
   }else assert.equal(calls.length,0);
  }finally{await app.close();}
 }
});
test('F12 pending queue fails closed on malformed projection and backend failure',async()=>{
 for(const rows of [[{requestId:'invalid',sourceTableNumber:1,expiresAt:'2026-11-02T12:00:00Z'}],
  [{requestId:id,sourceTableNumber:-1,expiresAt:'2026-11-02T12:00:00Z'}],
  [{requestId:id,sourceTableNumber:1,expiresAt:'invalid'}],
  Array.from({length:101},()=>({requestId:id,sourceTableNumber:1,expiresAt:'2026-11-02T12:00:00Z'}))]){
  const {app}=setup({rows});await app.ready();
  try{
   const response=await app.inject({method:'GET',url:path});
   assert.equal(response.statusCode,503);
   assert.deepEqual(response.json(),{error:'table_change_unavailable'});
  }finally{await app.close();}
 }
 const {app}=setup({failure:'secret_sql_exception'});await app.ready();
 try{
  const response=await app.inject({method:'GET',url:path});
  assert.equal(response.statusCode,503);
  assert.equal(response.body.includes('secret_sql_exception'),false);
 }finally{await app.close();}
});
test('F12 pending queue requires an explicit authorized service and guard',()=>{
 const app=Fastify({logger:false});
 assert.throws(()=>registerTableChangeStaffPendingHttp(app,{forRoles:()=>()=>{}}),
  /invalid_table_change_pending_configuration/);
});
