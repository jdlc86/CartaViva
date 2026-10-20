import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresOwnerLookup } from '../apps/api/src/postgres-owner-lookup.mjs';
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
test('reads singleton owner with fixed SQL and no caller-controlled parameters',async()=>{
 const calls=[];
 const lookup=createPostgresOwnerLookup({query:async(sql,values)=>{
  calls.push([sql,values]); return {rows:[{owner_user_id:id}]};
 }});
 assert.equal(await lookup(),id);
 assert.deepEqual(calls,[['select owner_user_id from sabora.admin_write_ownership where singleton = true',[]]]);
});
test('distinguishes unassigned bootstrap owner from corrupt or missing singleton',async()=>{
 const empty=createPostgresOwnerLookup({query:async()=>({rows:[{owner_user_id:null}]})});
 assert.equal(await empty(),null);
 for(const rows of [[],[{owner_user_id:'invalid'}],[{owner_user_id:id},{owner_user_id:id}]]) {
  const lookup=createPostgresOwnerLookup({query:async()=>({rows})});
  await assert.rejects(lookup(),/invalid_owner_lookup_result/);
 }
});
test('propagates database failure for fail-closed authorization',async()=>{
 const lookup=createPostgresOwnerLookup({query:async()=>{throw Error('db unavailable')}});
 await assert.rejects(lookup(),/db unavailable/);
});
