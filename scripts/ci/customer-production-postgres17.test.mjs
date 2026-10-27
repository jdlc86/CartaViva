import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';
import {createRestrictedCustomerRegistration,REGISTER_CUSTOMER_SQL} from '../../apps/api/src/customer-production-registration.mjs';
import {createCustomerProductionFlow,AUTHORIZE_VISIT_SQL,PREPARE_QUOTE_SQL,INSERT_QUOTE_SQL,
 LOOKUP_ATTEMPT_SQL,PREPARE_CONFIRMATION_SQL,PERSIST_ORDER_SQL}
 from '../../apps/api/src/customer-production-flow.mjs';
import {createCustomerSessionScopedQuery} from '../../apps/api/src/customer-session-scoped-query.mjs';
import {createCustomerSessionRevoker} from '../../apps/api/src/customer-session-revoker.mjs';
import {assertCustomerProductionSqlCapabilities} from '../../apps/api/src/customer-production-sql-preflight.mjs';

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
const qrToken='ci_production_qr_token_'.repeat(3);
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
 await admin.query(`INSERT INTO sabora.catalog_items
  (id,draft,draft_revision,published_revision,published_snapshot,published_at)
  VALUES ($1,$2,1,1,$2,clock_timestamp()),($3,$4,1,1,$4,clock_timestamp())`,
  [itemA,snapshotA,itemB,snapshotB]);

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
 assert.deepEqual(persisted.rows,[{grouping:'first',lines:2,attempts:1}]);

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
 const sessionQuery=createCustomerSessionScopedQuery({pool:sessionPool});
 const revoke=createCustomerSessionRevoker({query:sessionQuery});
 assert.equal(await revoke(registered.token),true);
 await assert.rejects(flow.authorizeVisit({customerSessionToken:registered.token,tableId,qrToken}),
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
