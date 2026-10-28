import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createStaffLifecycleDirectoryCapabilityIssuer} from '../../apps/api/src/staff-lifecycle-capability.mjs';
import {createStaffCodeMaintenanceCapabilityIssuer} from '../../apps/api/src/staff-code-maintenance-candidate.mjs';

const url=process.env.SABORA_CI_PG_URL,modulePath=process.env.SABORA_CI_PG_MODULE;
if(!url||!modulePath||process.env.GITHUB_ACTIONS!=='true'||!isDisposablePgModulePath(modulePath))
 throw Error('disposable_pg17_harness_required');
const parsed=new URL(url);
if(parsed.hostname!=='127.0.0.1'||parsed.username!=='postgres'||
 parsed.password!=='sabora_ci_ephemeral_only'||parsed.pathname!=='/postgres'||!parsed.port)
 throw Error('unsafe_pg17_harness_target');
const {Pool}=createRequire(import.meta.url)(modulePath);
const admin=new Pool({connectionString:url,max:8});
const login=(role,password)=>{const value=new URL(url);value.username=role;value.password=password;return value.toString();};
const ownerId='35000000-0000-4000-8000-000000000001';
const lifecycleRole='sabora_ci_staff_display_id',maintenanceRole='sabora_ci_staff_code_maint';
const lifecyclePassword='sabora_ci_staff_display_ephemeral';
const maintenancePassword='sabora_ci_staff_maint_ephemeral';
const keyId='staff_display_id_key_035',secret=randomBytes(32);
let lifecyclePool,maintenancePool,issueLifecycle,issueMaintenance,sequence=0;
const digest=value=>createHash('sha256').update(value,'utf8').digest('hex');
const identitySigningInput=value=>[
 'sabora.staff-identity-directory.v1',value.keyId,value.databaseRole,value.actorId,value.action,
 value.enrollmentId,value.subjectUserId??'-',value.requestedRole??'-',
 value.inviteeEmailHashHex??'-',value.inviteTokenHashHex??'-',
 value.credentialEvidenceHashHex??'-',value.reason===null?'-':digest(value.reason),
 value.givenName===null?'-':digest(value.givenName),
 value.familyName===null?'-':digest(value.familyName),
 value.inviteeEmail===null?'-':digest(value.inviteeEmail),value.correlationId,
 String(value.issuedAtMs),String(value.expiresAtMs),
].join('\n');
const lifecycleSql=`SELECT * FROM sabora.transition_staff_lifecycle_with_directory_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::text,$8::text,$9::text,
 $10::text,$11::text,$12::text,$13::bigint,$14::bigint,$15::text,$16::text,$17::text,$18::text)`;
const maintenanceSql=`SELECT sabora.maintain_staff_employee_codes_authorized_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::boolean,$6::text,$7::text,$8::bigint,
 $9::bigint,$10::text) AS result`;

function lifecycleArgs(value){return [value.keyId,value.databaseRole,value.actorId,value.action,
 value.enrollmentId,value.subjectUserId,value.requestedRole,value.inviteeEmailHashHex,
 value.inviteTokenHashHex,value.credentialEvidenceHashHex,value.reason,value.correlationId,
 value.issuedAtMs,value.expiresAtMs,value.givenName,value.familyName,value.inviteeEmail,
 value.signatureHex];}
function lifecycleInput(value){return {actorId:value.actorId,action:value.action,
 enrollmentId:value.enrollmentId,subjectUserId:value.subjectUserId,
 requestedRole:value.requestedRole,inviteeEmailHashHex:value.inviteeEmailHashHex,
 inviteTokenHashHex:value.inviteTokenHashHex,
 credentialEvidenceHashHex:value.credentialEvidenceHashHex,reason:value.reason,
 givenName:value.givenName,familyName:value.familyName,inviteeEmail:value.inviteeEmail,
 correlationId:value.correlationId};}
function maintenanceArgs(value){return [value.keyId,value.databaseRole,value.actorId,value.action,
 value.confirmed,value.reason,value.correlationId,value.issuedAtMs,value.expiresAtMs,value.signatureHex];}
