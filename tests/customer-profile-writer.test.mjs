import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerProfileWriter } from '../apps/api/src/customer-profile-writer.mjs';

const candidate = n => ({ internalId:'00000000-0000-4000-8000-00000000000'+n, publicId:'SB-22222222222'+n, alias:'Ana',company:null });
const collision = () => Object.assign(new Error('duplicate'),{code:'23505',constraint:'customer_profiles_public_id_key'});
function fakeTransaction(handler) {
 const statements=[];
 const withTransaction = async work => {
  statements.push('BEGIN');
  try { const result=await work(async (sql, params=[]) => {
   statements.push(sql);
   return handler(sql,params);
  }); statements.push('COMMIT'); return result; }
  catch(e) { statements.push('ROLLBACK'); throw e; }
 };
 return {withTransaction,statements};
}
test('inserts customer within one transaction with parameterized values',async()=>{
 const db=fakeTransaction((sql,p)=>sql.startsWith('INSERT')?{rowCount:1,rows:[{id:p[0],public_id:p[1],alias:p[2],company:p[3]}]}:{});
 const result=await createCustomerProfileWriter({withTransaction:db.withTransaction,prepare:()=>candidate(1)})({alias:'Ana'});
 assert.equal(result.public_id,candidate(1).publicId);
 assert.deepEqual(db.statements.map(x=>x.split(' ')[0]),['BEGIN','SAVEPOINT','INSERT','RELEASE','COMMIT']);
});
test('retries public ID collisions inside savepoints without aborting transaction',async()=>{
 let n=0, inserts=0;
 const db=fakeTransaction((sql,p)=>{
  if(sql.startsWith('INSERT')) { inserts++; if(inserts===1) throw collision(); return {rowCount:1,rows:[{id:p[0],public_id:p[1]}]}; }
  return {};
 });
 const result=await createCustomerProfileWriter({withTransaction:db.withTransaction,prepare:()=>candidate(++n)})({alias:'Ana'});
 assert.equal(result.public_id,candidate(2).publicId);
 assert.equal(db.statements.filter(x=>x==='ROLLBACK TO SAVEPOINT customer_id_candidate').length,1);
 assert.equal(db.statements.at(-1),'COMMIT');
});
test('collision retry is bounded and rolls back transaction on exhaustion',async()=>{
 const db=fakeTransaction(sql=>{if(sql.startsWith('INSERT')) throw collision(); return {};});
 await assert.rejects(createCustomerProfileWriter({withTransaction:db.withTransaction,prepare:()=>candidate(1),maxAttempts:2})({alias:'Ana'}),/customer_public_id_collision_limit/);
 assert.equal(db.statements.at(-1),'ROLLBACK');
 assert.equal(db.statements.filter(x=>x.startsWith('INSERT')).length,2);
});
test('other unique constraints and database failures are not retried',async()=>{
 const db=fakeTransaction(sql=>{if(sql.startsWith('INSERT')) throw Object.assign(new Error('uuid conflict'),{code:'23505',constraint:'customer_profiles_pkey'});return {};});
 await assert.rejects(createCustomerProfileWriter({withTransaction:db.withTransaction,prepare:()=>candidate(1)})({alias:'Ana'}),/uuid conflict/);
 assert.equal(db.statements.filter(x=>x.startsWith('INSERT')).length,1);
 assert.equal(db.statements.at(-1),'ROLLBACK');
});
test('invalid registration never inserts',async()=>{
 const db=fakeTransaction(()=>{throw Error('unexpected query')});
 const result=await createCustomerProfileWriter({withTransaction:db.withTransaction,prepare:()=>({error:'invalid_profile'})})({});
 assert.deepEqual(result,{error:'invalid_profile'});
 assert.deepEqual(db.statements,['BEGIN','COMMIT']);
});
