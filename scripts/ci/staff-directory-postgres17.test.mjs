import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createStaffLifecycleDirectoryCapabilityIssuer} from '../../apps/api/src/staff-lifecycle-capability.mjs';
import {createStaffDirectoryCapabilityIssuer} from '../../apps/api/src/staff-directory-capability.mjs';
import {createStaffDirectoryRepository} from '../../apps/api/src/staff-directory-repository.mjs';
import {preflightStaffDirectoryIdentity} from '../../apps/api/src/staff-directory-identity-preflight.mjs';
import {createStaffCodeMaintenanceCapabilityIssuer} from '../../apps/api/src/staff-code-maintenance-candidate.mjs';

const url=process.env.SABORA_CI_PG_URL,modulePath=process.env.SABORA_CI_PG_MODULE;
if(!url||!modulePath||process.env.GITHUB_ACTIONS!=='true'||!isDisposablePgModulePath(modulePath))
 throw Error('disposable_pg17_harness_required');
const parsed=new URL(url);
if(parsed.hostname!=='127.0.0.1'||parsed.username!=='postgres'||
 parsed.password!=='sabora_ci_ephemeral_only'||parsed.pathname!=='/postgres'||!parsed.port)
 throw Error('unsafe_pg17_harness_target');
const {Pool}=createRequire(import.meta.url)(modulePath),admin=new Pool({connectionString:url,max:8});
const lifecycleRole='sabora_ci_staff_directory_write',directoryRole='sabora_ci_staff_directory_read';
const maintenanceRole='sabora_ci_staff_directory_maint';
const password='sabora_ci_directory_ephemeral',ownerId='37000000-0000-4000-8000-000000000001';
const keyId='staff_directory_pg17_key_037',secret=randomBytes(32),digest=value=>createHash('sha256').update(value).digest('hex');
const login=role=>{const value=new URL(url);value.username=role;value.password=password;return value.toString();};
const lifecycleSql=`SELECT * FROM sabora.transition_staff_lifecycle_with_directory_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::text,$8::text,$9::text,
 $10::text,$11::text,$12::text,$13::bigint,$14::bigint,$15::text,$16::text,$17::text,$18::text)`;
const maintenanceSql=`SELECT sabora.maintain_staff_employee_codes_authorized_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::boolean,$6::text,$7::text,$8::bigint,$9::bigint,$10::text) AS result`;
let lifecyclePool,directoryPool,maintenancePool,issueLifecycle,issueDirectory,issueMaintenance,sequence=0;
let firstDirectoryInvitation,revokedDirectorySubject;
const repository=createStaffDirectoryRepository();
const lifecycleArgs=value=>[value.keyId,value.databaseRole,value.actorId,value.action,value.enrollmentId,
 value.subjectUserId,value.requestedRole,value.inviteeEmailHashHex,value.inviteTokenHashHex,
 value.credentialEvidenceHashHex,value.reason,value.correlationId,value.issuedAtMs,value.expiresAtMs,
 value.givenName,value.familyName,value.inviteeEmail,value.signatureHex];
const maintenanceArgs=value=>[value.keyId,value.databaseRole,value.actorId,value.action,value.confirmed,
 value.reason,value.correlationId,value.issuedAtMs,value.expiresAtMs,value.signatureHex];
