import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminReadProjectionCandidate} from '../apps/api/src/admin-read-projection-candidate.mjs';
const id='cafe0000-0000-4000-8000-000000000001';
const row=n=>({id,number:n,capacity:4,description:null,ordering_state:'open'});
test('admin read candidate refuses unauthorized roles before SQL',async()=>{
 let calls=0;
 const read=createAdminReadProjectionCandidate({query:async()=>{calls++;return {rows:[]};}});
 for(const role of ['root','kitchen',undefined,'ADMIN']){
  await assert.rejects(read.listTables({role}),/admin_projection_forbidden/);
 }
 assert.equal(calls,0);
});
test('admin read candidate uses bounded keyset pagination and no QR secrets',async()=>{
 const calls=[];
 const read=createAdminReadProjectionCandidate({query:async(sql,params)=>{
  calls.push({sql,params});return {rows:[row(2),row(3),row(4)]};
 }});
 const result=await read.listTables({role:'admin',limit:2,afterNumber:1});
 assert.equal(result.version,1);
 assert.equal(result.items.length,2);
 assert.equal(result.nextAfterNumber,3);
 assert.deepEqual(calls[0].params,[1,3]);
 assert.deepEqual(Object.keys(result.items[0]),
  ['id','number','capacity','description','orderingState']);
 assert.ok(!calls[0].sql.includes('qr_token_hash'));
 assert.ok(!calls[0].sql.includes('session_id'));
});
test('admin read candidate rejects invalid pages and malformed SQL results',async()=>{
 const read=createAdminReadProjectionCandidate({query:async()=>({rows:[row(1),row(1)]})});
 for(const limit of [0,101,1.5,NaN]){
  await assert.rejects(read.listTables({role:'waiter',limit}),/invalid_admin_projection_page/);
 }
 await assert.rejects(read.listTables({role:'waiter',limit:2}),
  /invalid_admin_projection_response/);
 const bad=createAdminReadProjectionCandidate({query:async()=>({rows:[{
  ...row(1),ordering_state:'forged'
 }]})});
 await assert.rejects(bad.listTables({role:'admin'}),/invalid_admin_projection_response/);
});

test('admin pagination rejects malformed or unsorted lookahead row before returning page',async()=>{
 for(const candidate of [
  {...row(3),number:0},
  {...row(3),number:2},
  {...row(3),ordering_state:'unknown'},
  {...row(3),capacity:0}
 ]){
  const read=createAdminReadProjectionCandidate({query:async()=>({
   rows:[row(1),row(2),candidate]
  })});
  await assert.rejects(read.listTables({role:'admin',limit:2}),
   /invalid_admin_projection_response/);
 }
});