function maintenanceSigningInput(value){return [
 'sabora.staff-code-maintenance.v1',value.keyId,value.databaseRole,value.actorId.toLowerCase(),
 value.action,String(value.confirmed),value.reason===null?'-':digest(value.reason),
 value.correlationId,String(value.issuedAtMs),String(value.expiresAtMs),
].join('\n');}
async function invite({givenName='Julia',familyName='García López',correlationId=null}={}){
 sequence++;const enrollmentId=randomUUID();const correlation=correlationId??`staff35_invite_${String(sequence).padStart(6,'0')}`;
 const email=`staff35-${sequence}@example.invalid`;
 const capability=issueLifecycle({actorId:ownerId,action:'invite',enrollmentId,
  subjectUserId:null,requestedRole:'waiter',inviteeEmailHashHex:digest(`staff35-${sequence}@example.invalid`),
  inviteTokenHashHex:digest(`staff35-token-${sequence}`),credentialEvidenceHashHex:null,
  reason:null,givenName,familyName,inviteeEmail:email,correlationId:correlation});
 const parity=await admin.query(`SELECT encode(extensions.hmac(convert_to($1,'UTF8'),
  hmac_key,'sha256'),'hex') AS signature FROM sabora.staff_lifecycle_signing_keys
  WHERE key_id=$2`,[identitySigningInput(capability),keyId]);
 assert.equal(parity.rows[0]?.signature,capability.signatureHex,
  'Node and PostgreSQL must derive the same staff identity capability signature');
 const result=await lifecyclePool.query(lifecycleSql,lifecycleArgs(capability));
 return {row:result.rows[0],capability};
}
async function maintain(action,correlationId,reason=null){
 const capability=issueMaintenance({actorId:ownerId,action,confirmed:action==='recover',reason,correlationId});
 return (await maintenancePool.query(maintenanceSql,maintenanceArgs(capability))).rows[0].result;
}

