// Opt-in B3 HTTP composition. This is deliberately not imported by the
// production bootstrap: a caller must supply six isolated SQL pools and
// explicit HTTP authentication/authorization adapters.
import {createStaffProtectedHooksFromPool} from './staff-protected-hooks-from-pool.mjs';
import {preflightOrderTransitionStaffIdentity} from './order-operations-identity-preflight.mjs';
import {createVerifiedTableChangeB3CustomerFlowCandidate}
 from './table-change-isolated-sql-composition-candidate.mjs';
import {registerCustomerProductionFlowHttp} from './customer-production-http.mjs';
import {registerTableChangeStaffHttp,registerTableChangeStaffPendingHttp}
 from './table-change-http-candidate.mjs';
import {createVerifiedPendingTableChangeReader}
 from './table-change-pending-reader-candidate.mjs';
import {createTableChangeCommitNotifier} from './table-change-state-stream-candidate.mjs';

export async function mountVerifiedTableChangeB3HttpCandidate(app,{
 cookieAuth,forRoles,observeStreamFailure=null,...sqlConfiguration
}={}){
 if(!app||typeof app.register!=='function'||typeof app.post!=='function'||
    typeof app.addHook!=='function'||
    !cookieAuth||typeof cookieAuth.authenticate!=='function'||
    typeof cookieAuth.requireSameOrigin!=='function'||
    typeof cookieAuth.logout!=='function'||typeof forRoles!=='function')
  throw Error('invalid_b3_http_composition');
 // Six independent SQL login preflights MUST succeed before registering
 // any route. The pending reader has its own one-function capability.
 const {pendingPool,expectedPendingLogin,notificationPool,verifyStaff,...b3Configuration}=sqlConfiguration;
 const candidate=await createVerifiedTableChangeB3CustomerFlowCandidate({
  ...b3Configuration,verifyStaff
 });
 const pendingReader=await createVerifiedPendingTableChangeReader({
  pendingPool,expectedLogin:expectedPendingLogin,verifyStaff
 });
 if(!candidate?.flow||typeof candidate.flow.authorizeVisit!=='function'||
    typeof candidate.flow.quote!=='function'||typeof candidate.flow.confirm!=='function'||
    typeof candidate.tableChange?.request!=='function'||
    typeof candidate.tableChange?.decide!=='function')
  throw Error('invalid_b3_http_composition');
 // Validate the staff guard before registering any route. Never register
 // a customer-only partial surface when the operations guard is invalid.
 const guard=forRoles(['admin','waiter']);
 if(typeof guard!=='function')throw Error('invalid_b3_http_composition');
 if(typeof notificationPool?.connect!=='function')throw Error('invalid_b3_http_composition');
 const notifier=await createTableChangeCommitNotifier({
  pool:notificationPool,expectedLogin:b3Configuration.expectedOperationsLogin
 });
 try{
  registerCustomerProductionFlowHttp(app,{
   cookieAuth,flow:candidate.flow,tableChange:candidate.tableChange,
   tableChangeNotifier:notifier,tableChangeObserveFailure:observeStreamFailure
  });
  registerTableChangeStaffHttp(app,{
   service:candidate.tableChange,forRoles:()=>guard
  });
  registerTableChangeStaffPendingHttp(app,{
   service:pendingReader,forRoles:()=>guard
  });
  app.addHook('onClose',async()=>{await notifier.close();});
  return Object.freeze({mounted:true});
 }catch(error){await notifier.close();throw error;}
}


/**
 * Candidate-only B3 staff JWT gate. The operational personnel JWT is checked
 * cryptographically against an injected trusted JWKS source on EVERY request.
 * A distinct read-only PostgreSQL LOGIN then verifies current staff membership,
 * including suspension/revocation, before any queue read or SQL decision.
 *
 * No caller-provided verify/lookup function or x-ci-staff bypass is accepted.
 * This adapter does not create users/logins, mount production routes or deploy.
 */
export async function mountVerifiedTableChangeB3JwtHttpCandidate(app,{
 staffReaderPool,expectedStaffReaderLogin,issuer,getTrustedKeys,
 ...candidate
}={}){
 const pools=[candidate.customerPool,candidate.operationsPool,
  candidate.confirmationPool,candidate.h6ReadPool,candidate.flowPool,
  candidate.pendingPool,candidate.notificationPool];
 if(!staffReaderPool||typeof staffReaderPool.connect!=='function'||
  typeof staffReaderPool.query!=='function'||
  pools.some(pool=>!pool||pool===staffReaderPool)||
  typeof expectedStaffReaderLogin!=='string'||!expectedStaffReaderLogin||
  typeof issuer!=='string'||!/^https:\/\/[^/]+\/auth\/v1$/.test(issuer)||
  typeof getTrustedKeys!=='function'||candidate.forRoles!==undefined||
  candidate.verifyStaff!==undefined)
  throw Error('invalid_b3_staff_jwt_composition');
 await preflightOrderTransitionStaffIdentity({
  pool:staffReaderPool,role:expectedStaffReaderLogin
 });
 const staffHooks=createStaffProtectedHooksFromPool({
  pool:staffReaderPool,issuer,getTrustedKeys
 });
 // The B3 candidate's restricted staff routes require a single preHandler
 // function. Compose the existing verified JWT and live membership hooks in
 // order; never run the membership/SQL decision after a denied JWT.
 const forRoles=roles=>async(request,reply)=>{
  for(const hook of staffHooks(roles)){
   await hook(request,reply);
   if(reply.sent)return;
  }
 };
 return mountVerifiedTableChangeB3HttpCandidate(app,{...candidate,forRoles,
  verifyStaff:async({verifiedIdentity,verifiedStaff})=>({
   userId:verifiedIdentity.userId,role:verifiedStaff.role
  })});
}
