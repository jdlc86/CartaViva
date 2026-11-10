import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedAdminTableReader} from '../apps/api/src/verified-admin-table-reader.mjs';
const id='cafe0000-0000-4000-8000-0000000000aa';
const identity={userId:id};
test('verified administrative table reader rejects missing and mismatched identities',async()=>{
 let calls=0;
 const reader=createVerifiedAdminTableReader({query:async()=>{calls++;return {rows:[]};}});
 const cases=[{}, {verifiedIdentity:identity},
  {verifiedIdentity:identity,verifiedStaff:{userId:'different',role:'admin'}},
  {verifiedIdentity:identity,verifiedStaff:{userId:id,role:'root'}},
  {verifiedIdentity:identity,verifiedStaff:{userId:id,role:'kitchen'}}];
 for(const request of cases)await assert.rejects(reader.listTables(request),
  /admin_projection_forbidden/);
 assert.equal(calls,0);
});
test('verified administrative reader accepts hook-verified active-role context only',async()=>{
 let calls=0;
 const reader=createVerifiedAdminTableReader({query:async()=>{calls++;return {rows:[]};}});
 const result=await reader.listTables({
  verifiedIdentity:identity,verifiedStaff:{userId:id,role:'waiter'}},{limit:5});
 assert.equal(result.version,1);
 assert.deepEqual(result.items,[]);
 assert.equal(calls,1);
 await assert.rejects(reader.listTables({
  verifiedIdentity:identity,verifiedStaff:{userId:id,role:'admin'}
 },{role:'admin'}),/invalid_admin_projection_page/);
 assert.equal(calls,1);
});
