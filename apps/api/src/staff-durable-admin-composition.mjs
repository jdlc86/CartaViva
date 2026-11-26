import {randomBytes,randomUUID} from 'node:crypto';
import {createPostgresTransaction} from './postgres-transaction.mjs';
import {createStaffLifecycleDirectoryCapabilityIssuer,createStaffInviteeEmailHasher} from './staff-lifecycle-capability.mjs';
import {createStaffAdminSubjectResolverCandidate,STAFF_ADMIN_SUBJECT_SQL} from './staff-admin-subject-candidate.mjs';
import {DIRECTORY_OUTBOX_SQL} from './staff-invitation-durable-lifecycle-candidate.mjs';
import {STAFF_INVITATION_CUSTODY_RESTRICTED_SQL} from './staff-invitation-custody-coordinator-candidate.mjs';
import {registerDurableStaffAdminHttpCandidate} from './staff-durable-admin-http-candidate.mjs';
import {preflightStaffDurableAdminIdentity} from './staff-durable-admin-identity-preflight.mjs';

// Explicitly injected candidate. No environment access, provisioning,
// provider dispatch or automatic registration in the operational runtime.
export async function createVerifiedDurableStaffAdminCandidate({pool,role,keyId,secret,emailHashSecret,keyring}={}){
 if(typeof keyring?.active!=='function'||typeof keyring?.resolveKey!=='function')throw Error('invalid_staff_durable_admin_config');
 const issueCapability=createStaffLifecycleDirectoryCapabilityIssuer({keyId,secret,databaseRole:role});
 const hashInviteeEmail=createStaffInviteeEmailHasher({secret:emailHashSecret});
 const tx=createPostgresTransaction({pool});
 const allowed=new Set([DIRECTORY_OUTBOX_SQL,STAFF_INVITATION_CUSTODY_RESTRICTED_SQL]);
 const withTransaction=work=>tx(query=>work((sql,args)=>{
  if(!allowed.has(sql))throw Error('staff_durable_admin_sql_not_allowed');
  return query(sql,args);
 }));
 const resolveSubject=createStaffAdminSubjectResolverCandidate({
  keyId,secret,databaseRole:role,query:(sql,args)=>tx(query=>{
   if(sql!==STAFF_ADMIN_SUBJECT_SQL)throw Error('staff_durable_admin_sql_not_allowed');
   return query(sql,args);
  })
 });
 const readiness=()=>preflightStaffDurableAdminIdentity({pool,role});
 await readiness();
 return Object.freeze({readiness,register(app,{forRoles}={}){
  return registerDurableStaffAdminHttpCandidate(app,{forRoles,keyring,resolveSubject,lifecycleConfig:{
   withTransaction,issueCapability,hashInviteeEmail,uuid:randomUUID,
   issueInvitationToken:()=>randomBytes(32).toString('base64url'),
   verifyCredentialRegistration:async()=>{throw Error('staff_admin_registration_forbidden');}
  }});
 }});
}
