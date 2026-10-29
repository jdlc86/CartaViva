import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {registerVerifiedCustomerProductionApp} from '../../apps/api/src/customer-production-app.mjs';
import {createPostgresTransaction} from '../../apps/api/src/postgres-transaction.mjs';
import {createOrderOperationsCoordinator} from '../../apps/api/src/order-operations-coordinator.mjs';
import {createOrderOperationsGateway} from '../../apps/management/src/order-operations-gateway.js';
import {registerOrderOperationsHttp} from '../../apps/api/src/order-operations-http.mjs';
import {createAuthenticatedOrderOperationsGateway} from '../../apps/management/src/order-operations-authenticated-gateway.js';
import {createOrderOperationCapabilityIssuer} from '../../apps/api/src/order-operation-capability.mjs';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';
import {createRestrictedCustomerRegistration,REGISTER_CUSTOMER_SQL} from '../../apps/api/src/customer-production-registration.mjs';
import {createCustomerProductionFlow,AUTHORIZE_VISIT_SQL,PREPARE_QUOTE_SQL,INSERT_QUOTE_SQL,
 LOOKUP_ATTEMPT_SQL,PREPARE_CONFIRMATION_SQL,PERSIST_ORDER_SQL}
 from '../../apps/api/src/customer-production-flow.mjs';
import {createCustomerSessionScopedQuery} from '../../apps/api/src/customer-session-scoped-query.mjs';
import {createCustomerSessionRevoker} from '../../apps/api/src/customer-session-revoker.mjs';
import {assertCustomerProductionSqlCapabilities} from '../../apps/api/src/customer-production-sql-preflight.mjs';
import {createTableQrCredential} from '../../apps/api/src/table-qr-credential.mjs';
import {parseTableQrPayload} from '../../packages/contracts/src/index.js';

const url=process.env.SABORA_CI_PG_URL;
const modulePath=process.env.SABORA_CI_PG_MODULE;
if(!url||!modulePath||process.env.GITHUB_ACTIONS!=='true'||!isDisposablePgModulePath(modulePath))
 throw Error('disposable_pg17_harness_required');
const parsed=new URL(url);
if(parsed.hostname!=='127.0.0.1'||parsed.username!=='postgres'||parsed.pathname!=='/postgres'||
 parsed.password!=='sabora_ci_ephemeral_only'||parsed.search||parsed.hash||!parsed.port)
 throw Error('unsafe_pg17_harness_target');
const require=createRequire(import.meta.url);
const {Pool}=require(modulePath);
const poolOptions={max:5,connectionTimeoutMillis:3000,idleTimeoutMillis:1000,
 options:'-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=20000'};
const admin=new Pool({connectionString:url,...poolOptions});
const loginUrl=(user,password)=>{
 const next=new URL(url);next.username=user;next.password=password;return next.toString();
};
const registrationPassword='ci-registration-only-71';
const sessionPassword='ci-session-only-72';
const flowPassword='ci-flow-only-73';
let registrationPool,sessionPool,flowPool;
test.after(async()=>{await Promise.allSettled([registrationPool?.end(),sessionPool?.end(),flowPool?.end()]);await admin.end();});

const tableId='ca710000-0000-4000-8000-000000000001';
const itemA='ca710000-0000-4000-8000-000000000002';
const itemB='ca710000-0000-4000-8000-000000000003';
const qrCredential=createTableQrCredential({origin:'https://sabora.example',restaurantCode:'SABORA',tableId,
 randomBytesImpl:()=>Buffer.from(Array.from({length:32},(_,index)=>index+1))});
const qrToken=parseTableQrPayload(qrCredential.payload,{expectedOrigin:'https://sabora.example',
 expectedRestaurantCode:'SABORA'}).token;
const secretKey='ci-customer-basket-acceptance-key-2026-at-least-32';
const selection={options:{},extras:[]};

