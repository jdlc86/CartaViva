import Fastify from 'fastify';
import {createRoleScopedPostgresTransaction} from './role-scoped-postgres.mjs';
import {assertCustomerProductionSqlCapabilities} from './customer-production-sql-preflight.mjs';
import {assertIsolatedCustomerPoolIdentities} from './isolated-pool-identity-preflight.mjs';
import {assertIsolatedCustomerSqlCapabilities} from './isolated-customer-sql-capabilities-preflight.mjs';
import {createRestrictedCustomerRegistration,REGISTER_CUSTOMER_SQL}
 from './customer-production-registration.mjs';
import {registerCustomerRegistrationCandidate} from './customer-registration-http-candidate.mjs';
import {createCustomerSessionScopedQuery} from './customer-session-scoped-query.mjs';
import {createCustomerSessionVerifier} from './customer-session-verifier.mjs';
import {createCustomerSessionRevoker} from './customer-session-revoker.mjs';
import {createCustomerCookieAuth} from './customer-cookie-session-candidate.mjs';
import {createCatalogScopedQuery} from './catalog-scoped-query.mjs';
import {registerCatalogHttpRoute} from './catalog-http-route.mjs';
import {createVerifiedTableChangeB3CustomerFlowCandidate,
 assertB3H6LoginSurface,assertB3CustomerFlowExactSetRole}
 from './table-change-isolated-sql-composition-candidate.mjs';
import {assertF12SqlCapabilities} from './table-change-isolated-sql-preflight-candidate.mjs';
import {assertB3ConfirmationCapabilities} from './table-change-b3-confirmation-preflight-candidate.mjs';
import {createVerifiedPendingTableChangeReader}
 from './table-change-pending-reader-candidate.mjs';
import {assertPendingReaderCapabilities}
 from './table-change-pending-reader-preflight-candidate.mjs';
import {registerCustomerProductionFlowHttp} from './customer-production-http.mjs';
import {registerTableChangeStaffHttp,registerTableChangeStaffPendingHttp}
 from './table-change-http-candidate.mjs';
import {createTableChangeCommitNotifier} from './table-change-state-stream-candidate.mjs';
import {createStaffProtectedHooksFromPool} from './staff-protected-hooks-from-pool.mjs';
import {preflightOrderTransitionStaffIdentity}
 from './order-operations-identity-preflight.mjs';
import {createOrderOperationsCoordinator} from './order-operations-coordinator.mjs';
import {createOrderOperationsRepository,TRANSITION_ORDER_LINE_SQL,
 READ_H6_DELIVERY_BOARD_SQL,READ_ORDER_HISTORY_SQL}
 from './order-operations-repository.mjs';
import {registerOrderOperationsHttp} from './order-operations-http.mjs';
import {assertH6RuntimeIdentity} from './h6-sql-preflight.mjs';
import {createH6CustomerPaymentFlow} from './h6-customer-payment-flow.mjs';
import {createH6PaymentOrchestrator} from './h6-payment-orchestrator.mjs';
import {registerH6StripeWebhookHttp} from './h6-stripe-webhook-http.mjs';
import {createH6ProviderRepository,RECORD_AUTHORIZATION_H6_SQL,LIST_SCHEDULABLE_H6_SQL,
 REQUEST_DUE_CAPTURE_H6_SQL,REQUEST_CAPTURE_H6_SQL,RECORD_CAPTURE_H6_SQL,
 RECORD_CAPTURE_COMPENSATION_H6_SQL,INGEST_STRIPE_WEBHOOK_H6_SQL,RECORD_REFUND_H6_SQL,
 REQUEST_REFUND_H6_SQL,REQUEST_RELEASE_H6_SQL,RECORD_RELEASE_H6_SQL}
 from './h6-provider-repository.mjs';
import {createH6OperationsRepository,createH6CustomerEventRepository,ACK_DISPATCH_H6_SQL,
 REPORT_INCIDENT_H6_SQL,RESOLVE_INCIDENT_H6_SQL,SETTLE_CASH_H6_SQL,REFUND_CASH_H6_SQL,
 READ_STAFF_EVENTS_H6_SQL,READ_CUSTOMER_EVENTS_H6_SQL,MANAGE_PICKUP_TASK_H6_SQL,
 SET_CATALOG_SOLD_OUT_H6_SQL,CLOSE_ACCOUNT_H6_SQL,READ_CASH_ACCOUNTS_H6_SQL}
 from './h6-operations-repository.mjs';
