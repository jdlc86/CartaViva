import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerProtectedAdminTablesReadFromPools} from '../apps/api/src/admin-tables-read-composition.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const userId='00000000-0000-4000-8000-000000000321';
const valid={id:'00000000-0000-4000-8000-000000000421',number:4,capacity:2,
 description:'Interior',ordering_state:'open'};
test('Fastify admin table projection rejects malformed SQL rows without exposing data',async t=>{
 let rows=[valid],calls=0;
 const app=Fastify();t.after(()=>app.close());
 registerProtectedAdminTablesReadFromPools(app,{
  issuer:'https://example.invalid/auth/v1',
  getTrustedKeys:async()=>[],verify:()=>({userId}),
  staffPool:{query:async()=>({rows:[{role:'admin',state:'active'}]})},
  adminTablesPool:{query:async()=>{calls++;return {rows};}}
 });
 const send=()=>app.inject({method:'GET',url:'/api/v1/admin/tables',
  headers:{authorization:'Bearer abc.def.ghi'}});
 const cases=[
  [{...valid,id:'not-uuid'}],
  [{...valid,number:0}],
  [{...valid,capacity:0}],
  [{...valid,description:{sensitive:'x'}}],
  [{...valid,ordering_state:'invalid'}],
  [{...valid,number:4},{...valid,number:4}],
  [{...valid,number:5},{...valid,number:4}],
  [{...valid,qr_token_hash:'secret'}]
 ];
 for(const candidate of cases){
  rows=candidate;
  const r=await send();
  if(candidate===cases.at(-1)){
   // Unknown database columns are not serialized to the HTTP response.
   assert.equal(r.statusCode,200);
   assert.equal(JSON.stringify(r.json()).includes('secret'),false);
  }else{
   assert.equal(r.statusCode,503,JSON.stringify(candidate));
   assert.deepEqual(r.json(),{error:'admin_projection_unavailable'});
  }
 }
 assert.equal(calls,cases.length);
});
