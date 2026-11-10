// Compose cryptographic JWT verification, active staff membership and
// table transitions. Deliberately no HTTP route or runtime DB grants.
import {createPinnedRs256StaffBearerVerifier} from './pinned-rs256-staff-bearer-verifier.mjs';
import {createVerifiedStaffSessionResolver} from './verified-staff-session-resolver.mjs';
import {createStaffTableTransitionCoordinator,createStaffTableTransitionSqlAdapter}
 from './staff-table-transition-coordinator.mjs';
export function createAuthenticatedStaffTableTransitions({
 publicKey,issuer,audience,clock,maxTokenAgeSeconds,withTransaction
}={}){
 const verifyBearer=createPinnedRs256StaffBearerVerifier({
  publicKey,issuer,audience,clock,maxTokenAgeSeconds
 });
 const resolveStaffSession=createVerifiedStaffSessionResolver({verifyBearer});
 return createStaffTableTransitionCoordinator({
  withTransaction,resolveStaffSession,
  transition:createStaffTableTransitionSqlAdapter()
 });
}
