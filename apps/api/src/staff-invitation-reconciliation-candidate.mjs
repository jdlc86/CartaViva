// Candidate-only: transactionally cancel a stale invitation job.
// Never mounted in production. The database adapter must lock the enrollment
// and job in one transaction, then conditionally update the same job.
import {decideStaffInvitationDelivery} from './staff-invitation-delivery-policy.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANCELLABLE = new Set(['revoked', 'already_accepted', 'superseded']);

export async function reconcileStaffInvitationJob({
  withTransaction, repository, jobId,
} = {}) {
  if (typeof withTransaction !== 'function' || !repository ||
      typeof repository.lockReconciliationCandidate !== 'function' ||
      typeof repository.cancelStaleDelivery !== 'function' ||
      typeof jobId !== 'string' || !UUID.test(jobId)) {
    throw Error('invalid_staff_reconciliation_config');
  }
  return withTransaction(async query => {
    const candidate = await repository.lockReconciliationCandidate(query, jobId);
    if (candidate === null) {
      return Object.freeze({cancelled: false, reason: 'not_found'});
    }
    const decision = decideStaffInvitationDelivery(candidate);
    if (decision.deliver) {
      return Object.freeze({cancelled: false, reason: 'current_invitation'});
    }
    if (!CANCELLABLE.has(decision.reason)) {
      throw Error('unsupported_staff_reconciliation_reason');
    }
    const result = await repository.cancelStaleDelivery(query, jobId);
    if (!result || result.cancelled !== true) {
      throw Error('staff_reconciliation_lost_race');
    }
    return Object.freeze({cancelled: true, reason: decision.reason});
  });
}
