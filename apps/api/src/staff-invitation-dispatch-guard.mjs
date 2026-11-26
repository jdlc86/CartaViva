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

// Called with an existing claim. The material reader only returns an
// enrollment URL after its own fenced read. No transaction spans the send.
export async function dispatchStaffInvitation({withTransaction,repository,jobId,fence,
  readDelivery,send,recordOutcome}){
  if(typeof readDelivery!=='function'||typeof send!=='function'||typeof recordOutcome!=='function')
    throw Error('invalid_staff_dispatch_config');
  const decision=await authorizeStaffInvitationDispatch({withTransaction,repository,jobId,fence});
  if(!decision.authorized)return decision;
  let outcome='unknown',providerId=null;
  try{
    const delivery=await readDelivery({jobId,fence});
    if(delivery?.authorized===true){
      const receipt=await send({jobId,recipient:delivery.recipient,enrollmentUrl:delivery.enrollmentUrl});
      if(receipt?.outcome==='accepted'&&typeof receipt.providerId==='string'&&UUID.test(receipt.providerId)){
        outcome='accepted';providerId=receipt.providerId;
      }else if(receipt?.outcome==='permanent_failure')outcome='permanent_failure';
    }else if(delivery?.authorized===false){
      outcome='permanent_failure';
    }
  }catch{
    // Do not automatically reschedule after a definitive dispatch fence.
  }
  return recordOutcome({jobId,fence,outcome,...(providerId?{providerId}:{})});
}
