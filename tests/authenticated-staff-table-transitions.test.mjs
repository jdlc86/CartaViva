import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createAuthenticatedStaffTableTransitions}
 from '../apps/api/src/authenticated-staff-table-transitions.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const issuer='https://auth.example.test/auth/v1';
const actor='00000000-0000-4000-8000-000000009201';
const table='00000000-0000-4000-8000-000000009202';
const session='00000000-0000-4000-8000-000000009203';
const now=1792600000000;
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function bearer(changes={}){
 const payload={iss:issuer,aud:'authenticated',sub:actor,
  iat:Math.floor(now/1000)-60,exp:Math.floor(now/1000)+300,...changes};
 const data=encode({alg:'RS256',typ:'JWT'})+'.'+encode(payload);
 return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
}
function harness(role='waiter'){
 const queries=[];
 const withTransaction=async fn=>{
  queries.push('BEGIN');
  try{
   const result=await fn(async(sql,args)=>{
    queries.push({sql,args});
    if(sql.includes('FROM sabora.staff_members'))
     return {rows:[{user_id:actor,role,state:'active'}]};
    if(sql.includes('transition_table_ordering_candidate'))
     return {rows:[{table_id:table,ordering_state:'open',session_id:session}]};
    throw Error('unexpected query');
   });
   queries.push('COMMIT');return result;
  }catch(error){queries.push('ROLLBACK');throw error;}
 };
 const change=createAuthenticatedStaffTableTransitions({
  publicKey,issuer,clock:()=>now,withTransaction
 });
 return {change,queries};
}
test('signed bearer binds staff subject and table transition in one transaction',async()=>{
 const {change,queries}=harness();
 assert.deepEqual(await change({credential:bearer(),tableId:table,target:'open'}),
  {tableId:table,orderingState:'open',sessionId:session});
 assert.equal(queries[0],'BEGIN');
 assert.equal(queries[3],'COMMIT');
 assert.deepEqual(queries[1].args,[actor]);
 assert.deepEqual(queries[2].args,[actor,table,'open',null]);
});
test('forged subject or issuer cannot reach staff membership or transition',async()=>{
 const {change,queries}=harness();
 await assert.rejects(change({credential:bearer({iss:'https://evil.example'}),
  tableId:table,target:'open'}),/staff_session_forbidden/);
 assert.deepEqual(queries,['BEGIN','ROLLBACK']);
});
test('kitchen member cannot mutate table even with valid JWT',async()=>{
 const {change,queries}=harness('kitchen');
 await assert.rejects(change({credential:bearer(),tableId:table,target:'open'}),
  /staff_session_forbidden/);
 assert.equal(queries.some(q=>typeof q==='object'&&
  q.sql.includes('transition_table_ordering_candidate')),false);
});
test('request-supplied actor is rejected before opening a transaction',async()=>{
 const {change,queries}=harness();
 await assert.rejects(change({credential:bearer(),tableId:table,target:'open',
  actorId:actor}),/invalid_staff_transition_request/);
 assert.deepEqual(queries,[]);
});
