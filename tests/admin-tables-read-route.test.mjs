import test from 'node:test';
import assert from 'node:assert/strict';
import {registerAdminTablesReadRoute} from '../apps/api/src/admin-tables-read-route.mjs';
const userId='cafe0000-0000-4000-8000-000000000001';
function harness({authorized=true,query=async()=>({rows:[]})}={}){
 let options,handler;
 registerAdminTablesReadRoute({get:(path,config,fn)=>{
  assert.equal(path,'/api/v1/admin/tables');options=config;handler=fn;
 }},{query,forRoles:roles=>{
  assert.deepEqual(roles,['admin','waiter']);
  return [async(req,reply)=>{
   if(!authorized)return reply.code(403).send({error:'forbidden'});
   req.verifiedIdentity={userId};
   req.verifiedStaff={userId,role:'admin'};
  }];
 }});
 return async(q={})=>{
  const headers={};
  const reply={status:200,sent:false,
   header(k,v){headers[k]=v;return this;},
   code(c){this.status=c;return this;},
   send(body){this.sent=true;this.body=body;return this;}
  };
  const request={query:q};
  for(const hook of options.preHandler){
   await hook(request,reply);
   if(reply.sent)return {status:reply.status,body:reply.body,headers};
  }
  const response=await handler(request,reply);
  return {status:reply.status,body:reply.sent?reply.body:response,headers};
 };
}
test('administrative table HTTP candidate returns versioned empty state',async()=>{
 const invoke=harness();
 const r=await invoke({limit:'10',afterNumber:'0'});
 assert.equal(r.status,200);
 assert.deepEqual(r.body,{version:1,items:[],nextAfterNumber:null});
 assert.equal(r.headers['Cache-Control'],'no-store');
});
test('administrative table HTTP candidate rejects unauthorized and untrusted query',async()=>{
 let calls=0;
 const query=async()=>{calls++;return {rows:[]};};
 assert.equal((await harness({authorized:false,query})()).status,403);
 const invoke=harness({query});
 for(const q of [{role:'admin'},{limit:'101'},{limit:'1.5'},{afterNumber:'-1'}]){
  assert.equal((await invoke(q)).status,400);
 }
 assert.equal(calls,0);
});
test('administrative table HTTP candidate hides database errors',async()=>{
 const invoke=harness({query:async()=>{throw Error('sensitive database details');}});
 const r=await invoke();
 assert.equal(r.status,503);
 assert.deepEqual(r.body,{error:'admin_projection_unavailable'});
});
