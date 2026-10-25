// Candidate-only: atomic lifecycle/outbox + encrypted token custody.
// Requires a trusted transactional SQL adapter; NOT mounted in runtime.
import {sealStaffInvitationToken} from './staff-invitation-envelope-candidate.mjs';
import {createStaffInvitationEnqueueCandidate} from './staff-invitation-enqueue-candidate.mjs';

export const STAFF_INVITATION_CUSTODY_INSERT_SQL = `SELECT
  sabora.store_staff_invitation_custody_candidate(
    $1::uuid,$2::uuid,$3::integer,$4::text,
    $5::text,$6::text,$7::text,$8::text
  )`;

export function createStaffInvitationCustodyCoordinatorCandidate({
  withTransaction, encryptionKey, keyId,
} = {}) {
  if (typeof withTransaction !== 'function' ||
      !Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32 ||
      typeof keyId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(keyId)) {
    throw Error('invalid_staff_custody_coordinator_config');
  }
  return Object.freeze({
    async transitionAndStore({capability, token} = {}) {
      if (!capability || !['invite','resend'].includes(capability.action) ||
          typeof token !== 'string') throw Error('invalid_staff_custody_input');
      // The DB determines the actual invite version; no version is trusted from callers.
      return withTransaction(async query => {
        const enqueue = createStaffInvitationEnqueueCandidate({query});
        const result = await enqueue.transitionAndEnqueue(capability);
        if (result.repeated) return Object.freeze({...result, stored:false});
        const envelope = sealStaffInvitationToken({
          token, enrollmentId:result.transition.enrollmentId,
          inviteVersion:result.transition.inviteVersion,
          tokenHashHex:capability.inviteTokenHashHex,
          keyId, key:encryptionKey,
        });
        await query(STAFF_INVITATION_CUSTODY_INSERT_SQL, [
          result.jobId,result.transition.enrollmentId,result.transition.inviteVersion,
          capability.inviteTokenHashHex,envelope.keyId,envelope.nonce,
          envelope.ciphertext,envelope.tag,
        ]);
        return Object.freeze({...result,stored:true});
      });
    },
  });
}
