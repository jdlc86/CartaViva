// Opt-in authentication hook for future customer-only HTTP routes.
// No endpoint or credential storage is installed by importing this module.
export function createCustomerProtectedHook({verifyCustomerSession}={}){
 if(typeof verifyCustomerSession!=='function')
  throw Error('invalid_customer_auth_verifier');
 return async function customerProtectedHook(request,reply){
  const header=request?.headers?.authorization;
  if(typeof header!=='string'||!/^Bearer [A-Za-z0-9_-]{43}$/.test(header)){
   reply.code(401).send({error:'unauthorized'});
   return;
  }
  // A public ID, alias or client-provided UUID must never grant access.
  const identity=await verifyCustomerSession(header.slice(7));
  if(!identity||typeof identity.customerId!=='string'||
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identity.customerId)){
   reply.code(401).send({error:'unauthorized'});
   return;
  }
  // Expose only server-verified internal identity, not bearer or public ID.
  request.customerIdentity=Object.freeze({customerId:identity.customerId});
 };
}
