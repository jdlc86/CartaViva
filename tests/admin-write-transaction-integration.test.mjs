import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresTransaction } from '../apps/api/src/postgres-transaction.mjs';
import { createTransactionalAdminWrite } from '../apps/api/src/transactional-admin-write.mjs';

const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const outsider='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// Integration of the two real JS adapters against a deterministic fake
// PostgreSQL client. This does NOT substitute for an RLS/ACL integration gate.
function fixture({role='admin',state='active',ownerId=owner,failMutation=false}={}){
 const statements=[],releases=[];
 let mutationCount=0;
 const client={
  async query(sql,args=[]){
   statements.push({sql,args});
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
   if(sql.includes('admin_write_ownership'))return {rows:[{owner_user_id:ownerId}]};
   if(sql.includes('staff_members'))return {rows:[{role,state}]};
   if(sql==='UPDATE sabora.restaurant_settings SET name=$1'){
    mutationCount++;
    if(failMutation)throw Error('mutation failed');
    return {rowCount:1,rows:[]};
   }
   throw Error('unexpected query: '+sql);
  },
  release:error=>releases.push(error)
 };
 const withTransaction=createPostgresTransaction({pool:{connect:async()=>client}});
 const run=createTransactionalAdminWrite({withTransaction});
 const input=(userId=owner)=>({
  verifiedIdentity:{userId},
  mutate:query=>query('UPDATE sabora.restaurant_settings SET name=$1',['New name'])
 });
 return {run,input,statements,releases,mutations:()=>mutationCount};
}

test('ADMIN owner mutation commits after revalidation on the same connection',async()=>{
 const f=fixture();
 await f.run(f.input());
 assert.deepEqual(f.statements.map(s=>s.sql==='BEGIN'||s.sql==='COMMIT'?s.sql:
  s.sql.includes('admin_write_ownership')?'LOCK_OWNER':
  s.sql.includes('staff_members')?'LOCK_STAFF':'MUTATE'),
  ['BEGIN','LOCK_OWNER','LOCK_STAFF','MUTATE','COMMIT']);
 assert.equal(f.mutations(),1);
 assert.deepEqual(f.releases,[undefined]);
});

test('non-owner, revoked and ROOT are denied before mutation, even with a valid transaction',async()=>{
 for(const config of [{ownerId:outsider},{state:'revoked'},{role:'root'}]){
  const f=fixture(config);
  const result=await f.run(f.input());
  assert.ok(result.error);
  assert.equal(f.mutations(),0);
  assert.equal(f.statements.at(-1).sql,'COMMIT');
 }
});

test('mutation failure rolls back and does not return an uncertain client',async()=>{
 const f=fixture({failMutation:true});
 await assert.rejects(f.run(f.input()),/mutation failed/);
 assert.equal(f.mutations(),1);
 assert.equal(f.statements.at(-1).sql,'ROLLBACK');
 assert.deepEqual(f.releases,[undefined]);
});
