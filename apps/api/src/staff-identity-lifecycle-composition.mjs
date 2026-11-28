import {timingSafeEqual} from 'node:crypto';
import {preflightStaffRestrictedIdentity} from './staff-durable-admin-identity-preflight.mjs';
import {createVerifiedDurableStaffAdminCandidate,createVerifiedDurableFirstAdminCandidate}
 from './staff-durable-admin-composition.mjs';
import {createStaffRootBootstrapCandidate} from './staff-root-bootstrap-candidate.mjs';
import {registerStaffEnrollmentHttpCandidate} from './staff-enrollment-http-candidate.mjs';
import {createStaffInviteeEmailHasher} from './staff-lifecycle-capability.mjs';
import {createStaffVerifiedEnrollmentCandidate,STAFF_ENROLLMENT_LOGIN}
 from './staff-verified-enrollment-candidate.mjs';
import {createStaffInvitationWorkerCandidate} from './staff-invitation-worker-candidate.mjs';

const ROOT_ROUTINE=['sabora.consume_root_bootstrap_candidate(uuid,uuid,uuid,text,bigint,bigint,text,text)',
 'sabora_root_bootstrap_fn_owner'];
const ENROLLMENT_ROUTINES=[
 'sabora.accept_staff_invitation_verified_candidate(text,uuid,uuid,text,text,bigint,bigint,text,text,uuid,text)',
 'sabora.check_staff_registration_candidate(text,uuid,uuid,uuid,text,bigint,text)',
 'sabora.register_staff_passkey_verified_candidate(text,uuid,uuid,text,text,bigint,bigint,text,text,uuid,uuid,uuid,text)'
].map(signature=>[signature,'sabora_staff_enrollment_fn_owner']);
const denied=()=>Error('invalid_staff_identity_lifecycle_dependencies');

export async function createVerifiedStaffIdentityLifecycleCandidate({origin,issuer,getTrustedKeys,
 bootstrap,firstAdmin,admin,enrollment,invitationDispatch,keyring,emailHashSecret,
 issueRootMutationProof,observeFailure}={}){
 if(enrollment?.expectedLogin!==STAFF_ENROLLMENT_LOGIN||typeof enrollment.exchangeInvitation!=='function'||
  invitationDispatch?.resend?.managementOrigin!==origin)
  throw denied();
 const invitationWorker=createStaffInvitationWorkerCandidate({...invitationDispatch,keyring,observeFailure});
 const keys=[firstAdmin?.secret,admin?.secret,enrollment.secret,enrollment.cookieSecret,emailHashSecret];
 if(keys.some((key,index)=>!(key instanceof Uint8Array)||key.length!==32||
  keys.slice(0,index).some(previous=>timingSafeEqual(previous,key))))throw denied();
 const rootBoot=createStaffRootBootstrapCandidate({pool:bootstrap?.pool,databaseRole:bootstrap?.expectedLogin});
 const verifyBootstrap=()=>preflightStaffRestrictedIdentity({pool:bootstrap.pool,role:bootstrap.expectedLogin,
  routines:[ROOT_ROUTINE],tables:['root_bootstrap_grants','root_bootstrap_receipt','staff_members','admin_write_ownership'],
  requiredTriggers:[['root_bootstrap_receipt','root_bootstrap_receipt_immutable',false],
   ['root_bootstrap_receipt','root_bootstrap_receipt_no_truncate',false]]});
 const verifyEnrollment=()=>preflightStaffRestrictedIdentity({pool:enrollment.pool,role:STAFF_ENROLLMENT_LOGIN,
  routines:ENROLLMENT_ROUTINES,tables:['staff_enrollments','staff_directory_contacts','staff_members',
   'staff_registration_receipts_candidate','staff_lifecycle_signing_keys'],requiredTriggers:[]});
 const accepted=createStaffVerifiedEnrollmentCandidate({...enrollment,issuer,getTrustedKeys,
  managementOrigin:origin,hashInviteeEmail:createStaffInviteeEmailHasher({secret:emailHashSecret})});
 const [first,normal]=await Promise.all([
  createVerifiedDurableFirstAdminCandidate({...firstAdmin,role:firstAdmin.expectedLogin,
   keyring,emailHashSecret,issueRootMutationProof}),
  createVerifiedDurableStaffAdminCandidate({...admin,role:admin.expectedLogin,keyring,emailHashSecret,issueRootMutationProof}),
  verifyBootstrap(),verifyEnrollment(),invitationWorker.readiness()
 ]);
 return Object.freeze({
  rootBootstrap:rootBoot,
  readiness:()=>Promise.all([verifyBootstrap(),verifyEnrollment(),first.readiness(),
   normal.readiness(),invitationWorker.readiness()]),
  register(app,{forRoles}){
   first.register(app,{forRoles});
   normal.register(app,{forRoles});
   registerStaffEnrollmentHttpCandidate(app,{origin,secret:enrollment.cookieSecret,enrollment:accepted,
    exchangeInvitation:enrollment.exchangeInvitation});
  },
  start:()=>invitationWorker.start(),
  wakeInvitations:()=>invitationWorker.tick(),
  close:()=>invitationWorker.close()
 });
}
