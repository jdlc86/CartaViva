// Candidate only. No plaintext is returned by SQL and no provider is called.
import {openStaffInvitationToken} from './staff-invitation-envelope-candidate.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
export const STAFF_DISPATCH_ENVELOPE_READ_SQL=`SELECT * FROM
  sabora.read_staff_invitation_dispatch_envelope_candidate($1::uuid,$2::uuid)`;
export function createStaffDispatchEnvelopeReaderCandidate({query,resolveKey}={}){
  if(typeof query!=='function'||typeof resolveKey!=='function')
    throw Error('invalid_staff_dispatch_envelope_reader_config');
  return Object.freeze({
    async read({jobId,fence}={}){
      if(!UUID.test(jobId??'')||!UUID.test(fence??''))
        throw Error('invalid_staff_dispatch_envelope_request');
      const result=await query(STAFF_DISPATCH_ENVELOPE_READ_SQL,[jobId,fence]);
      if(!Array.isArray(result?.rows)||result.rows.length>1)
        throw Error('invalid_staff_dispatch_envelope_result');
      if(result.rows.length===0) return Object.freeze({authorized:false});
      const row=result.rows[0];
      if(!UUID.test(row?.result_enrollment_id??'')||
        !Number.isSafeInteger(row?.result_invite_version)||row.result_invite_version<1||
        !HASH.test(row?.result_token_hash_hex??'')||
        typeof row?.result_key_id!=='string')
        throw Error('invalid_staff_dispatch_envelope_result');
      const key=await resolveKey(row.result_key_id);
      const token=openStaffInvitationToken({
        envelope:{version:1,keyId:row.result_key_id,
          nonce:row.result_nonce,ciphertext:row.result_ciphertext,
          tag:row.result_tag},
        enrollmentId:row.result_enrollment_id,
        inviteVersion:row.result_invite_version,
        tokenHashHex:row.result_token_hash_hex,key,keyId:row.result_key_id,
      });
      return Object.freeze({authorized:true,token,
        enrollmentId:row.result_enrollment_id,inviteVersion:row.result_invite_version});
    },
  });
}
