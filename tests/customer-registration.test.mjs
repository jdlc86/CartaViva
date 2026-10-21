import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerRegistrationWithSession } from '../apps/api/src/customer-registration.mjs';
import { issueCustomerSession } from '../apps/api/src/customer-session.mjs';

const profile = n => ({internalId:'00000000-0000-4000-8000-00000000000'+n,publicId:'SB-22222222222'+n,alias:'Ana',company:null});
const session = () => issueCustomerSession({random:()=>Buffer.alloc(32,7),now:()=>new Date('2026-10-21T00:00:00Z')});
function fakeDb(handler) {
 const calls=[];
 const withTransaction=async fn=>{
  calls.push('BEGIN');
  try {
   const result=await fn(async(sql,params=[])=>{calls.push(sql);return handler(sql,params);});
   calls.push('COMMIT');
   return result;
  }catch(e){calls.push('ROLLBACK');throw e;}
 };
 return {calls,withTransaction};
}
test('profile and session are inserted before a single commit',async()=>{
 const db=fakeDb((sql,params)=>{
  if(sql.startsWith('INSERT INTO sabora.customer_profiles'))return {rowCount:1,rows:[{id:params[0],public_id:params[1]}]};
  if(sql.startsWith('INSERT INTO sabora.customer_sessions'))return {rowCount:1,rows:[{id:params[0]}]};
  return {};
 });
 const result=await createCustomerRegistrationWithSession({withTransaction:db.withTransaction,prepare:()=>profile(1),issue:session,sessionId:()=>profile(2).internalId})({alias:'Ana'});
 assert.equal(result.profile.public_id,profile(1).publicId);
 assert.equal(result.token,session().token);
 assert.equal(db.calls.at(-1),'COMMIT');
 assert.equal(db.calls.filter(x=>x.startsWith('INSERT')).length,2);
 assert.ok(db.calls.indexOf('INSERT INTO sabora.customer_sessions(id,customer_id,token_hash,created_at,expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id') < db.calls.indexOf('COMMIT'));
});
test('failed session insertion rolls back profile too',async()=>{
 const db=fakeDb(sql=>{
  if(sql.startsWith('INSERT INTO sabora.customer_profiles'))return {rowCount:1,rows:[{id:profile(1).internalId}]};
  if(sql.startsWith('INSERT INTO sabora.customer_sessions'))throw Error('session storage down');
  return {};
 });
 await assert.rejects(createCustomerRegistrationWithSession({withTransaction:db.withTransaction,prepare:()=>profile(1),issue:session})({alias:'Ana'}),/session storage down/);
 assert.equal(db.calls.at(-1),'ROLLBACK');
 assert.ok(db.calls.includes('ROLLBACK TO SAVEPOINT customer_registration_candidate'));
});
test('only profile public ID collisions retry, with a new candidate',async()=>{
 let attempt=0;
 const db=fakeDb((sql,params)=>{
  if(sql.startsWith('INSERT INTO sabora.customer_profiles')){
   if(attempt===1)throw Object.assign(Error('collision'),{code:'23505',constraint:'customer_profiles_public_id_key'});
   return {rowCount:1,rows:[{id:params[0],public_id:params[1]}]};
  }
  if(sql.startsWith('INSERT INTO sabora.customer_sessions'))return {rowCount:1,rows:[{id:params[0]}]};
  return {};
 });
 const result=await createCustomerRegistrationWithSession({withTransaction:db.withTransaction,prepare:()=>profile(++attempt),issue:session,sessionId:()=>profile(3).internalId})({alias:'Ana'});
 assert.equal(result.profile.public_id,profile(2).publicId);
 assert.equal(db.calls.at(-1),'COMMIT');
});
test('invalid profile never creates a session',async()=>{
 const db=fakeDb(()=>{throw Error('unexpected database access');});
 const result=await createCustomerRegistrationWithSession({withTransaction:db.withTransaction,prepare:()=>({error:'invalid_profile'}),issue:()=>{throw Error('unexpected issue');}})({});
 assert.deepEqual(result,{error:'invalid_profile'});
 assert.deepEqual(db.calls,['BEGIN','COMMIT']);
});

test('registration rejects inconsistent bearer hash without storing session',async()=>{
 const db=fakeDb((sql,params)=>{
  if(sql.startsWith('INSERT INTO sabora.customer_profiles'))return {rowCount:1,rows:[{id:params[0],public_id:params[1]}]};
  if(sql.startsWith('INSERT INTO sabora.customer_sessions'))throw Error('session_insert_must_not_happen');
  return {};
 });
 const issue=()=>({...session(),tokenHash:Buffer.alloc(32,0)});
 await assert.rejects(createCustomerRegistrationWithSession({withTransaction:db.withTransaction,prepare:()=>profile(1),issue})({alias:'Ana'}),/invalid_issued_customer_session/);
 assert.equal(db.calls.at(-1),'ROLLBACK');
 assert.equal(db.calls.filter(x=>x.startsWith('INSERT INTO sabora.customer_sessions')).length,0);
});
test('registration rejects malformed or reversed session timestamps',async()=>{
 for(const change of [{expiresAt:new Date('2026-10-20T00:00:00Z')},{createdAt:new Date(NaN)},{token:'invalid'}]){
  const db=fakeDb((sql,params)=>sql.startsWith('INSERT INTO sabora.customer_profiles')?{rowCount:1,rows:[{id:params[0]}]}:{});
  await assert.rejects(createCustomerRegistrationWithSession({withTransaction:db.withTransaction,prepare:()=>profile(1),issue:()=>({...session(),...change})})({alias:'Ana'}),/invalid_issued_customer_session/);
  assert.equal(db.calls.at(-1),'ROLLBACK');
 }
});