import {createH6OperationsCoordinator} from './h6-operations-coordinator.mjs';
import {registerH6OperationsHttp} from './h6-operations-http.mjs';
import {registerH6CustomerEventStreamHttp,registerH6StaffEventStreamHttp,
 createPostgresH6OutboxNotifier} from './h6-event-stream.mjs';
import {createH6DeferredDispatchScheduler} from './h6-deferred-dispatch-scheduler.mjs';
import {assertM2CustomerEventCapability,assertM2AccountCloseCapability,
 assertM2H4OperationsCapability,M2_CUSTOMER_EVENT_ROLE,M2_ACCOUNT_CLOSE_ROLE,
 M2_H4_OPERATIONS_ROLE} from './m2-runtime-capabilities.mjs';
import {assertM3TablesCapability,assertM3CatalogCapability,
 M3_TABLES_ROLE,M3_CATALOG_ROLE} from './m3-runtime-capabilities.mjs';
import {createM3TablesRepository,createM3CatalogRepository,READ_M3_TABLES_SQL,
 MANAGE_M3_TABLE_SQL,OCCUPANCY_M3_TABLE_SQL,READ_M3_CATALOG_SQL,
 MANAGE_M3_CATALOG_SQL,createM3FinanceRepository,READ_M3_FINANCE_SQL} from './m3-management-repository.mjs';
import {registerM3ManagementHttp} from './m3-management-http.mjs';
import {M5_COMMS_ADMIN_ROLE,M5_COMMS_PUBLIC_ROLE,READ_M5_COMMS_ADMIN_SQL,
 MANAGE_M5_COMMS_SQL,READ_M5_COMMS_PUBLIC_SQL,
 assertM5CommunicationsCapability,createM5CommunicationsRepositories,
 registerM5CommunicationsHttp,createM5CommunicationsStream} from './m5-communications.mjs';

const providerSql=new Set([RECORD_AUTHORIZATION_H6_SQL,LIST_SCHEDULABLE_H6_SQL,
 REQUEST_DUE_CAPTURE_H6_SQL,REQUEST_CAPTURE_H6_SQL,RECORD_CAPTURE_H6_SQL,
 RECORD_CAPTURE_COMPENSATION_H6_SQL,INGEST_STRIPE_WEBHOOK_H6_SQL,RECORD_REFUND_H6_SQL,
 REQUEST_REFUND_H6_SQL,REQUEST_RELEASE_H6_SQL,RECORD_RELEASE_H6_SQL]);
const operationsSql=new Set([ACK_DISPATCH_H6_SQL,REPORT_INCIDENT_H6_SQL,
 RESOLVE_INCIDENT_H6_SQL,SETTLE_CASH_H6_SQL,REFUND_CASH_H6_SQL,READ_STAFF_EVENTS_H6_SQL,
 MANAGE_PICKUP_TASK_H6_SQL,SET_CATALOG_SOLD_OUT_H6_SQL,READ_CASH_ACCOUNTS_H6_SQL]);

function sameIdentity(a,b){
 if(a===b)return true;
 const x=a?.options??{},y=b?.options??{};
 return Boolean((x.user&&x.user===y.user)||
  (x.connectionString&&x.connectionString===y.connectionString));
}
function uniqueCapabilities(pools,logins){
 return pools.every(pool=>pool&&typeof pool.connect==='function')&&
  pools.every((pool,index)=>!pools.slice(index+1).some(other=>sameIdentity(pool,other)))&&
  logins.every(login=>typeof login==='string'&&/^[a-z][a-z0-9_]{0,62}$/.test(login))&&
  new Set(logins).size===logins.length;
}
const staffGuard=forRoles=>roles=>{
 const hooks=forRoles(roles);
 if(!Array.isArray(hooks)||hooks.some(hook=>typeof hook!=='function'))
  throw Error('invalid_m2_staff_guard');
 return async(request,reply)=>{
  for(const hook of hooks){await hook(request,reply);if(reply.sent)return;}
 };
};