async function lifecycle(input){
 const capability=issueLifecycle(input),result=await lifecyclePool.query(lifecycleSql,lifecycleArgs(capability));
 assert.equal(result.rows.length,1);return {capability,row:result.rows[0]};
}
async function invite({email,givenName,familyName,role='waiter',correlationId=null}={}){
 sequence++;const enrollmentId=randomUUID(),token=`directory-token-${sequence}-${'x'.repeat(32)}`;
 const value=await lifecycle({actorId:ownerId,action:'invite',enrollmentId,subjectUserId:null,
  requestedRole:role,inviteeEmailHashHex:digest(email),inviteTokenHashHex:digest(token),
  credentialEvidenceHashHex:null,reason:null,givenName,familyName,inviteeEmail:email,
  correlationId:correlationId??`directory_invite_${String(sequence).padStart(6,'0')}`});
 return {...value,enrollmentId:value.row.result_enrollment_id,token,role,email};
}
async function transition(invitation,action,actorId,extra={}){
 return lifecycle({actorId,action,enrollmentId:invitation.enrollmentId,
  subjectUserId:['accept','register'].includes(action)?actorId:extra.subjectUserId??null,
  requestedRole:null,inviteeEmailHashHex:null,
  inviteTokenHashHex:action==='accept'?digest(invitation.token):null,
  credentialEvidenceHashHex:action==='register'?digest(`credential-${actorId}`):null,
  reason:['suspend','revoke'].includes(action)?extra.reason??'Baja autorizada':null,
  givenName:null,familyName:null,inviteeEmail:null,
  correlationId:`directory_${action}_${String(++sequence).padStart(6,'0')}`});
}
async function activate(invitation,subjectId){
 await transition(invitation,'accept',subjectId);await transition(invitation,'register',subjectId);
 await transition(invitation,'activate',ownerId,{subjectUserId:subjectId});
}
async function maintain(action,correlationId,reason=null){
 const capability=issueMaintenance({actorId:ownerId,action,confirmed:action==='recover',reason,correlationId});
 return (await maintenancePool.query(maintenanceSql,maintenanceArgs(capability))).rows[0].result;
}
const directoryCapability=(actorId,staffRole,operation,overrides={})=>issueDirectory({actorId,staffRole,
 operation,targetEnrollmentId:null,search:null,cursor:0,limit:operation==='admin_list'?20:1,...overrides});
const queryDirectory=(method,capability)=>repository[method]((sql,values)=>directoryPool.query(sql,values),capability);

