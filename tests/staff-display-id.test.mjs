import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  createStaffCodeMaintenanceCapabilityIssuer,
  createStaffCodeMaintenanceCoordinator,
  createStaffCodeMaintenanceHttpHandler,
  createStaffCodeMaintenanceRepository,
  STAFF_CODE_MAINTENANCE_SQL,
} from '../apps/api/src/staff-code-maintenance-candidate.mjs';
import {createStaffManagementGateway,StaffManagementGatewayError}
  from '../apps/management/src/staff-management-gateway.js';

const actorId='10000000-0000-4000-8000-000000000001';
const secret=Buffer.alloc(32,17);
const result={version:1,action:'preview',eligibleCount:2,blockedCount:4,
  releasedCount:0,availableCount:46500,repeated:false};

test('maintenance capability binds global action, confirmation, reason and actor',()=>{
 const issue=createStaffCodeMaintenanceCapabilityIssuer({keyId:'staff_key_035',secret,
  databaseRole:'staff_code_maintenance_ci',clock:()=>1000});
 const preview=issue({actorId,action:'preview',confirmed:false,reason:null,
  correlationId:'staff_preview_001'});
 const recover=issue({actorId,action:'recover',confirmed:true,reason:'Bajas revisadas',
  correlationId:'staff_recover_001'});
 assert.notEqual(preview.signatureHex,recover.signatureHex);
 for(const invalid of [
  {actorId,action:'recover',confirmed:false,reason:'Bajas revisadas',correlationId:'staff_recover_001'},
  {actorId,action:'recover',confirmed:true,reason:null,correlationId:'staff_recover_001'},
  {actorId,action:'preview',confirmed:false,reason:null,correlationId:'bad'},
 ])assert.throws(()=>issue(invalid),/invalid_staff_code_maintenance_input/);
 let getterCalled=false;
 const hostile={actorId,action:'preview',confirmed:false,reason:null,
  correlationId:'staff_preview_hostile'};
 Object.defineProperty(hostile,'reason',{enumerable:true,get(){getterCalled=true;return null;}});
 assert.throws(()=>issue(hostile),/invalid_staff_code_maintenance_input/);
 assert.equal(getterCalled,false);
 assert.throws(()=>createStaffCodeMaintenanceCapabilityIssuer({keyId:'staff_key_035',secret,
  databaseRole:'staff_code_maintenance_ci',clock:()=>Number.MAX_SAFE_INTEGER})({actorId,
   action:'preview',confirmed:false,reason:null,correlationId:'staff_preview_004'}),
 /invalid_staff_code_maintenance_clock/);
});

test('maintenance coordinator is admin-only and repository issues one pinned statement',async()=>{
 const calls=[];
 const repository=createStaffCodeMaintenanceRepository({withTransaction:async callback=>
  callback(async(sql,values)=>{calls.push({sql,values});return {rows:[{result}]};})});
 const issue=createStaffCodeMaintenanceCapabilityIssuer({keyId:'staff_key_035',secret,
  databaseRole:'staff_code_maintenance_ci',clock:()=>1000});
 const coordinator=createStaffCodeMaintenanceCoordinator({repository,issueCapability:issue});
 assert.deepEqual(await coordinator.execute({verifiedIdentity:{userId:actorId},
  verifiedStaff:{userId:actorId,role:'admin'}},{action:'preview',correlationId:'staff_preview_001'}),result);
 assert.equal(calls.length,1);assert.equal(calls[0].sql,STAFF_CODE_MAINTENANCE_SQL);
 await assert.rejects(coordinator.execute({verifiedIdentity:{userId:actorId},
  verifiedStaff:{userId:actorId,role:'waiter'}},{action:'preview',correlationId:'staff_preview_002'}),
  /staff_code_maintenance_forbidden/);
 await assert.rejects(coordinator.execute({verifiedIdentity:{userId:actorId},
  verifiedStaff:{userId:actorId,role:'admin'}},{action:'recover',reason:null,
   confirmed:true,correlationId:'staff_recover_invalid'}),/invalid_staff_code_maintenance_request/);
});

test('HTTP and management gateway expose exhaustion solution and global maintenance only',async()=>{
 const handler=createStaffCodeMaintenanceHttpHandler({coordinator:{execute:async()=>result}});
 const reply={headers:{},status:0,header(k,v){this.headers[k]=v;return this;},
  code(v){this.status=v;return this;},send(v){this.payload=v;return v;}};
 await handler({body:{action:'preview',correlationId:'staff_preview_001'},
  verifiedIdentity:{userId:actorId},verifiedStaff:{userId:actorId,role:'admin'}},reply);
 assert.equal(reply.status,200);assert.equal(reply.headers['Cache-Control'],'no-store');
 const requests=[];
 const gateway=createStaffManagementGateway({send:async(path,options)=>{
  requests.push({path,body:JSON.parse(options.body)});
  return {status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>
    path.includes('code-maintenance')?result:{employeeCode:'027',operationalDisplayId:'JG-027'}};
 }});
 assert.equal((await gateway.invite({email:'julia@example.invalid',givenName:'Julia',
  familyName:'García López',requestedRole:'waiter',correlationId:'staff_invite_001'})).employeeCode,'027');
 await gateway.previewCodeMaintenance({correlationId:'staff_preview_003'});
 assert.deepEqual(requests.map(value=>value.path),
  ['/api/v1/staff/lifecycle','/api/v1/staff/code-maintenance']);
 assert.ok(requests.every(value=>!Object.hasOwn(value.body,'enrollmentId')));
 const exhausted=createStaffManagementGateway({send:async()=>({status:409,ok:false,
  headers:{get:()=> 'application/json'},json:async()=>({error:'staff_employee_codes_exhausted'})})});
 await assert.rejects(exhausted.invite({email:'julia@example.invalid',givenName:'Julia',
  familyName:'García López',requestedRole:'waiter',correlationId:'staff_invite_002'}),
  failure=>failure instanceof StaffManagementGatewayError&&failure.code==='staff_employee_codes_exhausted');
 const invalidCounts=createStaffManagementGateway({send:async()=>({status:200,ok:true,
  headers:{get:()=> 'application/json'},json:async()=>({...result,eligibleCount:-1})})});
 await assert.rejects(invalidCounts.previewCodeMaintenance({correlationId:'staff_preview_005'}),
  failure=>failure instanceof StaffManagementGatewayError&&failure.code==='invalid_response');
});

test('migration fixes sequence, global-only recovery, RLS and pickup display snapshots',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261027225805_sabora_staff_display_id_candidate.sql',import.meta.url),'utf8');
 assert.match(sql,/generate_series\(1,999\)/);assert.match(sql,/00A/);
 assert.match(sql,/allocation_order BETWEEN 1 AND 46655/);
 assert.match(sql,/staff_employee_codes_exhausted/);
 assert.match(sql,/maintain_staff_employee_codes_authorized_candidate/);
 assert.doesNotMatch(sql,/maintain_staff_employee_codes_authorized_candidate\([\s\S]{0,300}p_enrollment_id/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/g);
 assert.match(sql,/claimed_display_id/);assert.match(sql,/claimedDisplayId/);
 assert.match(sql,/staff_employee_code_events_immutable/);
 assert.match(sql,/operational_display_id=\s*upper\(left\(given_name,1\)/);
 assert.match(sql,/p_signature_hex IS NULL/);
 assert.match(sql,/p_action='recover' AND p_confirmed IS TRUE AND v_reason IS NOT NULL/);
 assert.match(sql,/SELECT\(code,allocation_order,enrollment_id,reserved_at\)/);
});
