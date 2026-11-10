// Candidate-only trusted issuance boundary. Never mount as an HTTP route.
// The caller must supply an independently authenticated and authorized actor resolver.
const ID=/^[A-Za-z0-9_-]{8,96}$/;
export function createAuthenticatedStaffCustodyGrantIssuerCandidate({
  authority,resolveAuthenticatedActor,authorizeMaintenance,
}={}){
  if(typeof authority?.issue!=='function'||
    typeof resolveAuthenticatedActor!=='function'||
    typeof authorizeMaintenance!=='function')
    throw Error('invalid_staff_custody_grant_issuer_config');
  return Object.freeze({
    async issue({context,cutoff,maxRows,maxBatches,ttlSeconds}={}){
      // Never accept actorId, role, approved or signature from caller parameters.
      const identity=await resolveAuthenticatedActor(context);
      if(!identity||typeof identity.actorId!=='string'||
        !ID.test(identity.actorId)||identity.authenticated!==true)
        throw Error('staff_custody_grant_actor_not_authenticated');
      const permitted=await authorizeMaintenance({
        identity,action:'purge_terminal_staff_custody',
        cutoff,maxRows,maxBatches,
      });
      if(permitted!==true)throw Error('staff_custody_grant_actor_not_authorized');
      return authority.issue({
        actorId:identity.actorId,cutoff,maxRows,maxBatches,ttlSeconds,
      });
    },
  });
}
