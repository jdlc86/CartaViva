// Candidate-only lease recovery: only 'claimed' (never 'dispatching') is reclaimable.
// A dispatching message may already be in flight; automatic retries are unsafe.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const STAFF_INVITATION_RECLAIM_SQL = `UPDATE sabora.staff_invitation_outbox
  SET fence=gen_random_uuid(),claimed_at=clock_timestamp(),
      updated_at=clock_timestamp()
  WHERE id=$1::uuid AND fence=$2::uuid AND state='claimed'
    AND claimed_at < clock_timestamp() - ($3::integer * interval '1 second')
  RETURNING fence::text AS fence`;

export function createStaffInvitationClaimRecoveryCandidate({withTransaction}={}) {
  if(typeof withTransaction!=='function') throw Error('invalid_staff_claim_recovery_config');
  return Object.freeze({
    async reclaim({jobId,staleFence,leaseSeconds}={}) {
      if(!UUID.test(jobId??'') || !UUID.test(staleFence??'') ||
         !Number.isSafeInteger(leaseSeconds) || leaseSeconds<30 || leaseSeconds>3600)
        throw Error('invalid_staff_claim_recovery_input');
      return withTransaction(async query=>{
        if(typeof query!=='function') throw Error('invalid_staff_claim_recovery_transaction');
        const result=await query(STAFF_INVITATION_RECLAIM_SQL,
          [jobId.toLowerCase(),staleFence.toLowerCase(),leaseSeconds]);
        if(!Array.isArray(result?.rows)||result.rows.length>1)
          throw Error('invalid_staff_claim_recovery_result');
        if(result.rows.length===0) return Object.freeze({reclaimed:false});
        const fence=result.rows[0]?.fence;
        if(!UUID.test(fence??'') || fence.toLowerCase()===staleFence.toLowerCase())
          throw Error('invalid_staff_claim_recovery_result');
        return Object.freeze({reclaimed:true,fence});
      });
    },
  });
}
