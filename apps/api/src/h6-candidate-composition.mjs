import {createRoleScopedPostgresTransaction} from './role-scoped-postgres.mjs';
import {registerCustomerProductionFlowHttp} from './customer-production-http.mjs';
import {createH6CustomerPaymentFlow} from './h6-customer-payment-flow.mjs';
import {registerH6CustomerEventStreamHttp,registerH6StaffEventStreamHttp,
 createPostgresH6OutboxNotifier} from './h6-event-stream.mjs';
import {createH6OperationsCoordinator} from './h6-operations-coordinator.mjs';
import {registerH6OperationsHttp} from './h6-operations-http.mjs';
import {createH6CustomerEventRepository,createH6OperationsRepository,ACK_DISPATCH_H6_SQL,
 REPORT_INCIDENT_H6_SQL,RESOLVE_INCIDENT_H6_SQL,SETTLE_CASH_H6_SQL,READ_STAFF_EVENTS_H6_SQL,
 REFUND_CASH_H6_SQL,READ_CUSTOMER_EVENTS_H6_SQL,MANAGE_PICKUP_TASK_H6_SQL} from './h6-operations-repository.mjs';
import {createH6PaymentOrchestrator} from './h6-payment-orchestrator.mjs';
import {createH6ProviderRepository,RECORD_AUTHORIZATION_H6_SQL,REQUEST_CAPTURE_H6_SQL,
 RECORD_CAPTURE_H6_SQL,RECORD_CAPTURE_COMPENSATION_H6_SQL,INGEST_STRIPE_WEBHOOK_H6_SQL,
 RECORD_REFUND_H6_SQL,REQUEST_REFUND_H6_SQL,REQUEST_RELEASE_H6_SQL,RECORD_RELEASE_H6_SQL}
 from './h6-provider-repository.mjs';
import {assertH6SqlCapabilities} from './h6-sql-preflight.mjs';

const customerSql=new Set([READ_CUSTOMER_EVENTS_H6_SQL]);
const providerSql=new Set([RECORD_AUTHORIZATION_H6_SQL,REQUEST_CAPTURE_H6_SQL,
 RECORD_CAPTURE_H6_SQL,RECORD_CAPTURE_COMPENSATION_H6_SQL,INGEST_STRIPE_WEBHOOK_H6_SQL,
 RECORD_REFUND_H6_SQL,REQUEST_REFUND_H6_SQL,REQUEST_RELEASE_H6_SQL,RECORD_RELEASE_H6_SQL]);
const operationsSql=new Set([ACK_DISPATCH_H6_SQL,REPORT_INCIDENT_H6_SQL,
 RESOLVE_INCIDENT_H6_SQL,SETTLE_CASH_H6_SQL,REFUND_CASH_H6_SQL,READ_STAFF_EVENTS_H6_SQL,
 MANAGE_PICKUP_TASK_H6_SQL]);

// Explicitly dormant composition: it opens only the injected LISTEN connection,
// never reads environment variables, creates credentials, starts a worker or
// imports server.mjs. The approved bootstrap must first provide authenticated
// HTTP hooks and the already-preflighted H3 customer flow.
export async function registerH6CandidateHttp(app,{cookieAuth,forRoles,customerFlow,stripe,
 customerPool,providerPool,operationsPool,notifierPool=operationsPool,
 expectedCustomerLogin,expectedProviderLogin,expectedOperationsLogin,issueStaffCapability,
 clock}={}){
 if(!app||!cookieAuth||typeof forRoles!=='function'||!customerFlow||!stripe||
    typeof issueStaffCapability!=='function'||!notifierPool||typeof notifierPool.connect!=='function')
  throw Error('invalid_h6_candidate_composition');
 await assertH6SqlCapabilities({customerPool,providerPool,operationsPool,
  expectedCustomerLogin,expectedProviderLogin,expectedOperationsLogin});
 const customerTx=createRoleScopedPostgresTransaction({pool:customerPool,
  role:'sabora_h6_customer_runtime',allowedSql:customerSql});
 const providerTx=createRoleScopedPostgresTransaction({pool:providerPool,
  role:'sabora_h6_provider_runtime',allowedSql:providerSql});
 const operationsTx=createRoleScopedPostgresTransaction({pool:operationsPool,
  role:'sabora_h6_operations_runtime',allowedSql:operationsSql});
 const provider=createH6ProviderRepository({withTransaction:providerTx});
 const payments=createH6PaymentOrchestrator({stripe,repository:provider,
  ...(clock===undefined?{}:{clock})});
 const flow=createH6CustomerPaymentFlow({flow:customerFlow,payments});
 const events=createH6CustomerEventRepository({withTransaction:customerTx});
 const operationsRepository=createH6OperationsRepository({withTransaction:operationsTx});
 const operations=createH6OperationsCoordinator({repository:operationsRepository,
  issueCapability:issueStaffCapability});
 const notifier=await createPostgresH6OutboxNotifier({pool:notifierPool});
 try{
  registerCustomerProductionFlowHttp(app,{cookieAuth,flow});
  registerH6OperationsHttp(app,{forRoles,operations});
  registerH6CustomerEventStreamHttp(app,{cookieAuth,events,subscribeCommitted:notifier.subscribe});
  registerH6StaffEventStreamHttp(app,{forRoles,events:operationsRepository,
   issueCapability:issueStaffCapability,subscribeCommitted:notifier.subscribe});
 }catch(error){await notifier.close();throw error;}
 return Object.freeze({provider,payments,operations,close:()=>notifier.close()});
}