// Separate opt-in assembly. It owns Fastify/listeners/scheduler, but never
// reads environment variables, creates LOGINs or imports server.mjs.
export async function createM2RestaurantCandidate({customer,tableChange,staff,h4,h6,
 management=null,eventHeartbeatMs=15_000,enableDeferredDispatch=false,observeFailure=()=>{}}={}){
 const app=Fastify({logger:false,trustProxy:false});
 let tableNotifier,h6Notifier,scheduler,announcementStream,closed=false,operational=false;
 const closeServices=async()=>{
  if(closed)return;closed=true;operational=false;
  await Promise.allSettled([scheduler?.close(),announcementStream?.close(),tableNotifier?.close(),h6Notifier?.close()]);
 };
 try{
  if(!customer||!tableChange||!staff||!h4||!h6||
     typeof customer.allowedOrigin!=='string'||typeof customer.secretKey!=='string'||
     Buffer.byteLength(customer.secretKey,'utf8')<32||
     typeof staff.issuer!=='string'||typeof staff.getTrustedKeys!=='function'||
     typeof h4.issueTransitionCapability!=='function'||typeof h4.issueReadCapability!=='function'||
     typeof h6.issueStaffCapability!=='function'||typeof h6.issueCloseCapability!=='function'||
     !h6.stripe||typeof observeFailure!=='function'||typeof enableDeferredDispatch!=='boolean'||
     (management!==null&&(!management||typeof management!=='object'||
       typeof management.expectedTablesLogin!=='string'||
       typeof management.expectedCatalogLogin!=='string'||
       typeof management.issueTablesCapability!=='function'||
       typeof management.issueCatalogCapability!=='function'||
       typeof management.qr?.secret!=='string'||typeof management.qr?.origin!=='string'||
       typeof management.qr?.restaurantCode!=='string'||
       (management.communications!==undefined&&(
        typeof management.communications!=='object'||!management.communications||
        typeof management.communications.expectedAdminLogin!=='string'||
        typeof management.communications.expectedPublicLogin!=='string'||
        typeof management.communications.issueCapability!=='function'))))||
     !Number.isSafeInteger(eventHeartbeatMs)||eventHeartbeatMs<5_000||eventHeartbeatMs>60_000)
   throw Error('invalid_m2_restaurant_candidate');

  const capabilityPools=[customer.catalogReaderPool,customer.registrationPool,
   customer.sessionPool,customer.flowPool,tableChange.customerPool,tableChange.operationsPool,
   tableChange.confirmationPool,tableChange.h6ReadPool,tableChange.pendingPool,staff.pool,
   h4.operationsPool,h6.providerPool,h6.operationsPool,h6.closePool,h6.eventPool];
  const logins=[customer.expectedCatalogLogin,customer.expectedRegistrationLogin,
   customer.expectedSessionLogin,customer.expectedFlowLogin,tableChange.expectedCustomerLogin,
   tableChange.expectedOperationsLogin,tableChange.expectedConfirmationLogin,
   tableChange.expectedH6ReadLogin,tableChange.expectedPendingLogin,staff.expectedLogin,
   h4.expectedOperationsLogin,h6.expectedProviderLogin,h6.expectedOperationsLogin,
   h6.expectedCloseLogin,h6.expectedEventLogin];
  if(management){
   capabilityPools.push(management.tablesPool,management.catalogPool);
   logins.push(management.expectedTablesLogin,management.expectedCatalogLogin);
   if(management.communications){
    capabilityPools.push(management.communications.adminPool,management.communications.publicPool);
    logins.push(management.communications.expectedAdminLogin,
     management.communications.expectedPublicLogin);
   }
  }
  if(!uniqueCapabilities(capabilityPools,logins)||
     typeof tableChange.notificationPool?.connect!=='function'||
     typeof h6.notifierPool?.connect!=='function')
   throw Error('m2_restaurant_candidate_isolation_required');

  const preflight=async()=>{
   await assertCustomerProductionSqlCapabilities({
    registrationPool:customer.registrationPool,sessionPool:customer.sessionPool,
    flowPool:customer.flowPool,expectedRegistrationLogin:customer.expectedRegistrationLogin,
    expectedSessionLogin:customer.expectedSessionLogin,expectedFlowLogin:customer.expectedFlowLogin
   });
   await assertIsolatedCustomerPoolIdentities({catalogReaderPool:customer.catalogReaderPool,
    orderWriterPool:customer.flowPool,expectedCatalogLogin:customer.expectedCatalogLogin,
    expectedOrderLogin:customer.expectedFlowLogin});
   await assertIsolatedCustomerSqlCapabilities({catalogReaderPool:customer.catalogReaderPool,
    orderWriterPool:customer.flowPool,expectedCatalogLogin:customer.expectedCatalogLogin,
    expectedOrderLogin:customer.expectedFlowLogin});
   await assertB3CustomerFlowExactSetRole({pool:customer.flowPool});
   await assertF12SqlCapabilities({customerPool:tableChange.customerPool,
    operationsPool:tableChange.operationsPool,
    expectedCustomerLogin:tableChange.expectedCustomerLogin,
    expectedOperationsLogin:tableChange.expectedOperationsLogin});
   await assertB3ConfirmationCapabilities({pool:tableChange.confirmationPool,
    expectedLogin:tableChange.expectedConfirmationLogin});
   await assertB3H6LoginSurface({pool:tableChange.h6ReadPool,
    expectedLogin:tableChange.expectedH6ReadLogin});
   await assertPendingReaderCapabilities({pool:tableChange.pendingPool,
    expectedLogin:tableChange.expectedPendingLogin});
   await preflightOrderTransitionStaffIdentity({pool:staff.pool,role:staff.expectedLogin});
   await assertM2H4OperationsCapability({pool:h4.operationsPool,
    expectedLogin:h4.expectedOperationsLogin});
   await assertH6RuntimeIdentity({pool:h6.providerPool,
    expectedLogin:h6.expectedProviderLogin,capability:'sabora_h6_provider_runtime'});
   await assertH6RuntimeIdentity({pool:h6.operationsPool,
    expectedLogin:h6.expectedOperationsLogin,capability:'sabora_h6_operations_runtime'});
   await assertM2AccountCloseCapability({pool:h6.closePool,
    expectedLogin:h6.expectedCloseLogin});
   await assertM2CustomerEventCapability({pool:h6.eventPool,
    expectedLogin:h6.expectedEventLogin});
   if(management){
    await assertM3TablesCapability({pool:management.tablesPool,
     expectedLogin:management.expectedTablesLogin});
    await assertM3CatalogCapability({pool:management.catalogPool,
     expectedLogin:management.expectedCatalogLogin});
    if(management.communications){
     await assertM5CommunicationsCapability({pool:management.communications.adminPool,
      expectedLogin:management.communications.expectedAdminLogin,kind:'admin'});
     await assertM5CommunicationsCapability({pool:management.communications.publicPool,
      expectedLogin:management.communications.expectedPublicLogin,kind:'public'});
    }
   }
   return true;
  };
  await preflight();

  const registrationTx=createRoleScopedPostgresTransaction({pool:customer.registrationPool,
   role:'sabora_customer_registration_runtime',allowedSql:new Set([REGISTER_CUSTOMER_SQL])});
  const sessionQuery=createCustomerSessionScopedQuery({pool:customer.sessionPool});
  const cookieAuth=createCustomerCookieAuth({allowedOrigin:customer.allowedOrigin,
   verifyCustomerSession:createCustomerSessionVerifier({query:sessionQuery}),
   revokeCustomerSession:createCustomerSessionRevoker({query:sessionQuery})});
  const b3=await createVerifiedTableChangeB3CustomerFlowCandidate({
   customerPool:tableChange.customerPool,operationsPool:tableChange.operationsPool,
   confirmationPool:tableChange.confirmationPool,h6ReadPool:tableChange.h6ReadPool,
   flowPool:customer.flowPool,expectedCustomerLogin:tableChange.expectedCustomerLogin,
   expectedOperationsLogin:tableChange.expectedOperationsLogin,
   expectedConfirmationLogin:tableChange.expectedConfirmationLogin,
   expectedH6ReadLogin:tableChange.expectedH6ReadLogin,
   expectedFlowLogin:customer.expectedFlowLogin,hashSession:tableChange.hashSession,
   verifyStaff:({verifiedIdentity,verifiedStaff})=>({userId:verifiedIdentity.userId,
    role:verifiedStaff.role}),secretKey:customer.secretKey
  });
  const pending=await createVerifiedPendingTableChangeReader({
   pendingPool:tableChange.pendingPool,expectedLogin:tableChange.expectedPendingLogin,
   verifyStaff:({verifiedIdentity,verifiedStaff})=>({userId:verifiedIdentity.userId,
    role:verifiedStaff.role})
  });
  const providerTx=createRoleScopedPostgresTransaction({pool:h6.providerPool,
   role:'sabora_h6_provider_runtime',allowedSql:providerSql});
  const operationsTx=createRoleScopedPostgresTransaction({pool:h6.operationsPool,
   role:'sabora_h6_operations_runtime',allowedSql:operationsSql});
  const closeTx=createRoleScopedPostgresTransaction({pool:h6.closePool,
   role:M2_ACCOUNT_CLOSE_ROLE,allowedSql:new Set([CLOSE_ACCOUNT_H6_SQL])});
  const eventTx=createRoleScopedPostgresTransaction({pool:h6.eventPool,
   role:M2_CUSTOMER_EVENT_ROLE,allowedSql:new Set([READ_CUSTOMER_EVENTS_H6_SQL])});
  const h4Tx=createRoleScopedPostgresTransaction({pool:h4.operationsPool,
   role:M2_H4_OPERATIONS_ROLE,allowedSql:new Set([TRANSITION_ORDER_LINE_SQL,
    READ_H6_DELIVERY_BOARD_SQL,READ_ORDER_HISTORY_SQL])});
  const provider=createH6ProviderRepository({withTransaction:providerTx});
  // Signed ingress is optional and restricted to test-mode webhooks.
  // server.mjs remains health-only; no route is exposed by default.
  if(h6.webhook!==undefined&&h6.webhook!==null)
   registerH6StripeWebhookHttp(app,{secret:h6.webhook.secret,providerRepository:provider});
  const payments=createH6PaymentOrchestrator({stripe:h6.stripe,repository:provider});
  const flow=createH6CustomerPaymentFlow({flow:b3.flow,payments});
  const operationsRepository=createH6OperationsRepository({withTransaction:operationsTx});
  const operations=createH6OperationsCoordinator({repository:operationsRepository,
   issueCapability:h6.issueStaffCapability});
  const closeOperations=createH6OperationsCoordinator({
   repository:createH6OperationsRepository({withTransaction:closeTx}),
   issueCapability:h6.issueCloseCapability});
  const composedOperations=Object.freeze({...operations,
   closeAccount:closeOperations.closeAccount});
  const customerEvents=createH6CustomerEventRepository({withTransaction:eventTx});
  const forRoles=createStaffProtectedHooksFromPool({pool:staff.pool,issuer:staff.issuer,
   getTrustedKeys:staff.getTrustedKeys,...(staff.verify?{verify:staff.verify}:{}),
   ...(staff.observe?{observe:staff.observe}:{})});
  const oneGuard=staffGuard(forRoles);
  const h4Operations=createOrderOperationsCoordinator({withTransaction:h4Tx,
   repository:createOrderOperationsRepository({deliveryBoardCandidate:true}),
   issueTransitionCapability:h4.issueTransitionCapability,
   issueReadCapability:h4.issueReadCapability});
  let m3Tables,m3Catalog,m3Finance,m5Communications;
  if(management){
   const tablesTx=createRoleScopedPostgresTransaction({pool:management.tablesPool,
    role:M3_TABLES_ROLE,allowedSql:new Set([READ_M3_TABLES_SQL,MANAGE_M3_TABLE_SQL,
     OCCUPANCY_M3_TABLE_SQL])});
   const catalogTx=createRoleScopedPostgresTransaction({pool:management.catalogPool,
    role:M3_CATALOG_ROLE,allowedSql:new Set([READ_M3_CATALOG_SQL,MANAGE_M3_CATALOG_SQL,READ_M3_FINANCE_SQL])});
   m3Tables=createM3TablesRepository({withTransaction:tablesTx,
    issueCapability:management.issueTablesCapability});
   m3Catalog=createM3CatalogRepository({withTransaction:catalogTx,
    issueCapability:management.issueCatalogCapability});
   m3Finance=createM3FinanceRepository({withTransaction:catalogTx,
    issueCapability:management.issueCatalogCapability,
    timeZone:management.dashboardTimeZone??null});
   if(management.communications){
    const adminCommsTx=createRoleScopedPostgresTransaction({
     pool:management.communications.adminPool,role:M5_COMMS_ADMIN_ROLE,
     allowedSql:new Set([READ_M5_COMMS_ADMIN_SQL,MANAGE_M5_COMMS_SQL])});
    const publicCommsTx=createRoleScopedPostgresTransaction({
     pool:management.communications.publicPool,role:M5_COMMS_PUBLIC_ROLE,
     allowedSql:new Set([READ_M5_COMMS_PUBLIC_SQL])});
    m5Communications=createM5CommunicationsRepositories({
     adminTx:adminCommsTx,publicTx:publicCommsTx,
     issueCapability:management.communications.issueCapability});
   }
  }

  tableNotifier=await createTableChangeCommitNotifier({pool:tableChange.notificationPool,
   expectedLogin:tableChange.expectedOperationsLogin});
  h6Notifier=await createPostgresH6OutboxNotifier({pool:h6.notifierPool,onLost:error=>{
   operational=false;try{observeFailure(error);}catch{}
   if(scheduler)void scheduler.close().catch(()=>{});
  }});

  registerCatalogHttpRoute(app,{query:createCatalogScopedQuery({pool:customer.catalogReaderPool})});
  registerCustomerRegistrationCandidate(app,{allowedOrigin:customer.allowedOrigin,
   register:createRestrictedCustomerRegistration({withTransaction:registrationTx})});
  registerCustomerProductionFlowHttp(app,{cookieAuth,flow,tableChange:b3.tableChange,
   tableChangeNotifier:tableNotifier,tableChangeObserveFailure:observeFailure});
  registerTableChangeStaffHttp(app,{service:b3.tableChange,forRoles:oneGuard});
  registerTableChangeStaffPendingHttp(app,{service:pending,forRoles:oneGuard});
  registerOrderOperationsHttp(app,{forRoles:oneGuard,operations:h4Operations,
   legacyPickupDisabled:true});
  registerH6OperationsHttp(app,{forRoles:oneGuard,operations:composedOperations});
  registerH6CustomerEventStreamHttp(app,{cookieAuth,events:customerEvents,
   subscribeCommitted:h6Notifier.subscribe,heartbeatMs:eventHeartbeatMs});
  registerH6StaffEventStreamHttp(app,{forRoles:oneGuard,events:operationsRepository,
   issueCapability:h6.issueStaffCapability,subscribeCommitted:h6Notifier.subscribe,
   heartbeatMs:eventHeartbeatMs});
  if(management)registerM3ManagementHttp(app,{forRoles:oneGuard,tables:m3Tables,
   catalog:m3Catalog,finance:m3Finance,qr:management.qr,observeFailure});
  if(m5Communications){
   announcementStream=await createM5CommunicationsStream({
    pool:management.communications.publicPool,
    readPublic:m5Communications.readPublic,onFailure:observeFailure});
   registerM5CommunicationsHttp(app,{forRoles:oneGuard,
    repositories:m5Communications,stream:announcementStream,observeFailure});
  }

  if(enableDeferredDispatch){
   scheduler=createH6DeferredDispatchScheduler({
    listSchedulable:options=>provider.listSchedulable(options),
    dispatchDue:({orderId})=>payments.captureOrDispatch({orderId,serverDue:true}),
    subscribeCommitted:h6Notifier.subscribe,onFailure:observeFailure
   });
   await scheduler.start();
  }

  app.get('/health',async(_request,reply)=>{
   reply.header('Cache-Control','no-store');
   return {status:'ok',service:management?'sabora-m3-candidate':'sabora-m2-candidate',mode:'opt-in'};
  });
  app.get('/ready',async(_request,reply)=>{
   reply.header('Cache-Control','no-store');
   if(!operational)return reply.code(503).send({status:'unavailable'});
   try{await preflight();}
   catch{return reply.code(503).send({status:'unavailable'});}
   return {status:'ready',service:management?'sabora-m3-candidate':'sabora-m2-candidate',mode:'opt-in'};
  });
  app.addHook('onClose',closeServices);
  await app.ready();operational=true;
  let closePromise=null;
  return Object.freeze({app,mode:management?'opt-in-h3-h6-m3-candidate':'opt-in-h3-h6-m2-candidate',
   close(){if(!closePromise)closePromise=app.close();return closePromise;},
   async listen({host='127.0.0.1',port=0}={}){
    if(host!=='127.0.0.1'||!Number.isSafeInteger(port)||port<0||port>65535)
     throw Error('invalid_m2_candidate_listener');
    return app.listen({host,port});
   }
  });
 }catch(error){
  await closeServices();try{await app.close();}catch{}
  throw error;
 }
}
