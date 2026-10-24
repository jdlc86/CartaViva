import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnershipWorkflow} from '../apps/api/src/ownership-workflow.mjs';
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const requester='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const corr='cccccccc-cccc-cccc-cccc-cccccccccccc';
const proposal='dddddddd-dddd-dddd-dddd-dddddddddddd';
function setup({audit=[],members,proposalRows}={}) {
 const calls=[];
 const query=async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('from sabora.admin_write_ownership')) return {rows:[{owner_user_id:owner}]};
  if(sql.includes('from sabora.admin_ownership_audit')) return {rows:audit};
  if(sql.includes('from sabora.staff_members')) return {rows:members??[{user_id:owner,role:'admin',state:'active'},{user_id:requester,role:'admin',state:'active'}]};
  if(sql.includes('from sabora.admin_ownership_proposals')) return {rows:proposalRows??[{id:proposal,kind:'request',status:'pending',from_owner_id:owner,to_owner_id:requester}]};
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
 assert.equal(calls.find(x=>x.sql.startsWith('insert into sabora.admin_ownership_audit')).args[2],'accept');
});
test('idempotent replay never mutates, conflicting correlation fails closed',async()=>{
 const prior={request_matches:true,result_payload:{proposalId:proposal,nextOwnerId:owner,status:'pending'}};
 const {calls,workflow}=setup({audit:[prior]});
 assert.deepEqual(await workflow({actorUserId:requester,action:'request',correlationId:corr}),{
  proposalId:proposal,nextOwnerId:owner,status:'pending',replayed:true
 });
 prior.request_matches=false;
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
 assert.equal(calls.find(x=>x.sql.startsWith('insert into sabora.admin_ownership_audit')).args[2],'force_transfer');
});

test('same correlation with altered target or reason is rejected',async()=>{
 const {workflow}=setup({audit:[{request_matches:false,result_payload:{proposalId:null,nextOwnerId:requester,status:'transferred'}}]});
 const result=await workflow({actorUserId:owner,action:'force',correlationId:corr,targetUserId:requester,reason:'changed'});
 assert.equal(result.error,'correlation_conflict');
});

test('canonicalizes UUIDs and rejects irrelevant or malformed fields',async()=>{
 const {workflow}=setup();
 const result=await workflow({actorUserId:requester.toUpperCase(),action:'request',correlationId:corr.toUpperCase()});
 assert.equal(result.proposalId,proposal);
 for(const input of [
  {actorUserId:requester,action:'request',correlationId:corr,targetUserId:owner},
  {actorUserId:requester,action:'force',correlationId:corr,targetUserId:owner,reason:{trim(){return 'x';}}},
  {actorUserId:requester,action:'force',correlationId:corr,targetUserId:owner,reason:'x'.repeat(1001)}
 ]) assert.equal((await workflow(input)).error,'invalid_request');
});

test('replay still requires current active durable membership',async()=>{
 const {workflow}=setup({
  audit:[{request_matches:true,result_payload:{proposalId:proposal,nextOwnerId:owner,status:'pending'}}],
  members:[{user_id:owner,role:'admin',state:'active'},{user_id:requester,role:'admin',state:'revoked'}]
 });
 assert.deepEqual(await workflow({actorUserId:requester,action:'request',correlationId:corr}),{error:'forbidden'});
});

test('successful replay does not depend on mutable proposal retention',async()=>{
 const {workflow}=setup({
  proposalRows:[],
  audit:[{request_matches:true,result_payload:{proposalId:proposal,nextOwnerId:requester,status:'accepted'}}]
 });
 assert.deepEqual(await workflow({actorUserId:owner,action:'accept',correlationId:corr,proposalId:proposal}),{
  proposalId:proposal,nextOwnerId:requester,status:'accepted',replayed:true
 });
});
