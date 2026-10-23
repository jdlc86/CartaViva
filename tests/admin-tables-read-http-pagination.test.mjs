import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerProtectedAdminTablesReadFromPools} from '../apps/api/src/admin-tables-read-composition.mjs';
import {ADMIN_TABLES_SQL} from '../apps/api/src/admin-tables-reader-query.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const userId='00000000-0000-4000-8000-000000000321';
const row=n=>({id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),
 number:n,capacity:4,description:null,ordering_state:'closed'});
test('Fastify administrative table pagination is bounded, ordered and fail-closed',async t=>{
 let role='admin',membershipReads=0,tableReads=0,malformed=false;
 const app=Fastify();t.after(()=>app.close());
 registerProtectedAdminTablesReadFromPools(app,{
  issuer:'https://example.invalid/auth/v1',
  getTrustedKeys:async()=>[],verify:()=>({userId}),
  staffPool:{query:async()=>{membershipReads++;return {rows:[{role,state:'active'}]};}},
  adminTablesPool:{query:async(sql,params)=>{
   assert.equal(sql,ADMIN_TABLES_SQL);tableReads++;
   const [after,limit]=params;
   if(malformed)return {rows:[row(after+2),row(after+1)]};
   return {rows:[1,2,3,4].filter(n=>n>after).slice(0,limit).map(row)};
  }}
 });
 const send=path=>app.inject({method:'GET',url:'/api/v1/admin/tables'+path,
  headers:{authorization:'Bearer abc.def.ghi'}});
 let r=await send('?limit=2&afterNumber=0');
 assert.equal(r.statusCode,200);
 assert.deepEqual(r.json().items.map(x=>x.number),[1,2]);
 assert.equal(r.json().nextAfterNumber,2);
 r=await send('?limit=2&afterNumber=2');
 assert.equal(r.statusCode,200);
 assert.deepEqual(r.json().items.map(x=>x.number),[3,4]);
 assert.equal(r.json().nextAfterNumber,null);
 assert.equal(tableReads,2);
 for(const path of ['?limit=0','?limit=101','?limit=-1',
  '?limit=1.5','?limit=01','?afterNumber=-1',
  '?afterNumber=9007199254740992','?role=admin',
  '?limit=2&unknown=1']){
  r=await send(path);assert.equal(r.statusCode,400,path);
 }
 assert.equal(tableReads,2);
 malformed=true;
 r=await send('?limit=2');assert.equal(r.statusCode,503);
 assert.deepEqual(r.json(),{error:'admin_projection_unavailable'});
 assert.equal(tableReads,3);
 role='kitchen';
 r=await send('?limit=2');assert.equal(r.statusCode,403);
 assert.equal(tableReads,3);
 assert.equal(membershipReads,13);
});
