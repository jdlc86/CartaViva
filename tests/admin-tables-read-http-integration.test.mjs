import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerProtectedAdminTablesReadFromPools} from '../apps/api/src/admin-tables-read-composition.mjs';
import {ADMIN_TABLES_SQL} from '../apps/api/src/admin-tables-reader-query.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const userId='00000000-0000-4000-8000-000000000321';
const token='abc.def.ghi';
const issuer='https://example.invalid/auth/v1';
const row={id:'00000000-0000-4000-8000-000000000421',number:4,capacity:2,
 description:'Interior',ordering_state:'open'};
test('Fastify administrative tables route authenticates and checks current membership on every read',async t=>{
 let role='waiter',state='active',failMembership=false,failTables=false;
 let staffReads=0,tableReads=0;
 const staffPool={query:async(sql,params)=>{
  assert.equal(sql,'select role, state from sabora.staff_members where user_id = $1');
  assert.deepEqual(params,[userId]);staffReads++;
  if(failMembership)throw Error('private membership db error');
  return {rows:[{role,state}]};
 }};
 const adminTablesPool={query:async(sql,params)=>{
  assert.equal(sql,ADMIN_TABLES_SQL);assert.deepEqual(params,[0,51]);
  tableReads++;
  if(failTables)throw Error('private table db error');
  return {rows:[row]};
 }};
 const app=Fastify();t.after(()=>app.close());
 registerProtectedAdminTablesReadFromPools(app,{
  staffPool,adminTablesPool,issuer,getTrustedKeys:async()=>['trusted'],
  verify:(jwt)=>{if(jwt!==token)throw Error('bad signature');return {userId};}
 });
 const send=(authorization)=>app.inject({method:'GET',url:'/api/v1/admin/tables',
  headers:authorization?{authorization}:{}});
 assert.equal((await send()).statusCode,401);
 assert.equal((await send('Bearer wrong.token.sig')).statusCode,401);
 assert.equal(staffReads,0);assert.equal(tableReads,0);
 let result=await send('Bearer '+token);
 assert.equal(result.statusCode,200);
 assert.deepEqual(result.json(),{version:1,items:[{
  id:row.id,number:4,capacity:2,description:'Interior',orderingState:'open'
 }],nextAfterNumber:null});
 assert.equal(result.headers['cache-control'],'no-store');
 assert.equal(tableReads,1);
 state='suspended';
 assert.equal((await send('Bearer '+token)).statusCode,403);
 role='kitchen';state='active';
 assert.equal((await send('Bearer '+token)).statusCode,403);
 role='admin';failMembership=true;
 result=await send('Bearer '+token);
 assert.equal(result.statusCode,503);
 assert.deepEqual(result.json(),{error:'authorization_unavailable'});
 assert.equal(tableReads,1);
 failMembership=false;failTables=true;
 result=await send('Bearer '+token);
 assert.equal(result.statusCode,503);
 assert.deepEqual(result.json(),{error:'admin_projection_unavailable'});
 assert.equal(staffReads,5);assert.equal(tableReads,2);
});
