import Fastify from 'fastify';
import {assertCustomerProductionSqlCapabilities} from './customer-production-sql-preflight.mjs';
import {preflightOrderTransitionStaffIdentity,
 preflightOrderOperationsRuntimeIdentity} from './order-operations-identity-preflight.mjs';
import {registerVerifiedCustomerProductionApp} from './customer-production-app.mjs';
import {registerVerifiedRestrictedOrderOperationsFromPools} from './order-operations-composition.mjs';
import {assertIsolatedCustomerPoolIdentities} from './isolated-pool-identity-preflight.mjs';
import {assertIsolatedCustomerSqlCapabilities} from './isolated-customer-sql-capabilities-preflight.mjs';

// Explicit opt-in single-restaurant H3/H4 HTTP composition. Six distinct
// restricted SQL pools are supplied and owned by the caller. This factory
// does not listen, read env, provision credentials or activate production.
export async function createVerifiedRestaurantFlowCandidate({customer,operations}={}){
 const app=Fastify({logger:false,trustProxy:false});
 try {
  if(!customer||!operations)throw Error('invalid_restaurant_flow_configuration');
  const pools=[customer.catalogReaderPool,customer.registrationPool,customer.sessionPool,customer.flowPool,
   operations.staffPool,operations.operationsPool];
  if(pools.some(pool=>!pool||typeof pool.connect!=='function')||
     new Set(pools).size!==6)throw Error('restaurant_flow_pool_isolation_required');
  const names=[customer.expectedCatalogLogin,customer.expectedRegistrationLogin,customer.expectedSessionLogin,
   customer.expectedFlowLogin,operations.staffRole,operations.operationsRole];
  if(names.some(name=>typeof name!=='string'||!name)||
     new Set(names).size!==6)throw Error('restaurant_flow_role_isolation_required');
  // Verify all six identities before registering any customer or staff route.
  // This prevents an H4 failure from leaving an H3-only partial app.
  await assertCustomerProductionSqlCapabilities(customer);
  await assertIsolatedCustomerPoolIdentities({
   catalogReaderPool:customer.catalogReaderPool,orderWriterPool:customer.flowPool,
   expectedCatalogLogin:customer.expectedCatalogLogin,
   expectedOrderLogin:customer.expectedFlowLogin
  });
  await assertIsolatedCustomerSqlCapabilities({
   catalogReaderPool:customer.catalogReaderPool,orderWriterPool:customer.flowPool,
   expectedCatalogLogin:customer.expectedCatalogLogin,
   expectedOrderLogin:customer.expectedFlowLogin
  });
  await preflightOrderTransitionStaffIdentity({pool:operations.staffPool,role:operations.staffRole});
  await preflightOrderOperationsRuntimeIdentity({pool:operations.operationsPool,role:operations.operationsRole});
  // Readiness must cover H4 as well as H3 after startup. H3's own /ready
  // checks the customer principals; this hook additionally fences the staff
  // and operations principals if privileges drift after registration.
  app.addHook('onRequest',async(request,reply)=>{
   if(request.method!=='GET'||request.url.split('?')[0]!=='/ready')return;
   reply.header('Cache-Control','no-store');
   try {
    await preflightOrderTransitionStaffIdentity({
     pool:operations.staffPool,role:operations.staffRole});
    await preflightOrderOperationsRuntimeIdentity({
     pool:operations.operationsPool,role:operations.operationsRole});
   }catch{
    return reply.code(503).send({status:'unavailable'});
   }
  });
  await registerVerifiedCustomerProductionApp(app,customer);
  await registerVerifiedRestrictedOrderOperationsFromPools(app,operations);
  await app.ready();
  return app;
 }catch(error){
  await app.close();
  throw error;
 }
}
