import {registerCustomerProductionCandidate} from './customer-production-composition.mjs';
import {assertCustomerProductionSqlCapabilities} from './customer-production-sql-preflight.mjs';

// Opt-in H3 customer API assembly for a separately authorized bootstrap.
// The caller owns Fastify, three distinct SQL pools and their lifecycle.
// This module never reads env, listens, provisions roles, or touches the VPS.
export async function registerVerifiedCustomerProductionApp(app,options={}){
 if(!app||typeof app.get!=='function'||typeof app.hasRoute!=='function'||
    typeof app.register!=='function'||typeof options!=='object'||options===null)
  throw Error('invalid_customer_production_app');
 const {registrationPool,sessionPool,flowPool,allowedOrigin,secretKey,
  expectedRegistrationLogin,expectedSessionLogin,expectedFlowLogin}=options;
 const routes=[['GET','/health'],['GET','/ready'],
  ['POST','/api/v1/customer/register'],['GET','/api/v1/customer/session'],
  ['POST','/api/v1/customer/logout'],['POST','/api/v1/customer/visits'],
  ['POST','/api/v1/customer/quotes'],['POST','/api/v1/customer/orders/confirm']];
 if(routes.some(([method,url])=>app.hasRoute({method,url})))
  throw Error('customer_production_app_route_conflict');
 if(typeof allowedOrigin!=='string'||!/^https:\/\/[^/]+$/.test(allowedOrigin)||
    typeof secretKey!=='string'||Buffer.byteLength(secretKey,'utf8')<32)
  throw Error('invalid_customer_production_app');
 const preflight=()=>assertCustomerProductionSqlCapabilities({registrationPool,sessionPool,flowPool,
  expectedRegistrationLogin,expectedSessionLogin,expectedFlowLogin});
 // Preflight BEFORE mounting any public route; registration itself repeats
 // the identity preflight and constructs only restricted transaction wrappers.
 await preflight();
 await registerCustomerProductionCandidate(app,options);
 app.get('/health',async(_request,reply)=>{
  reply.header('Cache-Control','no-store');
  return {status:'ok',service:'sabora-customer-production-candidate'};
 });
 app.get('/ready',async(_request,reply)=>{
  reply.header('Cache-Control','no-store');
  try {await preflight();}
  catch {return reply.code(503).send({status:'unavailable'});}
  return {status:'ready',service:'sabora-customer-production-candidate'};
 });
 return Object.freeze({registered:true,mode:'opt-in-customer-production-candidate'});
}
