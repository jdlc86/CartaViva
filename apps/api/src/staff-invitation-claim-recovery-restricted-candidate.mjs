// Candidate-only restricted principal adapter. Never mounted on runtime routes.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RESTRICTED_STAFF_CLAIM_RECOVERY_SQL =
  'SELECT sabora.reclaim_staff_invitation_claim_candidate($1::uuid,$2::uuid,$3::integer) AS fence';
export function createRestrictedStaffClaimRecoveryCandidate({query}={}){
  if(typeof query!=='function') throw Error('invalid_staff_claim_recovery_config');
  return Object.freeze({
    async reclaim({jobId,staleFence,leaseSeconds}={}){
      if(!UUID.test(jobId??'')||!UUID.test(staleFence??'')||
         !Number.isSafeInteger(leaseSeconds)||leaseSeconds<30||leaseSeconds>3600)
        throw Error('invalid_staff_claim_recovery_input');
      const result=await query(RESTRICTED_STAFF_CLAIM_RECOVERY_SQL,
        [jobId.toLowerCase(),staleFence.toLowerCase(),leaseSeconds]);
      if(!Array.isArray(result?.rows)||result.rows.length!==1)
        throw Error('invalid_staff_claim_recovery_result');
      const fence=result.rows[0]?.fence;
      if(fence===null) return Object.freeze({reclaimed:false});
      if(!UUID.test(fence??'')||fence.toLowerCase()===staleFence.toLowerCase())
        throw Error('invalid_staff_claim_recovery_result');
      return Object.freeze({reclaimed:true,fence});
    },
  });
}
