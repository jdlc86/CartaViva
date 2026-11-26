import {randomBytes,randomUUID} from 'node:crypto';
import {createPostgresTransaction} from './postgres-transaction.mjs';
import {createStaffLifecycleDirectoryCapabilityIssuer,createStaffInviteeEmailHasher} from './staff-lifecycle-capability.mjs';
import {createStaffAdminSubjectResolverCandidate,STAFF_ADMIN_SUBJECT_SQL,STAFF_FIRST_ADMIN_SUBJECT_SQL} from './staff-admin-subject-candidate.mjs';
import {DIRECTORY_OUTBOX_SQL} from './staff-invitation-durable-lifecycle-candidate.mjs';
import {STAFF_INVITATION_CUSTODY_RESTRICTED_SQL} from './staff-invitation-custody-coordinator-candidate.mjs';
import {registerDurableStaffAdminHttpCandidate,registerDurableFirstAdminHttpCandidate} from './staff-durable-admin-http-candidate.mjs';
import {FIRST_ADMIN_BOOTSTRAP_LOGIN} from './staff-lifecycle-coordinator.mjs';
import {createStaffFirstAdminStateCandidate,FIRST_ADMIN_STATE_SQL} from './staff-first-admin-state-candidate.mjs';
import {preflightStaffDurableAdminIdentity} from './staff-durable-admin-identity-preflight.mjs';
import {ROOT_MUTATION_PROOF_SQL} from './staff-root-recovery-candidate.mjs';

// Explicitly injected candidate. No environment access, provisioning,
// provider dispatch or automatic registration in the operational runtime.
export async function createVerifiedDurableStaffAdminCandidate(config={}){
 if(config.role===FIRST_ADMIN_BOOTSTRAP_LOGIN)throw Error('invalid_staff_durable_admin_config');
 return compose(config,false);
}
export async function createVerifiedDurableFirstAdminCandidate(config={}){
 if(config.role!==FIRST_ADMIN_BOOTSTRAP_LOGIN)throw Error('invalid_staff_durable_admin_config');
 return compose(config,true);
}
async function compose({pool,role,keyId,secret,emailHashSecret,keyring,issueRootMutationProof},first){
 if(typeof keyring?.active!=='function'||typeof keyring?.resolveKey!=='function'||
   (first&&typeof issueRootMutationProof!=='function'))throw Error('invalid_staff_durable_admin_config');
 const issueCapability=createStaffLifecycleDirectoryCapabilityIssuer({keyId,secret,databaseRole:role});
 const hashInviteeEmail=createStaffInviteeEmailHasher({secret:emailHashSecret});
 const tx=createPostgresTransaction({pool});
 const allowed=new Set([DIRECTORY_OUTBOX_SQL,STAFF_INVITATION_CUSTODY_RESTRICTED_SQL]);
 if(first)allowed.add(ROOT_MUTATION_PROOF_SQL);
 const withTransaction=work=>tx(query=>work((sql,args)=>{
  if(!allowed.has(sql))throw Error('staff_durable_admin_sql_not_allowed');
  return query(sql,args);
 }));
 const resolveSubject=createStaffAdminSubjectResolverCandidate({
  keyId,secret,databaseRole:role,query:(sql,args)=>tx(query=>{
   if(sql!==(first?STAFF_FIRST_ADMIN_SUBJECT_SQL:STAFF_ADMIN_SUBJECT_SQL))throw Error('staff_durable_admin_sql_not_allowed');
   return query(sql,args);
  })
 });
 const readState=first?createStaffFirstAdminStateCandidate({keyId,secret,query:(sql,args)=>tx(query=>{
  if(sql!==FIRST_ADMIN_STATE_SQL)throw Error('staff_durable_admin_sql_not_allowed');return query(sql,args);
 })}):undefined;
 const readiness=()=>preflightStaffDurableAdminIdentity({pool,role,firstAdminBootstrapOnly:first});
 await readiness();
 return Object.freeze({readiness,register(app,{forRoles}={}){
  return (first?registerDurableFirstAdminHttpCandidate:registerDurableStaffAdminHttpCandidate)(app,{forRoles,keyring,resolveSubject,readState,lifecycleConfig:{
   withTransaction,issueCapability,hashInviteeEmail,uuid:randomUUID,
   ...(first?{issueRootMutationProof,setRootMutationProof:(query,proof)=>query(ROOT_MUTATION_PROOF_SQL,[proof])}:{}),
   issueInvitationToken:()=>randomBytes(32).toString('base64url'),
   verifyCredentialRegistration:async()=>{throw Error('staff_admin_registration_forbidden');}
  }});
 }});
}
