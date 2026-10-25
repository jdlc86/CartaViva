// Candidate-only delivery outcome coordinator.
// A remote provider call is never made inside this module. In particular,
// an ambiguous provider outcome MUST NOT be silently retried: a duplicate
// invitation could otherwise be sent after an unobserved successful call.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOMES = new Set(['accepted', 'permanent_failure', 'unknown']);

export async function recordStaffInvitationDeliveryOutcome({
  withTransaction, repository, jobId, fence, outcome,
} = {}) {
  if (typeof withTransaction !== 'function' || !repository ||
      typeof repository.lockDispatchingDelivery !== 'function' ||
      typeof repository.finishDispatchingDelivery !== 'function' ||
      typeof jobId !== 'string' || !UUID.test(jobId) ||
      typeof fence !== 'string' || !UUID.test(fence) ||
      !OUTCOMES.has(outcome)) {
    throw Error('invalid_staff_delivery_outcome_config');
  }
  return withTransaction(async query => {
    const locked = await repository.lockDispatchingDelivery(query, jobId, fence);
    if (!locked) {
      return Object.freeze({recorded: false, reason: 'not_dispatching'});
    }
    // 'accepted' means only that the provider accepted the request. It does
    // not prove inbox delivery and never activates a staff enrollment.
    const nextState = outcome === 'accepted' ? 'delivered' : 'failed';
    const result = await repository.finishDispatchingDelivery(
      query, jobId, fence, nextState,
    );
    if (!result || result.finished !== true) {
      throw Error('staff_delivery_outcome_lost_race');
    }
    return Object.freeze({
      recorded: true, state: nextState,
      retryable: false, ambiguous: outcome === 'unknown',
    });
  });
}
