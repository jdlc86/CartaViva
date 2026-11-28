// Candidate-only bridge: one transaction joins identity, directory, outbox,
// encrypted custody and cancellation. Never expose an invitation token to HTTP.
import {createStaffLifecycleRepository} from './staff-lifecycle-repository.mjs';
import {sealStaffInvitationToken,openStaffInvitationToken} from './staff-invitation-envelope-candidate.mjs';
import {STAFF_INVITATION_CUSTODY_RESTRICTED_SQL} from './staff-invitation-custody-coordinator-candidate.mjs';
import {normalizeStaffInviteeEmail} from './staff-lifecycle-capability.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DIRECTORY_OUTBOX_SQL=`SELECT * FROM sabora.transition_staff_lifecycle_with_directory_outbox_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::text,$8::text,$9::text,
 $10::text,$11::text,$12::text,$13::bigint,$14::bigint,$15::text,$16::text,$17::text,$18::text)`;
export const DIRECTORY_DISPATCH_SQL='SELECT * FROM sabora.read_staff_invitation_directory_dispatch_candidate($1::uuid,$2::uuid)';

export function createDurableStaffLifecycleRepositoryCandidate({keyring}={}){
 if(typeof keyring?.active!=='function')throw Error('invalid_staff_durable_lifecycle_config');
 const lifecycle=createStaffLifecycleRepository();
 return Object.freeze({
  storesInvitationMaterial:true,
  async transition(query,capability,token){
   const invite=['invite','resend'].includes(capability?.action);
   if(invite?typeof token!=='string':token!==null)throw Error('invalid_staff_durable_lifecycle_material');
   let row;
   const transition=await lifecycle.transition(async(_sql,args)=>{
    const result=await query(DIRECTORY_OUTBOX_SQL,args);
    row=result?.rows?.[0];
    return result;
   },capability);
   if(!row||row.outbox_enqueued!==(invite&&!transition.repeated)||
      !Number.isSafeInteger(row.outbox_cancelled_count)||row.outbox_cancelled_count<0||
      (invite?!UUID.test(row.outbox_job_id??''):row.outbox_job_id!==null))
    throw Error('invalid_staff_durable_lifecycle_result');
   if(invite&&!transition.repeated){
    const selected=keyring.active();
    const envelope=sealStaffInvitationToken({token,enrollmentId:transition.enrollmentId,
     inviteVersion:transition.inviteVersion,tokenHashHex:capability.inviteTokenHashHex,
     keyId:selected.keyId,key:selected.key});
    await query(STAFF_INVITATION_CUSTODY_RESTRICTED_SQL,[
     row.outbox_job_id,transition.enrollmentId,transition.inviteVersion,
     capability.inviteTokenHashHex,envelope.keyId,envelope.nonce,envelope.ciphertext,envelope.tag]);
   }
   return transition;
  }
 });
}

// createEnrollmentUrl is a trusted, future provider integration. This helper
// intentionally does not mint Auth links, bypass recipient verification, or
// supply a token-only fallback. It calls that dependency only after the fence.
export function createStaffDirectoryDispatchReaderCandidate({query,keyring,createEnrollmentUrl}={}){
 if(typeof query!=='function'||typeof keyring?.resolveKey!=='function'||typeof createEnrollmentUrl!=='function')
  throw Error('invalid_staff_directory_dispatch_config');
 return async({jobId,fence})=>{
  if(!UUID.test(jobId??'')||!UUID.test(fence??''))throw Error('invalid_staff_directory_dispatch_request');
  const result=await query(DIRECTORY_DISPATCH_SQL,[jobId,fence]);
  if(!Array.isArray(result?.rows)||result.rows.length>1)throw Error('invalid_staff_directory_dispatch_result');
  if(!result.rows.length)return Object.freeze({authorized:false});
  const row=result.rows[0],recipient=normalizeStaffInviteeEmail(row.result_recipient);
  if(recipient!==row.result_recipient)throw Error('invalid_staff_directory_dispatch_result');
  const token=openStaffInvitationToken({envelope:{version:1,keyId:row.result_key_id,
    nonce:row.result_nonce,ciphertext:row.result_ciphertext,tag:row.result_tag},
   enrollmentId:row.result_enrollment_id,inviteVersion:row.result_invite_version,
   tokenHashHex:row.result_token_hash_hex,key:await keyring.resolveKey(row.result_key_id)});
  const enrollmentUrl=await createEnrollmentUrl({jobId,recipient,token,
   enrollmentId:row.result_enrollment_id,inviteVersion:row.result_invite_version});
  if(typeof enrollmentUrl!=='string')throw Error('invalid_staff_directory_dispatch_url');
  return Object.freeze({authorized:true,recipient,enrollmentUrl});
 };
}