test('real PG17 restricted principals complete H3 atomically and fail closed',async()=>{
 await admin.query(`
  CREATE ROLE sabora_customer_registration_ci LOGIN NOINHERIT NOBYPASSRLS
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${registrationPassword}';
  CREATE ROLE sabora_customer_session_ci LOGIN NOINHERIT NOBYPASSRLS
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${sessionPassword}';
  CREATE ROLE sabora_customer_flow_ci LOGIN NOINHERIT NOBYPASSRLS
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${flowPassword}';
  GRANT sabora_customer_registration_runtime TO sabora_customer_registration_ci;
  GRANT sabora_customer_session_runtime TO sabora_customer_session_ci;
  GRANT sabora_customer_flow_runtime TO sabora_customer_flow_ci;
 `);
 registrationPool=new Pool({connectionString:loginUrl('sabora_customer_registration_ci',registrationPassword),...poolOptions});
 sessionPool=new Pool({connectionString:loginUrl('sabora_customer_session_ci',sessionPassword),...poolOptions});
 flowPool=new Pool({connectionString:loginUrl('sabora_customer_flow_ci',flowPassword),...poolOptions});
 await assertCustomerProductionSqlCapabilities({registrationPool,sessionPool,flowPool,
  expectedRegistrationLogin:'sabora_customer_registration_ci',
  expectedSessionLogin:'sabora_customer_session_ci',expectedFlowLogin:'sabora_customer_flow_ci'});

 const roles=await admin.query(`SELECT rolname,rolinherit,rolsuper,rolbypassrls
  FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`,[[
   'sabora_customer_flow_ci','sabora_customer_registration_ci','sabora_customer_session_ci']]);
 assert.equal(roles.rows.length,3);
 assert.ok(roles.rows.every(row=>!row.rolinherit&&!row.rolsuper&&!row.rolbypassrls));
 await assert.rejects(flowPool.query('SELECT * FROM sabora.customer_profiles'),
  /permission denied/);
 await assert.rejects(flowPool.query('SET ROLE sabora_customer_flow_fn_owner'),
  /permission denied/);
 await assert.rejects(registrationPool.query(REGISTER_CUSTOMER_SQL,
  [crypto.randomUUID(),'SB-23456789ABCD','No role',null,crypto.randomUUID(),Buffer.alloc(32),new Date(),new Date(Date.now()+60000)]),
  /permission denied/);

 const snapshotA={name:'Arroz de temporada',category:'Primeros',priceCents:1400,
  allergens:[],options:[],extras:[],discount:null};
 const snapshotB={name:'Agua mineral',category:'Bebidas',priceCents:300,
  allergens:[],options:[],extras:[],discount:null};
 const table=await admin.query(`INSERT INTO sabora.dining_tables
  (id,number,capacity,qr_token_hash,ordering_state,grouping_window_seconds)
  VALUES ($1,971001,4,sha256(convert_to($2,'UTF8')),'open',300)
  RETURNING session_id`,[tableId,qrToken]);
 const storedQr=await admin.query(`SELECT qr_token_hash=$2::bytea AS matches
  FROM sabora.dining_tables WHERE id=$1`,[tableId,qrCredential.tokenHash]);
 assert.deepEqual(storedQr.rows,[{matches:true}]);
 await admin.query(`INSERT INTO sabora.catalog_items
  (id,draft,draft_revision,published_revision,published_snapshot,published_at)
  VALUES ($1,$2,1,1,$2,clock_timestamp()),($3,$4,1,1,$4,clock_timestamp())`,
  [itemA,snapshotA,itemB,snapshotB]);

 // HTTP acceptance on the same restricted PG17 principals: real registration
 // sets an HttpOnly cookie, then the client visits a QR, quotes and confirms.
 const Fastify=createRequire(new URL('../../apps/api/package.json',import.meta.url))('fastify');
 let clientPwaConfirmedOrderId=null;
 const customerHttp=Fastify({logger:false,trustProxy:false});
 try {
  await registerVerifiedCustomerProductionApp(customerHttp,{
   registrationPool,sessionPool,flowPool,allowedOrigin:'https://sabora.example',secretKey,
   expectedRegistrationLogin:'sabora_customer_registration_ci',
   expectedSessionLogin:'sabora_customer_session_ci',
   expectedFlowLogin:'sabora_customer_flow_ci'
  });
  const originHeaders={origin:'https://sabora.example','content-type':'application/json'};
  const httpRegister=await customerHttp.inject({method:'POST',url:'/api/v1/customer/register',
   headers:originHeaders,payload:{alias:'Cliente HTTP',company:'Sabora QA'}});
  assert.equal(httpRegister.statusCode,201,httpRegister.body);
  assert.equal(httpRegister.body.includes('token'),false,'session token must remain HttpOnly');
  const cookie=httpRegister.headers['set-cookie'].split(';')[0];
  assert.match(cookie,/^__Secure-sabora_customer=/);
  const headers={...originHeaders,cookie};
  const session=await customerHttp.inject({method:'GET',url:'/api/v1/customer/session',
   headers:{cookie}});
  assert.equal(session.statusCode,200,session.body);
  const httpVisit=await customerHttp.inject({method:'POST',url:'/api/v1/customer/visits',
   headers,payload:{tableId,qrToken}});
  assert.equal(httpVisit.statusCode,201,httpVisit.body);
  const visitBody=httpVisit.json();
  const httpQuote=await customerHttp.inject({method:'POST',url:'/api/v1/customer/quotes',
   headers,payload:{tableId,qrToken,visitId:visitBody.visitId,basketId:visitBody.basketId,
    lines:[{itemId:itemA,selection,quantity:1}]}});
  assert.equal(httpQuote.statusCode,201,httpQuote.body);
  const quoteBody=httpQuote.json();
  const httpOrder={tableId,qrToken,visitId:visitBody.visitId,basketId:visitBody.basketId,
   requestKey:'http_customer_request_971001',
   lines:[{quoteId:quoteBody.lines[0].quoteId,itemId:itemA,selection,quantity:1}]};
  const httpConfirmed=await customerHttp.inject({method:'POST',
   url:'/api/v1/customer/orders/confirm',headers,payload:httpOrder});
  assert.equal(httpConfirmed.statusCode,201,httpConfirmed.body);
  const httpReplay=await customerHttp.inject({method:'POST',
   url:'/api/v1/customer/orders/confirm',headers,payload:httpOrder});
  assert.equal(httpReplay.statusCode,200,httpReplay.body);
  assert.equal(httpReplay.json().orderId,httpConfirmed.json().orderId);
  const httpPersisted=await admin.query(
   'SELECT count(*)::integer AS n FROM sabora.order_lines WHERE order_id=$1',
   [httpConfirmed.json().orderId]);
  assert.equal(httpPersisted.rows[0].n,1);
  // Execute the actual PWA transport against this same HTTP server and PG17,
  // with a browser-equivalent same-origin cookie jar. No mocked business flow.
  const requireClient=createRequire(new URL('../../apps/client/package.json',import.meta.url));
  const ts=requireClient('typescript');
  const clientSource=readFileSync(new URL('../../apps/client/src/customer-flow-transport.ts',import.meta.url),'utf8');
  const clientJs=ts.transpileModule(clientSource,{compilerOptions:{
   module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {createCustomerFlowTransport}=await import('data:text/javascript;base64,'+
   Buffer.from(clientJs).toString('base64'));
  let browserCookie='';
  const browserFetch=async(path,init={})=>{
   assert.equal(init.credentials,'same-origin');
   const requestHeaders={...init.headers,origin:'https://sabora.example',
    ...(browserCookie?{cookie:browserCookie}:{})};
   const reply=await customerHttp.inject({method:init.method||'GET',url:path,
    headers:requestHeaders,...(init.body===undefined?{}:{payload:init.body})});
   if(reply.headers['set-cookie'])browserCookie=reply.headers['set-cookie'].split(';')[0];
   return new Response(reply.body,{status:reply.statusCode,headers:{
    'content-type':reply.headers['content-type']||'application/json'}});
  };
  const pwa=createCustomerFlowTransport({fetchImpl:browserFetch});
  const profile=await pwa.register({alias:'PWA HTTP',company:null});
  assert.match(profile.publicId,/^SB-/);
  assert.equal((await pwa.session()).publicId,profile.publicId);
  const pwaVisit=await pwa.authorizeVisit({tableId,qrToken});
  const pwaQuote=await pwa.quote({tableId,qrToken,visitId:pwaVisit.visitId,
   basketId:pwaVisit.basketId,lines:[{itemId:itemA,selection,quantity:1}]});
  const pwaOrder={tableId,qrToken,visitId:pwaVisit.visitId,basketId:pwaVisit.basketId,
   requestKey:'pwa_customer_request_971001',
   lines:[{quoteId:pwaQuote.lines[0].quoteId,itemId:itemA,selection,quantity:1}]};
  const pwaConfirmed=await pwa.confirm(pwaOrder);
  assert.equal(pwaConfirmed.status,'confirmed');
  clientPwaConfirmedOrderId=pwaConfirmed.orderId;
  assert.equal((await pwa.confirm(pwaOrder)).orderId,pwaConfirmed.orderId);
  assert.equal((await admin.query(
   'SELECT count(*)::integer AS n FROM sabora.order_lines WHERE order_id=$1',
   [pwaConfirmed.orderId])).rows[0].n,1);
  // Revocation must fence the exact same PWA session immediately, even if a
  // previously confirmed request key, QR and displayed quote are replayed.
  const revokedCookie=browserCookie;
  assert.equal(await pwa.logout(),true);
  assert.equal(typeof revokedCookie,'string');
  const afterLogout=await pwa.session().then(()=>null,error=>error);
  assert.ok(afterLogout);
  assert.ok([401,403].includes(afterLogout.status),
   'revoked PWA cookie must not authorize a new session');
  const afterLogoutVisit=await pwa.authorizeVisit({tableId,qrToken})
   .then(()=>null,error=>error);
  assert.ok(afterLogoutVisit);
  assert.ok([401,403].includes(afterLogoutVisit.status));
  const afterLogoutReplay=await pwa.confirm(pwaOrder).then(()=>null,error=>error);
  assert.ok(afterLogoutReplay);
  assert.ok([401,403].includes(afterLogoutReplay.status),
   'replay cannot bypass revoked session authentication');
  assert.equal((await admin.query(
   'SELECT count(*)::integer AS n FROM sabora.order_lines WHERE order_id=$1',
   [pwaConfirmed.orderId])).rows[0].n,1,
   'revocation does not delete a committed order or duplicate its lines');
  // An old cookie remains invalid even when a new customer registers.
  const replacement=await pwa.register({alias:'PWA replacement',company:null});
  assert.notEqual(replacement.publicId,profile.publicId);
  assert.equal((await pwa.session()).publicId,replacement.publicId);
  const staleCookie=await customerHttp.inject({method:'GET',
   url:'/api/v1/customer/session',headers:{cookie:revokedCookie}});
  assert.ok([401,403].includes(staleCookie.statusCode));
  const crossOrigin=await customerHttp.inject({method:'POST',
   url:'/api/v1/customer/orders/confirm',
   headers:{...headers,origin:'https://attacker.example'},payload:httpOrder});
  assert.equal(crossOrigin.statusCode,403);
 } finally {await customerHttp.close();}

 const registrationTransaction=createRoleScopedPostgresTransaction({pool:registrationPool,
  role:'sabora_customer_registration_runtime',allowedSql:new Set([REGISTER_CUSTOMER_SQL])});
 const register=createRestrictedCustomerRegistration({withTransaction:registrationTransaction});
 const registered=await register({alias:'Marina',company:'Sabora QA'});
 assert.match(registered.profile.public_id,/^SB-/);
 assert.equal(typeof registered.profile.id,'string');

 const flowTransaction=createRoleScopedPostgresTransaction({pool:flowPool,
  role:'sabora_customer_flow_runtime',allowedSql:new Set([AUTHORIZE_VISIT_SQL,PREPARE_QUOTE_SQL,
   INSERT_QUOTE_SQL,LOOKUP_ATTEMPT_SQL,PREPARE_CONFIRMATION_SQL,PERSIST_ORDER_SQL])});
 const flow=createCustomerProductionFlow({withTransaction:flowTransaction,secretKey});
 const visit=await flow.authorizeVisit({customerSessionToken:registered.token,tableId,qrToken});
 const quote=await flow.quote({customerSessionToken:registered.token,tableId,qrToken,
  visitId:visit.visitId,basketId:visit.basketId,lines:[
   {itemId:itemA,selection,quantity:2},{itemId:itemB,selection,quantity:1}
  ]});
 assert.equal(quote.lines.length,2);

 // A failed second line rolls back the first quote from the same transaction.
 const quoteCount=await admin.query('SELECT count(*)::integer AS n FROM sabora.catalog_displayed_quotes');
 await assert.rejects(flow.quote({customerSessionToken:registered.token,tableId,qrToken,
  visitId:visit.visitId,basketId:visit.basketId,lines:[
   {itemId:itemA,selection,quantity:1},
   {itemId:'ca710000-0000-4000-8000-000000000099',selection,quantity:1}
  ]}),/customer_quote_unavailable|invalid_customer_flow_result/);
 const afterRollback=await admin.query('SELECT count(*)::integer AS n FROM sabora.catalog_displayed_quotes');
 assert.equal(afterRollback.rows[0].n,quoteCount.rows[0].n);

 const request={customerSessionToken:registered.token,tableId,qrToken,
  visitId:visit.visitId,basketId:visit.basketId,requestKey:'customer_request_971001',lines:[
   {quoteId:quote.lines[0].quoteId,itemId:itemA,selection,quantity:2},
   {quoteId:quote.lines[1].quoteId,itemId:itemB,selection,quantity:1}
  ]};
 const concurrent=await Promise.all([flow.confirm(request),flow.confirm(request)]);
 assert.deepEqual(concurrent.map(value=>value.status).sort(),['confirmed','replayed']);
 assert.equal(concurrent[0].orderId,concurrent[1].orderId);
 const persisted=await admin.query(`SELECT o.grouping,
  (SELECT count(*)::integer FROM sabora.order_lines l WHERE l.order_id=o.id) AS lines,
  (SELECT count(*)::integer FROM sabora.customer_order_attempt_batches b WHERE b.order_id=o.id) AS attempts
  FROM sabora.orders o WHERE o.id=$1`,[concurrent[0].orderId]);
 assert.deepEqual(persisted.rows,[{grouping:'grouped',lines:2,attempts:1}],
  'second customer order within the configured five-minute window must group');
 // Cross-domain PG17 acceptance: H3-confirmed lines must be actionable by
 // H4 kitchen and sala without re-seeding or synthesizing another order.
 const signingKeyId='ci_h3_h4_shared_order_key_971001';
 const signingSecret=randomBytes(32);
 const kitchenId='ca710000-0000-4000-8000-000000000011';
 const waiterId='ca710000-0000-4000-8000-000000000012';
 await admin.query(`INSERT INTO sabora.order_operation_signing_keys
   (key_id,hmac_key,not_before,expires_at)
   VALUES ($1,decode($2,'hex'),clock_timestamp()-interval '1 minute',
    clock_timestamp()+interval '1 hour')`,[signingKeyId,signingSecret.toString('hex')]);
 await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state)
   VALUES ($1,'kitchen','active'),($2,'waiter','active')`,[kitchenId,waiterId]);
 const operations=createOrderOperationsCoordinator({
   withTransaction:createPostgresTransaction({pool:admin}),
   issueTransitionCapability:createOrderOperationCapabilityIssuer({
     keyId:signingKeyId,secret:signingSecret,databaseRole:'postgres'
   })
 });
 const kitchen={verifiedIdentity:{userId:kitchenId},
   verifiedStaff:{userId:kitchenId,role:'kitchen'}};
 const waiter={verifiedIdentity:{userId:waiterId},
   verifiedStaff:{userId:waiterId,role:'waiter'}};
 const confirmedLines=await admin.query(
   'SELECT id FROM sabora.order_lines WHERE order_id=$1 ORDER BY line_number',
   [concurrent[0].orderId]);
 assert.equal(confirmedLines.rows.length,2);
 const lineId=confirmedLines.rows[0].id;
 // Exercise the actual management PWA gateway's contract over the PG17-backed
 // H4 coordinator. HTTP authentication is verified in independent JWT tests.
 const sendFor=context=>async(path,request)=>{
  const parsed=new URL(path,'https://sabora.example');
  let value,status=200;
  if(parsed.pathname==='/api/v1/operations/order-lines'){
   value=await operations.listBoard(context,{
    status:parsed.searchParams.get('status'),
    limit:Number(parsed.searchParams.get('limit')),cursor:null});
  }else if(parsed.pathname.endsWith('/transitions')){
   const lineId=parsed.pathname.split('/')[5];
   value=await operations.transitionLine(context,{lineId,...JSON.parse(request.body)});
   status=value.repeated?200:201;
  }else if(parsed.pathname.endsWith('/history')){
   const orderId=parsed.pathname.split('/')[5];
   value=await operations.listHistory(context,{
    orderId,limit:Number(parsed.searchParams.get('limit'))});
  }else throw Error('unexpected_management_route');
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
 };
 const kitchenPwa=createOrderOperationsGateway({send:sendFor(kitchen)});
 const salaPwa=createOrderOperationsGateway({send:sendFor(waiter)});
 const pwaLineId=confirmedLines.rows[1].id;
 assert.ok((await kitchenPwa.listBoard({status:'confirmed'})).items.some(
  item=>item.lineId===pwaLineId));
 const pwaPreparing=await kitchenPwa.transitionLine({
  lineId:pwaLineId,targetStatus:'preparing',correlationId:'pwa_kitchen_prepare_971001'});
 assert.equal(pwaPreparing.currentStatus,'preparing');
 const pwaReady=await kitchenPwa.transitionLine({
  lineId:pwaLineId,targetStatus:'ready',correlationId:'pwa_kitchen_ready_971001'});
 assert.equal(pwaReady.currentStatus,'ready');
 assert.ok((await salaPwa.listBoard({status:'ready'})).items.some(
  item=>item.lineId===pwaLineId));
 const pwaPickup=await salaPwa.transitionLine({
  lineId:pwaLineId,targetStatus:'picked_up',correlationId:'pwa_sala_pickup_971001'});
 assert.equal(pwaPickup.currentStatus,'picked_up');
 assert.equal((await salaPwa.transitionLine({
  lineId:pwaLineId,targetStatus:'picked_up',correlationId:'pwa_sala_pickup_971001'})).repeated,true);
 assert.ok((await salaPwa.listHistory({orderId:concurrent[0].orderId})).events.some(
  event=>event.lineId===pwaLineId&&event.toStatus==='picked_up'));

 const kitchenBoard=await operations.listBoard(kitchen,{status:'confirmed',limit:100,cursor:null});
 assert.ok(kitchenBoard.items.some(item=>item.lineId===lineId),
   'H3-confirmed order must be visible to H4 kitchen');
 // A waiter cannot prepare a customer-confirmed line; no mutation occurs.
 await assert.rejects(operations.transitionLine(waiter,{
   lineId,targetStatus:'preparing',correlationId:'h3_h4_forbidden_waiter_prepare'}),
   /order_operations_forbidden/);
 assert.equal((await admin.query('SELECT status FROM sabora.order_lines WHERE id=$1',[lineId]))
   .rows[0].status,'confirmed');
 const preparing=await operations.transitionLine(kitchen,{
   lineId,targetStatus:'preparing',correlationId:'h3_h4_prepare_971001'});
 assert.equal(preparing.repeated,false);
 const ready=await operations.transitionLine(kitchen,{
   lineId,targetStatus:'ready',correlationId:'h3_h4_ready_971001'});
 assert.equal(ready.repeated,false);
 assert.ok(ready.notificationId);
 const salaBoard=await operations.listBoard(waiter,{status:'ready',limit:100,cursor:null});
 assert.ok(salaBoard.items.some(item=>item.lineId===lineId),
   'H4 sala must see the same H3-confirmed line');
 // Kitchen cannot perform sala pickup, and the ready notification survives.
 await assert.rejects(operations.transitionLine(kitchen,{
   lineId,targetStatus:'picked_up',correlationId:'h3_h4_forbidden_kitchen_pickup'}),
   /order_operations_forbidden/);
 assert.equal((await admin.query('SELECT status FROM sabora.order_lines WHERE id=$1',[lineId]))
   .rows[0].status,'ready');
 const pickup=await operations.transitionLine(waiter,{
   lineId,targetStatus:'picked_up',correlationId:'h3_h4_pickup_971001'});
 assert.equal(pickup.notificationId,ready.notificationId);
 const replay=await operations.transitionLine(waiter,{
   lineId,targetStatus:'picked_up',correlationId:'h3_h4_pickup_971001'});
 assert.equal(replay.repeated,true);
 assert.equal(replay.eventId,pickup.eventId,
   'idempotent sala replay must reference the original event');
 const events=await admin.query(
   'SELECT count(*)::integer AS n FROM sabora.order_line_events WHERE order_line_id=$1',
   [lineId]);
 assert.ok(events.rows[0].n>=3);

 const finalLine=await admin.query('SELECT status FROM sabora.order_lines WHERE id=$1',[lineId]);
 assert.equal(finalLine.rows[0].status,'picked_up');
 const history=await operations.listHistory(waiter,{orderId:concurrent[0].orderId,limit:100});
 assert.ok(history);

 // Execute the actual management PWA gateway through H4 HTTP against the same
 // PG17-confirmed order. Authentication is a test-only role fixture here;
 // cryptographic staff JWT and restricted SQL principals have separate suites.
 const managementHttp=Fastify({logger:false});
 const bearerByRole={
  kitchen:'ci_kitchen_bearer_token_971001',
  waiter:'ci_waiter_bearer_token_971001'
 };
 registerOrderOperationsHttp(managementHttp,{
  forRoles:allowed=>async(request,reply)=>{
   const token=request.headers.authorization?.replace(/^Bearer /,'');
   const role=Object.entries(bearerByRole).find(([,value])=>value===token)?.[0];
   if(!role||!allowed.includes(role))return reply.code(403).send({error:'forbidden'});
   const identity=role==='kitchen'?kitchen:waiter;
   request.verifiedIdentity=identity.verifiedIdentity;
   request.verifiedStaff=identity.verifiedStaff;
  },operations
 });
 const managementRequests=[];
 const gateway=(role)=>createAuthenticatedOrderOperationsGateway({
  getAccessToken:async()=>bearerByRole[role],
  fetchImpl:async(path,options)=>{
   assert.equal(options.credentials,'omit');
   assert.equal(options.redirect,'error');
   assert.equal(options.cache,'no-store');
   assert.equal(options.headers.get('authorization'),`Bearer ${bearerByRole[role]}`);
   managementRequests.push({role,path});
   const reply=await managementHttp.inject({method:options.method,url:path,
    headers:Object.fromEntries(options.headers.entries()),
    ...(options.body===undefined?{}:{payload:options.body})});
   return new Response(reply.body,{status:reply.statusCode,headers:{
    'content-type':reply.headers['content-type']||'application/json'}});
  }
 });
 const kitchenPwa=gateway('kitchen'),salaPwa=gateway('waiter');
 try{
  // Same persisted order created through the *actual client PWA transport*.
  // H4 management PWA must process it, not an unrelated seeded order.
  assert.ok(clientPwaConfirmedOrderId);
  const pwaLines=await admin.query(
   'SELECT id FROM sabora.order_lines WHERE order_id=$1',
   [clientPwaConfirmedOrderId]);
  assert.equal(pwaLines.rows.length,1);
  const pwaLineId=pwaLines.rows[0].id;
  assert.ok((await kitchenPwa.listBoard({status:'confirmed'})).items
   .some(item=>item.lineId===pwaLineId));
  const denied=await salaPwa.transitionLine({lineId:pwaLineId,
   targetStatus:'preparing',correlationId:'pwa_pg17_forbidden_971001'})
   .then(()=>null,error=>error);
  assert.equal(denied?.code,'forbidden');
  assert.equal((await admin.query('SELECT status FROM sabora.order_lines WHERE id=$1',
   [pwaLineId])).rows[0].status,'confirmed');
  const prepared=await kitchenPwa.transitionLine({lineId:pwaLineId,
   targetStatus:'preparing',correlationId:'pwa_pg17_prepare_971001'});
  assert.equal(prepared.currentStatus,'preparing');
  const readyPwa=await kitchenPwa.transitionLine({lineId:pwaLineId,
   targetStatus:'ready',correlationId:'pwa_pg17_ready_971001'});
  assert.equal(readyPwa.currentStatus,'ready');
  assert.ok(readyPwa.notificationId);
  assert.ok((await salaPwa.listBoard({status:'ready'})).items
   .some(item=>item.lineId===pwaLineId));
  const picked=await salaPwa.transitionLine({lineId:pwaLineId,
   targetStatus:'picked_up',correlationId:'pwa_pg17_pickup_971001'});
  assert.equal(picked.currentStatus,'picked_up');
  assert.equal(picked.notificationId,readyPwa.notificationId);
  const repeatedPwa=await salaPwa.transitionLine({lineId:pwaLineId,
   targetStatus:'picked_up',correlationId:'pwa_pg17_pickup_971001'});
  assert.equal(repeatedPwa.repeated,true);
  assert.ok((await salaPwa.listHistory({orderId:clientPwaConfirmedOrderId})).events
   .some(event=>event.lineId===pwaLineId&&event.toStatus==='picked_up'));
  assert.ok(managementRequests.length>=8);
  kitchenPwa.revoke();salaPwa.revoke();
  await assert.rejects(kitchenPwa.listBoard(),/order_operations_auth_unavailable/);
  await assert.rejects(salaPwa.listBoard(),/order_operations_auth_unavailable/);
 }finally{
  kitchenPwa.revoke();salaPwa.revoke();await managementHttp.close();
 }


 // Same idempotency key with different content is not a replay.
 await assert.rejects(flow.confirm({...request,lines:[request.lines[0]]}),
  /customer_order_idempotency_conflict/);

 // A catalog change (including a lower price) requires explicit exact HMAC acceptance.
 const repriceQuote=await flow.quote({customerSessionToken:registered.token,tableId,qrToken,
  visitId:visit.visitId,basketId:visit.basketId,lines:[
   {itemId:itemA,selection,quantity:2},{itemId:itemB,selection,quantity:1}
  ]});
 await admin.query(`UPDATE sabora.catalog_items SET draft_revision=2,published_revision=2,
  draft=jsonb_set(draft,'{priceCents}','1300'::jsonb),
  published_snapshot=jsonb_set(published_snapshot,'{priceCents}','1300'::jsonb),
  published_at=clock_timestamp() WHERE id=$1`,[itemA]);
 const repriceRequest={...request,requestKey:'customer_request_971002',lines:[
  {quoteId:repriceQuote.lines[0].quoteId,itemId:itemA,selection,quantity:2},
  {quoteId:repriceQuote.lines[1].quoteId,itemId:itemB,selection,quantity:1}
 ]};
 const challenge=await flow.confirm(repriceRequest);
 assert.equal(challenge.status,'acceptance_required');
 assert.equal(challenge.changes[0].currentTotalCents,2600);
 const accepted=await flow.confirm({...repriceRequest,acceptanceToken:challenge.acceptance.token});
 assert.equal(accepted.status,'confirmed');

 // Visit expiry and session revocation are checked again on every operation.
 await admin.query(`UPDATE sabora.customer_table_visits
  SET granted_at=clock_timestamp()-interval '2 hours',
      expires_at=clock_timestamp()-interval '1 hour'
  WHERE table_id=$1 AND visit_key=$2`,[tableId,visit.visitId]);
 await assert.rejects(flow.quote({customerSessionToken:registered.token,tableId,qrToken,
  visitId:visit.visitId,basketId:visit.basketId,
  lines:[{itemId:itemA,selection,quantity:1}]}),/invalid_customer_flow_result/);
 await admin.query(`UPDATE sabora.customer_table_visits
  SET granted_at=clock_timestamp()-interval '1 minute',
      expires_at=clock_timestamp()+interval '1 hour'
  WHERE table_id=$1 AND visit_key=$2`,[tableId,visit.visitId]);
 // Rotation accepts only the V1 canonical token, immediately fences the old
 // credential and permits a new visit only through the newly encoded payload.
 await assert.rejects(admin.query('SELECT * FROM sabora.rotate_table_qr($1,$2)',
  [tableId,'legacy-token-that-is-long-enough-but-not-v1']),/invalid_qr_rotation_input/);
 const rotatedCredential=createTableQrCredential({origin:'https://sabora.example',restaurantCode:'SABORA',tableId,
  randomBytesImpl:()=>Buffer.from(Array.from({length:32},(_,index)=>255-index))});
 const rotatedToken=parseTableQrPayload(rotatedCredential.payload,{expectedOrigin:'https://sabora.example',
  expectedRestaurantCode:'SABORA'}).token;
 const rotation=await admin.query('SELECT * FROM sabora.rotate_table_qr($1,$2)',[tableId,rotatedToken]);
 assert.equal(rotation.rows.length,1);
 await assert.rejects(flow.quote({customerSessionToken:registered.token,tableId,qrToken,
  visitId:visit.visitId,basketId:visit.basketId,
  lines:[{itemId:itemA,selection,quantity:1}]}),/invalid_customer_flow_result/);
 const rotatedVisit=await flow.authorizeVisit({customerSessionToken:registered.token,tableId,qrToken:rotatedToken});
 assert.equal(rotatedVisit.tableId,tableId);
 const sessionQuery=createCustomerSessionScopedQuery({pool:sessionPool});
 const revoke=createCustomerSessionRevoker({query:sessionQuery});
 assert.equal(await revoke(registered.token),true);
 await assert.rejects(flow.authorizeVisit({customerSessionToken:registered.token,tableId,qrToken:rotatedToken}),
  /customer_session_forbidden/);

 const rls=await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
  has_table_privilege('sabora_customer_flow_ci',c.oid,'SELECT') AS direct_select,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_access,
  has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS auth_access
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relname=ANY($1::text[])`,[[
   'customer_profiles','customer_sessions','customer_table_visits','catalog_displayed_quotes',
   'orders','order_lines','customer_order_attempt_batches','customer_order_attempt_lines']]);
 assert.equal(rls.rows.length,8);
 assert.ok(rls.rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity&&
  !row.direct_select&&!row.anon_access&&!row.auth_access));
 const callable=await admin.query(`SELECT DISTINCT p.proname
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
   JOIN pg_roles grantee ON grantee.oid=acl.grantee
   WHERE n.nspname='sabora' AND grantee.rolname='sabora_customer_flow_runtime'
     AND acl.privilege_type='EXECUTE'
   ORDER BY p.proname`);
 assert.deepEqual(callable.rows.map(row=>row.proname),[
  'authorize_customer_visit_candidate','insert_customer_quote_candidate',
  'lookup_customer_order_attempt_candidate','persist_customer_order_candidate',
  'prepare_customer_confirmation_line_candidate','prepare_customer_quote_candidate'
 ]);
 assert.equal(table.rows[0].session_id.length,36);
});
