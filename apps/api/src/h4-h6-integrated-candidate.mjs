import Fastify from 'fastify';
import {registerVerifiedRestrictedOrderOperationsFromPools} from './order-operations-composition.mjs';
import {createStaffProtectedHooksFromPool} from './staff-protected-hooks-from-pool.mjs';
import {registerH6CandidateHttp} from './h6-candidate-composition.mjs';

// Dormant, explicitly opted-in integration candidate for isolated H4/H6 tests.
// No environment reads, default bootstrap imports, listeners or deployments.
// Both H4 and H6 retain their independently preflighted SQL identities.
export async function createH4H6IntegratedCandidate({h4,h6}={}) {
 if(!h4||!h6||typeof h4!=='object'||typeof h6!=='object'||
    !h4.staffPool||!h4.operationsPool||!h6.operationsPool||
    h4.operationsPool===h6.operationsPool||
    h4.staffPool===h6.operationsPool||
    h6.forRoles!==undefined||
    h6.customerPool===h6.providerPool||h6.customerPool===h6.operationsPool||
    h6.providerPool===h6.operationsPool||
    h4.staffPool===h6.customerPool||h4.staffPool===h6.providerPool||
    h4.operationsPool===h6.customerPool||h4.operationsPool===h6.providerPool||
    !h6.customerPool||!h6.providerPool||
    (h6.notifierPool!==undefined&&
      (h6.notifierPool===h4.staffPool||h6.notifierPool===h4.operationsPool||
       h6.notifierPool===h6.customerPool||h6.notifierPool===h6.providerPool||
       typeof h6.notifierPool?.connect!=='function'))||
    [h4.staffPool,h4.operationsPool,h6.customerPool,h6.providerPool,h6.operationsPool]
      .some(pool=>!pool||typeof pool.connect!=='function'))
  throw Error('invalid_h4_h6_candidate_isolation');
 const app=Fastify({logger:false,trustProxy:false});
 let h6Registration;
 try {
  // H6 is deliberately given the same cryptographic staff configuration
  // as H4. A caller cannot inject a permissive test-only H6 role hook.
  const forRoles=createStaffProtectedHooksFromPool({
   pool:h4.staffPool,issuer:h4.issuer,getTrustedKeys:h4.getTrustedKeys,
   verify:h4.verify,observe:h4.observe,
  });
  await registerVerifiedRestrictedOrderOperationsFromPools(app,h4);
  h6Registration=await registerH6CandidateHttp(app,{...h6,forRoles});
  app.addHook('onClose',async()=>{await h6Registration.close();});
  await app.ready();
  return app;
 }catch(error){
  try{await h6Registration?.close();}catch{}
  try{await app.close();}catch{}
  throw error;
 }
}