test.before(async()=>{
 await admin.query(`CREATE ROLE ${lifecycleRole} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
 CREATE ROLE ${directoryRole} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
 CREATE ROLE ${maintenanceRole} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
 GRANT USAGE ON SCHEMA sabora TO ${lifecycleRole},${directoryRole},${maintenanceRole};
 GRANT EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_with_directory_candidate(
  text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text) TO ${lifecycleRole};
 GRANT EXECUTE ON FUNCTION sabora.read_staff_directory_authorized_candidate(
  text,text,uuid,text,text,uuid,text,integer,integer,bigint,bigint,text) TO ${directoryRole};
 GRANT EXECUTE ON FUNCTION sabora.maintain_staff_employee_codes_authorized_candidate(
  text,text,uuid,text,boolean,text,text,bigint,bigint,text) TO ${maintenanceRole}`);
 await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'admin','active')
  ON CONFLICT(user_id) DO UPDATE SET role='admin',state='active'`,[ownerId]);
 await admin.query(`UPDATE sabora.admin_write_ownership SET owner_user_id=$1,
  assigned_at=clock_timestamp() WHERE singleton=true`,[ownerId]);
 await admin.query(`INSERT INTO sabora.staff_lifecycle_signing_keys(key_id,hmac_key,not_before,expires_at)
  VALUES($1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '2 hours')`,[keyId,secret]);
 lifecyclePool=new Pool({connectionString:login(lifecycleRole),max:8});
 directoryPool=new Pool({connectionString:login(directoryRole),max:12});
 maintenancePool=new Pool({connectionString:login(maintenanceRole),max:3});
 issueLifecycle=createStaffLifecycleDirectoryCapabilityIssuer({keyId,secret,databaseRole:lifecycleRole});
 issueDirectory=createStaffDirectoryCapabilityIssuer({keyId,secret,databaseRole:directoryRole});
 issueMaintenance=createStaffCodeMaintenanceCapabilityIssuer({keyId,secret,databaseRole:maintenanceRole});
 await maintain('recover','directory_initial_recovery_037','Preparación aislada de reutilización histórica');
});
test.after(async()=>{await Promise.allSettled([lifecyclePool?.end(),directoryPool?.end(),maintenancePool?.end()]);await admin.end();});

test('PG17 directory runtime has one RPC, FORCE RLS and no direct or escalated access',async()=>{
 assert.deepEqual(await preflightStaffDirectoryIdentity({pool:directoryPool,role:directoryRole}),
  {role:directoryRole});
 const evidence=await admin.query(`SELECT role.rolsuper,role.rolbypassrls,role.rolinherit,
  has_function_privilege($1,'sabora.read_staff_directory_authorized_candidate(text,text,uuid,text,text,uuid,text,integer,integer,bigint,bigint,text)','EXECUTE') AS rpc,
  has_table_privilege($1,'sabora.staff_directory_contacts','SELECT') AS contacts,
  has_table_privilege($1,'sabora.staff_enrollments','SELECT') AS enrollments,
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='sabora' AND c.relname='staff_directory_contacts') AS forced
  FROM pg_roles role WHERE role.rolname=$1`,[directoryRole]);
 assert.deepEqual(evidence.rows,[{rolsuper:false,rolbypassrls:false,rolinherit:false,rpc:true,
  contacts:false,enrollments:false,forced:true}]);
 for(const statement of ['SELECT * FROM sabora.staff_directory_contacts','SELECT * FROM sabora.staff_enrollments',
  'UPDATE sabora.staff_members SET state=state','CREATE TABLE sabora.directory_escape(id integer)',
  'SET ROLE sabora_staff_directory_fn_owner'])
  await assert.rejects(directoryPool.query(statement),/permission denied|must be able to SET ROLE/);
});

test('PG17 invitation contact is atomic, idempotent and rejects contradictory replay',async()=>{
 const first=await invite({email:'julia@example.invalid',givenName:'Julia',familyName:'García López'});
 assert.deepEqual((await admin.query(`SELECT email FROM sabora.staff_directory_contacts WHERE enrollment_id=$1`,
  [first.enrollmentId])).rows,[{email:'julia@example.invalid'}]);
 const replay=issueLifecycle({...Object.fromEntries(Object.entries(first.capability).filter(([key])=>
  !['keyId','databaseRole','issuedAtMs','expiresAtMs','signatureHex'].includes(key))),enrollmentId:randomUUID(),
  inviteTokenHashHex:digest('regenerated-directory-token')});
 assert.equal((await lifecyclePool.query(lifecycleSql,lifecycleArgs(replay))).rows[0].repeated,true);
 assert.equal((await admin.query(`SELECT count(*)::integer AS count FROM sabora.staff_directory_contacts
  WHERE enrollment_id=$1`,[first.enrollmentId])).rows[0].count,1);
 const contradiction=issueLifecycle({...Object.fromEntries(Object.entries(first.capability).filter(([key])=>
  !['keyId','databaseRole','issuedAtMs','expiresAtMs','signatureHex'].includes(key))),enrollmentId:randomUUID(),
  inviteTokenHashHex:digest('another-directory-token'),inviteeEmail:'other@example.invalid'});
 await assert.rejects(lifecyclePool.query(lifecycleSql,lifecycleArgs(contradiction)),
  /staff_directory_contact_idempotency_conflict/);
 const failedId=randomUUID(),duplicateEmail=issueLifecycle({actorId:ownerId,action:'invite',enrollmentId:failedId,
  subjectUserId:null,requestedRole:'waiter',inviteeEmailHashHex:digest('different-hash-input'),
  inviteTokenHashHex:digest('duplicate-email-token'),credentialEvidenceHashHex:null,reason:null,
  givenName:'Duplicada',familyName:'Atómica',inviteeEmail:'julia@example.invalid',
  correlationId:'directory_duplicate_email_037'});
 await assert.rejects(lifecyclePool.query(lifecycleSql,lifecycleArgs(duplicateEmail)),/duplicate key value/);
 assert.equal((await admin.query('SELECT count(*)::integer AS count FROM sabora.staff_enrollments WHERE id=$1',
  [failedId])).rows[0].count,0);
 firstDirectoryInvitation=first;
});

test('PG17 admin pages, own profile, cross-denial and immediate revocation are real',async()=>{
 const first=firstDirectoryInvitation,subjectId='37000000-0000-4000-8000-000000000101';
 await activate(first,subjectId);
 const page=await queryDirectory('list',directoryCapability(ownerId,'admin','admin_list',{
  search:'julia@example.invalid',limit:1}));
 assert.equal(page.items.length,1);assert.equal(page.items[0].email,'julia@example.invalid');
 assert.equal(page.items[0].operationalDisplayId,first.row.result_operational_display_id);
 const detail=await queryDirectory('detail',directoryCapability(ownerId,'admin','admin_detail',{
  targetEnrollmentId:first.enrollmentId,limit:1}));assert.equal(detail.member.enrollmentId,first.enrollmentId);
 const ownCapability=directoryCapability(subjectId,'waiter','self_profile');
 const own=await queryDirectory('self',ownCapability);assert.deepEqual(Object.keys(own.profile),
  ['givenName','familyName','email','role','operationalDisplayId']);
 const forged={...ownCapability,actorId:ownerId};
 await assert.rejects(queryDirectory('self',forged),/invalid_staff_directory_read_capability/);
 const pendingReads=Array.from({length:16},()=>queryDirectory('self',directoryCapability(subjectId,'waiter','self_profile')));
 const revocation=transition(first,'revoke',ownerId,{subjectUserId:subjectId,reason:'Revocación concurrente'});
 const outcomes=await Promise.allSettled([...pendingReads,revocation]);
 assert.equal(outcomes.at(-1).status,'fulfilled');
 assert.ok(outcomes.slice(0,-1).every(item=>item.status==='fulfilled'||
  /staff_directory_forbidden/.test(item.reason?.message??'')));
 await assert.rejects(queryDirectory('self',directoryCapability(subjectId,'waiter','self_profile')),
  /staff_directory_forbidden/);
 const revoked=await queryDirectory('detail',directoryCapability(ownerId,'admin','admin_detail',{
  targetEnrollmentId:first.enrollmentId,limit:1}));assert.equal(revoked.member.state,'revoked');
 revokedDirectorySubject={first,subjectId};
});

test('PG17 code reuse keeps historical operational identity snapshots immutable',async()=>{
 const {first}=revokedDirectorySubject,originalCode=first.row.result_employee_code;
 const originalDisplay=first.row.result_operational_display_id;
 const recovered=await maintain('recover','directory_recover_reuse_037','Baja revisada para reutilización global');
 assert.ok(recovered.releasedCount>=1);
 const replacement=await invite({email:'nora@example.invalid',givenName:'Nora',familyName:'Sala'});
 assert.equal(replacement.row.result_employee_code,originalCode);
 assert.notEqual(replacement.row.result_operational_display_id,originalDisplay);
 const history=await admin.query(`SELECT operational_display_id FROM sabora.staff_employee_code_events
  WHERE enrollment_id=$1 AND event_type='assigned'`,[first.enrollmentId]);
 assert.deepEqual(history.rows,[{operational_display_id:originalDisplay}]);
 const revoked=await queryDirectory('detail',directoryCapability(ownerId,'admin','admin_detail',{
  targetEnrollmentId:first.enrollmentId,limit:1}));
 assert.equal(revoked.member.operationalDisplayId,null);
 const replacementDetail=await queryDirectory('detail',directoryCapability(ownerId,'admin','admin_detail',{
  targetEnrollmentId:replacement.enrollmentId,limit:1}));
 assert.equal(replacementDetail.member.operationalDisplayId,replacement.row.result_operational_display_id);
 const paged=await queryDirectory('list',directoryCapability(ownerId,'admin','admin_list',{limit:1}));
 assert.equal(paged.items.length,1);assert.ok(paged.nextCursor!==null);
});
