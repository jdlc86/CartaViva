import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {createStaffDirectoryCapabilityIssuer,STAFF_DIRECTORY_CAPABILITY_AUDIENCE}
 from '../apps/api/src/staff-directory-capability.mjs';
import {createStaffDirectoryRepository,STAFF_DIRECTORY_READ_SQL}
 from '../apps/api/src/staff-directory-repository.mjs';
import {createStaffDirectoryCoordinator} from '../apps/api/src/staff-directory-coordinator.mjs';
import {registerStaffDirectoryHttpCandidate} from '../apps/api/src/staff-directory-http-candidate.mjs';

const Fastify=createRequire(new URL('../apps/api/package.json',import.meta.url))('fastify');

const actorId='71000000-0000-4000-8000-000000000001';
const enrollmentId='72000000-0000-4000-8000-000000000002';
const secret=Buffer.alloc(32,37),now=1_800_000_000_000;
const issue=createStaffDirectoryCapabilityIssuer({keyId:'staff_directory_key_037',secret,
 databaseRole:'sabora_staff_directory_ci',ttlMs:10_000,clock:()=>now});
const input={actorId,staffRole:'admin',operation:'admin_list',targetEnrollmentId:null,
 search:'García',cursor:0,limit:20};
const date=new Date('2026-10-28T10:00:00.000Z');
const sqlRow=(overrides={})=>({record_kind:'admin',enrollment_id:enrollmentId,given_name:'Julia',
 family_name:'García López',email:'julia@example.invalid',operational_display_id:'JG-027',
 requested_role:'waiter',enrollment_state:'active',created_at:date,updated_at:date,...overrides});

test('directory capability binds actor, scope, search and pagination',()=>{
 const value=issue(input),searchHash=createHash('sha256').update('García').digest('hex');
 const message=[STAFF_DIRECTORY_CAPABILITY_AUDIENCE,'staff_directory_key_037',
  'sabora_staff_directory_ci',actorId,'admin','admin_list','-',searchHash,'0','20',
  String(now),String(now+10_000)].join('\n');
 assert.equal(value.signatureHex,createHmac('sha256',secret).update(message).digest('hex'));
 assert.throws(()=>issue({...input,staffRole:'waiter'}),/invalid_staff_directory_capability_input/);
 assert.throws(()=>issue({...input,search:'bad\nquery'}),/invalid_staff_directory_capability_input/);
});

test('repository emits distinct minimal admin and own DTOs',async()=>{
 const repository=createStaffDirectoryRepository(),listCapability=issue(input);let call;
 const page=await repository.list(async(sql,values)=>{call={sql,values};return {rows:[sqlRow()]};},listCapability);
 assert.equal(call.sql,STAFF_DIRECTORY_READ_SQL);assert.equal(page.items[0].email,'julia@example.invalid');
 assert.deepEqual(Object.keys(page.items[0]),['enrollmentId','givenName','familyName','email',
  'operationalDisplayId','role','state','createdAt','updatedAt']);
 const selfCapability=issue({...input,staffRole:'waiter',operation:'self_profile',search:null,limit:1});
 const self=await repository.self(async()=>({rows:[sqlRow({record_kind:'self'})]}),selfCapability);
 assert.deepEqual(self,{version:1,profile:{givenName:'Julia',familyName:'García López',
  email:'julia@example.invalid',role:'waiter',operationalDisplayId:'JG-027'}});
 assert.equal(Object.hasOwn(self.profile,'enrollmentId'),false);
});

test('coordinator denies cross-scope reads before SQL and binds verified identity',async()=>{
 let transactions=0,observed;
 const coordinator=createStaffDirectoryCoordinator({
  withTransaction:async callback=>{transactions++;return callback(async()=>({rows:[]}));},
  repository:{list:async(_query,capability)=>{observed=capability;return {version:1,items:[],nextCursor:null};},
   detail:async()=>({}),self:async()=>({version:1,profile:{}})},issueCapability:issue,
 });
 await assert.rejects(coordinator.list({verifiedIdentity:{userId:actorId},
  verifiedStaff:{userId:actorId,role:'waiter'}},{}),/staff_directory_forbidden/);
 assert.equal(transactions,0);
 await coordinator.list({verifiedIdentity:{userId:actorId},
  verifiedStaff:{userId:actorId,role:'admin'}},{search:'  Julia  ',cursor:0,limit:20});
 assert.equal(observed.actorId,actorId);assert.equal(observed.search,'Julia');assert.equal(transactions,1);
});

test('HTTP directory exposes admin pages and own profile without write authority',async t=>{
 const app=Fastify();t.after(()=>app.close());
 const forRoles=roles=>async request=>{
  const role=request.headers['x-test-role'];if(!roles.includes(role))throw Object.assign(Error('forbidden'),{statusCode:403});
  request.verifiedIdentity={userId:actorId};request.verifiedStaff={userId:actorId,role};
 };
 registerStaffDirectoryHttpCandidate(app,{forRoles,directory:{
  list:async()=>({version:1,items:[],nextCursor:null}),
  detail:async()=>({version:1,member:{}}),
  self:async(_context)=>({version:1,profile:{givenName:'Julia',familyName:'García López',
   email:'julia@example.invalid',role:'waiter',operationalDisplayId:'JG-027'}}),
 }});
 const page=await app.inject({method:'GET',url:'/api/v1/staff/directory?limit=20',
  headers:{'x-test-role':'admin'}});assert.equal(page.statusCode,200);assert.deepEqual(page.json().items,[]);
 const denied=await app.inject({method:'GET',url:'/api/v1/staff/directory',
  headers:{'x-test-role':'waiter'}});assert.equal(denied.statusCode,403);
 const self=await app.inject({method:'GET',url:'/api/v1/staff/me',headers:{'x-test-role':'waiter'}});
 assert.equal(self.statusCode,200);assert.equal(Object.hasOwn(self.json().profile,'enrollmentId'),false);
 assert.equal(app.hasRoute({method:'POST',url:'/api/v1/staff/directory'}),false);
});
