import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';
import {createRestrictedCustomerRegistration,REGISTER_CUSTOMER_SQL} from '../../apps/api/src/customer-production-registration.mjs';
import {hashCustomerSessionToken} from '../../apps/api/src/customer-session.mjs';
import {createCustomerProductionFlow,AUTHORIZE_VISIT_SQL,PREPARE_QUOTE_SQL,INSERT_QUOTE_SQL,
 LOOKUP_ATTEMPT_SQL,PREPARE_CONFIRMATION_SQL,READ_H6_PAYMENT_POLICY_SQL,READ_H6_ROUND_SQL,
 PERSIST_H6_ORDER_SQL} from '../../apps/api/src/customer-production-flow.mjs';
import {createH6ProviderRepository,RECORD_AUTHORIZATION_H6_SQL,REQUEST_CAPTURE_H6_SQL,
 RECORD_CAPTURE_H6_SQL,RECORD_CAPTURE_COMPENSATION_H6_SQL,INGEST_STRIPE_WEBHOOK_H6_SQL,
 RECORD_REFUND_H6_SQL,REQUEST_REFUND_H6_SQL,REQUEST_RELEASE_H6_SQL,RECORD_RELEASE_H6_SQL}
 from '../../apps/api/src/h6-provider-repository.mjs';
import {createH6OperationsRepository,ACK_DISPATCH_H6_SQL,REPORT_INCIDENT_H6_SQL,
 RESOLVE_INCIDENT_H6_SQL,SETTLE_CASH_H6_SQL,READ_STAFF_EVENTS_H6_SQL,
 REFUND_CASH_H6_SQL,READ_CUSTOMER_EVENTS_H6_SQL,createH6CustomerEventRepository}
 from '../../apps/api/src/h6-operations-repository.mjs';
import {createH6StaffCapabilityIssuer} from '../../apps/api/src/h6-staff-capability.mjs';
import {assertH6SqlCapabilities} from '../../apps/api/src/h6-sql-preflight.mjs';
import {createTableQrCredential} from '../../apps/api/src/table-qr-credential.mjs';
import {parseTableQrPayload} from '../../packages/contracts/src/index.js';

const url=process.env.SABORA_CI_PG_URL,modulePath=process.env.SABORA_CI_PG_MODULE;
if(!url||!modulePath||process.env.GITHUB_ACTIONS!=='true'||!isDisposablePgModulePath(modulePath))
 throw Error('disposable_pg17_harness_required');
const parsed=new URL(url);
if(parsed.hostname!=='127.0.0.1'||parsed.username!=='postgres'||parsed.pathname!=='/postgres'||
 parsed.password!=='sabora_ci_ephemeral_only'||parsed.search||parsed.hash||!parsed.port)
 throw Error('unsafe_pg17_harness_target');
const require=createRequire(import.meta.url),{Pool}=require(modulePath);
const poolOptions={max:8,connectionTimeoutMillis:3000,idleTimeoutMillis:1000,
 options:'-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=20000'};
const admin=new Pool({connectionString:url,...poolOptions});
const loginUrl=(user,password)=>{const next=new URL(url);next.username=user;next.password=password;return next.toString();};
let registrationPool,customerPool,providerPool,operationsPool;
test.after(async()=>{await Promise.allSettled([registrationPool?.end(),customerPool?.end(),
 providerPool?.end(),operationsPool?.end()]);await admin.end();});

const passwords={registration:'h6-registration-ci-1',customer:'h6-customer-ci-2',
 provider:'h6-provider-ci-3',operations:'h6-operations-ci-4'};
const tableId='a6200000-0000-4000-8000-000000000001';
const itemId='a6200000-0000-4000-8000-000000000002';
const freeItemId='a6200000-0000-4000-8000-000000000006';
const kitchenId='a6200000-0000-4000-8000-000000000003';
const adminId='a6200000-0000-4000-8000-000000000004';
const waiterId='a6200000-0000-4000-8000-000000000005';
const keyId='h6_pg17_key_2026',signingSecret=randomBytes(32);
const qr=createTableQrCredential({origin:'https://sabora.example',restaurantCode:'SABORA',tableId,
 randomBytesImpl:()=>Buffer.alloc(32,23)});