test.before(async()=>{
 await admin.query(`CREATE ROLE ${lifecycleRole} LOGIN PASSWORD '${lifecyclePassword}'
  NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  CREATE ROLE ${maintenanceRole} LOGIN PASSWORD '${maintenancePassword}'
  NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  GRANT USAGE ON SCHEMA sabora TO ${lifecycleRole},${maintenanceRole};
  GRANT EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_with_directory_candidate(
   text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text
  ) TO ${lifecycleRole};
  GRANT EXECUTE ON FUNCTION sabora.maintain_staff_employee_codes_authorized_candidate(
   text,text,uuid,text,boolean,text,text,bigint,bigint,text
  ) TO ${maintenanceRole}`);
 await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state)
  VALUES($1,'admin','active') ON CONFLICT(user_id) DO UPDATE SET role='admin',state='active'`,[ownerId]);
 await admin.query(`UPDATE sabora.admin_write_ownership SET owner_user_id=$1,
  assigned_at=clock_timestamp() WHERE singleton=true`,[ownerId]);
 await admin.query(`INSERT INTO sabora.staff_lifecycle_signing_keys
  (key_id,hmac_key,not_before,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 minute',
  clock_timestamp()+interval '1 hour')`,[keyId,secret]);
 lifecyclePool=new Pool({connectionString:login(lifecycleRole,lifecyclePassword),max:5});
 maintenancePool=new Pool({connectionString:login(maintenanceRole,maintenancePassword),max:3});
 issueLifecycle=createStaffLifecycleDirectoryCapabilityIssuer({keyId,secret,databaseRole:lifecycleRole});
 issueMaintenance=createStaffCodeMaintenanceCapabilityIssuer({keyId,secret,databaseRole:maintenanceRole});
});
test.after(async()=>{await Promise.allSettled([lifecyclePool?.end(),maintenancePool?.end()]);await admin.end();});

test('PG17 sequence, concurrent allocation, replay and 999 to 00A are deterministic',async()=>{
 const poolShape=await admin.query(`SELECT count(*)::integer AS count,
  min(code) FILTER(WHERE allocation_order=1) AS first,
  min(code) FILTER(WHERE allocation_order=999) AS last_numeric,
  min(code) FILTER(WHERE allocation_order=1000) AS first_alpha,
  max(allocation_order)::integer AS last_order FROM sabora.staff_employee_code_pool`);
 assert.deepEqual(poolShape.rows,[{count:46655,first:'001',last_numeric:'999',first_alpha:'00A',last_order:46655}]);
 const first=await invite();
 assert.equal(first.row.result_employee_code,'001');assert.equal(first.row.result_operational_display_id,'JG-001');
 const replayCapability=issueLifecycle({...lifecycleInput(first.capability),enrollmentId:randomUUID(),
  inviteTokenHashHex:digest('regenerated-token')});
 const replay=(await lifecyclePool.query(lifecycleSql,lifecycleArgs(replayCapability))).rows[0];
 assert.equal(replay.repeated,true);assert.equal(replay.result_enrollment_id,first.row.result_enrollment_id);
 assert.equal(replay.result_employee_code,'001');
 const changedName=issueLifecycle({...lifecycleInput(first.capability),enrollmentId:randomUUID(),
  inviteTokenHashHex:digest('regenerated-token-2'),familyName:'Nombre alterado'});
 await assert.rejects(lifecyclePool.query(lifecycleSql,lifecycleArgs(changedName)),
  /staff_identity_idempotency_conflict/);
 const concurrent=await Promise.all([invite({givenName:'Ana',familyName:'Sala'}),
  invite({givenName:'Bruno',familyName:'Sala'})]);
 assert.deepEqual(concurrent.map(value=>value.row.result_employee_code).sort(),['002','003']);

 await admin.query(`INSERT INTO sabora.staff_enrollments(
  id,invitee_email_hash,requested_role,state,invite_token_hash,created_by,
  created_at,last_invited_at,revoked_at,updated_at,
  revocation_reason,given_name,family_name,employee_code,operational_display_id)
 SELECT (substr(md5('staff35-numeric-'||pool.code),1,8)||'-'||substr(md5('staff35-numeric-'||pool.code),9,4)
  ||'-'||substr(md5('staff35-numeric-'||pool.code),13,4)||'-'||substr(md5('staff35-numeric-'||pool.code),17,4)
  ||'-'||substr(md5('staff35-numeric-'||pool.code),21,12))::uuid,
  sha256(convert_to('staff35-numeric-email-'||pool.code,'UTF8')),'waiter','revoked',
  sha256(convert_to('staff35-numeric-token-'||pool.code,'UTF8')),$1,
  statement_timestamp(),statement_timestamp(),statement_timestamp(),statement_timestamp(),
  'Fixture numérico PG17','Persona','Numérica',pool.code,'PN-'||pool.code
 FROM sabora.staff_employee_code_pool pool WHERE pool.allocation_order BETWEEN 4 AND 999`,[ownerId]);
 await admin.query(`UPDATE sabora.staff_employee_code_pool pool SET enrollment_id=enrollment.id,
  reserved_at=clock_timestamp() FROM sabora.staff_enrollments enrollment
  WHERE enrollment.employee_code=pool.code AND pool.allocation_order BETWEEN 4 AND 999`);
 const alpha=await invite({givenName:'Celia',familyName:'Alfa'});
 assert.equal(alpha.row.result_employee_code,'00A');assert.equal(alpha.row.result_operational_display_id,'CA-00A');
});

test('PG17 global maintenance is idempotent, audited and has no individual release',async()=>{
 const invalidCapability=issueMaintenance({actorId:ownerId,action:'preview',confirmed:false,
  reason:null,correlationId:'staff35_preview_null_signature'});
 const invalidArgs=maintenanceArgs(invalidCapability);invalidArgs[9]=null;
 const beforeInvalid=(await admin.query(`SELECT count(*)::integer AS count
  FROM sabora.staff_code_maintenance_requests`)).rows[0].count;
 await assert.rejects(maintenancePool.query(maintenanceSql,invalidArgs),
  /invalid_staff_code_maintenance_capability/);
 const validRecovery=issueMaintenance({actorId:ownerId,action:'recover',confirmed:true,
  reason:'Motivo sustituido',correlationId:'staff35_recover_null_reason'});
 const nullReason={...validRecovery,reason:null};
 nullReason.signatureHex=createHmac('sha256',secret)
  .update(maintenanceSigningInput(nullReason),'utf8').digest('hex');
 await assert.rejects(maintenancePool.query(maintenanceSql,maintenanceArgs(nullReason)),
  /invalid_staff_code_maintenance_capability/);
 const afterInvalid=(await admin.query(`SELECT count(*)::integer AS count
  FROM sabora.staff_code_maintenance_requests`)).rows[0].count;
 assert.equal(afterInvalid,beforeInvalid,'a null capability field must have no audit side effect');
 const target=(await admin.query(`SELECT id,auth_user_id FROM sabora.staff_enrollments
  WHERE employee_code='001'`)).rows[0];
 const revoke=issueLifecycle({actorId:ownerId,action:'revoke',enrollmentId:target.id,
  subjectUserId:null,requestedRole:null,inviteeEmailHashHex:null,inviteTokenHashHex:null,
  credentialEvidenceHashHex:null,reason:'Baja antes de activación',givenName:null,familyName:null,
  inviteeEmail:null,
  correlationId:'staff35_revoke_001'});
 await lifecyclePool.query(lifecycleSql,lifecycleArgs(revoke));
 const preview=await maintain('preview','staff35_preview_001');
 assert.equal(preview.eligibleCount,997);assert.equal(preview.releasedCount,0);
 const recovered=await maintain('recover','staff35_recover_001','Bajas revisadas globalmente');
 assert.equal(recovered.releasedCount,997);
 const replay=await maintain('recover','staff35_recover_001','Bajas revisadas globalmente');
 assert.equal(replay.repeated,true);assert.equal(replay.releasedCount,997);
 const evidence=await admin.query(`SELECT
  (SELECT count(*)::integer FROM sabora.staff_employee_code_events
   WHERE enrollment_id=$1 AND event_type='assigned') AS assigned,
  (SELECT count(*)::integer FROM sabora.staff_employee_code_events
   WHERE enrollment_id=$1 AND event_type='released') AS released,
  (SELECT count(*)::integer FROM sabora.staff_enrollments WHERE id=$1) AS enrollment_preserved,
  (SELECT employee_code IS NULL FROM sabora.staff_enrollments WHERE id=$1) AS code_cleared`,[target.id]);
 assert.deepEqual(evidence.rows,[{assigned:1,released:1,enrollment_preserved:1,code_cleared:true}]);
 await assert.rejects(maintenancePool.query('SELECT * FROM sabora.staff_employee_code_pool'),/permission denied/);
 await assert.rejects(maintenancePool.query('UPDATE sabora.staff_enrollments SET employee_code=NULL WHERE false'),/permission denied/);
 const reused=await invite({givenName:'Diana',familyName:'Reutilizada'});
 assert.equal(reused.row.result_employee_code,'001');assert.equal(reused.row.result_operational_display_id,'DR-001');
});

test('PG17 total exhaustion rejects the whole enrollment transaction without partial effects',async()=>{
 await admin.query(`INSERT INTO sabora.staff_enrollments(
  id,invitee_email_hash,requested_role,state,invite_token_hash,created_by)
 SELECT (substr(md5('staff35-exhaust-'||pool.code),1,8)||'-'||substr(md5('staff35-exhaust-'||pool.code),9,4)
  ||'-'||substr(md5('staff35-exhaust-'||pool.code),13,4)||'-'||substr(md5('staff35-exhaust-'||pool.code),17,4)
  ||'-'||substr(md5('staff35-exhaust-'||pool.code),21,12))::uuid,
  sha256(convert_to('staff35-exhaust-email-'||pool.code,'UTF8')),'waiter','invited',
  sha256(convert_to('staff35-exhaust-token-'||pool.code,'UTF8')),$1
 FROM sabora.staff_employee_code_pool pool WHERE pool.enrollment_id IS NULL`,[ownerId]);
 await admin.query(`UPDATE sabora.staff_employee_code_pool pool SET
  enrollment_id=(substr(md5('staff35-exhaust-'||pool.code),1,8)||'-'||substr(md5('staff35-exhaust-'||pool.code),9,4)
   ||'-'||substr(md5('staff35-exhaust-'||pool.code),13,4)||'-'||substr(md5('staff35-exhaust-'||pool.code),17,4)
   ||'-'||substr(md5('staff35-exhaust-'||pool.code),21,12))::uuid,reserved_at=clock_timestamp()
  WHERE pool.enrollment_id IS NULL`);
 const before=(await admin.query(`SELECT
  (SELECT count(*)::integer FROM sabora.staff_enrollments) AS enrollments,
  (SELECT count(*)::integer FROM sabora.staff_lifecycle_requests) AS lifecycle_requests,
  (SELECT count(*)::integer FROM sabora.staff_employee_code_events) AS code_events`)).rows[0];
 const failedId=randomUUID(),capability=issueLifecycle({actorId:ownerId,action:'invite',
  enrollmentId:failedId,subjectUserId:null,requestedRole:'waiter',
  inviteeEmailHashHex:digest('staff35-exhausted@example.invalid'),
  inviteTokenHashHex:digest('staff35-exhausted-token'),credentialEvidenceHashHex:null,
  reason:null,givenName:'Eva',familyName:'Sin Código',inviteeEmail:'exhausted@example.invalid',
  correlationId:'staff35_exhausted_001'});
 await assert.rejects(lifecyclePool.query(lifecycleSql,lifecycleArgs(capability)),
  /staff_employee_codes_exhausted/);
 const after=(await admin.query(`SELECT
  (SELECT count(*)::integer FROM sabora.staff_enrollments) AS enrollments,
  (SELECT count(*)::integer FROM sabora.staff_lifecycle_requests) AS lifecycle_requests,
  (SELECT count(*)::integer FROM sabora.staff_employee_code_events) AS code_events,
  (SELECT count(*)::integer FROM sabora.staff_enrollments WHERE id=$1) AS failed_rows`,[failedId])).rows[0];
 assert.deepEqual(after,{...before,failed_rows:0});
 await admin.query(`UPDATE sabora.staff_employee_code_pool SET enrollment_id=NULL,reserved_at=NULL
  WHERE enrollment_id IN(SELECT id FROM sabora.staff_enrollments
   WHERE given_name IS NULL AND invitee_email_hash IN(
    SELECT sha256(convert_to('staff35-exhaust-email-'||code,'UTF8')) FROM sabora.staff_employee_code_pool));
  DELETE FROM sabora.staff_enrollments enrollment WHERE enrollment.given_name IS NULL
   AND EXISTS(SELECT 1 FROM sabora.staff_employee_code_pool pool
    WHERE enrollment.invitee_email_hash=sha256(convert_to('staff35-exhaust-email-'||pool.code,'UTF8')))`);
});
