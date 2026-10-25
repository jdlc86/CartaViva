// Opt-in isolated customer API assembly. No listen(), env, credentials or
// production server import. Caller owns Fastify and both pool lifecycles.
import {registerVerifiedIsolatedCustomerRoutes} from './verified-isolated-customer-composition-candidate.mjs';
export async function registerVerifiedCustomerApiCandidate(app,options={}){
 if(!app||typeof app.get!=='function'||typeof app.post!=='function'||
    typeof app.hasRoute!=='function')
  throw Error('invalid_verified_customer_api');
 // Fail before any registration if an existing endpoint would be overwritten.
 for(const [method,url] of [['GET','/health'],['GET','/ready'],
  ['GET','/api/v1/catalog'],['POST','/api/v1/customer/orders/confirm']]){
  if(app.hasRoute({method,url}))throw Error('verified_customer_api_route_conflict');
 }
 // Preflight must succeed before exposing even health/readiness for this app.
 await registerVerifiedIsolatedCustomerRoutes(app,options);
 app.get('/health',async(_request,reply)=>{
  reply.header('Cache-Control','no-store');
  return {status:'ok',service:'sabora-customer-api-candidate'};
 });
 app.get('/ready',async(_request,reply)=>{
  reply.header('Cache-Control','no-store');
  return {status:'ready',service:'sabora-customer-api-candidate'};
 });
 return Object.freeze({registered:true});
}
