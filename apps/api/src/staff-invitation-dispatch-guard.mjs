import {decideStaffInvitationDelivery} from './staff-invitation-delivery-policy.mjs';

// Candidate-only: this is a decision boundary, NOT an email sender.
// The SQL adapter must provide a durable, atomic fencing check.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function authorizeStaffInvitationDispatch({
  withTransaction, repository, jobId, fence,
} = {}) {
  if (typeof withTransaction !== 'function' || !repository ||
      typeof repository.lockClaimedDelivery !== 'function' ||
      typeof repository.authorizeDispatch !== 'function' ||
      typeof jobId !== 'string' || !UUID.test(jobId) ||
      typeof fence !== 'string' || !UUID.test(fence)) {
    throw Error('invalid_staff_dispatch_config');
  }
  return withTransaction(async (query) => {
    const candidate = await repository.lockClaimedDelivery(query, jobId, fence);
    if (!candidate) {
      return Object.freeze({authorized: false, reason: 'claim_not_found'});
    }
    const decision = decideStaffInvitationDelivery(candidate);
    if (!decision.deliver) {
      return Object.freeze({authorized: false, reason: decision.reason});
    }
    const result = await repository.authorizeDispatch(query, jobId, fence);
    if (!result || result.authorized !== true) {
      throw Error('staff_dispatch_fence_rejected');
    }
    return Object.freeze({authorized: true});
  });
}
