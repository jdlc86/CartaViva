import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnershipWorkflow} from '../apps/api/src/ownership-workflow.mjs';
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const requester='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const corr='cccccccc-cccc-cccc-cccc-cccccccccccc';
const proposal='dddddddd-dddd-dddd-dddd-dddddddddddd';
function setup({audit=[]}={}) {
 const calls=[];
 const query=async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('from sabora.admin_write_ownership')) return {rows:[{owner_user_id:owner}]};
  if(sql.includes('from sabora.admin_ownership_audit')) return {rows:audit};
  if(sql.includes('from sabora.staff_members')) return {rows:[{user_id:owner,role:'admin',state:'active'},{user_id:requester,role:'admin',state:'active'}]};
  if(sql.includes('from sabora.admin_ownership_proposals')) return {rows:[{id:proposal,kind:'request',status:'pending',from_owner_id:owner,to_owner_id:requester}]};
  if(sql.startsWith('insert into sabora.admin_ownership_proposals')) return {rows:[{id:proposal}]};
  return {rows:[]};
 };
 return {calls,workflow:createOwnershipWorkflow({withTransaction:async work=>work(query)})};
}
test('request writes proposal and append-only audit under ownership lock',async()=>{
 const {calls,workflow}=setup();
 const result=await workflow({actorUserId:requester,action:'request',correlationId:corr});
 assert.equal(result.proposalId,proposal);
 assert.match(calls[0].sql,/for update$/);
 assert.ok(calls.some(x=>x.sql.startsWith('insert into sabora.admin_ownership_proposals')));
 assert.ok(calls.some(x=>x.sql.startsWith('insert into sabora.admin_ownership_audit')));
 assert.ok(!calls.some(x=>x.sql.startsWith('update sabora.admin_write_ownership')));
});
test('accepted request updates owner, proposal and audit in one transaction',async()=>{
 const {calls,workflow}=setup();
 const result=await workflow({actorUserId:owner,action:'accept',correlationId:corr,proposalId:proposal});
 assert.equal(result.nextOwnerId,requester,JSON.stringify(result));
 assert.equal(result.status,'accepted');
 assert.ok(calls.some(x=>x.sql.startsWith('update sabora.admin_write_ownership')));
 assert.ok(calls.some(x=>x.sql.startsWith('update sabora.admin_ownership_proposals')));
 assert.ok(calls.some(x=>x.sql.startsWith('insert into sabora.admin_ownership_audit')));
});
test('idempotent replay never mutates, conflicting correlation fails closed',async()=>{
 const {calls,workflow}=setup({audit:[{action:'request',actor_user_id:requester,proposal_id:proposal,next_owner_id:owner,request_payload:{action:'request',actorUserId:requester,proposalId:null,targetUserId:null,reason:null}}]});
 assert.equal((await workflow({actorUserId:requester,action:'request',correlationId:corr})).replayed,true);
 assert.equal((await workflow({actorUserId:owner,action:'request',correlationId:corr})).error,'correlation_conflict');
 assert.ok(!calls.some(x=>x.sql.startsWith('insert ')||x.sql.startsWith('update ')));
});
test('rejects unverified identifiers before transaction',async()=>{
 const {calls,workflow}=setup();
 assert.equal((await workflow({actorUserId:'not-a-uuid',action:'force',correlationId:corr})).error,'invalid_request');
 assert.equal(calls.length,0);
});

test('active ROOT can force transfer with a reason and writes audit',async()=>{
 const {calls,workflow}=setup();
 // Override staff lookup in this isolated test by using an explicit wrapper.
 const root='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
 const query=async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('from sabora.admin_write_ownership'))return {rows:[{owner_user_id:owner}]};
  if(sql.includes('from sabora.admin_ownership_audit'))return {rows:[]};
  if(sql.includes('from sabora.staff_members'))return {rows:[{user_id:root,role:'root',state:'active'},{user_id:requester,role:'admin',state:'active'}]};
  return {rows:[]};
 };
 const force=createOwnershipWorkflow({withTransaction:async work=>work(query)});
 const result=await force({actorUserId:root,action:'force',correlationId:corr,targetUserId:requester,reason:'Recovery'});
 assert.equal(result.nextOwnerId,requester);
 assert.ok(calls.some(x=>x.sql.startsWith('update sabora.admin_write_ownership')));
 assert.ok(calls.some(x=>x.sql.startsWith('insert into sabora.admin_ownership_audit')));
});

test('same correlation with altered target or reason is rejected',async()=>{
 const {workflow}=setup({audit:[{action:'force_transfer',actor_user_id:owner,proposal_id:null,next_owner_id:requester,request_payload:{action:'force',actorUserId:owner,proposalId:null,targetUserId:requester,reason:'original'}}]});
 const result=await workflow({actorUserId:owner,action:'force',correlationId:corr,targetUserId:requester,reason:'changed'});
 assert.equal(result.error,'correlation_conflict');
});
