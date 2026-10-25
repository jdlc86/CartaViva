import {decideStaffInvitationDelivery} from './staff-invitation-delivery-policy.mjs';

// A worker may use this to claim a candidate only when a trusted transactional
// adapter has locked both the job and enrollment. The adapter must enforce the
// documented fencing invariant; this helper never sends email by itself.
export async function claimCurrentStaffInvitation({withTransaction, repository, jobId} = {}) {
  if (typeof withTransaction !== 'function' ||
      !repository || typeof repository.lockDeliveryCandidate !== 'function' ||
      typeof repository.markDeliveryClaimed !== 'function' ||
      typeof jobId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    throw Error('invalid_staff_delivery_claim_config');
  }
  return withTransaction(async (query) => {
    const candidate = await repository.lockDeliveryCandidate(query, jobId);
    if (!candidate || !candidate.job || !candidate.enrollment) {
      return Object.freeze({claimed: false, reason: 'not_found'});
    }
    const decision = decideStaffInvitationDelivery(candidate);
    if (!decision.deliver) {
      return Object.freeze({claimed: false, reason: decision.reason});
    }
    // The repository must atomically fence competing workers, using its own
    // conditional SQL update while the row locks remain held.
    const claim = await repository.markDeliveryClaimed(query, jobId, candidate);
    if (!claim || claim.claimed !== true || typeof claim.fence !== 'string' ||
        claim.fence.length < 16) {
      throw Error('staff_delivery_claim_failed');
    }
    return Object.freeze({claimed: true, reason: 'claimed', fence: claim.fence});
  });
}