const qrToken=parseTableQrPayload(qr.payload,{expectedOrigin:'https://sabora.example',
 expectedRestaurantCode:'SABORA'}).token;
const secretKey='h6-customer-basket-acceptance-ci-key-at-least-32';
const selection={options:{},extras:[]};

test('H6 runs atomically under split least-privilege PG17 principals',async()=>{
 await admin.query(`
  CREATE ROLE sabora_h6_registration_ci LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${passwords.registration}';
  CREATE ROLE sabora_h6_customer_ci LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${passwords.customer}';
  CREATE ROLE sabora_h6_provider_ci LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${passwords.provider}';
  CREATE ROLE sabora_h6_operations_ci LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${passwords.operations}';
  GRANT sabora_customer_registration_runtime TO sabora_h6_registration_ci;
  GRANT sabora_customer_flow_runtime,sabora_h6_customer_runtime TO sabora_h6_customer_ci;
  GRANT sabora_h6_provider_runtime TO sabora_h6_provider_ci;
  GRANT sabora_h6_operations_runtime TO sabora_h6_operations_ci;
 `);
 registrationPool=new Pool({connectionString:loginUrl('sabora_h6_registration_ci',passwords.registration),...poolOptions});
 customerPool=new Pool({connectionString:loginUrl('sabora_h6_customer_ci',passwords.customer),...poolOptions});
 providerPool=new Pool({connectionString:loginUrl('sabora_h6_provider_ci',passwords.provider),...poolOptions});
 operationsPool=new Pool({connectionString:loginUrl('sabora_h6_operations_ci',passwords.operations),...poolOptions});

 await assertH6SqlCapabilities({customerPool,providerPool,operationsPool,
  expectedCustomerLogin:'sabora_h6_customer_ci',expectedProviderLogin:'sabora_h6_provider_ci',
  expectedOperationsLogin:'sabora_h6_operations_ci'});

 for(const pool of [customerPool,providerPool,operationsPool]){
  await assert.rejects(pool.query('SELECT * FROM sabora.event_outbox'),/permission denied/);
  await assert.rejects(pool.query('SET ROLE sabora_h6_fn_owner'),/permission denied/);
 }
 await assert.rejects(customerPool.query(`SET ROLE sabora_h6_operations_runtime`),/permission denied/);
 await assert.rejects(operationsPool.query(`SET ROLE sabora_h6_customer_runtime`),/permission denied/);

 await admin.query(`INSERT INTO sabora.dining_tables
  (id,number,capacity,qr_token_hash,ordering_state,grouping_window_seconds)
  VALUES ($1,976001,4,$2,'open',300)`,[tableId,qr.tokenHash]);
 await admin.query(`INSERT INTO sabora.catalog_items
  (id,draft,draft_revision,published_revision,published_snapshot,published_at)
  VALUES ($1,$2,1,1,$2,clock_timestamp()),($3,$4,1,1,$4,clock_timestamp())`,
  [itemId,{name:'Menú H6',category:'Primeros',priceCents:2400,allergens:[],options:[],extras:[],discount:null},
   freeItemId,{name:'Detalle de cortesía',category:'Postres',priceCents:0,allergens:[],options:[],extras:[],discount:null}]);
 await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state) VALUES
  ($1,'kitchen','active'),($2,'admin','active'),($3,'waiter','active')`,[kitchenId,adminId,waiterId]);
 await admin.query(`INSERT INTO sabora.order_operation_signing_keys(key_id,hmac_key,not_before,expires_at)
  VALUES($1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')`,
  [keyId,signingSecret]);

 const registrationTx=createRoleScopedPostgresTransaction({pool:registrationPool,
  role:'sabora_customer_registration_runtime',allowedSql:new Set([REGISTER_CUSTOMER_SQL])});
 const register=createRestrictedCustomerRegistration({withTransaction:registrationTx});
 const customer=await register({alias:'Cliente H6',company:null});
 const flowTx=createRoleScopedPostgresTransaction({pool:customerPool,role:'sabora_customer_flow_runtime',
  allowedSql:new Set([AUTHORIZE_VISIT_SQL,PREPARE_QUOTE_SQL,INSERT_QUOTE_SQL,
   LOOKUP_ATTEMPT_SQL,PREPARE_CONFIRMATION_SQL])});
 const h6CustomerTx=createRoleScopedPostgresTransaction({pool:customerPool,role:'sabora_h6_customer_runtime',
  allowedSql:new Set([READ_H6_PAYMENT_POLICY_SQL,READ_H6_ROUND_SQL,PERSIST_H6_ORDER_SQL,
   READ_CUSTOMER_EVENTS_H6_SQL])});
 const flow=createCustomerProductionFlow({withTransaction:flowTx,withH6Transaction:h6CustomerTx,secretKey});
 const events=createH6CustomerEventRepository({withTransaction:h6CustomerTx});
 const providerTx=createRoleScopedPostgresTransaction({pool:providerPool,role:'sabora_h6_provider_runtime',
  allowedSql:new Set([RECORD_AUTHORIZATION_H6_SQL,REQUEST_CAPTURE_H6_SQL,RECORD_CAPTURE_H6_SQL,
   RECORD_CAPTURE_COMPENSATION_H6_SQL,INGEST_STRIPE_WEBHOOK_H6_SQL,RECORD_REFUND_H6_SQL,
   REQUEST_REFUND_H6_SQL,REQUEST_RELEASE_H6_SQL,RECORD_RELEASE_H6_SQL])});
 const provider=createH6ProviderRepository({withTransaction:providerTx});
 const operationsTx=createRoleScopedPostgresTransaction({pool:operationsPool,role:'sabora_h6_operations_runtime',
  allowedSql:new Set([ACK_DISPATCH_H6_SQL,REPORT_INCIDENT_H6_SQL,RESOLVE_INCIDENT_H6_SQL,
   SETTLE_CASH_H6_SQL,REFUND_CASH_H6_SQL,READ_STAFF_EVENTS_H6_SQL])});
 const operations=createH6OperationsRepository({withTransaction:operationsTx});
 const issueKitchen=createH6StaffCapabilityIssuer({keyId,secret:signingSecret,
  databaseRole:'sabora_h6_operations_ci'});

 const visit=await flow.authorizeVisit({customerSessionToken:customer.token,tableId,qrToken});
 assert.deepEqual(visit.paymentPolicy,{requirePayAsOrdered:false,version:1});
 const quote=await flow.quote({customerSessionToken:customer.token,tableId,qrToken,
  visitId:visit.visitId,basketId:visit.basketId,lines:[{itemId,selection,quantity:1}]});
 const request={customerSessionToken:customer.token,tableId,qrToken,visitId:visit.visitId,
  basketId:visit.basketId,requestKey:'h6_confirm_request_0001',paymentMode:'pay_now',
  lines:[{quoteId:quote.lines[0].quoteId,itemId,selection,quantity:1}]};
 const concurrent=await Promise.all([flow.confirm(request),flow.confirm(request)]);
 assert.deepEqual(concurrent.map(result=>result.status).sort(),['confirmed','replayed']);
 assert.equal(concurrent[0].orderId,concurrent[1].orderId);
 assert.equal(concurrent[0].accountId,concurrent[1].accountId);
 const order=concurrent[0],roundId=order.roundId;
 assert.equal(order.amountCents,2400);
 assert.equal(order.paymentMode,'pay_now');
 const persisted=await admin.query(`SELECT
  (SELECT count(*)::integer FROM sabora.orders WHERE id=$1) AS orders,
  (SELECT count(*)::integer FROM sabora.order_rounds WHERE order_id=$1) AS rounds,
  (SELECT count(*)::integer FROM sabora.payment_attempts p JOIN sabora.order_rounds r ON r.id=p.round_id WHERE r.order_id=$1) AS payments,
  (SELECT count(*)::integer FROM sabora.kitchen_dispatches WHERE order_id=$1) AS dispatches`,[order.orderId]);
 assert.deepEqual(persisted.rows,[{orders:1,rounds:1,payments:1,dispatches:1}]);

 const authorized=await provider.recordAuthorization({orderId:order.orderId,outcome:'authorized',
  providerIntentId:'pi_H6Pg17Intent01',captureBefore:new Date(Date.now()+86400000)});
 assert.equal(authorized.payment_state,'authorized');
 const capture=await provider.requestCapture({orderId:order.orderId,now:new Date(Date.now()+360000)});
 assert.equal(capture.action,'capture');
 const captured=await provider.recordCapture({orderId:order.orderId,outcome:'captured',
  providerChargeId:'ch_H6Pg17Charge01'});
 assert.equal(captured.dispatch_state,'requested');

 const dispatchId=captured.dispatch_id;
 const line=(await admin.query('SELECT id FROM sabora.order_lines WHERE order_id=$1',[order.orderId])).rows[0].id;
 await assert.rejects(admin.query(`UPDATE sabora.order_lines SET status='preparing' WHERE id=$1`,[line]),
  /kitchen_dispatch_not_acknowledged/);
 const ackCapability=issueKitchen({actorId:kitchenId,staffRole:'kitchen',action:'ack_dispatch',
  targetId:dispatchId,correlationId:'h6_ack_concurrent_0001'});
 const acknowledgements=await Promise.all([
  operations.acknowledgeDispatch({dispatchId,capability:ackCapability}),
  operations.acknowledgeDispatch({dispatchId,capability:ackCapability})
 ]);
 assert.deepEqual(acknowledgements.map(value=>value.repeated).sort(),[false,true]);
 await admin.query(`UPDATE sabora.order_lines SET status='preparing' WHERE id=$1`,[line]);

 const sessionHash=hashCustomerSessionToken(customer.token);
 const backlog=await events.read({sessionHash,tableId,visitId:visit.visitId,
  accountId:order.accountId,afterCursor:0,limit:100});
 assert.ok(backlog.events.some(event=>event.type==='sabora.payment.captured'));
 assert.ok(backlog.events.some(event=>event.type==='sabora.kitchen.dispatch_acknowledged'));
 const empty=await events.read({sessionHash,tableId,visitId:visit.visitId,accountId:order.accountId,
  afterCursor:Number(backlog.nextCursor),limit:100});
 assert.deepEqual(empty.events,[]);

 const kitchenIncidentCap=issueKitchen({actorId:kitchenId,staffRole:'kitchen',action:'report_incident',
  targetId:roundId,correlationId:'h6_kitchen_incident_001'});
 const incident=await operations.reportIncident({roundId,lineId:line,origin:'kitchen',
  reason:'Plato no apto para servir',affectedCents:400,capability:kitchenIncidentCap});
 assert.equal(incident.state,'awaiting_admin');
 const rejectCap=issueKitchen({actorId:adminId,staffRole:'admin',action:'resolve_incident',
  targetId:incident.incidentId,correlationId:'h6_incident_reject_001'});
 await assert.rejects(operations.resolveIncident({incidentId:incident.incidentId,resolution:'reject',
  reason:'No procede',capability:rejectCap}),/kitchen_refund_cannot_be_denied/);
 const approveCap=issueKitchen({actorId:adminId,staffRole:'admin',action:'resolve_incident',
  targetId:incident.incidentId,correlationId:'h6_incident_approve_001'});
 const resolution=await operations.resolveIncident({incidentId:incident.incidentId,resolution:'approve',
  reason:'Devolución obligatoria de cocina',capability:approveCap});
 assert.equal(resolution.state,'refund_due');
 const refund=(await admin.query('SELECT id FROM sabora.refund_attempts WHERE incident_id=$1',
  [incident.incidentId])).rows[0];
 assert.equal((await provider.requestRefund({refundAttemptId:refund.id})).action,'refund');
 assert.equal((await provider.recordRefund({refundAttemptId:refund.id,outcome:'succeeded',
  providerRefundId:'re_H6Pg17Refund01'})).state,'succeeded');
 assert.equal((await provider.requestRefund({refundAttemptId:refund.id})).action,'done');
 assert.equal((await admin.query('SELECT state FROM sabora.incident_cases WHERE id=$1',
  [incident.incidentId])).rows[0].state,'resolved');
 const refundWebhook=await provider.ingestWebhook({eventId:'evt_H6RefundUpdate1',eventType:'refund.updated',
  providerObjectId:'re_H6Pg17Refund01',providerCreatedAt:new Date(),payloadSha256:Buffer.alloc(32,6),
  refundAttemptId:refund.id,refundStatus:'succeeded'});
 assert.equal(refundWebhook.outcome,'applied');

 const staffEventsCap=issueKitchen({actorId:kitchenId,staffRole:'kitchen',action:'read_events',
  targetId:kitchenId,correlationId:'h6_staff_events_0001'});
 const staffEvents=await operations.readStaffEvents({afterCursor:0,limit:100,capability:staffEventsCap});
 assert.ok(staffEvents.events.some(event=>event.type==='sabora.kitchen.dispatch_requested'));
 assert.ok(staffEvents.events.every(event=>!event.type.startsWith('sabora.incident.')));

 // A free round does not select payment mode or create a provider attempt;
 // the next positive round fixes pay-at-end and its debt is settled by a
 // separately authorized waiter action with concurrent idempotent replay.
 const secondCustomer=await register({alias:'Cliente cuenta abierta',company:null});
 const secondVisit=await flow.authorizeVisit({customerSessionToken:secondCustomer.token,tableId,qrToken});
 const freeQuote=await flow.quote({customerSessionToken:secondCustomer.token,tableId,qrToken,
  visitId:secondVisit.visitId,basketId:secondVisit.basketId,
  lines:[{itemId:freeItemId,selection,quantity:1}]});
 const freeOrder=await flow.confirm({customerSessionToken:secondCustomer.token,tableId,qrToken,
  visitId:secondVisit.visitId,basketId:secondVisit.basketId,requestKey:'h6_free_round_0001',paymentMode:null,
  lines:[{quoteId:freeQuote.lines[0].quoteId,itemId:freeItemId,selection,quantity:1}]});
 assert.equal(freeOrder.amountCents,0);
 assert.equal(freeOrder.paymentMode,null);
 assert.equal(freeOrder.paymentAttemptId,null);
 assert.equal((await admin.query('SELECT payment_mode FROM sabora.customer_accounts WHERE id=$1',
  [freeOrder.accountId])).rows[0].payment_mode,null);
 assert.equal((await provider.requestCapture({orderId:freeOrder.orderId,
  now:new Date(Date.now()+360000)})).action,'dispatch');

 const debtQuote=await flow.quote({customerSessionToken:secondCustomer.token,tableId,qrToken,
  visitId:secondVisit.visitId,basketId:secondVisit.basketId,
  lines:[{itemId,selection,quantity:1}]});
 const debtOrder=await flow.confirm({customerSessionToken:secondCustomer.token,tableId,qrToken,
  visitId:secondVisit.visitId,basketId:secondVisit.basketId,requestKey:'h6_debt_round_0001',
  paymentMode:'pay_at_end',lines:[{quoteId:debtQuote.lines[0].quoteId,itemId,selection,quantity:1}]});
 assert.equal(debtOrder.paymentMode,'pay_at_end');
 assert.equal(debtOrder.paymentAttemptId,null);
 assert.equal((await admin.query('SELECT outstanding_cents::integer AS cents FROM sabora.customer_accounts WHERE id=$1',
  [debtOrder.accountId])).rows[0].cents,2400);
 const cashCap=issueKitchen({actorId:waiterId,staffRole:'waiter',action:'settle_cash',
  targetId:debtOrder.accountId,correlationId:'h6_cash_concurrent_0001'});
 const cashResults=await Promise.all([
  operations.settleCash({accountId:debtOrder.accountId,amountCents:2400,capability:cashCap}),
  operations.settleCash({accountId:debtOrder.accountId,amountCents:2400,capability:cashCap})
 ]);
 assert.deepEqual(cashResults.map(value=>value.repeated).sort(),[false,true]);
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.cash_settlements WHERE account_id=$1',
  [debtOrder.accountId])).rows[0].n,1);
 const cashIncidentCap=issueKitchen({actorId:waiterId,staffRole:'waiter',action:'report_incident',
  targetId:debtOrder.roundId,correlationId:'h6_cash_refund_incident_001'});
 const cashIncident=await operations.reportIncident({roundId:debtOrder.roundId,lineId:null,
  origin:'waiter_restaurant',reason:'Servicio no prestado tras cobro presencial',affectedCents:400,
  capability:cashIncidentCap});
 assert.equal(cashIncident.state,'cash_refund_due');
 const cashRefundCap=issueKitchen({actorId:waiterId,staffRole:'waiter',action:'refund_cash',
  targetId:cashIncident.incidentId,correlationId:'h6_cash_refund_paid_001'});
 const cashRefunds=await Promise.all([
  operations.refundCash({incidentId:cashIncident.incidentId,capability:cashRefundCap}),
  operations.refundCash({incidentId:cashIncident.incidentId,capability:cashRefundCap})
 ]);
 assert.deepEqual(cashRefunds.map(value=>value.repeated).sort(),[false,true]);
 assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM sabora.cash_settlements
  WHERE incident_id=$1 AND kind='refund'`,[cashIncident.incidentId])).rows[0].n,1);

 // The table policy rejects pay-at-end in the same transaction that would
 // otherwise persist the order, leaving no economic or kitchen artifacts.
 const strictTableId='a6200000-0000-4000-8000-000000000007';
 const strictQr=createTableQrCredential({origin:'https://sabora.example',restaurantCode:'SABORA',
  tableId:strictTableId,randomBytesImpl:()=>Buffer.alloc(32,31)});
 const strictToken=parseTableQrPayload(strictQr.payload,{expectedOrigin:'https://sabora.example',
  expectedRestaurantCode:'SABORA'}).token;
 await admin.query(`INSERT INTO sabora.dining_tables
  (id,number,capacity,qr_token_hash,ordering_state,require_pay_as_ordered)
  VALUES($1,976002,4,$2,'open',true)`,[strictTableId,strictQr.tokenHash]);
 const strictCustomer=await register({alias:'Cliente política estricta',company:null});
 const strictVisit=await flow.authorizeVisit({customerSessionToken:strictCustomer.token,
  tableId:strictTableId,qrToken:strictToken});
 assert.equal(strictVisit.paymentPolicy.requirePayAsOrdered,true);
 const strictQuote=await flow.quote({customerSessionToken:strictCustomer.token,tableId:strictTableId,
  qrToken:strictToken,visitId:strictVisit.visitId,basketId:strictVisit.basketId,
  lines:[{itemId,selection,quantity:1}]});
 const beforeRejected=(await admin.query('SELECT count(*)::integer AS n FROM sabora.orders')).rows[0].n;
 await assert.rejects(flow.confirm({customerSessionToken:strictCustomer.token,tableId:strictTableId,
  qrToken:strictToken,visitId:strictVisit.visitId,basketId:strictVisit.basketId,
  requestKey:'h6_strict_reject_0001',paymentMode:'pay_at_end',
  lines:[{quoteId:strictQuote.lines[0].quoteId,itemId,selection,quantity:1}]}),/table_requires_pay_now/);
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.orders')).rows[0].n,beforeRejected);

 // If Stripe has captured but the atomic capture+dispatch recording call is
 // unavailable, the explicit compensation path records the original charge,
 // blocks kitchen dispatch and makes the refund requirement durable.
 const compensationCustomer=await register({alias:'Cliente compensación',company:null});
 const compensationVisit=await flow.authorizeVisit({customerSessionToken:compensationCustomer.token,
  tableId,qrToken});
 const compensationQuote=await flow.quote({customerSessionToken:compensationCustomer.token,tableId,
  qrToken,visitId:compensationVisit.visitId,basketId:compensationVisit.basketId,
  lines:[{itemId,selection,quantity:1}]});
 const compensationOrder=await flow.confirm({customerSessionToken:compensationCustomer.token,tableId,
  qrToken,visitId:compensationVisit.visitId,basketId:compensationVisit.basketId,
  requestKey:'h6_compensation_order_0001',paymentMode:'pay_now',
  lines:[{quoteId:compensationQuote.lines[0].quoteId,itemId,selection,quantity:1}]});
 await provider.recordAuthorization({orderId:compensationOrder.orderId,outcome:'authorized',
  providerIntentId:'pi_H6CompIntent01',captureBefore:new Date(Date.now()+86400000)});
 await provider.requestCapture({orderId:compensationOrder.orderId,now:new Date(Date.now()+360000)});
 const compensated=await provider.recordCaptureCompensation({orderId:compensationOrder.orderId,
  providerChargeId:'ch_H6CompCharge01',errorCode:'dispatch_persistence_failed'});
 assert.equal(compensated.payment_state,'refund_required');
 assert.equal(compensated.round_state,'compensation_required');
 assert.equal(compensated.dispatch_state,'compensation_required');
 assert.equal((await provider.recordCaptureCompensation({orderId:compensationOrder.orderId,
  providerChargeId:'ch_H6CompCharge01',errorCode:'dispatch_persistence_failed'})).repeated,true);
 await assert.rejects(provider.recordCaptureCompensation({orderId:compensationOrder.orderId,
  providerChargeId:'ch_H6CompCharge02',errorCode:'dispatch_persistence_failed'}),
  /capture_compensation_conflict/);
 const compensationRefund=(await admin.query(`SELECT rf.id FROM sabora.refund_attempts rf
  JOIN sabora.payment_attempts p ON p.id=rf.payment_attempt_id
  JOIN sabora.order_rounds r ON r.id=p.round_id WHERE r.order_id=$1 AND rf.incident_id IS NULL`,
  [compensationOrder.orderId])).rows[0];
 assert.ok(compensationRefund?.id);
 assert.equal((await provider.requestRefund({refundAttemptId:compensationRefund.id})).action,'refund');
 assert.equal((await provider.recordRefund({refundAttemptId:compensationRefund.id,outcome:'succeeded',
  providerRefundId:'re_H6CompRefund01'})).state,'succeeded');
 const compensatedFinal=(await admin.query(`SELECT p.state AS payment_state,r.state AS round_state,
  d.state AS dispatch_state FROM sabora.payment_attempts p JOIN sabora.order_rounds r ON r.id=p.round_id
  JOIN sabora.kitchen_dispatches d ON d.round_id=r.id WHERE r.order_id=$1`,[compensationOrder.orderId])).rows[0];
 assert.deepEqual(compensatedFinal,{payment_state:'released',round_state:'cancelled',dispatch_state:'failed'});
 const compensationLine=(await admin.query('SELECT id FROM sabora.order_lines WHERE order_id=$1',
  [compensationOrder.orderId])).rows[0].id;
 await assert.rejects(admin.query(`UPDATE sabora.order_lines SET status='preparing' WHERE id=$1`,
  [compensationLine]),/kitchen_dispatch_not_acknowledged/);

 const webhookCustomer=await register({alias:'Cliente webhook',company:null});
 const webhookVisit=await flow.authorizeVisit({customerSessionToken:webhookCustomer.token,tableId,qrToken});
 const webhookQuote=await flow.quote({customerSessionToken:webhookCustomer.token,tableId,qrToken,
  visitId:webhookVisit.visitId,basketId:webhookVisit.basketId,
  lines:[{itemId,selection,quantity:1}]});
 const webhookOrder=await flow.confirm({customerSessionToken:webhookCustomer.token,tableId,qrToken,
  visitId:webhookVisit.visitId,basketId:webhookVisit.basketId,
  requestKey:'h6_webhook_order_0001',paymentMode:'pay_now',
  lines:[{quoteId:webhookQuote.lines[0].quoteId,itemId,selection,quantity:1}]});
 await provider.recordAuthorization({orderId:webhookOrder.orderId,outcome:'requires_action',
  providerIntentId:'pi_H6WebhookIntent1'});
 const webhookCaptureBefore=new Date(Date.now()+6*86400000);
 const appliedAuthorization=await provider.ingestWebhook({eventId:'evt_H6Capturable01',
  eventType:'payment_intent.amount_capturable_updated',providerObjectId:'pi_H6WebhookIntent1',
  providerCreatedAt:new Date(),payloadSha256:Buffer.alloc(32,7),captureBefore:webhookCaptureBefore});
 assert.equal(appliedAuthorization.outcome,'applied');
 const webhookPayment=(await admin.query(`SELECT p.state,p.capture_before
  FROM sabora.payment_attempts p JOIN sabora.order_rounds r ON r.id=p.round_id WHERE r.order_id=$1`,
  [webhookOrder.orderId])).rows[0];
 assert.equal(webhookPayment.state,'authorized');
 assert.equal(webhookPayment.capture_before.toISOString(),webhookCaptureBefore.toISOString());
 const releaseCap=issueKitchen({actorId:waiterId,staffRole:'waiter',action:'report_incident',
  targetId:webhookOrder.roundId,correlationId:'h6_release_incident_001'});
 const releaseIncident=await operations.reportIncident({roundId:webhookOrder.roundId,lineId:null,
  origin:'waiter_restaurant',reason:'Cancelación atribuible al restaurante',affectedCents:2400,
  capability:releaseCap});
 assert.equal(releaseIncident.state,'refund_due');
 const releaseRequest=await provider.requestRelease({orderId:webhookOrder.orderId});
 assert.equal(releaseRequest.action,'release');
 const released=await provider.recordRelease({orderId:webhookOrder.orderId,outcome:'released'});
 assert.equal(released.payment_state,'released');
 assert.equal(released.round_state,'cancelled');
 assert.equal((await provider.requestRelease({orderId:webhookOrder.orderId})).action,'done');

 const webhookPayload=Buffer.alloc(32,9);
 const ignored=await provider.ingestWebhook({eventId:'evt_H6Pg17Ignored01',
  eventType:'payment_intent.payment_failed',providerObjectId:'pi_H6Pg17Unknown01',
  providerCreatedAt:new Date(),payloadSha256:webhookPayload});
 assert.equal(ignored.outcome,'ignored');
 const duplicate=await provider.ingestWebhook({eventId:'evt_H6Pg17Ignored01',
  eventType:'payment_intent.payment_failed',providerObjectId:'pi_H6Pg17Unknown01',
  providerCreatedAt:new Date(),payloadSha256:webhookPayload});
 assert.equal(duplicate.repeated,true);
 await assert.rejects(provider.ingestWebhook({eventId:'evt_H6Pg17Ignored01',
  eventType:'payment_intent.canceled',providerObjectId:'pi_H6Pg17Unknown01',
  providerCreatedAt:new Date(),payloadSha256:Buffer.alloc(32,8)}),/stripe_event_identity_conflict/);

 await admin.query('UPDATE sabora.customer_sessions SET revoked_at=clock_timestamp() WHERE customer_id=$1',
  [customer.profile.id]);
 await assert.rejects(events.read({sessionHash,tableId,visitId:visit.visitId,accountId:order.accountId,
  afterCursor:0,limit:100}),/event_scope_forbidden/);

 const rls=await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
  has_table_privilege('sabora_h6_customer_ci',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS customer_direct,
  has_table_privilege('sabora_h6_operations_ci',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS operations_direct,
  has_table_privilege('sabora_h6_provider_ci',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS provider_direct
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relname=ANY($1::text[])`,[[
   'customer_accounts','order_rounds','payment_attempts','kitchen_dispatches','incident_cases',
   'refund_attempts','cash_settlements','stripe_webhook_events','event_outbox','h6_action_requests']]);
 assert.equal(rls.rows.length,10);
 assert.ok(rls.rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity&&
  !row.customer_direct&&!row.operations_direct&&!row.provider_direct));
});
