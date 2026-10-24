import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionalAdminWrite } from '../apps/api/src/transactional-admin-write.mjs';
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actor=userId=>({verifiedIdentity:{userId},mutate:async()=>({updated:true})});
function harness({ownerId=owner,role='admin',state='active',missing=false}={}) {
 const calls=[];
 const run=createTransactionalAdminWrite({withTransaction:async callback=>{
  const query=async(sql,args)=>{
   calls.push([sql,args]);
   if(sql.includes('admin_write_ownership'))return {rows:[{owner_user_id:ownerId}]};
   if(sql.includes('staff_members'))return {rows:missing?[]:[{role,state}]};
   throw Error('unexpected sql');
  };
  return callback(query);
 }});
 return {run,calls};
}
test('locks singleton first, revalidates actor and mutates within same transaction',async()=>{
 const {run,calls}=harness();
 assert.deepEqual(await run(actor(owner)),{updated:true});
 assert.equal(calls.length,2);
 assert.match(calls[0][0],/for update$/);
 assert.match(calls[1][0],/for update$/);
 assert.deepEqual(calls[1][1],[owner]);
});
test('non-owner, revoked, missing, and operational staff cannot mutate',async()=>{
 for(const cfg of [{ownerId:other},{state:'revoked'},{missing:true},{role:'waiter'}]){
  const {run}=harness(cfg);
  assert.equal((await run(actor(owner))).updated,undefined);
 }
});
test('active ROOT cannot use the ordinary admin mutation boundary',async()=>{
 const {run}=harness({ownerId:other,role:'root'});
 assert.deepEqual(await run(actor(owner)),{error:'forbidden'});
});
test('transaction query errors propagate and mutation does not execute',async()=>{
 const run=createTransactionalAdminWrite({withTransaction:async callback=>callback(async()=>{throw Error('db down')})});
 await assert.rejects(run(actor(owner)),/db down/);
});
