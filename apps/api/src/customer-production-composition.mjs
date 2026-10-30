import {createRoleScopedPostgresTransaction} from './role-scoped-postgres.mjs';
import {createRestrictedCustomerRegistration,REGISTER_CUSTOMER_SQL} from './customer-production-registration.mjs';
import {createCustomerSessionScopedQuery} from './customer-session-scoped-query.mjs';
import {createCustomerSessionVerifier} from './customer-session-verifier.mjs';
import {createCustomerSessionRevoker} from './customer-session-revoker.mjs';
import {createCustomerCookieAuth} from './customer-cookie-session-candidate.mjs';
import {registerCustomerRegistrationCandidate} from './customer-registration-http-candidate.mjs';
import {createCustomerProductionFlow,AUTHORIZE_VISIT_SQL,PREPARE_QUOTE_SQL,
 INSERT_QUOTE_SQL,LOOKUP_ATTEMPT_SQL,PREPARE_CONFIRMATION_SQL,PERSIST_ORDER_SQL,
 READ_H6_PAYMENT_POLICY_SQL,READ_H6_ROUND_SQL,PERSIST_H6_ORDER_SQL}
 from './customer-production-flow.mjs';
import {assertH6RuntimeIdentity} from './h6-sql-preflight.mjs';
import {registerCustomerProductionFlowHttp} from './customer-production-http.mjs';
import {assertCustomerProductionSqlCapabilities} from './customer-production-sql-preflight.mjs';
import {assertIsolatedCustomerPoolIdentities} from './isolated-pool-identity-preflight.mjs';
import {assertIsolatedCustomerSqlCapabilities} from './isolated-customer-sql-capabilities-preflight.mjs';
import {createCatalogScopedQuery} from './catalog-scoped-query.mjs';
import {registerCatalogHttpRoute} from './catalog-http-route.mjs';

const registrationSql=new Set([REGISTER_CUSTOMER_SQL]);
const h6FlowSql=new Set([READ_H6_PAYMENT_POLICY_SQL,READ_H6_ROUND_SQL,PERSIST_H6_ORDER_SQL]);
const flowSql=new Set([AUTHORIZE_VISIT_SQL,PREPARE_QUOTE_SQL,INSERT_QUOTE_SQL,
 LOOKUP_ATTEMPT_SQL,PREPARE_CONFIRMATION_SQL,PERSIST_ORDER_SQL]);

// Dormant production composition. Pools, origin and HMAC custody are supplied
// by a separately approved bootstrap; this module never reads env or connects.
export async function registerCustomerProductionCandidate(app,{
 catalogReaderPool,registrationPool,sessionPool,flowPool,allowedOrigin,secretKey,clock,newId,
 expectedCatalogLogin,expectedRegistrationLogin,expectedSessionLogin,expectedFlowLogin,
 h6CustomerPool=null,expectedH6CustomerLogin=null
}={}){
 const pools=[catalogReaderPool,registrationPool,sessionPool,flowPool,
  ...(h6CustomerPool?[h6CustomerPool]:[])];
 if(Boolean(h6CustomerPool)!==Boolean(expectedH6CustomerLogin))
  throw Error('invalid_h6_customer_composition');
 if(!app||pools.some(pool=>!pool)||new Set(pools).size!==pools.length)
  throw Error('invalid_customer_production_composition');
 await assertCustomerProductionSqlCapabilities({registrationPool,sessionPool,flowPool,
  expectedRegistrationLogin,expectedSessionLogin,expectedFlowLogin});
 await assertIsolatedCustomerPoolIdentities({catalogReaderPool,orderWriterPool:flowPool,
  expectedCatalogLogin,expectedOrderLogin:expectedFlowLogin});
 await assertIsolatedCustomerSqlCapabilities({catalogReaderPool,orderWriterPool:flowPool,
  expectedCatalogLogin,expectedOrderLogin:expectedFlowLogin});
 if(h6CustomerPool)await assertH6RuntimeIdentity({pool:h6CustomerPool,
  expectedLogin:expectedH6CustomerLogin,capability:'sabora_h6_customer_runtime'});
 const registrationTransaction=createRoleScopedPostgresTransaction({
  pool:registrationPool,role:'sabora_customer_registration_runtime',allowedSql:registrationSql
 });
 const sessionQuery=createCustomerSessionScopedQuery({pool:sessionPool});
 const cookieAuth=createCustomerCookieAuth({allowedOrigin,
  verifyCustomerSession:createCustomerSessionVerifier({query:sessionQuery}),
  revokeCustomerSession:createCustomerSessionRevoker({query:sessionQuery})
 });
 const flowTransaction=createRoleScopedPostgresTransaction({
  pool:flowPool,role:'sabora_customer_flow_runtime',allowedSql:flowSql
 });
 const h6Transaction=h6CustomerPool?createRoleScopedPostgresTransaction({
  pool:h6CustomerPool,role:'sabora_h6_customer_runtime',allowedSql:h6FlowSql
 }):null;
 const registration=createRestrictedCustomerRegistration({withTransaction:registrationTransaction});
 const flow=createCustomerProductionFlow({withTransaction:flowTransaction,secretKey,
  ...(h6Transaction?{withH6Transaction:h6Transaction}:{}),
  ...(clock===undefined?{}:{clock}),...(newId===undefined?{}:{newId})});
 registerCatalogHttpRoute(app,{query:createCatalogScopedQuery({pool:catalogReaderPool})});
 registerCustomerRegistrationCandidate(app,{register:registration,allowedOrigin});
 return registerCustomerProductionFlowHttp(app,{cookieAuth,flow});
}
