import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomBytes,randomUUID,createHmac,generateKeyPairSync,sign} from 'node:crypto';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {F12_FUNCTION_SQL,assertF12SqlIdentity} from '../../apps/api/src/table-change-isolated-sql-preflight-candidate.mjs';
import {assertB3ConfirmationCapabilities} from '../../apps/api/src/table-change-b3-confirmation-preflight-candidate.mjs';
import {assertB3H6LoginSurface,assertB3CustomerFlowExactSetRole,createVerifiedTableChangeB3CustomerFlowCandidate,createIsolatedB3ConfirmationTransaction} from '../../apps/api/src/table-change-isolated-sql-composition-candidate.mjs';
import {assertCustomerFlowSqlCapabilities} from '../../apps/api/src/customer-production-sql-preflight.mjs';
import {PERSIST_H6_TRANSFER_ORDER_SQL} from '../../apps/api/src/customer-production-flow.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';
import {createH6OperationsRepository,createH6CustomerEventRepository,
 SETTLE_CASH_H6_SQL,CLOSE_ACCOUNT_H6_SQL,MANAGE_PICKUP_TASK_H6_SQL,
 READ_CUSTOMER_EVENTS_H6_SQL} from '../../apps/api/src/h6-operations-repository.mjs';
import {createOrderOperationCapabilityIssuer} from '../../apps/api/src/order-operation-capability.mjs';
import {createOrderOperationReadCapabilityIssuer} from '../../apps/api/src/order-operation-read-capability.mjs';
import {createOrderOperationsRepository,TRANSITION_ORDER_LINE_SQL,READ_H6_DELIVERY_BOARD_SQL,
 READ_ORDER_HISTORY_SQL} from '../../apps/api/src/order-operations-repository.mjs';
import {createOrderOperationsCoordinator} from '../../apps/api/src/order-operations-coordinator.mjs';
import {registerOrderOperationsHttp} from '../../apps/api/src/order-operations-http.mjs';
import {createH6OperationsCoordinator} from '../../apps/api/src/h6-operations-coordinator.mjs';
import {createH6StaffCapabilityIssuer} from '../../apps/api/src/h6-staff-capability.mjs';
import {registerH6OperationsHttp} from '../../apps/api/src/h6-operations-http.mjs';
import {assertH6RuntimeIdentity} from '../../apps/api/src/h6-sql-preflight.mjs';
import {createH6ProviderRepository,LIST_SCHEDULABLE_H6_SQL,REQUEST_DUE_CAPTURE_H6_SQL,
 RECORD_AUTHORIZATION_H6_SQL,REQUEST_CAPTURE_H6_SQL,
 RECORD_CAPTURE_H6_SQL,INGEST_STRIPE_WEBHOOK_H6_SQL,REQUEST_REFUND_H6_SQL,
 RECORD_REFUND_H6_SQL} from '../../apps/api/src/h6-provider-repository.mjs';
import {ACK_DISPATCH_H6_SQL,REPORT_INCIDENT_H6_SQL,
 READ_STAFF_EVENTS_H6_SQL,SET_CATALOG_SOLD_OUT_H6_SQL}
 from '../../apps/api/src/h6-operations-repository.mjs';
import {createH6StripeWebhookHandler} from '../../apps/api/src/h6-stripe-webhook.mjs';
import {createH6StripeAdapter} from '../../apps/api/src/h6-stripe-adapter.mjs';
import {createH6PaymentOrchestrator} from '../../apps/api/src/h6-payment-orchestrator.mjs';
import {createH6DeferredDispatchScheduler} from '../../apps/api/src/h6-deferred-dispatch-scheduler.mjs';
import {createPostgresH6OutboxNotifier,registerH6CustomerEventStreamHttp}
 from '../../apps/api/src/h6-event-stream.mjs';
import {mountVerifiedTableChangeB3JwtHttpCandidate} from '../../apps/api/src/table-change-b3-http-composition-candidate.mjs';
import {preflightOrderTransitionStaffIdentity} from '../../apps/api/src/order-operations-identity-preflight.mjs';
import {createStaffProtectedHooksFromPool} from '../../apps/api/src/staff-protected-hooks-from-pool.mjs';
import {hashCustomerSessionToken} from '../../apps/api/src/customer-session.mjs';
import {assertPendingReaderCapabilities} from '../../apps/api/src/table-change-pending-reader-preflight-candidate.mjs';
import {createCustomerFlowTransport} from '../../apps/client/src/customer-flow-transport.ts';
import {createAuthenticatedOrderOperationsGateway} from '../../apps/management/src/order-operations-authenticated-gateway.js';
import {createM2RestaurantCandidate} from '../../apps/api/src/m2-restaurant-candidate.mjs';
import {createM3RestaurantCandidate} from '../../apps/api/src/m3-restaurant-candidate.mjs';
import {createM3AuthenticatedManagementGateway} from '../../apps/management/src/m3-authenticated-management-gateway.js';
import {createM3ManagementCapabilityIssuer} from '../../apps/api/src/m3-management-capability.mjs';
import {assertM2CustomerEventCapability} from '../../apps/api/src/m2-runtime-capabilities.mjs';

const url=process.env.SABORA_CI_PG_URL,modulePath=process.env.SABORA_CI_PG_MODULE;
if(!url||!modulePath||process.env.GITHUB_ACTIONS!=='true'||!isDisposablePgModulePath(modulePath))
 throw Error('disposable_pg17_harness_required');
const parsed=new URL(url);
if(parsed.hostname!=='127.0.0.1'||parsed.username!=='postgres'||parsed.pathname!=='/postgres'||
 parsed.password!=='sabora_ci_ephemeral_only'||parsed.search||parsed.hash||!parsed.port)
 throw Error('unsafe_pg17_harness_target');
const require=createRequire(import.meta.url),{Pool}=require(modulePath);
const admin=new Pool({connectionString:url,max:4,connectionTimeoutMillis:3000,idleTimeoutMillis:1000,
 options:'-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=20000'});
test.after(async()=>admin.end());

const qrHash=Buffer.alloc(32,201),tokenHash=Buffer.alloc(32,202);
const ids=Object.freeze({
 customer:'b0a00000-0000-4000-8000-000000000001',
 sourceTable:'b0a00000-0000-4000-8000-000000000002',
 destinationTable:'b0a00000-0000-4000-8000-000000000003',
 sourceSession:'b0a00000-0000-4000-8000-000000000004',
 destinationSession:'b0a00000-0000-4000-8000-000000000005',
 sourceAccount:'b0a00000-0000-4000-8000-000000000006',
 destinationAccount:'b0a00000-0000-4000-8000-000000000007',
 order:'b0a00000-0000-4000-8000-000000000008',
 round:'b0a00000-0000-4000-8000-000000000009'
});
const sourceVisit='b0_source_visit_0001',destinationVisit='b0_destination_visit_0001';

async function transaction(handler){
 const client=await admin.connect();
 try{await client.query('BEGIN');return await handler(client);}
 finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
}

async function expectSqlError(client,callback,pattern){
 await client.query('SAVEPOINT expected_failure');
 let failure;
 try{await callback();}catch(error){failure=error;}
 await client.query('ROLLBACK TO SAVEPOINT expected_failure');
 assert.ok(failure,'expected PostgreSQL statement to fail');
 assert.match(failure.message,pattern);
 return failure;
}

async function insertIdentityAndTables(client,{publicId='SB-BABABABABABA'}={}){
 await client.query(`INSERT INTO sabora.customer_profiles(id,public_id,alias)
  VALUES($1,$2,'Auditoría cambio mesa')`,[ids.customer,publicId]);
 await client.query(`INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
  VALUES($1,$2,clock_timestamp()+interval '1 hour')`,[ids.customer,tokenHash]);
 await client.query(`INSERT INTO sabora.dining_tables(
   id,number,capacity,qr_token_hash,session_id,ordering_state,readiness_state)
  VALUES($1,981001,4,$3,$4,'open','LISTA'),($2,981002,4,$3,$5,'open','LISTA')`,
  [ids.sourceTable,ids.destinationTable,qrHash,ids.sourceSession,ids.destinationSession]);
}

async function insertVisit(client,{tableId,sessionId,visitKey}){
 await client.query(`INSERT INTO sabora.customer_table_visits(
   table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
  VALUES($1,$2,$3::uuid,$4,($3::uuid)::text,1,clock_timestamp()+interval '1 hour')`,
  [tableId,sessionId,ids.customer,visitKey]);
}


test('PG17 H6 pickup authorizes the effective destination with live QR, not historical order A',async()=>{
 const signature='sabora.manage_pickup_task_h6_candidate(text,text,uuid,text,text,uuid,bigint,text,bigint,bigint,text)';
 const result=await admin.query(`SELECT pg_get_functiondef(p.oid) AS definition,
  p.prosecdef AS security_definer,p.proowner::regrole::text AS owner,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS browser_execute,
  has_function_privilege('sabora_h6_operations_runtime',p.oid,'EXECUTE') AS operations_execute,
  has_function_privilege('sabora_h6_customer_runtime',p.oid,'EXECUTE') AS customer_execute
  FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,[signature]);
 assert.equal(result.rows.length,1,'effective pickup function must exist in PG17');
 const row=result.rows[0];
 assert.equal(row.security_definer,true);
 assert.equal(row.owner,'sabora_h6_fn_owner');
 assert.equal(row.anon_execute,false);
 assert.equal(row.browser_execute,false);
 assert.equal(row.customer_execute,false);
 assert.equal(row.operations_execute,true);
 assert.match(row.definition,/LEFT JOIN sabora\.order_line_delivery_destinations dest/);
 assert.match(row.definition,/COALESCE\(dest\.table_id,o\.table_id\)/);
 assert.match(row.definition,/COALESCE\(dest\.session_id,o\.session_id\)/);
 assert.match(row.definition,/COALESCE\(dest\.visit_key,o\.customer_visit_key\)/);
 assert.match(row.definition,/sabora\.customer_account_operational_bindings binding/);
 assert.match(row.definition,/binding\.account_id=v_scope\.account_id/);
 assert.match(row.definition,/binding\.table_id=v_scope\.table_id/);
 assert.match(row.definition,/binding\.session_id=v_scope\.session_id/);
 assert.match(row.definition,/binding\.visit_key=v_scope\.customer_visit_key/);
 assert.match(row.definition,/d\.ordering_state='open'/);
 assert.match(row.definition,/v\.authorized_qr_version=d\.qr_version/);
 assert.match(row.definition,/v\.revoked_at IS NULL AND v\.expires_at>clock_timestamp\(\)/);
 assert.match(row.definition,/FOR SHARE OF v/);
 assert.match(row.definition,/FOR UPDATE/);
 await transaction(async client=>{
  const now=Date.now();
  const failure=await expectSqlError(client,()=>client.query(`SELECT
   sabora.manage_pickup_task_h6_candidate($1,$2,$3::uuid,$4,$5,$6::uuid,
    $7::bigint,$8,$9::bigint,$10::bigint,$11)`,[
    'forged_pickup_key','postgres',ids.customer,'waiter','claim_pickup',
    ids.order,1,'forged_pickup_attempt_01',now,now+30000,'0'.repeat(64)
   ]),/invalid_pickup_capability/);
  assert.equal(failure.code,'42501');
 });
});

test('PG17 H6 delivery board is sealed and retains picked-up fallback in its SQL contract',async()=>{
 const signature='sabora.read_order_operations_delivery_board_h6_candidate(text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)';
 const result=await admin.query(`SELECT p.oid::regprocedure::text AS signature,
  pg_get_functiondef(p.oid) AS definition,p.prosecdef AS security_definer,
  p.proowner::regrole::text AS owner,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('sabora_h6_operations_runtime',p.oid,'EXECUTE') AS h6_operations_execute
  FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,[signature]);
 assert.equal(result.rows.length,1);
 const row=result.rows[0];
 assert.equal(row.security_definer,true);
 assert.equal(row.owner,'sabora_order_operations_fn_owner');
 assert.equal(row.anon_execute,false);
 assert.equal(row.authenticated_execute,false);
 assert.equal(row.h6_operations_execute,false);
 assert.match(row.definition,/authorize_order_operation_read_candidate/);
 assert.match(row.definition,/LEFT JOIN sabora.order_line_delivery_destinations/);
 assert.match(row.definition,/coalesce\(d\.table_id,\s*l\.table_id\)/i);
 assert.match(row.definition,/d\.order_line_id\s+IS\s+NOT\s+NULL\s+OR\s+l\.status\s*=\s*'picked_up'/i);
 assert.match(row.definition,/p_staff_role\s*=\s*'kitchen'/);
 assert.match(row.definition,/p_staff_role\s*=\s*'waiter'/);
});

test('PG17 H6 sealed delivery board rejects forged staff read capability before returning rows',async()=>{
 await transaction(async client=>{
  const sql=`SELECT * FROM sabora.read_order_operations_delivery_board_h6_candidate(
   $1::text,$2::text,$3::uuid,$4::text,$5::text,$6::bigint,$7::uuid,
   $8::integer,$9::integer,$10::bigint,$11::bigint,$12::text)`;
  const now=Date.now();
  const args=['forged_key_2026','postgres',ids.customer,'waiter',null,
   null,null,null,50,now,now+15000,'0'.repeat(64)];
  const error=await expectSqlError(client,()=>client.query(sql,args),
   /invalid_order_operation_read_capability/);
  assert.equal(error.code,'42501');
 });
});

test('PG17 catalog proves the economic, delivery and event dependency graph before refactor',async()=>{
 const constraints=(await admin.query(`SELECT c.conrelid::regclass::text AS child,
   pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  WHERE c.contype='f' AND c.confrelid=ANY(ARRAY[
   'sabora.customer_accounts'::regclass,'sabora.order_rounds'::regclass,
   'sabora.orders'::regclass,'sabora.dining_tables'::regclass])
  ORDER BY child,definition`)).rows.map(row=>`${row.child} ${row.definition}`).join('\n');
 for(const relation of [
  /order_rounds FOREIGN KEY \(account_id\) REFERENCES sabora\.customer_accounts\(id\)/,
  /payment_attempts FOREIGN KEY \(account_id\) REFERENCES sabora\.customer_accounts\(id\)/,
  /cash_settlements FOREIGN KEY \(account_id\) REFERENCES sabora\.customer_accounts\(id\)/,
  /event_outbox FOREIGN KEY \(account_id\) REFERENCES sabora\.customer_accounts\(id\)/,
  /customer_table_change_requests FOREIGN KEY \(account_id\) REFERENCES sabora\.customer_accounts\(id\)/,
  /kitchen_dispatches FOREIGN KEY \(round_id\) REFERENCES sabora\.order_rounds\(id\)/,
  /kitchen_dispatches FOREIGN KEY \(order_id\) REFERENCES sabora\.orders\(id\)/
 ])assert.match(constraints,relation);

 const columnRows=(await admin.query(`SELECT table_name,column_name
  FROM information_schema.columns WHERE table_schema='sabora'
   AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position`,[[
    'customer_accounts','kitchen_dispatches','pickup_tasks','event_outbox'
   ]])).rows;
 const columns=new Map();
 for(const {table_name:tableName,column_name:columnName} of columnRows){
  if(!columns.has(tableName))columns.set(tableName,[]);
  columns.get(tableName).push(columnName);
 }
 assert.deepEqual(columns.get('customer_accounts').filter(name=>
  ['id','table_id','session_id','visit_key','customer_id'].includes(name)),
 ['id','table_id','session_id','visit_key','customer_id']);
 assert.equal(columns.get('kitchen_dispatches').some(name=>/destination|delivery_table/.test(name)),false);
 assert.equal(columns.get('pickup_tasks').some(name=>/destination|delivery_table/.test(name)),false);
 for(const name of ['table_id','session_id','visit_key','customer_id','account_id'])
  assert.ok(columns.get('event_outbox').includes(name));

 const functionBody=(await admin.query(`SELECT pg_get_functiondef(p.oid) AS source
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='sabora' AND p.proname='confirm_customer_round_h6_candidate'`)).rows[0].source;
 assert.match(functionBody,/table_change_transfer_not_integrated/);
 assert.ok(functionBody.indexOf('persist_customer_order_candidate')<
  functionBody.indexOf('INSERT INTO sabora.customer_accounts'));

 const guardedTables=['customer_accounts','customer_table_change_requests','event_outbox','pickup_tasks'];
 const security=await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
   has_table_privilege('sabora_h6_customer_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS direct
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relname=ANY($1::text[])`,[guardedTables]);
 assert.equal(security.rows.length,guardedTables.length);
 assert.ok(security.rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity&&!row.direct));
});

test('PG17 schema reproduces two open economic accounts for one customer across table sessions',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client);
  await client.query(`INSERT INTO sabora.customer_accounts(
    id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400),
         ($6,$7,$8,$9,$5,'pay_at_end',clock_timestamp(),1800)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer,
    ids.destinationAccount,ids.destinationTable,ids.destinationSession,destinationVisit]);
  const duplicated=await client.query(`SELECT count(*)::integer AS accounts,
    count(DISTINCT table_id)::integer AS tables,count(DISTINCT session_id)::integer AS sessions,
    sum(outstanding_cents)::integer AS outstanding
   FROM sabora.customer_accounts WHERE customer_id=$1 AND state='open'`,[ids.customer]);
  assert.deepEqual(duplicated.rows,[{accounts:2,tables:2,sessions:2,outstanding:4200}]);
 });
});

test('PG17 historical H6 round stays readable from original visit after account location changes',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABC'});
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,
   visitKey:destinationVisit});
  await client.query(`INSERT INTO sabora.customer_accounts(
    id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.orders(id,table_id,session_id,company,employee_number,
    customer_alias,customer_identifier,customer_visit_key,economic_snapshot,
    confirmed_at,grouping,items)
   VALUES($1,$2,$3,NULL,NULL,'Auditoría cambio mesa',$4,$5,
    '{"schemaVersion":"1"}'::jsonb,clock_timestamp(),'first',
    '[{"category":"main","name":"Plato auditoría","quantity":1}]'::jsonb)`,
   [ids.order,ids.sourceTable,ids.sourceSession,'SB-BABABABABABC',sourceVisit]);
  await client.query(`INSERT INTO sabora.order_rounds(id,order_id,account_id,amount_cents,
    payment_mode,payment_policy_version,grouping_deadline,state)
   VALUES($1,$2,$3,2400,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')`,
   [ids.round,ids.order,ids.sourceAccount]);

  const read=async(tableId,visitKey)=>client.query(`SELECT account_id,round_id
   FROM sabora.read_customer_round_h6_candidate($1::bytea,$2::uuid,$3::text,$4::uuid)`,
   [tokenHash,tableId,visitKey,ids.order]);
  await client.query('SET LOCAL ROLE sabora_h6_customer_runtime');
  assert.deepEqual((await read(ids.sourceTable,sourceVisit)).rows,
   [{account_id:ids.sourceAccount,round_id:ids.round}]);
  await client.query('RESET ROLE');

  await client.query(`UPDATE sabora.customer_accounts SET table_id=$2,session_id=$3,
    visit_key=$4,updated_at=clock_timestamp() WHERE id=$1`,
   [ids.sourceAccount,ids.destinationTable,ids.destinationSession,destinationVisit]);
  await client.query('SET LOCAL ROLE sabora_h6_customer_runtime');
  assert.deepEqual((await read(ids.sourceTable,sourceVisit)).rows,
   [{account_id:ids.sourceAccount,round_id:ids.round}]);
  const destinationFailure=await expectSqlError(client,()=>read(ids.destinationTable,destinationVisit),
   /customer_round_scope_forbidden/);
  assert.equal(destinationFailure.code,'42501');
  await client.query('RESET ROLE');
  const history=await client.query(`SELECT o.table_id AS historical_table,
    a.table_id AS mutated_account_table,r.account_id
   FROM sabora.orders o JOIN sabora.order_rounds r ON r.order_id=o.id
   JOIN sabora.customer_accounts a ON a.id=r.account_id WHERE o.id=$1`,[ids.order]);
  assert.deepEqual(history.rows,[{historical_table:ids.sourceTable,
   mutated_account_table:ids.destinationTable,account_id:ids.sourceAccount}]);
 });
});

test('PG17 provisional guard blocks a legitimate new visit when an old account stays open',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABD'});
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,
   visitKey:destinationVisit});
  await client.query(`INSERT INTO sabora.customer_accounts(
    id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query('SET LOCAL ROLE sabora_h6_customer_runtime');
  const failure=await expectSqlError(client,()=>client.query(`SELECT *
   FROM sabora.confirm_customer_round_h6_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
    $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,[
   tokenHash,ids.destinationTable,'A'.repeat(43),destinationVisit,
   'b0_destination_basket_0001','b0_destination_request_0001',Buffer.alloc(32,43),
   'b0a00000-0000-4000-8000-000000000010','b0a00000-0000-4000-8000-000000000011',
   [],false,'pay_at_end']),/table_change_transfer_not_integrated/);
  assert.equal(failure.code,'23514');
  await client.query('RESET ROLE');
  assert.equal((await client.query(`SELECT count(*)::integer AS n FROM sabora.orders
   WHERE table_id=$1`,[ids.destinationTable])).rows[0].n,0);
  assert.equal((await client.query(`SELECT count(*)::integer AS n FROM sabora.customer_accounts
   WHERE customer_id=$1`,[ids.customer])).rows[0].n,1);
 });
});


test('PG17 B foundation enforces isolated operational binding and delivery projection without mutating history',async()=>{
 const names=['customer_account_operational_bindings','order_round_delivery_destinations'];
 const catalog=await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
   has_table_privilege('sabora_h6_customer_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS direct
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relname=ANY($1::text[])`,[names]);
 assert.equal(catalog.rows.length,2);
 assert.ok(catalog.rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity&&!row.direct));
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABE'});
  await client.query(`INSERT INTO sabora.customer_accounts(
    id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
    (account_id,table_id,session_id,visit_key)
    VALUES($1,$2,$3,$4)`,[ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  const initial=(await client.query(`SELECT a.id,a.outstanding_cents,b.binding_version,b.table_id
   FROM sabora.customer_accounts a
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   WHERE a.id=$1`,[ids.sourceAccount])).rows[0];
  assert.equal(initial.outstanding_cents,'2400');
  assert.equal(initial.table_id,ids.sourceTable);
  await client.query(`UPDATE sabora.customer_account_operational_bindings
   SET table_id=$2,session_id=$3,visit_key=$4,binding_version=binding_version+1,
   changed_at=clock_timestamp() WHERE account_id=$1`,
   [ids.sourceAccount,ids.destinationTable,ids.destinationSession,destinationVisit]);
  const moved=(await client.query(`SELECT a.table_id AS historic,b.table_id AS operational,
   b.binding_version,a.outstanding_cents FROM sabora.customer_accounts a
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   WHERE a.id=$1`,[ids.sourceAccount])).rows[0];
  assert.equal(moved.historic,ids.sourceTable);
  assert.equal(moved.operational,ids.destinationTable);
  assert.equal(moved.binding_version,'2');
  assert.equal(moved.outstanding_cents,'2400');
  await expectSqlError(client,()=>client.query(`INSERT INTO
   sabora.customer_account_operational_bindings(account_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4)`,[ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]),
   /duplicate key/);
  await client.query('SET LOCAL ROLE sabora_h6_customer_runtime');
  const denied=await expectSqlError(client,()=>client.query(`SELECT * FROM
   sabora.customer_account_operational_bindings WHERE account_id=$1`,[ids.sourceAccount]),
   /permission denied/);
  assert.equal(denied.code,'42501');
  await client.query('RESET ROLE');
 });
});


test('PG17 delivery projection preserves historical order, account, grouping and economic balances',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABF'});
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await client.query(`INSERT INTO sabora.customer_accounts(
    id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4)`,[ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  await client.query(`INSERT INTO sabora.orders(id,table_id,session_id,company,employee_number,
    customer_alias,customer_identifier,customer_visit_key,economic_snapshot,
    confirmed_at,grouping,items)
   VALUES($1,$2,$3,NULL,NULL,'Auditoría entrega',$4,$5,
    '{"schemaVersion":"1"}'::jsonb,clock_timestamp(),'first',
    '[{"category":"main","name":"Plato auditoría","quantity":1}]'::jsonb)`,
   [ids.order,ids.sourceTable,ids.sourceSession,'SB-BABABABABABF',sourceVisit]);
  await client.query(`INSERT INTO sabora.order_rounds(id,order_id,account_id,amount_cents,
    payment_mode,payment_policy_version,grouping_deadline,state)
   VALUES($1,$2,$3,2400,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')`,
   [ids.round,ids.order,ids.sourceAccount]);
  await client.query(`INSERT INTO sabora.order_round_delivery_destinations
   (round_id,account_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4,$5)`,
   [ids.round,ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  const before=(await client.query(`SELECT r.account_id,r.grouping_deadline,
   a.outstanding_cents,o.table_id AS historical_table,d.table_id AS delivery_table
   FROM sabora.order_rounds r JOIN sabora.customer_accounts a ON a.id=r.account_id
   JOIN sabora.orders o ON o.id=r.order_id
   JOIN sabora.order_round_delivery_destinations d ON d.round_id=r.id
   WHERE r.id=$1`,[ids.round])).rows[0];
  await client.query(`UPDATE sabora.order_round_delivery_destinations
   SET table_id=$2,session_id=$3,visit_key=$4,destination_version=destination_version+1
   WHERE round_id=$1`,[ids.round,ids.destinationTable,ids.destinationSession,destinationVisit]);
  const after=(await client.query(`SELECT r.account_id,r.grouping_deadline,
   a.outstanding_cents,o.table_id AS historical_table,d.table_id AS delivery_table,
   d.destination_version
   FROM sabora.order_rounds r JOIN sabora.customer_accounts a ON a.id=r.account_id
   JOIN sabora.orders o ON o.id=r.order_id
   JOIN sabora.order_round_delivery_destinations d ON d.round_id=r.id
   WHERE r.id=$1`,[ids.round])).rows[0];
  assert.equal(after.account_id,before.account_id);
  assert.equal(after.grouping_deadline.getTime(),before.grouping_deadline.getTime());
  assert.equal(after.outstanding_cents,before.outstanding_cents);
  assert.equal(after.historical_table,ids.sourceTable);
  assert.equal(after.delivery_table,ids.destinationTable);
  assert.equal(after.destination_version,'2');
  await client.query('SET LOCAL ROLE sabora_h6_customer_runtime');
  const denied=await expectSqlError(client,()=>client.query(`UPDATE
   sabora.order_round_delivery_destinations SET destination_version=3 WHERE round_id=$1`,
   [ids.round]),/permission denied/);
  assert.equal(denied.code,'42501');
  await client.query('RESET ROLE');
 });
});


test('PG17 H6 confirmation integrates account binding and delivery projection within root transaction',async()=>{
 const source=(await admin.query(`SELECT pg_get_functiondef(p.oid) AS source
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='sabora' AND p.proname='confirm_customer_round_h6_candidate'`)).rows[0].source;
 const lock=source.indexOf('pg_advisory_xact_lock');
 const sessionShare=source.indexOf('AND s.expires_at>clock_timestamp() FOR SHARE');
 const visitShare=source.indexOf('AND v.expires_at>clock_timestamp() FOR SHARE');
 const persist=source.indexOf('persist_customer_order_candidate');
 const account=source.indexOf('INSERT INTO sabora.customer_account_operational_bindings');
 const round=source.indexOf('INSERT INTO sabora.order_rounds');
 const delivery=source.indexOf('INSERT INTO sabora.order_round_delivery_destinations');
 assert.ok(sessionShare>=0&&sessionShare<lock&&lock<visitShare&&visitShare<persist);
 assert.ok(lock<persist&&persist<account&&account<round&&round<delivery);
 assert.match(source,/h6_replay_account_scope_conflict/);
 assert.match(source,/v_round\.account_id,v_round\.id/);
 assert.match(source,/table_change_transfer_not_integrated/);
 const roles=(await admin.query(`SELECT c.relname,
  has_table_privilege('sabora_h6_fn_owner',c.oid,'SELECT,INSERT,UPDATE') AS owner_access,
  has_table_privilege('sabora_h6_customer_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS customer_access,
  c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relname=ANY($1::text[])`,
 [['customer_account_operational_bindings','order_round_delivery_destinations']])).rows;
 assert.equal(roles.length,2);
 assert.ok(roles.every(row=>row.owner_access&&!row.customer_access&&
  row.relrowsecurity&&row.relforcerowsecurity));
});


test('PG17 table-change lifecycle is sealed and has no unauthenticated runtime entry',async()=>{
 const funcs=(await admin.query(`SELECT p.proname,p.prosecdef,
  pg_get_userbyid(p.proowner) AS owner,
  has_function_privilege('sabora_h6_customer_runtime',p.oid,'EXECUTE') AS customer_execute,
  has_function_privilege('sabora_h6_operations_runtime',p.oid,'EXECUTE') AS operations_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND p.proname=ANY($1::text[])`,
 [['request_customer_table_change_h6_candidate','decide_customer_table_change_h6_candidate']])).rows;
 assert.equal(funcs.length,2);
 assert.ok(funcs.every(f=>f.prosecdef&&f.owner==='sabora_h6_fn_owner'&&
  !f.customer_execute&&!f.operations_execute));
 const requests=(await admin.query(`SELECT c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege('sabora_h6_fn_owner',c.oid,'SELECT,INSERT,UPDATE') AS owner_access,
 has_table_privilege('sabora_h6_customer_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS customer_access
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='sabora' AND c.relname='customer_table_change_requests'`)).rows;
 assert.equal(requests.length,1);
 assert.ok(requests[0].relrowsecurity&&requests[0].relforcerowsecurity&&
  requests[0].owner_access&&!requests[0].customer_access);
});

test('PG17 table-change entrypoints deny PUBLIC, anon, authenticated and unrelated principals',async()=>{
 const principals=['anon','authenticated','sabora_admin_writer',
  'sabora_h6_provider_runtime','sabora_h6_customer_runtime','sabora_h6_operations_runtime'];
 const rows=(await admin.query(`SELECT p.proname,role_name,
  has_function_privilege(role_name,p.oid,'EXECUTE') AS executable
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN unnest($1::text[]) AS role_name
 WHERE n.nspname='sabora' AND p.proname=ANY($2::text[])`,[
  principals,['request_customer_table_change_h6_candidate','decide_customer_table_change_h6_candidate']
 ])).rows;
 assert.equal(rows.length,principals.length*2);
 assert.ok(rows.every(row=>!row.executable),
  'unwired lifecycle entrypoints must remain inaccessible to runtime principals');
 const publicExec=(await admin.query(`SELECT p.proname,
  EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='sabora' AND p.proname=ANY($1::text[])`,
  [['request_customer_table_change_h6_candidate','decide_customer_table_change_h6_candidate']])).rows;
 assert.equal(publicExec.length,2);
 assert.ok(publicExec.every(row=>!row.public_execute),'PUBLIC must have no EXECUTE grant');
 const tables=(await admin.query(`SELECT c.relname,role_name,
  has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE') AS direct
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN unnest($1::text[]) AS role_name
 WHERE n.nspname='sabora' AND c.relname=ANY($2::text[])`,[
  principals,['customer_table_change_requests','customer_account_operational_bindings',
   'order_round_delivery_destinations']
 ])).rows;
 assert.equal(tables.length,principals.length*3);
 assert.ok(tables.every(row=>!row.direct),
  'runtime principals must not access transfer persistence directly');
 const publicDml=(await admin.query(`SELECT c.relname,
  EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE a.grantee=0 AND a.privilege_type=ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE'])) AS public_dml
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relname=ANY($1::text[])`,
  [['customer_table_change_requests','customer_account_operational_bindings',
    'order_round_delivery_destinations']])).rows;
 assert.equal(publicDml.length,3);
 assert.ok(publicDml.every(row=>!row.public_dml),'PUBLIC must have no projection DML grants');
});

test('PG17 composite FK rejects delivery projection for another economic account',async()=>{
 const constraints=(await admin.query(`SELECT conname,convalidated
 FROM pg_constraint WHERE conrelid='sabora.order_round_delivery_destinations'::regclass
 AND conname='order_round_delivery_round_account_fk'`)).rows;
 assert.deepEqual(constraints,[{conname:'order_round_delivery_round_account_fk',convalidated:true}]);
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABG'});
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id)
   VALUES($1,$2,$3,$4,$5),($6,$7,$8,$9,$5)`,[
   ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer,
   ids.destinationAccount,ids.destinationTable,ids.destinationSession,destinationVisit
  ]);
  await client.query(`INSERT INTO sabora.orders(id,table_id,session_id,
   customer_alias,customer_identifier,customer_visit_key,economic_snapshot,
   confirmed_at,grouping,items)
   VALUES($1,$2,$3,'Auditoría entrega','SB-BABABABABABG',$4,
   '{"schemaVersion":"1"}'::jsonb,clock_timestamp(),'first',
   '[{"category":"main","name":"Plato auditoría","quantity":1}]'::jsonb)`,[
   ids.order,ids.sourceTable,ids.sourceSession,sourceVisit
  ]);
  await client.query(`INSERT INTO sabora.order_rounds
   (id,order_id,account_id,amount_cents,payment_policy_version,grouping_deadline,state)
   VALUES($1,$2,$3,0,1,clock_timestamp()+interval '5 minutes','free_grouping')`,[
   ids.round,ids.order,ids.sourceAccount
  ]);
  const error=await expectSqlError(client,()=>client.query(`INSERT INTO
   sabora.order_round_delivery_destinations
   (round_id,account_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4,$5)`,[
   ids.round,ids.destinationAccount,ids.destinationTable,ids.destinationSession,destinationVisit
  ]),/foreign key constraint/);
  assert.equal(error.code,'23503');
  assert.equal((await client.query(`SELECT count(*)::int AS n
   FROM sabora.order_round_delivery_destinations WHERE round_id=$1`,[ids.round])).rows[0].n,0);
  await client.query(`INSERT INTO sabora.order_round_delivery_destinations
   (round_id,account_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4,$5)`,[
   ids.round,ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit
  ]);
  assert.equal((await client.query(`SELECT account_id FROM sabora.order_round_delivery_destinations
   WHERE round_id=$1`,[ids.round])).rows[0].account_id,ids.sourceAccount);
 });
});

test('PG17 waiter decision takes customer advisory lock before account/request row locks',async()=>{
 const result=await admin.query(`SELECT pg_get_functiondef(p.oid) AS source,
  pg_get_userbyid(p.proowner) AS owner,p.prosecdef,
  has_function_privilege('sabora_h6_operations_runtime',p.oid,'EXECUTE') AS exposed
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND p.proname='decide_customer_table_change_h6_candidate'`);
 assert.equal(result.rows.length,1);
 const {source,owner,prosecdef,exposed}=result.rows[0];
 assert.equal(owner,'sabora_h6_fn_owner');
 assert.equal(prosecdef,true);
 assert.equal(exposed,false);
 const lock=source.indexOf('pg_advisory_xact_lock');
 const accountLock=source.search(/a\.state\s*=\s*'open'\s+FOR UPDATE/i);
 const requestLock=source.search(/q\.account_id\s*=\s*v_account_id\s+AND\s+q\.customer_id\s*=\s*v_customer\s+FOR UPDATE/i);
 assert.ok(lock>=0 && accountLock>lock && requestLock>accountLock,
  'decision must acquire customer advisory lock before account and request locks');
 assert.match(source,/v_request\.status\s*=\s*'pending'\s+AND\s+v_now\s*>=\s*v_request\.expires_at/);
});

test('PG17 request lifecycle enforces cooldown, expiry and no premature table transfer',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABH'});
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,visitKey:destinationVisit});
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,
    outstanding_cents) VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400)`,[
   ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer
  ]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,[
   ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit
  ]);
  await client.query(`INSERT INTO sabora.restaurant_settings(singleton,name)
   VALUES(true,'Sabora PG17 isolated test') ON CONFLICT(singleton) DO NOTHING`);
  const call=()=>client.query(`SELECT * FROM sabora.request_customer_table_change_h6_candidate(
   $1::bytea,$2::uuid)`,[tokenHash,ids.sourceAccount]);
  const first=(await call()).rows[0];
  assert.equal(first.request_status,'pending');
  assert.equal(first.expires_at instanceof Date,true);
  const saved=(await client.query(`SELECT status,source_table_id,destination_table_id,
   consumed_order_id,requesting_session_hash,expires_at,created_at
   FROM sabora.customer_table_change_requests WHERE id=$1`,[first.request_id])).rows[0];
  assert.equal(saved.source_table_id,ids.sourceTable);
  assert.equal(saved.destination_table_id,null);
  assert.equal(saved.consumed_order_id,null);
  assert.deepEqual(saved.requesting_session_hash,tokenHash);
  assert.ok(saved.expires_at.getTime()>saved.created_at.getTime());
  const cooldown=await expectSqlError(client,call,/table_change_cooldown/);
  assert.equal(cooldown.code,'23514');
  await client.query(`UPDATE sabora.customer_table_change_requests
   SET created_at=clock_timestamp()-interval '200 seconds',
   expires_at=clock_timestamp()-interval '110 seconds'
   WHERE id=$1`,[first.request_id]);
  const next=(await call()).rows[0];
  assert.notEqual(next.request_id,first.request_id);
  assert.equal(next.request_status,'pending');
  const expired=(await client.query(`SELECT status FROM sabora.customer_table_change_requests
   WHERE id=$1`,[first.request_id])).rows[0];
  assert.equal(expired.status,'expired');
  const scope=(await client.query(`SELECT a.table_id AS historical,b.table_id AS operational,
   a.outstanding_cents,b.binding_version
   FROM sabora.customer_accounts a
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   WHERE a.id=$1`,[ids.sourceAccount])).rows[0];
  assert.equal(scope.historical,ids.sourceTable);
  assert.equal(scope.operational,ids.sourceTable);
  assert.equal(scope.outstanding_cents,'2400');
  assert.equal(scope.binding_version,'1');
  assert.equal((await client.query(`SELECT count(*)::int AS n
   FROM sabora.orders WHERE table_id=$1`,[ids.destinationTable])).rows[0].n,0);
 });
});

test('PG17 line destinations are account-scoped, sealed, and exclude completed pickups',async()=>{
 const columns=(await admin.query(`SELECT column_name FROM information_schema.columns
  WHERE table_schema='sabora' AND table_name='order_line_delivery_destinations'`))
  .rows.map(row=>row.column_name);
 for(const name of ['order_line_id','round_id','account_id','order_id','table_id',
  'session_id','visit_key','destination_version','changed_at'])
  assert.ok(columns.includes(name),name);
 const constraints=(await admin.query(`SELECT pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
  WHERE conrelid='sabora.order_line_delivery_destinations'::regclass
    AND contype='f'`)).rows.map(row=>row.definition).join('\n');
 assert.match(constraints,/FOREIGN KEY \(round_id, account_id\) REFERENCES sabora\.order_rounds\(id, account_id\)/);
 assert.match(constraints,/FOREIGN KEY \(order_id, order_line_id\) REFERENCES sabora\.order_lines\(order_id, id\)/);
 const lineKey=(await admin.query(`SELECT conname,pg_get_constraintdef(oid) AS definition
  FROM pg_constraint WHERE conrelid='sabora.order_lines'::regclass
  AND conname='order_lines_order_id_id_unique'`)).rows;
 assert.equal(lineKey.length,1,'line/order composite FK requires explicit referenced unique key');
 assert.match(lineKey[0].definition,/UNIQUE \(order_id, id\)/);
 const security=(await admin.query(`SELECT c.relrowsecurity,c.relforcerowsecurity,
  has_table_privilege('sabora_h6_customer_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS direct
  FROM pg_class c WHERE c.oid='sabora.order_line_delivery_destinations'::regclass`)).rows[0];
 assert.equal(security.relrowsecurity,true);
 assert.equal(security.relforcerowsecurity,true);
 assert.equal(security.direct,false);
 const source=(await admin.query(`SELECT pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='sabora' AND p.proname='confirm_customer_round_h6_candidate'`)).rows[0].definition;
 assert.match(source,/table_change_transfer_not_integrated/);
 const roundInsert=source.indexOf('INSERT INTO sabora.order_round_delivery_destinations');
 const lineInsert=source.indexOf('INSERT INTO sabora.order_line_delivery_destinations');
 const dispatchInsert=source.indexOf('INSERT INTO sabora.kitchen_dispatches');
 assert.ok(roundInsert>=0 && lineInsert>roundInsert && dispatchInsert>lineInsert,
  'new lines must be projected in the same confirmation transaction before dispatch');
 assert.match(source,/l[.]status\s*<>\s*'picked_up'/);
 const pending=(await admin.query(`SELECT count(*)::int AS n
  FROM sabora.order_line_delivery_destinations d
  JOIN sabora.order_lines l ON l.id=d.order_line_id
  WHERE l.status='picked_up'`)).rows[0].n;
 assert.equal(pending,0);
});

test('PG17 atomic grant consumer is sealed and updates only non-picked-up delivery projections',async()=>{
 const fn=(await admin.query(`SELECT p.oid,pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND p.proname='consume_customer_table_change_h6_candidate'`)).rows;
 assert.equal(fn.length,1);
 const body=fn[0].definition;
 assert.match(body,/pg_advisory_xact_lock/);
 assert.match(body,/status='approved'/);
 assert.match(body,/status='consumed'/);
 assert.match(body,/consumed_order_id=p_confirmed_order_id/);
 assert.match(body,/r.order_id=o.id AND r.account_id=p_account_id/);
 assert.match(body,/v_grant.requesting_session_hash<>p_session_hash/);
 assert.match(body,/table_change_approval_session_revoked/);
 assert.match(body,/l.status<>'picked_up'/);
 assert.match(body,/UPDATE sabora.order_line_delivery_destinations/);
 assert.match(body,/UPDATE sabora.order_round_delivery_destinations/);
 assert.match(body,/NOT EXISTS/);
 assert.match(body,/l.status='picked_up'/);
 assert.match(body,/UPDATE sabora.customer_account_operational_bindings/);
 assert.doesNotMatch(body,/UPDATE sabora.customer_accounts/);
 assert.doesNotMatch(body,/UPDATE sabora.orders/);
 assert.doesNotMatch(body,/UPDATE sabora.payment_attempts/);
 const grants=(await admin.query(`SELECT
 has_function_privilege('sabora_h6_customer_runtime',$1::oid,'EXECUTE') AS customer,
 has_function_privilege('sabora_h6_operations_runtime',$1::oid,'EXECUTE') AS staff,
 has_function_privilege('anon',$1::oid,'EXECUTE') AS anonymous`,[fn[0].oid])).rows[0];
 assert.deepEqual(grants,{customer:false,staff:false,anonymous:false});
});

test('PG17 isolated B2 confirmation retains production guard and seals transfer integration',async()=>{
 const functions=(await admin.query(`SELECT p.proname,p.oid,pg_get_functiondef(p.oid) AS body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND p.proname IN
 ('confirm_customer_round_h6_candidate','confirm_customer_round_h6_transfer_integration_candidate')`)).rows;
 assert.equal(functions.length,2);
 const active=functions.find(x=>x.proname==='confirm_customer_round_h6_candidate');
 const isolated=functions.find(x=>x.proname==='confirm_customer_round_h6_transfer_integration_candidate');
 assert.match(active.body,/table_change_transfer_not_integrated/);
 assert.doesNotMatch(active.body,/consume_customer_table_change_h6_candidate/);
 assert.match(isolated.body,/v_transfer:=true/);
 assert.match(isolated.body,/h6_multiple_open_accounts_ambiguous/);
 assert.match(isolated.body,/v_round.order_id/);
 assert.match(isolated.body,/consume_customer_table_change_h6_candidate/);
 assert.match(isolated.body,/v_round.account_id<>v_account.id/);
 assert.match(isolated.body,/persist_customer_order_candidate/);
 const grants=(await admin.query(`SELECT
 has_function_privilege('sabora_h6_customer_runtime',$1::oid,'EXECUTE') AS customer,
 has_function_privilege('anon',$1::oid,'EXECUTE') AS anonymous,
 has_function_privilege('sabora_h6_operations_runtime',$1::oid,'EXECUTE') AS operations`,[isolated.oid])).rows[0];
 assert.deepEqual(grants,{customer:false,anonymous:false,operations:false});
});

test('PG17 B2 primitive refuses invalid consumption without mutating approvals or bindings',async()=>{
 const before=(await admin.query(`SELECT
  (SELECT count(*)::bigint FROM sabora.customer_table_change_requests) AS requests,
  (SELECT count(*)::bigint FROM sabora.customer_account_operational_bindings) AS bindings,
  (SELECT count(*)::bigint FROM sabora.order_line_delivery_destinations) AS destinations`)).rows[0];
 await assert.rejects(
  admin.query(`SELECT sabora.consume_customer_table_change_h6_candidate(
   NULL::uuid,NULL::uuid,NULL::bytea,NULL::uuid,NULL::uuid,NULL::text,NULL::uuid)`),
  err=>err.code==='22023' && /invalid_table_change_consumption/.test(err.message)
 );
 const after=(await admin.query(`SELECT
  (SELECT count(*)::bigint FROM sabora.customer_table_change_requests) AS requests,
  (SELECT count(*)::bigint FROM sabora.customer_account_operational_bindings) AS bindings,
  (SELECT count(*)::bigint FROM sabora.order_line_delivery_destinations) AS destinations`)).rows[0];
 assert.deepEqual(after,before);
});

test('PG17 waiter decision obtains customer advisory lock before locking economic account',async()=>{
 const fn=(await admin.query(`SELECT pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='sabora' AND p.proname='decide_customer_table_change_h6_candidate'`)).rows;
 assert.equal(fn.length,1);
 const body=fn[0].definition;
 const advisory=body.indexOf('pg_advisory_xact_lock');
 const accountLock=body.indexOf("a.state='open' FOR UPDATE");
 const requestLock=body.indexOf('q.customer_id=v_customer FOR UPDATE');
 assert.ok(advisory>=0 && accountLock>advisory && requestLock>accountLock,
  'decision must serialize by customer before locking account and request');
 assert.match(body,/table_change_account_closed/);
 assert.match(body,/table_change_request_missing/);
});

test('PG17 B2 transfer rejects absent approval with live account and destination visit',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABJ'});
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,visitKey:destinationVisit});
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp())`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  const denied=await expectSqlError(client,()=>client.query(`SELECT
   sabora.consume_customer_table_change_h6_candidate(
   $1::uuid,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::text,$7::uuid)`,
   [ids.sourceAccount,ids.customer,tokenHash,ids.destinationTable,
    ids.destinationSession,destinationVisit,ids.order]),/table_change_approval_required/);
  assert.equal(denied.code,'23514');
  const binding=(await client.query(`SELECT table_id,binding_version FROM
   sabora.customer_account_operational_bindings WHERE account_id=$1`,
   [ids.sourceAccount])).rows[0];
  assert.equal(binding.table_id,ids.sourceTable);
  assert.equal(binding.binding_version,'1');
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM
   sabora.customer_table_change_requests WHERE account_id=$1`,
   [ids.sourceAccount])).rows[0].n,0);
 });
});

test('PG17 B2 consumes a real approval once and preserves economic account and order history',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABK'});
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,visitKey:destinationVisit});
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,
    outstanding_cents) VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  await client.query(`INSERT INTO sabora.orders(id,table_id,session_id,company,employee_number,
   customer_alias,customer_identifier,customer_visit_key,economic_snapshot,
   confirmed_at,grouping,items)
   VALUES($1,$2,$3,NULL,NULL,'Auditoría transferencia',$4,$5,
   '{"schemaVersion":"1"}'::jsonb,clock_timestamp(),'first',
   '[{"category":"main","name":"Plato transferencia","quantity":1}]'::jsonb)`,
   [ids.order,ids.destinationTable,ids.destinationSession,'SB-BABABABABABK',destinationVisit]);
  await client.query(`INSERT INTO sabora.order_rounds(id,order_id,account_id,amount_cents,
   payment_mode,payment_policy_version,grouping_deadline,state)
   VALUES($1,$2,$3,1000,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')`,
   [ids.round,ids.order,ids.sourceAccount]);
  const request=(await client.query(`INSERT INTO sabora.customer_table_change_requests(
   account_id,customer_id,visit_key,source_table_id,status,
   requesting_session_hash,expires_at,decided_at,decided_by)
   VALUES($1,$2,$3,$4,'approved',$5,clock_timestamp()+interval '90 seconds',
   clock_timestamp(),$2) RETURNING id`,
   [ids.sourceAccount,ids.customer,sourceVisit,ids.sourceTable,tokenHash])).rows[0];
  const call=()=>client.query(`SELECT sabora.consume_customer_table_change_h6_candidate(
   $1::uuid,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::text,$7::uuid) AS approval`,
   [ids.sourceAccount,ids.customer,tokenHash,ids.destinationTable,
    ids.destinationSession,destinationVisit,ids.order]);
  // The same approved grant must not authorize an unrelated destination,
  // another session, or a destination order that is not tied to this account.
  const wrongDestination=await expectSqlError(client,()=>client.query(`SELECT
   sabora.consume_customer_table_change_h6_candidate(
   $1::uuid,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::text,$7::uuid)`,
   [ids.sourceAccount,ids.customer,tokenHash,ids.sourceTable,
    ids.sourceSession,sourceVisit,ids.order]),/table_change_same_table/);
  assert.equal(wrongDestination.code,'23514');
  const wrongSession=await expectSqlError(client,()=>client.query(`SELECT
   sabora.consume_customer_table_change_h6_candidate(
   $1::uuid,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::text,$7::uuid)`,
   [ids.sourceAccount,ids.customer,Buffer.alloc(32,203),ids.destinationTable,
    ids.destinationSession,destinationVisit,ids.order]),/table_change_session_forbidden/);
  assert.equal(wrongSession.code,'42501');
  const wrongOrder=await expectSqlError(client,()=>client.query(`SELECT
   sabora.consume_customer_table_change_h6_candidate(
   $1::uuid,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::text,$7::uuid)`,
   [ids.sourceAccount,ids.customer,tokenHash,ids.destinationTable,
    ids.destinationSession,destinationVisit,ids.destinationAccount]),/table_change_order_scope_forbidden/);
  assert.equal(wrongOrder.code,'42501');
  const before=(await client.query(`SELECT b.table_id,b.binding_version,q.status
   FROM sabora.customer_account_operational_bindings b
   JOIN sabora.customer_table_change_requests q ON q.account_id=b.account_id
   WHERE b.account_id=$1`,[ids.sourceAccount])).rows[0];
  assert.equal(before.table_id,ids.sourceTable);
  assert.equal(before.binding_version,'1');
  assert.equal(before.status,'approved');
  await client.query('SAVEPOINT before_valid_transfer');
  const first=(await call()).rows[0];
  assert.equal(first.approval,request.id);
  const state=(await client.query(`SELECT a.table_id AS historical,a.outstanding_cents,
   b.table_id AS current,b.binding_version,q.status,q.consumed_order_id,
   o.table_id AS order_table,r.account_id
   FROM sabora.customer_accounts a
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   JOIN sabora.customer_table_change_requests q ON q.account_id=a.id
   JOIN sabora.order_rounds r ON r.account_id=a.id
   JOIN sabora.orders o ON o.id=r.order_id
   WHERE a.id=$1`,[ids.sourceAccount])).rows[0];
  assert.equal(state.historical,ids.sourceTable);
  assert.equal(state.current,ids.destinationTable);
  assert.equal(state.binding_version,'2');
  assert.equal(state.outstanding_cents,'2400');
  assert.equal(state.status,'consumed');
  assert.equal(state.consumed_order_id,ids.order);
  assert.equal(state.order_table,ids.destinationTable);
  assert.equal(state.account_id,ids.sourceAccount);
  const replay=await expectSqlError(client,call,/table_change_same_table/);
  assert.equal(replay.code,'23514');
  assert.equal((await client.query(`SELECT binding_version FROM
   sabora.customer_account_operational_bindings WHERE account_id=$1`,
   [ids.sourceAccount])).rows[0].binding_version,'2');
  // A transaction rollback must restore both grant and operational location.
  await client.query('ROLLBACK TO SAVEPOINT before_valid_transfer');
  const restored=(await client.query(`SELECT b.table_id,b.binding_version,q.status,
    q.consumed_order_id,q.consumed_at
   FROM sabora.customer_account_operational_bindings b
   JOIN sabora.customer_table_change_requests q ON q.account_id=b.account_id
   WHERE b.account_id=$1`,[ids.sourceAccount])).rows[0];
  assert.equal(restored.table_id,ids.sourceTable);
  assert.equal(restored.binding_version,'1');
  assert.equal(restored.status,'approved');
  assert.equal(restored.consumed_order_id,null);
  assert.equal(restored.consumed_at,null);
  // The same grant remains usable after a rolled-back confirmation.
  const retry=(await call()).rows[0];
  assert.equal(retry.approval,request.id);
  assert.equal((await client.query(`SELECT status FROM sabora.customer_table_change_requests
    WHERE id=$1`,[request.id])).rows[0].status,'consumed');
 });
});

test('PG17 B2 integrated confirmation rejects missing session before any economic or delivery writes',async()=>{
 await transaction(async client=>{
  const before=(await client.query(`SELECT
   (SELECT count(*)::bigint FROM sabora.orders) AS orders,
   (SELECT count(*)::bigint FROM sabora.customer_accounts) AS accounts,
   (SELECT count(*)::bigint FROM sabora.order_rounds) AS rounds,
   (SELECT count(*)::bigint FROM sabora.customer_table_change_requests) AS approvals,
   (SELECT count(*)::bigint FROM sabora.customer_account_operational_bindings) AS bindings,
   (SELECT count(*)::bigint FROM sabora.order_line_delivery_destinations) AS deliveries,
   (SELECT count(*)::bigint FROM sabora.payment_attempts) AS payments`)).rows[0];
  const failure=await expectSqlError(client,()=>client.query(`SELECT *
   FROM sabora.confirm_customer_round_h6_transfer_integration_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
    $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,
   [Buffer.alloc(32,244),ids.destinationTable,'invalid-qr',destinationVisit,
    'invalid-basket','invalid-request',Buffer.alloc(32,245),ids.round,
    ids.order,JSON.stringify([]),false,'pay_at_end']),/customer_session_forbidden/);
  assert.equal(failure.code,'42501');
  const after=(await client.query(`SELECT
   (SELECT count(*)::bigint FROM sabora.orders) AS orders,
   (SELECT count(*)::bigint FROM sabora.customer_accounts) AS accounts,
   (SELECT count(*)::bigint FROM sabora.order_rounds) AS rounds,
   (SELECT count(*)::bigint FROM sabora.customer_table_change_requests) AS approvals,
   (SELECT count(*)::bigint FROM sabora.customer_account_operational_bindings) AS bindings,
   (SELECT count(*)::bigint FROM sabora.order_line_delivery_destinations) AS deliveries,
   (SELECT count(*)::bigint FROM sabora.payment_attempts) AS payments`)).rows[0];
  assert.deepEqual(after,before);
 });
});

test('PG17 integrated B2 rejects unauthorized destination and unapproved transfer without persisting an order',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABL'});
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp())`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  const confirm=()=>client.query(`SELECT *
   FROM sabora.confirm_customer_round_h6_transfer_integration_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
    $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,
   [tokenHash,ids.destinationTable,'invalid-qr',destinationVisit,
    'transfer-basket','transfer-request',Buffer.alloc(32,204),ids.round,
    ids.order,JSON.stringify([]),false,'pay_at_end']);
  const invalidVisit=await expectSqlError(client,confirm,/customer_visit_forbidden/);
  assert.equal(invalidVisit.code,'42501');
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,visitKey:destinationVisit});
  const missingApproval=await expectSqlError(client,confirm,/table_change_approval_required/);
  assert.equal(missingApproval.code,'23514');
  const state=(await client.query(`SELECT
   (SELECT count(*)::int FROM sabora.orders WHERE id=$1) AS orders,
   (SELECT count(*)::int FROM sabora.order_rounds WHERE order_id=$1) AS rounds,
   (SELECT count(*)::int FROM sabora.customer_table_change_requests WHERE account_id=$2) AS grants,
   (SELECT count(*)::int FROM sabora.payment_attempts WHERE account_id=$2) AS payments,
   (SELECT count(*)::int FROM sabora.order_line_delivery_destinations WHERE account_id=$2) AS deliveries,
   b.table_id,b.binding_version
   FROM sabora.customer_account_operational_bindings b WHERE b.account_id=$2`,
   [ids.order,ids.sourceAccount])).rows[0];
  assert.equal(state.orders,0);
  assert.equal(state.rounds,0);
  assert.equal(state.grants,0);
  assert.equal(state.payments,0);
  assert.equal(state.deliveries,0);
  assert.equal(state.table_id,ids.sourceTable);
  assert.equal(state.binding_version,'1');
 });
});

test('PG17 integrated B2 preserves approved grant if destination order cannot be persisted',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABM'});
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,visitKey:destinationVisit});
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp())`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  const approval=(await client.query(`INSERT INTO sabora.customer_table_change_requests(
   account_id,customer_id,visit_key,source_table_id,status,
   requesting_session_hash,expires_at,decided_at,decided_by)
   VALUES($1,$2,$3,$4,'approved',$5,clock_timestamp()+interval '90 seconds',
   clock_timestamp(),$2) RETURNING id`,
   [ids.sourceAccount,ids.customer,sourceVisit,ids.sourceTable,tokenHash])).rows[0];
  const failure=await expectSqlError(client,()=>client.query(`SELECT *
   FROM sabora.confirm_customer_round_h6_transfer_integration_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
    $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,
   [tokenHash,ids.destinationTable,'definitely-invalid-qr',destinationVisit,
    'approved-basket','approved-request',Buffer.alloc(32,205),ids.round,
    ids.order,JSON.stringify([]),false,'pay_at_end']),/./);
  assert.ok(failure.code);
  const state=(await client.query(`SELECT q.status,q.consumed_order_id,
   b.table_id,b.binding_version,
   (SELECT count(*)::int FROM sabora.orders WHERE id=$2) AS orders,
   (SELECT count(*)::int FROM sabora.order_rounds WHERE order_id=$2) AS rounds
   FROM sabora.customer_table_change_requests q
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
   WHERE q.id=$1`,[approval.id,ids.order])).rows[0];
  assert.equal(state.status,'approved');
  assert.equal(state.consumed_order_id,null);
  assert.equal(state.table_id,ids.sourceTable);
  assert.equal(state.binding_version,'1');
  assert.equal(state.orders,0);
  assert.equal(state.rounds,0);
 });
});

test('PG17 B2 atomic transfer redirects pending earlier round but preserves historical order and economic account',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABN'});
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,visitKey:destinationVisit});
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  const previousOrder='b0a00000-0000-4000-8000-000000000010';
  const previousRound='b0a00000-0000-4000-8000-000000000011';
  for(const [orderId,tableId,sessionId,visitKey] of [
   [previousOrder,ids.sourceTable,ids.sourceSession,sourceVisit],
   [ids.order,ids.destinationTable,ids.destinationSession,destinationVisit]
  ]){
   await client.query(`INSERT INTO sabora.orders(id,table_id,session_id,company,employee_number,
    customer_alias,customer_identifier,customer_visit_key,economic_snapshot,
    confirmed_at,grouping,items)
    VALUES($1,$2,$3,NULL,NULL,'Auditoría transferencia',$4,$5,
    '{"schemaVersion":"1"}'::jsonb,clock_timestamp(),'first',
    '[{"category":"main","name":"Plato transferencia","quantity":1}]'::jsonb)`,
    [orderId,tableId,sessionId,'SB-BABABABABABN',visitKey]);
  }
  for(const [roundId,orderId] of [[previousRound,previousOrder],[ids.round,ids.order]]){
   await client.query(`INSERT INTO sabora.order_rounds(id,order_id,account_id,amount_cents,
    payment_mode,payment_policy_version,grouping_deadline,state)
    VALUES($1,$2,$3,1000,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')`,
    [roundId,orderId,ids.sourceAccount]);
  }
  await client.query(`INSERT INTO sabora.order_round_delivery_destinations
   (round_id,account_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4,$5)`,
   [previousRound,ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  const grant=(await client.query(`INSERT INTO sabora.customer_table_change_requests(
   account_id,customer_id,visit_key,source_table_id,status,
   requesting_session_hash,expires_at,decided_at,decided_by)
   VALUES($1,$2,$3,$4,'approved',$5,clock_timestamp()+interval '90 seconds',
   clock_timestamp(),$2) RETURNING id`,
   [ids.sourceAccount,ids.customer,sourceVisit,ids.sourceTable,tokenHash])).rows[0];
  const consumed=(await client.query(`SELECT sabora.consume_customer_table_change_h6_candidate(
   $1::uuid,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::text,$7::uuid) AS id`,
   [ids.sourceAccount,ids.customer,tokenHash,ids.destinationTable,
    ids.destinationSession,destinationVisit,ids.order])).rows[0];
  assert.equal(consumed.id,grant.id);
  const state=(await client.query(`SELECT a.table_id AS account_table,a.outstanding_cents,
   b.table_id AS operational_table,b.binding_version,
   d.table_id AS delivery_table,d.session_id AS delivery_session,
   d.visit_key AS delivery_visit,d.destination_version,
   o.table_id AS original_order_table,r.account_id AS round_account,
   q.status,q.consumed_order_id
   FROM sabora.customer_accounts a
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   JOIN sabora.order_rounds r ON r.account_id=a.id AND r.id=$2
   JOIN sabora.orders o ON o.id=r.order_id
   JOIN sabora.order_round_delivery_destinations d ON d.round_id=r.id
   JOIN sabora.customer_table_change_requests q ON q.account_id=a.id
   WHERE a.id=$1`,[ids.sourceAccount,previousRound])).rows[0];
  assert.equal(state.account_table,ids.sourceTable);
  assert.equal(state.outstanding_cents,'2400');
  assert.equal(state.operational_table,ids.destinationTable);
  assert.equal(state.binding_version,'2');
  assert.equal(state.delivery_table,ids.destinationTable);
  assert.equal(state.delivery_session,ids.destinationSession);
  assert.equal(state.delivery_visit,destinationVisit);
  assert.equal(state.destination_version,'2');
  assert.equal(state.original_order_table,ids.sourceTable);
  assert.equal(state.round_account,ids.sourceAccount);
  assert.equal(state.status,'consumed');
  assert.equal(state.consumed_order_id,ids.order);
 });
});

test('PG17 B2 chained A-to-B-to-C requires a fresh approval and preserves the original economic account',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABP'});
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,visitKey:destinationVisit});
  const thirdTable='b0a00000-0000-4000-8000-000000000020';
  const thirdSession='b0a00000-0000-4000-8000-000000000021';
  const thirdOrder='b0a00000-0000-4000-8000-000000000022';
  const thirdRound='b0a00000-0000-4000-8000-000000000023';
  const thirdVisit='b0_third_visit_0001';
  await client.query(`INSERT INTO sabora.dining_tables(
   id,number,capacity,qr_token_hash,session_id,ordering_state,readiness_state)
   VALUES($1,981003,4,$2,$3,'open','LISTA')`,[thirdTable,qrHash,thirdSession]);
  await insertVisit(client,{tableId:thirdTable,sessionId:thirdSession,visitKey:thirdVisit});
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),500)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  for(const [orderId,tableId,sessionId,visitKey] of [
   [ids.order,ids.destinationTable,ids.destinationSession,destinationVisit],
   [thirdOrder,thirdTable,thirdSession,thirdVisit]
  ]){
   await client.query(`INSERT INTO sabora.orders(id,table_id,session_id,company,employee_number,
    customer_alias,customer_identifier,customer_visit_key,economic_snapshot,
    confirmed_at,grouping,items)
    VALUES($1,$2,$3,NULL,NULL,'Auditoría cadena',$4,$5,
    '{"schemaVersion":"1"}'::jsonb,clock_timestamp(),'first',
    '[{"category":"main","name":"Plato cadena","quantity":1}]'::jsonb)`,
    [orderId,tableId,sessionId,'SB-BABABABABABP',visitKey]);
  }
  for(const [roundId,orderId] of [[ids.round,ids.order],[thirdRound,thirdOrder]]){
   await client.query(`INSERT INTO sabora.order_rounds(id,order_id,account_id,amount_cents,
    payment_mode,payment_policy_version,grouping_deadline,state)
    VALUES($1,$2,$3,500,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')`,
    [roundId,orderId,ids.sourceAccount]);
  }
  const approve=async(sourceTable,visitKey)=>(await client.query(`INSERT INTO sabora.customer_table_change_requests(
   account_id,customer_id,visit_key,source_table_id,status,
   requesting_session_hash,expires_at,decided_at,decided_by)
   VALUES($1,$2,$3,$4,'approved',$5,clock_timestamp()+interval '90 seconds',
   clock_timestamp(),$2) RETURNING id`,
   [ids.sourceAccount,ids.customer,visitKey,sourceTable,tokenHash])).rows[0].id;
  const consume=(table,session,visit,order)=>client.query(`SELECT
   sabora.consume_customer_table_change_h6_candidate(
   $1::uuid,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::text,$7::uuid) AS id`,
   [ids.sourceAccount,ids.customer,tokenHash,table,session,visit,order]);
  const firstGrant=await approve(ids.sourceTable,sourceVisit);
  assert.equal((await consume(ids.destinationTable,ids.destinationSession,destinationVisit,ids.order)).rows[0].id,firstGrant);
  await expectSqlError(client,()=>consume(thirdTable,thirdSession,thirdVisit,thirdOrder),/table_change_approval_required/);
  const afterRejected=(await client.query(`SELECT table_id,binding_version FROM
   sabora.customer_account_operational_bindings WHERE account_id=$1`,
   [ids.sourceAccount])).rows[0];
  assert.equal(afterRejected.table_id,ids.destinationTable);
  assert.equal(afterRejected.binding_version,'2');
  const secondGrant=await approve(ids.destinationTable,destinationVisit);
  assert.notEqual(firstGrant,secondGrant);
  assert.equal((await consume(thirdTable,thirdSession,thirdVisit,thirdOrder)).rows[0].id,secondGrant);
  const result=(await client.query(`SELECT a.table_id AS historical_table,
   a.outstanding_cents,b.table_id AS operational_table,b.binding_version,
   (SELECT count(*)::int FROM sabora.customer_table_change_requests q
    WHERE q.account_id=a.id AND q.status='consumed') AS consumed_count,
   (SELECT count(*)::int FROM sabora.order_rounds r
    WHERE r.account_id=a.id) AS round_count
   FROM sabora.customer_accounts a
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   WHERE a.id=$1`,[ids.sourceAccount])).rows[0];
  assert.equal(result.historical_table,ids.sourceTable);
  assert.equal(result.outstanding_cents,'500');
  assert.equal(result.operational_table,thirdTable);
  assert.equal(result.binding_version,'3');
  assert.equal(result.consumed_count,2);
  assert.equal(result.round_count,2);
 });
});

test('PG17 B2 approved grant survives integrated checkout rejection and remains consumable afterward',async()=>{
 await transaction(async client=>{
  await insertIdentityAndTables(client,{publicId:'SB-BABABABABABQ'});
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,visitKey:destinationVisit});
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),800)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  const approval=(await client.query(`INSERT INTO sabora.customer_table_change_requests(
   account_id,customer_id,visit_key,source_table_id,status,
   requesting_session_hash,expires_at,decided_at,decided_by)
   VALUES($1,$2,$3,$4,'approved',$5,clock_timestamp()+interval '90 seconds',
   clock_timestamp(),$2) RETURNING id`,
   [ids.sourceAccount,ids.customer,sourceVisit,ids.sourceTable,tokenHash])).rows[0];
  await expectSqlError(client,()=>client.query(`SELECT * FROM
   sabora.confirm_customer_round_h6_transfer_integration_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
    $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,
   [tokenHash,ids.destinationTable,'invalid-qr',destinationVisit,
    'recovery-basket','recovery-request',Buffer.alloc(32,207),
    ids.round,ids.order,JSON.stringify([]),false,'pay_at_end']),/./);
  const afterFailure=(await client.query(`SELECT q.status,q.consumed_order_id,
   b.table_id,b.binding_version,a.outstanding_cents
   FROM sabora.customer_table_change_requests q
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
   JOIN sabora.customer_accounts a ON a.id=q.account_id
   WHERE q.id=$1`,[approval.id])).rows[0];
  assert.equal(afterFailure.status,'approved');
  assert.equal(afterFailure.consumed_order_id,null);
  assert.equal(afterFailure.table_id,ids.sourceTable);
  assert.equal(afterFailure.binding_version,'1');
  assert.equal(afterFailure.outstanding_cents,'800');
  await client.query(`INSERT INTO sabora.orders(id,table_id,session_id,company,employee_number,
   customer_alias,customer_identifier,customer_visit_key,economic_snapshot,
   confirmed_at,grouping,items)
   VALUES($1,$2,$3,NULL,NULL,'Auditoría recuperación',$4,$5,
   '{"schemaVersion":"1"}'::jsonb,clock_timestamp(),'first',
   '[{"category":"main","name":"Plato recuperación","quantity":1}]'::jsonb)`,
   [ids.order,ids.destinationTable,ids.destinationSession,'SB-BABABABABABQ',destinationVisit]);
  await client.query(`INSERT INTO sabora.order_rounds(id,order_id,account_id,amount_cents,
   payment_mode,payment_policy_version,grouping_deadline,state)
   VALUES($1,$2,$3,800,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')`,
   [ids.round,ids.order,ids.sourceAccount]);
  const result=(await client.query(`SELECT
   sabora.consume_customer_table_change_h6_candidate(
    $1::uuid,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::text,$7::uuid) AS id`,
   [ids.sourceAccount,ids.customer,tokenHash,ids.destinationTable,
    ids.destinationSession,destinationVisit,ids.order])).rows[0];
  assert.equal(result.id,approval.id);
  const final=(await client.query(`SELECT q.status,b.table_id,b.binding_version,
   a.outstanding_cents FROM sabora.customer_table_change_requests q
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
   JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
   [approval.id])).rows[0];
  assert.equal(final.status,'consumed');
  assert.equal(final.table_id,ids.destinationTable);
  assert.equal(final.binding_version,'2');
  assert.equal(final.outstanding_cents,'800');
 });
});

test('PG17 B2 positive integrated A-to-B confirmation consumes approval with real catalog quote and economic round',async()=>{
 await transaction(async client=>{
  const publicId='SB-BABABABABABR';
  const qrToken='h6-positive-qr-token-2026-32-characters';
  const qrDigest=createHash('sha256').update(qrToken).digest();
  const basket='h6_positive_basket_0001',requestKey='h6_positive_request_0001';
  const itemId='b0a00000-0000-4000-8000-000000000030';
  const quoteId='b0a00000-0000-4000-8000-000000000031';
  const batchId='b0a00000-0000-4000-8000-000000000032';
  await insertIdentityAndTables(client,{publicId});
  await client.query('UPDATE sabora.dining_tables SET qr_token_hash=$1 WHERE id=ANY($2::uuid[])',
   [qrDigest,[ids.sourceTable,ids.destinationTable]]);
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,visitKey:destinationVisit});
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),1200)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  // Existing A order and pending delivery must move with the integrated B checkout.
  const priorOrder='b0a00000-0000-4000-8000-000000000040';
  const priorRound='b0a00000-0000-4000-8000-000000000041';
  await client.query(`INSERT INTO sabora.orders
   (id,table_id,session_id,company,employee_number,customer_alias,customer_identifier,
    customer_visit_key,economic_snapshot,confirmed_at,grouping,items)
   VALUES($1,$2,$3,NULL,NULL,'Histórico A',$4,$5,'{"schemaVersion":"1"}'::jsonb,
    clock_timestamp(),'first','[{"category":"main","name":"Recogido","quantity":1},{"category":"main","name":"Pendiente","quantity":1}]'::jsonb)`,
   [priorOrder,ids.sourceTable,ids.sourceSession,publicId,sourceVisit]);
  await client.query(`INSERT INTO sabora.order_rounds
   (id,order_id,account_id,amount_cents,payment_mode,payment_policy_version,
    grouping_deadline,state)
   VALUES($1,$2,$3,1200,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')`,
   [priorRound,priorOrder,ids.sourceAccount]);
  // The mixed historical round has one completed pickup and one pending line.
  await client.query(`UPDATE sabora.order_lines SET status='picked_up'
   WHERE order_id=$1 AND line_number=1`,[priorOrder]);
  await client.query(`INSERT INTO sabora.order_round_delivery_destinations
   (round_id,account_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4,$5)`,
   [priorRound,ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  const oldLines=(await client.query(`SELECT id,line_number,status
   FROM sabora.order_lines WHERE order_id=$1 ORDER BY line_number`,[priorOrder])).rows;
  assert.equal(oldLines.length,2);
  await client.query(`INSERT INTO sabora.order_line_delivery_destinations
   (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4,$5,$6,$7),($8,$2,$3,$4,$5,$6,$7)`,
   [oldLines[0].id,priorRound,ids.sourceAccount,priorOrder,ids.sourceTable,
    ids.sourceSession,sourceVisit,oldLines[1].id]);
  const grant=(await client.query(`INSERT INTO sabora.customer_table_change_requests(
   account_id,customer_id,visit_key,source_table_id,status,
   requesting_session_hash,expires_at,decided_at,decided_by)
   VALUES($1,$2,$3,$4,'approved',$5,clock_timestamp()+interval '90 seconds',
   clock_timestamp(),$2) RETURNING id`,
   [ids.sourceAccount,ids.customer,sourceVisit,ids.sourceTable,tokenHash])).rows[0];
  const draft={name:'Plato de integración',category:'Primeros',priceCents:700,
   allergens:[],options:[],extras:[],discount:null};
  await client.query(`INSERT INTO sabora.catalog_items
   (id,draft,draft_revision,published_revision,published_snapshot,published_at)
   VALUES($1,$2,1,1,$2,clock_timestamp())`,[itemId,draft]);
  const evidence={schemaVersion:'1',itemId,publishedRevision:1,quantity:1,
   itemName:'Plato de integración',category:'Primeros',
   subtotalCents:'700',discountCents:'0',totalCents:'700'};
  await client.query(`INSERT INTO sabora.catalog_displayed_quotes
   (id,table_id,session_id,visit_id,basket_id,actor_id,item_id,
    published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,1,700,0,700,$8,clock_timestamp()+interval '15 minutes')`,
   [quoteId,ids.destinationTable,ids.destinationSession,destinationVisit,basket,
    ids.customer.toString(),itemId,evidence]);
  const lines=[{quoteId,itemId,evidence}];
  // An approved grant must not permit checkout into a table closed after QR scan.
  // This is a real invocation of the integrated writer, not only a SQL source check.
  await client.query('SAVEPOINT closed_destination_case');
  await client.query(`UPDATE sabora.dining_tables SET ordering_state='closed'
   WHERE id=$1`,[ids.destinationTable]);
  await expectSqlError(client,()=>client.query(`SELECT * FROM
   sabora.confirm_customer_round_h6_transfer_integration_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
    $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,
   [tokenHash,ids.destinationTable,qrToken,destinationVisit,basket,requestKey,
    Buffer.alloc(32,211),batchId,ids.order,JSON.stringify(lines),false,'pay_at_end']),
   /customer_visit_forbidden/);
  const closedState=(await client.query(`SELECT
   (SELECT count(*)::int FROM sabora.orders WHERE id=$1) AS orders,
   (SELECT status FROM sabora.customer_table_change_requests WHERE id=$2) AS grant,
   (SELECT table_id FROM sabora.customer_account_operational_bindings WHERE account_id=$3) AS binding
   `,[ids.order,grant.id,ids.sourceAccount])).rows[0];
  assert.equal(closedState.orders,0);
  assert.equal(closedState.grant,'approved');
  assert.equal(closedState.binding,ids.sourceTable);
  // Closing a table may revoke the active visit. Roll back this isolated
  // negative case before testing the independent payment-mode failure.
  await client.query('ROLLBACK TO SAVEPOINT closed_destination_case');
  // A conflicting payment-mode switch at B must rollback the persisted
  // order, round, grant consumption and every pending delivery redirect.
  await expectSqlError(client,()=>client.query(`SELECT * FROM
   sabora.confirm_customer_round_h6_transfer_integration_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
    $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,
   [tokenHash,ids.destinationTable,qrToken,destinationVisit,basket,requestKey,
    Buffer.alloc(32,211),batchId,ids.order,JSON.stringify(lines),false,'pay_now']),
   /payment_mode_conflict/);
  const before=(await client.query(`SELECT
   (SELECT count(*)::int FROM sabora.orders WHERE id=$1) AS orders,
   (SELECT count(*)::int FROM sabora.order_rounds WHERE order_id=$1) AS rounds,
   (SELECT status FROM sabora.customer_table_change_requests WHERE id=$2) AS grant,
   (SELECT table_id FROM sabora.customer_account_operational_bindings
    WHERE account_id=$3) AS binding,
   (SELECT outstanding_cents FROM sabora.customer_accounts
    WHERE id=$3) AS outstanding`,
   [ids.order,grant.id,ids.sourceAccount])).rows[0];
  assert.equal(before.orders,0);
  assert.equal(before.rounds,0);
  assert.equal(before.grant,'approved');
  assert.equal(before.binding,ids.sourceTable);
  assert.equal(before.outstanding,'1200');
  assert.equal((await client.query(`SELECT table_id FROM
   sabora.order_round_delivery_destinations WHERE round_id=$1`,
   [priorRound])).rows[0].table_id,ids.sourceTable);
  assert.equal((await client.query(`SELECT count(*)::int AS n
   FROM sabora.order_line_delivery_destinations
   WHERE order_id=$1 AND table_id=$2`,
   [priorOrder,ids.destinationTable])).rows[0].n,0);
  // The integrated checkout must work through the restricted B3 writer
  // capability, not merely through the privileged PG17 test connection.
  await client.query('CREATE ROLE sabora_b3_positive_checkout NOLOGIN NOINHERIT');
  await client.query('GRANT USAGE ON SCHEMA sabora TO sabora_b3_positive_checkout');
  await client.query(`GRANT EXECUTE ON FUNCTION
   sabora.confirm_customer_round_h6_transfer_integration_candidate(
    bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)
   TO sabora_b3_positive_checkout`);
  await client.query(`GRANT EXECUTE ON FUNCTION
   sabora.resubmit_customer_order_revision_h6_candidate(
    bytea,uuid,text,text,text,uuid,integer,text,jsonb,boolean)
   TO sabora_b3_positive_checkout`);
  await client.query('SET LOCAL ROLE sabora_b3_positive_checkout');
  const roleAtCheckout=(await client.query('SELECT current_user')).rows[0].current_user;
  assert.equal(roleAtCheckout,'sabora_b3_positive_checkout');
  const result=(await client.query(`SELECT * FROM
   sabora.confirm_customer_round_h6_transfer_integration_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
    $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,
   [tokenHash,ids.destinationTable,qrToken,destinationVisit,basket,requestKey,
    Buffer.alloc(32,211),batchId,ids.order,JSON.stringify(lines),false,'pay_at_end'])).rows[0];
  await client.query('RESET ROLE');
  assert.equal(result.persisted_order_id,ids.order);
  assert.equal(result.account_id,ids.sourceAccount);
  assert.equal(result.amount_cents,'700');
  assert.equal(result.effective_payment_mode,'pay_at_end');
  assert.equal(result.repeated,false);
  const state=(await client.query(`SELECT a.table_id AS historical_table,
   a.outstanding_cents,b.table_id AS operational_table,b.binding_version,
   q.status,q.consumed_order_id,o.table_id AS new_order_table,
   r.account_id AS round_account,d.table_id AS delivery_table,
   (SELECT count(*)::int FROM sabora.kitchen_dispatches k WHERE k.order_id=o.id) AS dispatches
   FROM sabora.customer_accounts a
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   JOIN sabora.customer_table_change_requests q ON q.account_id=a.id
   JOIN sabora.orders o ON o.id=$2
   JOIN sabora.order_rounds r ON r.order_id=o.id
   JOIN sabora.order_round_delivery_destinations d ON d.round_id=r.id
   WHERE a.id=$1`,[ids.sourceAccount,ids.order])).rows[0];
  assert.equal(state.historical_table,ids.sourceTable);
  assert.equal(state.outstanding_cents,'1900');
  assert.equal(state.operational_table,ids.destinationTable);
  assert.equal(state.binding_version,'2');
  assert.equal(state.status,'consumed');
  assert.equal(state.consumed_order_id,ids.order);
  assert.equal(state.new_order_table,ids.destinationTable);
  assert.equal(state.round_account,ids.sourceAccount);
  assert.equal(state.delivery_table,ids.destinationTable);
  assert.equal(state.dispatches,1);
  const previous=(await client.query(`SELECT o.table_id AS historical_table,
   r.account_id,d.table_id AS delivery_table,d.session_id,d.visit_key
   FROM sabora.orders o JOIN sabora.order_rounds r ON r.order_id=o.id
   JOIN sabora.order_round_delivery_destinations d ON d.round_id=r.id
   WHERE o.id=$1`,[priorOrder])).rows[0];
  assert.equal(previous.historical_table,ids.sourceTable);
  assert.equal(previous.account_id,ids.sourceAccount);
  // Mixed pickup keeps the round summary historical; pending line is authoritative.
  assert.equal(previous.delivery_table,ids.sourceTable);
  const priorLines=(await client.query(`SELECT l.line_number,l.status,d.table_id,
   d.destination_version FROM sabora.order_lines l
   JOIN sabora.order_line_delivery_destinations d ON d.order_line_id=l.id
   WHERE l.order_id=$1 ORDER BY l.line_number`,[priorOrder])).rows;
  assert.equal(priorLines.length,2);
  assert.equal(priorLines[0].status,'picked_up');
  assert.equal(priorLines[0].table_id,ids.sourceTable);
  assert.equal(priorLines[0].destination_version,'1');
  assert.equal(priorLines[1].table_id,ids.destinationTable);
  assert.equal(priorLines[1].destination_version,'2');
  assert.equal(previous.session_id,ids.sourceSession);
  assert.equal(previous.visit_key,sourceVisit);
  const lineProjection=(await client.query(`SELECT l.id,l.status,d.account_id,
   d.table_id,d.session_id,d.visit_key,d.destination_version
   FROM sabora.order_lines l
   LEFT JOIN sabora.order_line_delivery_destinations d ON d.order_line_id=l.id
   WHERE l.order_id=$1`,[ids.order])).rows;
  assert.equal(lineProjection.length,1);
  assert.equal(lineProjection[0].account_id,ids.sourceAccount);
  assert.equal(lineProjection[0].table_id,ids.destinationTable);
  assert.equal(lineProjection[0].session_id,ids.destinationSession);
  assert.equal(lineProjection[0].visit_key,destinationVisit);
  assert.equal(lineProjection[0].destination_version,'1');
  const beforeReplay=(await client.query(`SELECT
   (SELECT count(*)::int FROM sabora.order_rounds WHERE order_id=$1) AS rounds,
   (SELECT count(*)::int FROM sabora.kitchen_dispatches WHERE order_id=$1) AS dispatches,
   (SELECT count(*)::int FROM sabora.payment_attempts WHERE account_id=$2) AS payments,
   (SELECT binding_version FROM sabora.customer_account_operational_bindings
    WHERE account_id=$2) AS binding_version,
   (SELECT count(*)::int FROM sabora.customer_table_change_requests
    WHERE account_id=$2 AND status='consumed') AS consumed_grants`,
   [ids.order,ids.sourceAccount])).rows[0];
  const replay=(await client.query(`SELECT * FROM
   sabora.confirm_customer_round_h6_transfer_integration_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
    $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,
   [tokenHash,ids.destinationTable,qrToken,destinationVisit,basket,requestKey,
    Buffer.alloc(32,211),batchId,ids.order,JSON.stringify(lines),false,'pay_at_end'])).rows[0];
  assert.equal(replay.repeated,true);
  assert.equal(replay.account_id,ids.sourceAccount);
  assert.equal(replay.round_id,result.round_id);
  const afterReplay=(await client.query(`SELECT
   (SELECT count(*)::int FROM sabora.order_rounds WHERE order_id=$1) AS rounds,
   (SELECT count(*)::int FROM sabora.kitchen_dispatches WHERE order_id=$1) AS dispatches,
   (SELECT count(*)::int FROM sabora.payment_attempts WHERE account_id=$2) AS payments,
   (SELECT binding_version FROM sabora.customer_account_operational_bindings
    WHERE account_id=$2) AS binding_version,
   (SELECT count(*)::int FROM sabora.customer_table_change_requests
    WHERE account_id=$2 AND status='consumed') AS consumed_grants`,
   [ids.order,ids.sourceAccount])).rows[0];
  assert.deepEqual(afterReplay,beforeReplay,
   'F12 replay must not create economic rounds, dispatches, payments or grant consumption');

  const replacementItem='b0a00000-0000-4000-8000-000000000033';
  const replacementQuote='b0a00000-0000-4000-8000-000000000034';
  const replacementDraft={name:'Alternativa PG17',category:'Primeros',priceCents:600,
   allergens:[],options:[],extras:[],discount:null};
  const replacementEvidence={schemaVersion:'1',itemId:replacementItem,
   publishedRevision:1,quantity:1,itemName:'Alternativa PG17',category:'Primeros',
   subtotalCents:'600',discountCents:'0',totalCents:'600'};
  await client.query(`INSERT INTO sabora.catalog_items
   (id,draft,draft_revision,published_revision,published_snapshot,published_at)
   VALUES($1,$2,1,1,$2,clock_timestamp())`,[replacementItem,replacementDraft]);
  await client.query(`INSERT INTO sabora.catalog_displayed_quotes
   (id,table_id,session_id,visit_id,basket_id,actor_id,item_id,
    published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,1,600,0,600,$8,clock_timestamp()+interval '15 minutes')`,
   [replacementQuote,ids.destinationTable,ids.destinationSession,destinationVisit,basket,
    ids.customer.toString(),replacementItem,replacementEvidence]);
  await client.query('UPDATE sabora.catalog_items SET sold_out=true WHERE id=$1',[itemId]);
  const invalidated=(await client.query(`SELECT state,invalidation,
   economic_snapshot->'lines'->0->'evidence'->>'itemName' AS original_item
   FROM sabora.order_revisions WHERE order_id=$1 AND revision_number=1`,[ids.order])).rows[0];
  assert.equal(invalidated.state,'invalidated');
  assert.equal(invalidated.original_item,'Plato de integración');
  assert.deepEqual(invalidated.invalidation.affectedLineNumbers,[1]);
  await client.query('SET LOCAL ROLE sabora_h6_customer_runtime');
  const customerRevision=(await client.query(`SELECT
   sabora.read_customer_order_revision_h6_candidate($1::bytea,$2::uuid,$3::text,$4::uuid) AS result`,
   [tokenHash,ids.destinationTable,destinationVisit,ids.order])).rows[0].result;
  await client.query('RESET ROLE');
  assert.equal(customerRevision.state,'invalidated');
  assert.equal(customerRevision.lines[0].affected,true);
  const replacements=[{lineNumber:1,quoteId:replacementQuote,itemId:replacementItem,
   evidence:replacementEvidence}];
  await client.query('SET LOCAL ROLE sabora_b3_positive_checkout');
  const correction=(await client.query(`SELECT
   sabora.resubmit_customer_order_revision_h6_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::uuid,$7::integer,
    $8::text,$9::jsonb,$10::boolean) AS result`,
   [tokenHash,ids.destinationTable,qrToken,destinationVisit,basket,ids.order,1,
    'h6_revision_request_0001',JSON.stringify(replacements),true])).rows[0].result;
  const correctionReplay=(await client.query(`SELECT
   sabora.resubmit_customer_order_revision_h6_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::uuid,$7::integer,
    $8::text,$9::jsonb,$10::boolean) AS result`,
   [tokenHash,ids.destinationTable,qrToken,destinationVisit,basket,ids.order,1,
    'h6_revision_request_0001',JSON.stringify(replacements),true])).rows[0].result;
  await client.query('RESET ROLE');
  assert.equal(correction.revisionNumber,2);
  assert.equal(correction.amountCents,600);
  assert.equal(correction.dispatchState,'requested');
  assert.equal(correction.repeated,false);
  assert.equal(correctionReplay.repeated,true);
  const revised=(await client.query(`SELECT r.account_id,r.revision_number,r.amount_cents,
   r.state AS round_state,d.state AS dispatch_state,d.revision_number AS dispatch_revision,
   (SELECT count(*)::int FROM sabora.orders WHERE id=$1) AS orders,
   (SELECT count(*)::int FROM sabora.order_revisions WHERE order_id=$1) AS revisions,
   (SELECT count(*)::int FROM sabora.order_revision_requests WHERE order_id=$1) AS requests,
   (SELECT count(*)::int FROM sabora.event_outbox WHERE event_type='sabora.kitchen.dispatch_requested'
     AND aggregate_id=d.id) AS dispatch_events
   FROM sabora.order_rounds r JOIN sabora.kitchen_dispatches d ON d.round_id=r.id
   WHERE r.order_id=$1`,[ids.order])).rows[0];
  assert.deepEqual(revised,{account_id:ids.sourceAccount,revision_number:2,
   amount_cents:'600',round_state:'dispatch_requested',dispatch_state:'requested',
   dispatch_revision:2,orders:1,revisions:2,requests:1,dispatch_events:1});

  assert.equal((await client.query(`SELECT count(*)::int AS n
   FROM sabora.order_line_delivery_destinations d
   JOIN sabora.order_lines l ON l.id=d.order_line_id
   WHERE l.order_id=$1`,[ids.order])).rows[0].n,2);
  assert.deepEqual((await client.query(`SELECT revision_number,is_current_revision,name
   FROM sabora.order_lines WHERE order_id=$1 ORDER BY revision_number`,[ids.order])).rows,
   [{revision_number:1,is_current_revision:false,name:'Plato de integración'},
    {revision_number:2,is_current_revision:true,name:'Alternativa PG17'}]);
  assert.equal((await client.query(`SELECT outstanding_cents FROM sabora.customer_accounts
   WHERE id=$1`,[ids.sourceAccount])).rows[0].outstanding_cents,'1800');
 });
});

test('PG17 B2 two-session customer advisory gate serializes transfer writers without cross-customer blocking',async()=>{
 const first=await admin.connect(),second=await admin.connect();
 const customer=ids.customer,otherCustomer='b0a00000-0000-4000-8000-000000000099';
 try{
  await first.query('BEGIN');
  await second.query('BEGIN');
  const held=(await first.query(`SELECT pg_advisory_xact_lock(
   hashtextextended($1::text,140630))`,[customer]));
  assert.equal(held.rowCount,1);
  const same=(await second.query(`SELECT pg_try_advisory_xact_lock(
   hashtextextended($1::text,140630)) AS acquired`,[customer])).rows[0];
  assert.equal(same.acquired,false,'a concurrent transfer for the same customer must wait');
  const independent=(await second.query(`SELECT pg_try_advisory_xact_lock(
   hashtextextended($1::text,140630)) AS acquired`,[otherCustomer])).rows[0];
  assert.equal(independent.acquired,true,'an unrelated customer must not be serialized');
  await first.query('ROLLBACK');
  const released=(await second.query(`SELECT pg_try_advisory_xact_lock(
   hashtextextended($1::text,140630)) AS acquired`,[customer])).rows[0];
  assert.equal(released.acquired,true,'rollback releases the transactional customer lock');
 }finally{
  await first.query('ROLLBACK').catch(()=>{});
  await second.query('ROLLBACK').catch(()=>{});
  first.release();second.release();
 }
 const functions=(await admin.query(`SELECT proname,pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='sabora' AND p.proname IN
   ('confirm_customer_round_h6_transfer_integration_candidate',
    'consume_customer_table_change_h6_candidate')`)).rows;
 assert.equal(functions.length,2);
 for(const fn of functions)
  assert.match(fn.definition,/hashtextextended\([^;]*140630/s,
   fn.proname+' must take the same customer transaction advisory lock');
});

test('PG17 B2 Stripe authorization pending survives A-to-B transfer with distinct new payment attempt',async()=>{
 await transaction(async client=>{
  const publicId='SB-BABABABABABR';
  const qrToken='h6-positive-qr-token-2026-32-characters';
  const qrDigest=createHash('sha256').update(qrToken).digest();
  const basket='h6_positive_basket_0001',requestKey='h6_positive_request_0001';
  const itemId='b0a00000-0000-4000-8000-000000000030';
  const quoteId='b0a00000-0000-4000-8000-000000000031';
  const batchId='b0a00000-0000-4000-8000-000000000032';
  await insertIdentityAndTables(client,{publicId});
  await client.query('UPDATE sabora.dining_tables SET qr_token_hash=$1 WHERE id=ANY($2::uuid[])',
   [qrDigest,[ids.sourceTable,ids.destinationTable]]);
  await insertVisit(client,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await insertVisit(client,{tableId:ids.destinationTable,sessionId:ids.destinationSession,visitKey:destinationVisit});
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_now',clock_timestamp(),0)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  // Existing A order and pending delivery must move with the integrated B checkout.
  const priorOrder='b0a00000-0000-4000-8000-000000000040';
  const priorRound='b0a00000-0000-4000-8000-000000000041';
  await client.query(`INSERT INTO sabora.orders
   (id,table_id,session_id,company,employee_number,customer_alias,customer_identifier,
    customer_visit_key,economic_snapshot,confirmed_at,grouping,items)
   VALUES($1,$2,$3,NULL,NULL,'Histórico A',$4,$5,'{"schemaVersion":"1"}'::jsonb,
    clock_timestamp(),'first','[{"category":"main","name":"Recogido","quantity":1},{"category":"main","name":"Pendiente","quantity":1}]'::jsonb)`,
   [priorOrder,ids.sourceTable,ids.sourceSession,publicId,sourceVisit]);
  await client.query(`INSERT INTO sabora.order_rounds
   (id,order_id,account_id,amount_cents,payment_mode,payment_policy_version,
    grouping_deadline,state)
   VALUES($1,$2,$3,1200,'pay_now',1,clock_timestamp()+interval '5 minutes','grouping')`,
   [priorRound,priorOrder,ids.sourceAccount]);
  // The mixed historical round has one completed pickup and one pending line.
  await client.query(`UPDATE sabora.order_lines SET status='picked_up'
   WHERE order_id=$1 AND line_number=1`,[priorOrder]);
  await client.query(`INSERT INTO sabora.order_round_delivery_destinations
   (round_id,account_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4,$5)`,
   [priorRound,ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  const oldLines=(await client.query(`SELECT id,line_number,status
   FROM sabora.order_lines WHERE order_id=$1 ORDER BY line_number`,[priorOrder])).rows;
  assert.equal(oldLines.length,2);
  await client.query(`INSERT INTO sabora.order_line_delivery_destinations
   (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4,$5,$6,$7),($8,$2,$3,$4,$5,$6,$7)`,
   [oldLines[0].id,priorRound,ids.sourceAccount,priorOrder,ids.sourceTable,
    ids.sourceSession,sourceVisit,oldLines[1].id]);
  const grant=(await client.query(`INSERT INTO sabora.customer_table_change_requests(
   account_id,customer_id,visit_key,source_table_id,status,
   requesting_session_hash,expires_at,decided_at,decided_by)
   VALUES($1,$2,$3,$4,'approved',$5,clock_timestamp()+interval '90 seconds',
   clock_timestamp(),$2) RETURNING id`,
   [ids.sourceAccount,ids.customer,sourceVisit,ids.sourceTable,tokenHash])).rows[0];
  const draft={name:'Plato de integración',category:'Primeros',priceCents:700,
   allergens:[],options:[],extras:[],discount:null};
  await client.query(`INSERT INTO sabora.catalog_items
   (id,draft,draft_revision,published_revision,published_snapshot,published_at)
   VALUES($1,$2,1,1,$2,clock_timestamp())`,[itemId,draft]);
  const evidence={schemaVersion:'1',itemId,publishedRevision:1,quantity:1,
   itemName:'Plato de integración',category:'Primeros',
   subtotalCents:'700',discountCents:'0',totalCents:'700'};
  await client.query(`INSERT INTO sabora.catalog_displayed_quotes
   (id,table_id,session_id,visit_id,basket_id,actor_id,item_id,
    published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,1,700,0,700,$8,clock_timestamp()+interval '15 minutes')`,
   [quoteId,ids.destinationTable,ids.destinationSession,destinationVisit,basket,
    ids.customer.toString(),itemId,evidence]);
  const lines=[{quoteId,itemId,evidence}];

  const oldAuthorization='h6_auth_old_pending_0000000000001';
  const oldCapture='h6_capture_old_pending_0000000000001';
  const oldPayment=(await client.query(`INSERT INTO sabora.payment_attempts
   (round_id,account_id,amount_cents,authorization_key,capture_key,state,provider_intent_id)
   VALUES($1,$2,1200,$3,$4,'requires_action','pi_1234567890abc')
   RETURNING id,state,provider_intent_id`,
   [priorRound,ids.sourceAccount,oldAuthorization,oldCapture])).rows[0];
  const confirmed=(await client.query(`SELECT * FROM
   sabora.confirm_customer_round_h6_transfer_integration_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
    $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,
   [tokenHash,ids.destinationTable,qrToken,destinationVisit,basket,requestKey,
    Buffer.alloc(32,211),batchId,ids.order,JSON.stringify(lines),false,'pay_now'])).rows[0];
  assert.equal(confirmed.account_id,ids.sourceAccount);
  // Exercise the actual delivery projection that kitchen and sala must read:
  // order origin is historical, but pending line destination is operational.
  const delivery=(await client.query(`SELECT l.line_number,l.status,
   o.table_id AS historical_table_id,d.table_id AS delivery_table_id,
   d.session_id AS delivery_session_id,d.visit_key AS delivery_visit_key,
   d.destination_version,r.account_id
   FROM sabora.order_lines l
   JOIN sabora.orders o ON o.id=l.order_id
   JOIN sabora.order_line_delivery_destinations d ON d.order_line_id=l.id
   JOIN sabora.order_rounds r ON r.id=d.round_id AND r.account_id=d.account_id
   WHERE l.order_id=$1 ORDER BY l.line_number`,[priorOrder])).rows;
  assert.equal(delivery.length,2);
  assert.equal(delivery[0].status,'picked_up');
  assert.equal(delivery[0].historical_table_id,ids.sourceTable);
  assert.equal(delivery[0].delivery_table_id,ids.sourceTable);
  assert.equal(delivery[0].destination_version,'1');
  assert.equal(delivery[1].status,'confirmed');
  assert.equal(delivery[1].historical_table_id,ids.sourceTable);
  assert.equal(delivery[1].delivery_table_id,ids.destinationTable);
  assert.equal(delivery[1].delivery_session_id,ids.destinationSession);
  assert.equal(delivery[1].delivery_visit_key,destinationVisit);
  assert.equal(delivery[1].destination_version,'2');
  assert.equal(delivery[1].account_id,ids.sourceAccount);
  const pendingAtA=(await client.query(`SELECT count(*)::int AS n
   FROM sabora.order_line_delivery_destinations d
   JOIN sabora.order_lines l ON l.id=d.order_line_id
   WHERE d.account_id=$1 AND d.table_id=$2 AND l.status<>'picked_up'`,
   [ids.sourceAccount,ids.sourceTable])).rows[0].n;
  assert.equal(pendingAtA,0,'no pending delivery may remain routed to A');
  const pendingAtB=(await client.query(`SELECT count(*)::int AS n
   FROM sabora.order_line_delivery_destinations d
   JOIN sabora.order_lines l ON l.id=d.order_line_id
   WHERE d.account_id=$1 AND d.table_id=$2 AND l.status<>'picked_up'`,
   [ids.sourceAccount,ids.destinationTable])).rows[0].n;
  assert.equal(pendingAtB,2,'pending historical line and new B line both route to B');
  assert.equal(confirmed.effective_payment_mode,'pay_now');
  assert.equal(confirmed.round_state,'awaiting_authorization');
  assert.ok(confirmed.payment_attempt_id);
  assert.notEqual(confirmed.payment_attempt_id,oldPayment.id);
  const payments=(await client.query(`SELECT id,round_id,account_id,amount_cents,
   authorization_key,capture_key,state,provider_intent_id
   FROM sabora.payment_attempts WHERE account_id=$1 ORDER BY created_at,id`,
   [ids.sourceAccount])).rows;
  assert.equal(payments.length,2);
  const original=payments.find(p=>p.id===oldPayment.id);
  const current=payments.find(p=>p.id===confirmed.payment_attempt_id);
  assert.equal(original.round_id,priorRound);
  assert.equal(original.account_id,ids.sourceAccount);
  assert.equal(original.amount_cents,'1200');
  assert.equal(original.state,'requires_action');
  assert.equal(original.provider_intent_id,'pi_1234567890abc');
  assert.equal(original.authorization_key,oldAuthorization);
  assert.equal(original.capture_key,oldCapture);
  assert.equal(current.account_id,ids.sourceAccount);
  assert.equal(current.amount_cents,'700');
  assert.equal(current.state,'authorization_requested');
  assert.equal(current.provider_intent_id,null);
  assert.notEqual(current.authorization_key,original.authorization_key);
  assert.notEqual(current.capture_key,original.capture_key);
  assert.equal((await client.query(`SELECT outstanding_cents FROM
   sabora.customer_accounts WHERE id=$1`,[ids.sourceAccount])).rows[0].outstanding_cents,'0');
  assert.equal((await client.query(`SELECT table_id FROM
   sabora.customer_account_operational_bindings WHERE account_id=$1`,
   [ids.sourceAccount])).rows[0].table_id,ids.destinationTable);
  // In the actual confirmed A→B checkout, retiring A must not invalidate the
  // still-current destination scope of the pending historical line.
  await client.query(`UPDATE sabora.customer_table_visits
   SET revoked_at=clock_timestamp()
   WHERE table_id=$1 AND customer_id=$2`,[ids.sourceTable,ids.customer]);
  const effectiveScope=async()=>(await client.query(`SELECT count(*)::integer AS n
   FROM sabora.order_line_delivery_destinations d
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=d.account_id
    AND b.table_id=d.table_id AND b.session_id=d.session_id AND b.visit_key=d.visit_key
   JOIN sabora.customer_accounts a ON a.id=b.account_id
   JOIN sabora.dining_tables t ON t.id=d.table_id AND t.session_id=d.session_id
    AND t.ordering_state='open'
   JOIN sabora.customer_table_visits v ON v.table_id=d.table_id
    AND v.session_id=d.session_id AND v.visit_key=d.visit_key
    AND v.customer_id=a.customer_id AND v.authorized_qr_version=t.qr_version
    AND v.revoked_at IS NULL AND v.expires_at>clock_timestamp()
   JOIN sabora.order_lines l ON l.id=d.order_line_id AND l.order_id=d.order_id
   WHERE d.account_id=$1 AND d.order_id=$2 AND l.status<>'picked_up'`,
   [ids.sourceAccount,priorOrder])).rows[0].n;
  assert.equal(await effectiveScope(),1,'revoking A must preserve valid B delivery scope');
  await client.query('SAVEPOINT destination_qr_revoked');
  await client.query(`UPDATE sabora.dining_tables SET qr_version=qr_version+1
   WHERE id=$1`,[ids.destinationTable]);
  assert.equal(await effectiveScope(),0,'rotated B QR must invalidate pickup scope');
  await client.query('ROLLBACK TO SAVEPOINT destination_qr_revoked');
  await client.query('RELEASE SAVEPOINT destination_qr_revoked');
  await client.query('SAVEPOINT destination_closed');
  await client.query(`UPDATE sabora.dining_tables SET ordering_state='closed'
   WHERE id=$1`,[ids.destinationTable]);
  assert.equal(await effectiveScope(),0,'closed B must invalidate pickup scope');
  await client.query('ROLLBACK TO SAVEPOINT destination_closed');
  await client.query('RELEASE SAVEPOINT destination_closed');
  assert.equal(await effectiveScope(),1,'restored B must recover current delivery scope');
  const replay=(await client.query(`SELECT * FROM
   sabora.confirm_customer_round_h6_transfer_integration_candidate(
    $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
    $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,
   [tokenHash,ids.destinationTable,qrToken,destinationVisit,basket,requestKey,
    Buffer.alloc(32,211),batchId,ids.order,JSON.stringify(lines),false,'pay_now'])).rows[0];
  assert.equal(replay.repeated,true);
  assert.equal(replay.payment_attempt_id,current.id);
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM sabora.payment_attempts
   WHERE account_id=$1`,[ids.sourceAccount])).rows[0].n,2);
 });
});

test('PG17 B2 concurrent complete checkouts consume one approval and create one economic round',async()=>{
 // This test commits fixtures ONLY inside the strictly disposable PG17 CI harness.
 // The two checkout transactions use separate connections and overlap in time.
 const fixture=await admin.connect();
 let first,second,rival;
 try{
  await fixture.query('BEGIN');
  const publicId='SB-BABABABABABR';
  const qrToken='h6-positive-qr-token-2026-32-characters';
  const qrDigest=createHash('sha256').update(qrToken).digest();
  const basket='h6_positive_basket_0001',requestKey='h6_positive_request_0001';
  const itemId='b0a00000-0000-4000-8000-000000000030';
  const quoteId='b0a00000-0000-4000-8000-000000000031';
  const batchId='b0a00000-0000-4000-8000-000000000032';
  await insertIdentityAndTables(fixture,{publicId});
  await fixture.query('UPDATE sabora.dining_tables SET qr_token_hash=$1 WHERE id=ANY($2::uuid[])',
   [qrDigest,[ids.sourceTable,ids.destinationTable]]);
  await insertVisit(fixture,{tableId:ids.sourceTable,sessionId:ids.sourceSession,visitKey:sourceVisit});
  await insertVisit(fixture,{tableId:ids.destinationTable,sessionId:ids.destinationSession,visitKey:destinationVisit});
  await fixture.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),1200)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit,ids.customer]);
  await fixture.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
   [ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  // Existing A order and pending delivery must move with the integrated B checkout.
  const priorOrder='b0a00000-0000-4000-8000-000000000040';
  const priorRound='b0a00000-0000-4000-8000-000000000041';
  await fixture.query(`INSERT INTO sabora.orders
   (id,table_id,session_id,company,employee_number,customer_alias,customer_identifier,
    customer_visit_key,economic_snapshot,confirmed_at,grouping,items)
   VALUES($1,$2,$3,NULL,NULL,'Histórico A',$4,$5,'{"schemaVersion":"1"}'::jsonb,
    clock_timestamp(),'first','[{"category":"main","name":"Recogido","quantity":1},{"category":"main","name":"Pendiente","quantity":1}]'::jsonb)`,
   [priorOrder,ids.sourceTable,ids.sourceSession,publicId,sourceVisit]);
  await fixture.query(`INSERT INTO sabora.order_rounds
   (id,order_id,account_id,amount_cents,payment_mode,payment_policy_version,
    grouping_deadline,state)
   VALUES($1,$2,$3,1200,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')`,
   [priorRound,priorOrder,ids.sourceAccount]);
  // The mixed historical round has one completed pickup and one pending line.
  await fixture.query(`UPDATE sabora.order_lines SET status='picked_up'
   WHERE order_id=$1 AND line_number=1`,[priorOrder]);
  await fixture.query(`INSERT INTO sabora.order_round_delivery_destinations
   (round_id,account_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4,$5)`,
   [priorRound,ids.sourceAccount,ids.sourceTable,ids.sourceSession,sourceVisit]);
  const oldLines=(await fixture.query(`SELECT id,line_number,status
   FROM sabora.order_lines WHERE order_id=$1 ORDER BY line_number`,[priorOrder])).rows;
  assert.equal(oldLines.length,2);
  await fixture.query(`INSERT INTO sabora.order_line_delivery_destinations
   (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
   VALUES($1,$2,$3,$4,$5,$6,$7),($8,$2,$3,$4,$5,$6,$7)`,
   [oldLines[0].id,priorRound,ids.sourceAccount,priorOrder,ids.sourceTable,
    ids.sourceSession,sourceVisit,oldLines[1].id]);
  const grant=(await fixture.query(`INSERT INTO sabora.customer_table_change_requests(
   account_id,customer_id,visit_key,source_table_id,status,
   requesting_session_hash,expires_at,decided_at,decided_by)
   VALUES($1,$2,$3,$4,'approved',$5,clock_timestamp()+interval '90 seconds',
   clock_timestamp(),$2) RETURNING id`,
   [ids.sourceAccount,ids.customer,sourceVisit,ids.sourceTable,tokenHash])).rows[0];
  const draft={name:'Plato de integración',category:'Primeros',priceCents:700,
   allergens:[],options:[],extras:[],discount:null};
  await fixture.query(`INSERT INTO sabora.catalog_items
   (id,draft,draft_revision,published_revision,published_snapshot,published_at)
   VALUES($1,$2,1,1,$2,clock_timestamp())`,[itemId,draft]);
  const evidence={schemaVersion:'1',itemId,publishedRevision:1,quantity:1,
   itemName:'Plato de integración',category:'Primeros',
   subtotalCents:'700',discountCents:'0',totalCents:'700'};
  await fixture.query(`INSERT INTO sabora.catalog_displayed_quotes
   (id,table_id,session_id,visit_id,basket_id,actor_id,item_id,
    published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,1,700,0,700,$8,clock_timestamp()+interval '15 minutes')`,
   [quoteId,ids.destinationTable,ids.destinationSession,destinationVisit,basket,
    ids.customer.toString(),itemId,evidence]);
  const lines=[{quoteId,itemId,evidence}];
  const rivalQuote='b0a00000-0000-4000-8000-000000000053';
  await fixture.query(`INSERT INTO sabora.catalog_displayed_quotes
   (id,table_id,session_id,visit_id,basket_id,actor_id,item_id,
    published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,1,700,0,700,$8,clock_timestamp()+interval '15 minutes')`,
   [rivalQuote,ids.destinationTable,ids.destinationSession,destinationVisit,
    'h6_rival_basket_0001',ids.customer.toString(),itemId,evidence]);
  const rivalLines=[{quoteId:rivalQuote,itemId,evidence}];

  await fixture.query('COMMIT');
  first=await admin.connect();
  second=await admin.connect();
  rival=await admin.connect();
  await first.query('BEGIN');
  await second.query('BEGIN');
  await rival.query('BEGIN');
  const args=[tokenHash,ids.destinationTable,qrToken,destinationVisit,basket,requestKey,
   Buffer.alloc(32,211),batchId,ids.order,JSON.stringify(lines),false,'pay_at_end'];
  const sql=`SELECT * FROM sabora.confirm_customer_round_h6_transfer_integration_candidate(
   $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
   $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`;
  const winner=(await first.query(sql,args)).rows[0];
  assert.equal(winner.repeated,false);
  assert.equal(winner.account_id,ids.sourceAccount);
  // Start the second *full* checkout before the first transaction commits.
  // It must wait for the customer advisory lock, not independently persist.
  const competing=second.query(sql,args);
  // A distinct valid B basket races the first confirmation and shares the account.
  const rivalArgs=[tokenHash,ids.destinationTable,qrToken,destinationVisit,
   'h6_rival_basket_0001','h6_rival_request_0001',Buffer.alloc(32,212),
   'b0a00000-0000-4000-8000-000000000051',
   'b0a00000-0000-4000-8000-000000000052',JSON.stringify(rivalLines),false,'pay_at_end'];
  const rivalCheckout=rival.query(sql,rivalArgs);
  let rivalSettled=false;
  rivalCheckout.then(()=>{rivalSettled=true;},()=>{rivalSettled=true;});
  let settled=false;
  competing.then(()=>{settled=true;},()=>{settled=true;});
  await new Promise(resolve=>setTimeout(resolve,120));
  assert.equal(settled,false,'competing confirmation must wait for first commit');
  assert.equal(rivalSettled,false,'distinct A checkout must also wait for first commit');
  await first.query('COMMIT');
  // Both waiters contend for the same advisory lock; PostgreSQL does not
  // guarantee which waiter wins. Commit whichever finishes first before
  // awaiting the other, otherwise the test itself creates a lock timeout.
  const firstFinished=await Promise.race([
   competing.then(row=>({kind:'replay',row:row.rows[0]})),
   rivalCheckout.then(row=>({kind:'rival',row:row.rows[0]}))
  ]);
  let replay,rivalResult;
  if(firstFinished.kind==='replay'){
   replay=firstFinished.row;
   await second.query('COMMIT');
   rivalResult=(await rivalCheckout).rows[0];
   await rival.query('COMMIT');
  }else{
   rivalResult=firstFinished.row;
   await rival.query('COMMIT');
   replay=(await competing).rows[0];
   await second.query('COMMIT');
  }
  assert.equal(replay.repeated,true);
  assert.equal(replay.account_id,ids.sourceAccount);
  assert.equal(replay.round_id,winner.round_id);
  assert.equal(rivalResult.repeated,false);
  assert.equal(rivalResult.account_id,ids.sourceAccount);
  assert.notEqual(rivalResult.round_id,winner.round_id);
  await rival.query('BEGIN');
  await expectSqlError(rival,()=>rival.query(sql,[tokenHash,ids.sourceTable,
   qrToken,sourceVisit,'h6_stale_basket_0001','h6_stale_request_0001',
   Buffer.alloc(32,213),'b0a00000-0000-4000-8000-000000000054',
   'b0a00000-0000-4000-8000-000000000055',JSON.stringify(lines),false,
   'pay_at_end']),/table_change_approval_required/);
  await rival.query('ROLLBACK');
  const state=(await fixture.query(`SELECT
   (SELECT count(*)::int FROM sabora.orders WHERE id=$1) AS orders,
   (SELECT count(*)::int FROM sabora.orders WHERE id=$3) AS rival_orders,
   (SELECT count(*)::int FROM sabora.order_rounds WHERE order_id=$1) AS rounds,
   (SELECT count(*)::int FROM sabora.kitchen_dispatches WHERE order_id=$1) AS dispatches,
   (SELECT count(*)::int FROM sabora.order_rounds WHERE order_id=$3) AS rival_rounds,
   (SELECT count(*)::int FROM sabora.customer_table_change_requests
    WHERE account_id=$2 AND status='consumed') AS grants,
   (SELECT outstanding_cents FROM sabora.customer_accounts WHERE id=$2) AS balance,
   (SELECT binding_version FROM sabora.customer_account_operational_bindings
    WHERE account_id=$2) AS binding_version`,
   [ids.order,ids.sourceAccount,rivalArgs[8]])).rows[0];
  assert.equal(state.orders,1);
  assert.equal(state.rival_orders,1);
  assert.equal(state.rounds,1);
  assert.equal(state.rival_rounds,1);
  assert.equal(state.dispatches,1);
  assert.equal(state.grants,1);
  assert.equal(state.balance,'2600');
  assert.equal(state.binding_version,'2');
 }finally{
  if(first){await first.query('ROLLBACK').catch(()=>{});first.release();}
  if(second){await second.query('ROLLBACK').catch(()=>{});second.release();}
  if(rival){await rival.query('ROLLBACK').catch(()=>{});rival.release();}
  await fixture.query('ROLLBACK').catch(()=>{});
  fixture.release();
 }
});


test('PG17 H6/B2 pickup-compatible delivery board remains sealed and has a complete result contract',async()=>{
 const signature='sabora.read_order_operations_delivery_pickup_board_h6_candidate(text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)';
 const result=await admin.query(`SELECT p.prosecdef,p.proowner::regrole::text AS owner,
 pg_get_functiondef(p.oid) AS definition,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('sabora_h6_operations_runtime',p.oid,'EXECUTE') AS runtime_execute
 FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,[signature]);
 assert.equal(result.rows.length,1);
 const row=result.rows[0];
 assert.equal(row.prosecdef,true);
 assert.equal(row.owner,'sabora_order_operations_fn_owner');
 assert.equal(row.anon_execute,false);
 assert.equal(row.authenticated_execute,false);
 assert.equal(row.runtime_execute,false);
 for(const field of ['pickup_task_id','pickup_state','pickup_version',
  'pickup_claimed_by','pickup_claimed_display_id','pickup_claimed_at',
  'pickup_updated_at','delivery_table_id','delivery_session_id',
  'delivery_visit_key','delivery_version'])
  assert.match(row.definition,new RegExp('\\b'+field+'\\b'));
 assert.match(row.definition,/authorize_order_operation_read_candidate/);
 assert.match(row.definition,/order_line_delivery_destinations/);
 assert.match(row.definition,/pt\.claimed_display_id/);
 assert.match(row.definition,/dest\.order_line_id IS NOT NULL OR l\.status='picked_up'/);
 await transaction(async client=>{
  const now=Date.now();
  const error=await expectSqlError(client,()=>client.query(`SELECT * FROM
   sabora.read_order_operations_delivery_pickup_board_h6_candidate(
    $1::text,$2::text,$3::uuid,$4::text,$5::text,$6::bigint,$7::uuid,
    $8::integer,$9::integer,$10::bigint,$11::bigint,$12::text)`,[
    'forged_key_2026','postgres',ids.customer,'waiter',null,
    null,null,null,50,now,now+15000,'0'.repeat(64)
   ]),/invalid_order_operation_read_capability/);
  assert.equal(error.code,'42501');
 });
});

test('PG17 F12 resolved request is sealed and rejects forged session without writes',async()=>{
 const signature='sabora.request_customer_table_change_h6_resolved_candidate(bytea)';
 const result=await admin.query(`SELECT p.prosecdef,
  pg_get_userbyid(p.proowner) AS owner,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('sabora_h6_customer_runtime',p.oid,'EXECUTE') AS customer_execute,
  has_function_privilege('sabora_h6_operations_runtime',p.oid,'EXECUTE') AS operations_execute,
  pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,[signature]);
 assert.equal(result.rows.length,1);
 const row=result.rows[0];
 assert.equal(row.prosecdef,true);
 assert.equal(row.owner,'sabora_h6_fn_owner');
 assert.equal(row.anon_execute,false);
 assert.equal(row.authenticated_execute,false);
 assert.equal(row.customer_execute,false);
 assert.equal(row.operations_execute,false);
 assert.match(row.definition,/pg_advisory_xact_lock/);
 assert.match(row.definition,/v_open_count<>1/);
 await transaction(async client=>{
  const before=(await client.query('SELECT count(*)::int AS total FROM sabora.customer_table_change_requests')).rows[0].total;
  const invalid=await expectSqlError(client,()=>client.query(
   'SELECT * FROM sabora.request_customer_table_change_h6_resolved_candidate($1::bytea)',
   [Buffer.alloc(32,87)]),/customer_session_forbidden/);
  assert.equal(invalid.code,'42501');
  const malformed=await expectSqlError(client,()=>client.query(
   'SELECT * FROM sabora.request_customer_table_change_h6_resolved_candidate($1::bytea)',
   [Buffer.alloc(4,87)]),/invalid_table_change_request/);
  assert.equal(malformed.code,'22023');
  const after=(await client.query('SELECT count(*)::int AS total FROM sabora.customer_table_change_requests')).rows[0].total;
  assert.equal(after,before);
 });
});


const scenarioA=Object.freeze({
 customer:'b0a00000-0000-4000-8000-000000000101',
 sourceTable:'b0a00000-0000-4000-8000-000000000102',
 destinationTable:'b0a00000-0000-4000-8000-000000000103',
 sourceSession:'b0a00000-0000-4000-8000-000000000104',
 destinationSession:'b0a00000-0000-4000-8000-000000000105',
 sourceAccount:'b0a00000-0000-4000-8000-000000000106',
 destinationAccount:'b0a00000-0000-4000-8000-000000000107',
 token:Buffer.alloc(32,211),sourceVisit:'f12_source_visit_0101',destinationVisit:'f12_destination_visit_0101'
});
const scenarioB=Object.freeze({
 customer:'b0a00000-0000-4000-8000-000000000201',
 sourceTable:'b0a00000-0000-4000-8000-000000000202',
 destinationTable:'b0a00000-0000-4000-8000-000000000203',
 sourceSession:'b0a00000-0000-4000-8000-000000000204',
 destinationSession:'b0a00000-0000-4000-8000-000000000205',
 sourceAccount:'b0a00000-0000-4000-8000-000000000206',
 destinationAccount:'b0a00000-0000-4000-8000-000000000207',
 token:Buffer.alloc(32,212),sourceVisit:'f12_source_visit_0201',destinationVisit:'f12_destination_visit_0201'
});
async function insertF12Visit(client,scenario){
 await client.query(`INSERT INTO sabora.customer_table_visits(
 table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
 VALUES($1,$2,$3::uuid,$4,($3::uuid)::text,1,clock_timestamp()+interval '1 hour')`,
 [scenario.sourceTable,scenario.sourceSession,scenario.customer,scenario.sourceVisit]);
}
async function insertF12IsolatedIdentity(client,scenario){
 await client.query(`INSERT INTO sabora.customer_profiles(id,public_id,alias)
 VALUES($1,$2,'F12 PG17 isolated')`,[
 scenario.customer,scenario===scenarioA?'SB-BABABABABABJ':'SB-BABABABABABK']);
 await client.query(`INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
 VALUES($1,$2,clock_timestamp()+interval '1 hour')`,[scenario.customer,scenario.token]);
 await client.query(`INSERT INTO sabora.dining_tables
 (id,number,capacity,qr_token_hash,session_id,ordering_state,readiness_state)
 VALUES($1,$2,4,$5,$6,'open','LISTA'),($3,$4,4,$5,$7,'open','LISTA')`,[
 scenario.sourceTable,scenario===scenarioA?981101:981201,
 scenario.destinationTable,scenario===scenarioA?981102:981202,
 qrHash,scenario.sourceSession,scenario.destinationSession]);
}
test('PG17 F12 resolved request creates exactly one pending grant for a unique open account',async()=>{
 await transaction(async client=>{
  await insertF12IsolatedIdentity(client,scenarioA);
  await insertF12Visit(client,scenarioA);
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,
    outstanding_cents) VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400)`,[
   scenarioA.sourceAccount,scenarioA.sourceTable,scenarioA.sourceSession,scenarioA.sourceVisit,scenarioA.customer
  ]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,[
   scenarioA.sourceAccount,scenarioA.sourceTable,scenarioA.sourceSession,scenarioA.sourceVisit
  ]);
  await client.query(`INSERT INTO sabora.restaurant_settings(singleton,name)
   VALUES(true,'Sabora PG17 isolated test') ON CONFLICT(singleton) DO NOTHING`);
  const call=()=>client.query(
   'SELECT * FROM sabora.request_customer_table_change_h6_resolved_candidate($1::bytea)',
   [scenarioA.token]);
  const first=(await call()).rows[0];
  assert.equal(first.request_status,'pending');
  assert.equal(first.expires_at instanceof Date,true);
  const saved=(await client.query(`SELECT q.account_id,q.status,q.source_table_id,
   q.destination_table_id,q.requesting_session_hash,b.table_id AS current_table
   FROM sabora.customer_table_change_requests q
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
   WHERE q.id=$1`,[first.request_id])).rows[0];
  assert.equal(saved.account_id,scenarioA.sourceAccount);
  assert.equal(saved.status,'pending');
  assert.equal(saved.source_table_id,scenarioA.sourceTable);
  assert.equal(saved.current_table,scenarioA.sourceTable);
  assert.equal(saved.destination_table_id,null);
  assert.deepEqual(saved.requesting_session_hash,scenarioA.token);
  const cooldown=await expectSqlError(client,call,/table_change_cooldown/);
  assert.equal(cooldown.code,'23514');
  const count=(await client.query(`SELECT count(*)::int AS total
   FROM sabora.customer_table_change_requests WHERE customer_id=$1`,[scenarioA.customer])).rows[0].total;
  assert.equal(count,1);
 });
});

test('PG17 F12 resolved request denies ambiguous open accounts without creating a grant',async()=>{
 await transaction(async client=>{
  await insertF12IsolatedIdentity(client,scenarioB);
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,
    outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400),
         ($6,$7,$8,$9,$5,'pay_at_end',clock_timestamp(),1800)`,[
   scenarioB.sourceAccount,scenarioB.sourceTable,scenarioB.sourceSession,scenarioB.sourceVisit,scenarioB.customer,
   scenarioB.destinationAccount,scenarioB.destinationTable,scenarioB.destinationSession,scenarioB.destinationVisit
  ]);
  const error=await expectSqlError(client,()=>client.query(
   'SELECT * FROM sabora.request_customer_table_change_h6_resolved_candidate($1::bytea)',
   [scenarioB.token]),/table_change_account_forbidden/);
  assert.equal(error.code,'42501');
  const count=(await client.query(`SELECT count(*)::int AS total
   FROM sabora.customer_table_change_requests WHERE customer_id=$1`,[scenarioB.customer])).rows[0].total;
  assert.equal(count,0);
 });
});

// The candidate RPC may pass root-only tests without being safe to expose to
// a runtime login. Keep its exact execution surface sealed until B3 cutover.
test('PG17 F12 resolved request is not executable by any existing runtime login or browser role',async()=>{
 const result=await admin.query(`SELECT p.prosecdef AS security_definer,
  p.proowner::regrole::text AS owner,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
  has_function_privilege('sabora_h6_customer_runtime',p.oid,'EXECUTE') AS customer,
  has_function_privilege('sabora_h6_operations_runtime',p.oid,'EXECUTE') AS operations,
  has_function_privilege('sabora_h6_provider_runtime',p.oid,'EXECUTE') AS provider,
  has_function_privilege('sabora_admin_writer',p.oid,'EXECUTE') AS admin_writer
  FROM pg_proc p WHERE p.oid=to_regprocedure(
   'sabora.request_customer_table_change_h6_resolved_candidate(bytea)')`);
 assert.equal(result.rows.length,1);
 const row=result.rows[0];
 assert.equal(row.security_definer,true);
 assert.equal(row.owner,'sabora_h6_fn_owner');
 for(const role of ['anon','authenticated','customer','operations','provider','admin_writer'])
  assert.equal(row[role],false,`unexpected F12 EXECUTE for ${role}`);
});

// A real catalog exercise is essential: a mock cannot prove PostgreSQL's
// effective EXECUTE semantics for PUBLIC, role membership or overloads.
test('PG17 F12 effective RPC surface detects PUBLIC grants and denies unrelated function grants',async()=>{
 await transaction(async client=>{
  await client.query('CREATE ROLE sabora_f12_probe_runtime NOLOGIN NOINHERIT');
  await client.query('CREATE ROLE sabora_f12_probe_login LOGIN NOINHERIT');
  await client.query('GRANT sabora_f12_probe_runtime TO sabora_f12_probe_login WITH SET TRUE, INHERIT FALSE');
  const signature='sabora.request_customer_table_change_h6_resolved_candidate(bytea)';
  const read=async()=>{
   const result=await client.query(F12_FUNCTION_SQL,['sabora_f12_probe_runtime']);
   return result.rows[0].names;
  };
  const baseline=await read();
  assert.equal(baseline.includes(signature),false);
  await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO sabora_f12_probe_runtime`);
  assert.deepEqual(await read(),[...baseline,signature].sort());
  const loginRead=async()=>{
   const result=await client.query(F12_FUNCTION_SQL,['sabora_f12_probe_login']);
   return result.rows[0].names;
  };
  const loginBaseline=await loginRead();
  assert.equal(loginBaseline.includes(signature),false,
   'NOINHERIT login must not silently acquire the capability EXECUTE');
  await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO sabora_f12_probe_login`);
  assert.deepEqual(await loginRead(),[...loginBaseline,signature].sort());
  await client.query(`GRANT EXECUTE ON FUNCTION
   sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)
   TO sabora_f12_probe_runtime`);
  const decision='sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)';
  assert.deepEqual(await read(),[...baseline,signature,decision].sort());
  await client.query(`REVOKE EXECUTE ON FUNCTION
   sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)
   FROM sabora_f12_probe_runtime`);
  assert.deepEqual(await read(),[...baseline,signature].sort());
  await client.query(`GRANT EXECUTE ON FUNCTION
   sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean) TO PUBLIC`);
  const leaked=await read();
  assert.ok(leaked.includes('sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)'),
   'PUBLIC EXECUTE must be visible in effective F12 surface');
 });
});

// PostgreSQL must prove the NOINHERIT boundary before any F12 cutover.
test('PG17 F12 SET ROLE boundary denies direct execution but permits explicitly assumed capability',async()=>{
 await transaction(async client=>{
  const role='sabora_f12_set_probe_role',login='sabora_f12_set_probe_login';
  const signature='sabora.request_customer_table_change_h6_resolved_candidate(bytea)';
  await client.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT`);
  await client.query(`CREATE ROLE ${login} LOGIN NOINHERIT`);
  await client.query(`GRANT ${role} TO ${login} WITH SET TRUE, INHERIT FALSE`);
  await client.query(`GRANT USAGE ON SCHEMA sabora TO ${role}`);
  await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${role}`);
  const functionOid=(await client.query('SELECT to_regprocedure($1)::oid AS oid',
   [signature])).rows[0].oid;
  assert.ok(functionOid,'candidate RPC must exist in disposable PG17');
  const probe=async()=>{
   const result=await client.query(`SELECT current_user AS who,
    pg_has_role(current_user,$1::name,'SET') AS may_set,
    has_function_privilege(current_user,$2::oid,'EXECUTE') AS can_execute`,
    [role,functionOid]);
   return result.rows[0];
  };
  await client.query(`SET LOCAL ROLE ${login}`);
  const before=await probe();
  assert.equal(before.who,login);
  assert.equal(before.may_set,true);
  assert.equal(before.can_execute,false,'NOINHERIT login must not execute capability RPC');
  await client.query(`SET LOCAL ROLE ${role}`);
  const assumed=await probe();
  assert.equal(assumed.who,role);
  assert.equal(assumed.can_execute,true,'explicit capability role must execute only after SET ROLE');
  await client.query('RESET ROLE');
 });
});

test('PG17 F12 candidate fails closed on open account without binding before persisting destination order',async()=>{
 await transaction(async client=>{
  await insertF12IsolatedIdentity(client,scenarioA);
  await client.query(`INSERT INTO sabora.customer_table_visits
   (table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
   VALUES($1,$2,$3::uuid,$4,($3::uuid)::text,1,clock_timestamp()+interval '1 hour')`,
   [scenarioA.destinationTable,scenarioA.destinationSession,scenarioA.customer,scenarioA.destinationVisit]);
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400)`,
   [scenarioA.sourceAccount,scenarioA.sourceTable,scenarioA.sourceSession,scenarioA.sourceVisit,scenarioA.customer]);
  const failure=await expectSqlError(client,()=>client.query(`SELECT * FROM
   sabora.confirm_customer_round_h6_transfer_integration_candidate(
   $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,
   $8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text)`,[
   scenarioA.token,scenarioA.destinationTable,'A'.repeat(43),scenarioA.destinationVisit,
   'f12_binding_missing_basket','f12_binding_missing_request',Buffer.alloc(32,71),
   'b0a00000-0000-4000-8000-000000000131','b0a00000-0000-4000-8000-000000000132',
   JSON.stringify([]),false,'pay_at_end'
  ]),/h6_open_account_binding_missing/);
  assert.equal(failure.code,'42501');
  const state=(await client.query(`SELECT
   (SELECT count(*)::int FROM sabora.customer_accounts WHERE customer_id=$1) AS accounts,
   (SELECT count(*)::int FROM sabora.orders WHERE table_id=$2) AS destination_orders,
   (SELECT count(*)::int FROM sabora.customer_table_change_requests WHERE customer_id=$1) AS grants`,
   [scenarioA.customer,scenarioA.destinationTable])).rows[0];
  assert.deepEqual(state,{accounts:1,destination_orders:0,grants:0});
 });
});

test('PG17 F12 atomic grant consumption moves operational binding without moving economic history',async()=>{
 await transaction(async client=>{
  await insertF12IsolatedIdentity(client,scenarioA);
  await insertF12Visit(client,scenarioA);
  await client.query(`INSERT INTO sabora.customer_table_visits
   (table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
   VALUES($1,$2,$3::uuid,$4,($3::uuid)::text,1,clock_timestamp()+interval '1 hour')`,
   [scenarioA.destinationTable,scenarioA.destinationSession,scenarioA.customer,scenarioA.destinationVisit]);
  await client.query(`INSERT INTO sabora.customer_accounts
   (id,table_id,session_id,visit_key,customer_id,payment_mode,payment_mode_selected_at,outstanding_cents)
   VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400)`,
   [scenarioA.sourceAccount,scenarioA.sourceTable,scenarioA.sourceSession,scenarioA.sourceVisit,scenarioA.customer]);
  await client.query(`INSERT INTO sabora.customer_account_operational_bindings
   (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
   [scenarioA.sourceAccount,scenarioA.sourceTable,scenarioA.sourceSession,scenarioA.sourceVisit]);
  // The F17 guard requires a genuinely orderable destination in the positive fixture.
  await client.query(`UPDATE sabora.dining_tables SET ordering_state='open'
   WHERE id=$1`,[scenarioA.destinationTable]);
  const orderId='b0a00000-0000-4000-8000-000000000141';
  await client.query(`INSERT INTO sabora.orders(id,table_id,session_id,company,employee_number,
   customer_alias,customer_identifier,customer_visit_key,economic_snapshot,confirmed_at,grouping,items)
   VALUES($1,$2,$3,NULL,NULL,'F12 PG17 isolated',$4,$5,
   '{"schemaVersion":"1"}'::jsonb,clock_timestamp(),'first',
   '[{"category":"main","name":"Plato auditoría","quantity":1}]'::jsonb)`,
   [orderId,scenarioA.destinationTable,scenarioA.destinationSession,'SB-BABABABABABJ',scenarioA.destinationVisit]);
  await client.query(`INSERT INTO sabora.order_rounds
   (order_id,account_id,amount_cents,payment_mode,payment_policy_version,grouping_deadline,state)
   VALUES($1,$2,1200,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')`,
   [orderId,scenarioA.sourceAccount]);
  // Two historical lines share a round: only the pending one may move.
  const sourceOrder='b0a00000-0000-4000-8000-000000000144';
  await client.query(`INSERT INTO sabora.orders(id,table_id,session_id,company,employee_number,
   customer_alias,customer_identifier,customer_visit_key,economic_snapshot,confirmed_at,grouping,items)
   VALUES($1,$2,$3,NULL,NULL,'F12 PG17 isolated',$4,$5,
   '{"schemaVersion":"1"}'::jsonb,clock_timestamp(),'first',
   '[{"category":"main","name":"Pendiente","quantity":1},
     {"category":"drink","name":"Recogido","quantity":1}]'::jsonb)`,
   [sourceOrder,scenarioA.sourceTable,scenarioA.sourceSession,'SB-BABABABABABJ',scenarioA.sourceVisit]);
  const sourceRound=(await client.query(`INSERT INTO sabora.order_rounds
   (order_id,account_id,amount_cents,payment_mode,payment_policy_version,grouping_deadline,state)
   VALUES($1,$2,1200,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')
   RETURNING id`,[sourceOrder,scenarioA.sourceAccount])).rows[0].id;
  await client.query(`INSERT INTO sabora.order_round_delivery_destinations
   (round_id,account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4,$5)`,
   [sourceRound,scenarioA.sourceAccount,scenarioA.sourceTable,scenarioA.sourceSession,scenarioA.sourceVisit]);
  const historicalLines=(await client.query(`SELECT id,line_number FROM sabora.order_lines
   WHERE order_id=$1 ORDER BY line_number`,[sourceOrder])).rows;
  assert.equal(historicalLines.length,2);
  await client.query(`UPDATE sabora.order_lines SET status='picked_up' WHERE id=$1`,[historicalLines[1].id]);
  await client.query(`INSERT INTO sabora.order_line_delivery_destinations
   (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
   SELECT l.id,$2,$3,$1,$4,$5,$6 FROM sabora.order_lines l WHERE l.order_id=$1`,
   [sourceOrder,sourceRound,scenarioA.sourceAccount,scenarioA.sourceTable,scenarioA.sourceSession,scenarioA.sourceVisit]);
  const grant=(await client.query(`INSERT INTO sabora.customer_table_change_requests
   (account_id,customer_id,visit_key,source_table_id,requesting_session_hash,
    status,expires_at,decided_at,decided_by)
   VALUES($1,$2,$3,$4,$5,'approved',clock_timestamp()+interval '90 seconds',
    clock_timestamp(),$6) RETURNING id`,[
    scenarioA.sourceAccount,scenarioA.customer,scenarioA.sourceVisit,scenarioA.sourceTable,
    scenarioA.token,'b0a00000-0000-4000-8000-000000000142'
   ])).rows[0].id;
  const consume=()=>client.query(`SELECT sabora.consume_customer_table_change_h6_candidate(
   $1::uuid,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::text,$7::uuid) AS grant_id`,[
   scenarioA.sourceAccount,scenarioA.customer,scenarioA.token,scenarioA.destinationTable,
   scenarioA.destinationSession,scenarioA.destinationVisit,orderId]);
  // A grant cannot be consumed by a nonexistent or unrelated confirmed order.
  const badOrder=await expectSqlError(client,()=>client.query(`SELECT
   sabora.consume_customer_table_change_h6_candidate(
   $1::uuid,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::text,$7::uuid)`,[
   scenarioA.sourceAccount,scenarioA.customer,scenarioA.token,scenarioA.destinationTable,
   scenarioA.destinationSession,scenarioA.destinationVisit,
   'b0a00000-0000-4000-8000-000000000143'
  ]),/table_change_order_scope_forbidden/);
  assert.equal(badOrder.code,'42501');
  const before=(await client.query(`SELECT q.status,b.table_id AS bound_table,
   a.outstanding_cents FROM sabora.customer_table_change_requests q
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
   JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,[grant])).rows[0];
  assert.equal(before.status,'approved');
  assert.equal(before.bound_table,scenarioA.sourceTable);
  assert.equal(before.outstanding_cents,'2400');
  // Revoking the destination QR version must invalidate the visit and leave
  // the grant available for a later authorized scan, without side effects.
  // QR rotation can revoke the existing visit through a trigger. Roll back
  // the entire rotation scenario, not merely the qr_version integer.
  await client.query('SAVEPOINT f17_qr_rotation');
  await client.query(`UPDATE sabora.dining_tables SET qr_version=qr_version+1 WHERE id=$1`,
   [scenarioA.destinationTable]);
  const revoked=await expectSqlError(client,consume,/table_change_destination_forbidden/);
  assert.equal(revoked.code,'42501');
  await client.query('ROLLBACK TO SAVEPOINT f17_qr_rotation');
  await client.query('RELEASE SAVEPOINT f17_qr_rotation');
  const afterQr=(await client.query(`SELECT q.status,b.table_id AS bound_table
   FROM sabora.customer_table_change_requests q JOIN
   sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
   WHERE q.id=$1`,[grant])).rows[0];
  assert.equal(afterQr.status,'approved');
  assert.equal(afterQr.bound_table,scenarioA.sourceTable);
  // A revoked customer session must never consume an otherwise valid approval.
  await client.query(`UPDATE sabora.customer_sessions SET revoked_at=clock_timestamp()
   WHERE token_hash=$1`,[scenarioA.token]);
  const revokedSession=await expectSqlError(client,consume,/table_change_session_forbidden/);
  assert.equal(revokedSession.code,'42501');
  await client.query(`UPDATE sabora.customer_sessions SET revoked_at=NULL
   WHERE token_hash=$1`,[scenarioA.token]);
  const afterSession=(await client.query(`SELECT q.status,b.table_id AS bound_table
   FROM sabora.customer_table_change_requests q JOIN
   sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
   WHERE q.id=$1`,[grant])).rows[0];
  assert.equal(afterSession.status,'approved');
  assert.equal(afterSession.bound_table,scenarioA.sourceTable);
  // An economically settled account cannot be transferred, even with an
  // approved grant and a valid destination order; no partial consumption.
  await client.query(`UPDATE sabora.customer_accounts SET state='settled'
   WHERE id=$1`,[scenarioA.sourceAccount]);
  const closedAccount=await expectSqlError(client,consume,/table_change_account_forbidden/);
  assert.equal(closedAccount.code,'42501');
  await client.query(`UPDATE sabora.customer_accounts SET state='open'
   WHERE id=$1`,[scenarioA.sourceAccount]);
  const afterClosure=(await client.query(`SELECT q.status,b.table_id AS bound_table,
   a.outstanding_cents FROM sabora.customer_table_change_requests q
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
   JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,[grant])).rows[0];
  assert.equal(afterClosure.status,'approved');
  assert.equal(afterClosure.bound_table,scenarioA.sourceTable);
  assert.equal(afterClosure.outstanding_cents,'2400');
  // F17: valid QR and live visit are insufficient when destination is closed.
  await client.query('SAVEPOINT f17_table_closed');
  await client.query(`UPDATE sabora.dining_tables SET ordering_state='closed'
   WHERE id=$1`,[scenarioA.destinationTable]);
  const blocked=await expectSqlError(client,consume,/table_change_destination_forbidden/);
  assert.equal(blocked.code,'42501');
  await client.query('ROLLBACK TO SAVEPOINT f17_table_closed');
  await client.query('RELEASE SAVEPOINT f17_table_closed');
  const afterBlocked=(await client.query(`SELECT q.status,b.table_id AS bound_table
   FROM sabora.customer_table_change_requests q
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
   WHERE q.id=$1`,[grant])).rows[0];
  assert.equal(afterBlocked.status,'approved');
  assert.equal(afterBlocked.bound_table,scenarioA.sourceTable);
  // F15: the 90-second deadline governs pending decisions, not approved grants.
  // An approved-but-unused grant remains consumable after its original TTL.
  // Preserve the normative decided_at < expires_at constraint while
  // simulating an approval issued several minutes ago.
  await client.query(`UPDATE sabora.customer_table_change_requests
   SET created_at=clock_timestamp()-interval '5 minutes',
       decided_at=clock_timestamp()-interval '4 minutes',
       expires_at=clock_timestamp()-interval '3 minutes'
   WHERE id=$1`,[grant]);
  const approvedExpired=(await client.query(`SELECT status,expires_at<clock_timestamp() AS expired
   FROM sabora.customer_table_change_requests WHERE id=$1`,[grant])).rows[0];
  assert.equal(approvedExpired.status,'approved');
  assert.equal(approvedExpired.expired,true);
  assert.equal((await consume()).rows[0].grant_id,grant);
  const state=(await client.query(`SELECT a.id,a.table_id AS historical_table,
   a.outstanding_cents,b.table_id AS operational_table,b.binding_version,
   q.status,q.destination_table_id,q.consumed_order_id
   FROM sabora.customer_accounts a
   JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
   JOIN sabora.customer_table_change_requests q ON q.account_id=a.id
   WHERE a.id=$1`,[scenarioA.sourceAccount])).rows[0];
  assert.equal(state.historical_table,scenarioA.sourceTable);
  assert.equal(state.operational_table,scenarioA.destinationTable);
  assert.equal(state.outstanding_cents,'2400');
  assert.equal(state.binding_version,'2');
  assert.equal(state.status,'consumed');
  assert.equal(state.destination_table_id,scenarioA.destinationTable);
  assert.equal(state.consumed_order_id,orderId);
  const projections=(await client.query(`SELECT l.line_number,l.status,
   d.table_id,d.destination_version FROM sabora.order_lines l
   JOIN sabora.order_line_delivery_destinations d ON d.order_line_id=l.id
   WHERE l.order_id=$1 ORDER BY l.line_number`,[sourceOrder])).rows;
  assert.equal(projections[0].status,'confirmed');
  assert.equal(projections[0].table_id,scenarioA.destinationTable);
  assert.equal(projections[0].destination_version,'2');
  assert.equal(projections[1].status,'picked_up');
  assert.equal(projections[1].table_id,scenarioA.sourceTable);
  assert.equal(projections[1].destination_version,'1');
  const roundDestination=(await client.query(`SELECT table_id,destination_version
   FROM sabora.order_round_delivery_destinations WHERE round_id=$1`,[sourceRound])).rows[0];
  assert.equal(roundDestination.table_id,scenarioA.sourceTable,
   'mixed historical round must not overwrite the completed pickup');
  assert.equal(roundDestination.destination_version,'1');

  const failure=await expectSqlError(client,consume,/table_change_same_table/);
  assert.equal(failure.code,'23514');
  assert.equal((await client.query(`SELECT count(*)::int AS n
   FROM sabora.customer_accounts WHERE customer_id=$1`,[scenarioA.customer])).rows[0].n,1);
 });
});

test('PG17 M2 provisions only the dedicated transfer writer capability',async()=>{
 const signature='sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
 const row=(await admin.query(`SELECT p.prosecdef AS security_definer,
  p.proowner::regrole::text AS owner,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('sabora_h6_customer_runtime',p.oid,'EXECUTE') AS h6_customer_execute,
  has_function_privilege('sabora_h6_operations_runtime',p.oid,'EXECUTE') AS h6_operations_execute,
  has_function_privilege('sabora_h6_provider_runtime',p.oid,'EXECUTE') AS h6_provider_execute
  FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,[signature])).rows[0];
 assert.ok(row,'transfer function must exist in disposable PG17');
 assert.equal(row.security_definer,true);
 assert.equal(row.owner,'sabora_h6_fn_owner');
 for(const key of ['anon_execute','authenticated_execute','h6_customer_execute',
  'h6_operations_execute','h6_provider_execute'])assert.equal(row[key],false,key);
 const role=(await admin.query(`SELECT rolcanlogin,rolinherit,rolsuper,rolbypassrls
  FROM pg_roles WHERE rolname='sabora_b3_confirmation_runtime'`)).rows[0];
 assert.deepEqual(role,{rolcanlogin:false,rolinherit:false,rolsuper:false,rolbypassrls:false});
 const exact=(await admin.query(F12_FUNCTION_SQL,['sabora_b3_confirmation_runtime'])).rows[0].names;
 assert.deepEqual(exact,[signature,
  'sabora.resubmit_customer_order_revision_h6_candidate(bytea,uuid,text,text,text,uuid,integer,text,jsonb,boolean)'].sort());
});

test('PG17 B3 dedicated login has no direct transfer EXECUTE and capability is exact',async()=>{
 await transaction(async client=>{
  const role='sabora_b3_confirmation_runtime',login='sabora_b3_confirmation_probe_login';
  const signature='sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
  const revisionSignature='sabora.resubmit_customer_order_revision_h6_candidate(bytea,uuid,text,text,text,uuid,integer,text,jsonb,boolean)';
  await client.query(`CREATE ROLE ${login} LOGIN NOINHERIT`);
  await client.query(`GRANT ${role} TO ${login} WITH SET TRUE, INHERIT FALSE`);
  const functionOid=(await client.query('SELECT to_regprocedure($1)::oid AS oid',
   [signature])).rows[0].oid;
  assert.ok(functionOid);
  await client.query(`SET LOCAL ROLE ${login}`);
  const before=(await client.query(`SELECT current_user AS who,
   pg_has_role(current_user,$1::name,'SET') AS may_set,
   has_function_privilege(current_user,$2::oid,'EXECUTE') AS can_execute`,
   [role,functionOid])).rows[0];
  assert.equal(before.who,login);
  assert.equal(before.may_set,true);
  assert.equal(before.can_execute,false);
  await client.query(`SET LOCAL ROLE ${role}`);
  const after=(await client.query(`SELECT current_user AS who,
   has_function_privilege(current_user,$1::oid,'EXECUTE') AS can_execute`,
   [functionOid])).rows[0];
  assert.equal(after.who,role);
  assert.equal(after.can_execute,true);
  const names=(await client.query(F12_FUNCTION_SQL,[role])).rows[0].names;
  assert.deepEqual(names,[signature,revisionSignature].sort(),
   'B3 role must have exactly the confirmation and corrective-revision writes');
  await client.query('RESET ROLE');
 });
});


test('PG17 B3 live preflight accepts only the isolated transactional login capability',async()=>{
 await transaction(async client=>{
  const role='sabora_b3_confirmation_runtime';
  const login='sabora_b3_confirmation_preflight_probe';
  const signature='sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
  const revisionSignature='sabora.resubmit_customer_order_revision_h6_candidate(bytea,uuid,text,text,text,uuid,integer,text,jsonb,boolean)';
  await client.query(`CREATE ROLE ${login} LOGIN NOINHERIT`);
  await client.query(`GRANT ${role} TO ${login} WITH SET TRUE, INHERIT FALSE`);
  // A disposable superuser session can impersonate the exact login within
  // this rolled-back transaction. This checks the real PostgreSQL catalog,
  // not a fixture, and never creates persistent runtime credentials.
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${login}`);
  const pool={connect:async()=>({
   query:(sql,params)=>client.query(sql,params),release:()=>{}
  })};
  const result=await assertB3ConfirmationCapabilities({pool,expectedLogin:login});
  assert.deepEqual(result,{validated:true,login,capability:role});
  const current=(await client.query('SELECT current_user,session_user')).rows[0];
  assert.equal(current.current_user,login);
  assert.equal(current.session_user,login);
  // A privilege added after the initial success must invalidate the same
  // live preflight. All changes remain inside the disposable transaction.
  await client.query('RESET SESSION AUTHORIZATION');
  const extra='sabora.confirm_customer_round_h6_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
  const extraExists=(await client.query('SELECT to_regprocedure($1) IS NOT NULL AS found',[extra])).rows[0].found;
  assert.equal(extraExists,true,'H6 baseline RPC must exist for negative privilege probe');
  await client.query(`GRANT EXECUTE ON FUNCTION ${extra} TO ${role}`);
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${login}`);
  await assert.rejects(()=>assertB3ConfirmationCapabilities({pool,expectedLogin:login}),
   /invalid_b3_confirmation_capabilities:function-surface/);
  await client.query('RESET SESSION AUTHORIZATION');
  await client.query(`REVOKE EXECUTE ON FUNCTION ${extra} FROM ${role}`);
  await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${login}`);
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${login}`);
  await assert.rejects(()=>assertB3ConfirmationCapabilities({pool,expectedLogin:login}),
   /invalid_b3_confirmation_capabilities:login-function-surface/);
 });
});


test('PG17 B3 H6 reader live preflight validates isolated login and rejects privilege drift',async()=>{
 await transaction(async client=>{
  const role='sabora_b3_h6_reader_runtime',login='sabora_b3_h6_reader_probe';
  const readerRound='sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)';
  const readerPolicy='sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)';
  const readerRevision='sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)';
  await client.query(`CREATE ROLE ${login} LOGIN NOINHERIT`);
  await client.query(`GRANT ${role} TO ${login} WITH SET TRUE, INHERIT FALSE`);
  const pool={connect:async()=>({query:(sql,params)=>client.query(sql,params),release:()=>{}})};
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${login}`);
  assert.deepEqual(await assertB3H6LoginSurface({pool,expectedLogin:login}),{validated:true});
  const identity=(await client.query('SELECT current_user,session_user')).rows[0];
  assert.equal(identity.current_user,login);
  assert.equal(identity.session_user,login);
  await client.query('RESET SESSION AUTHORIZATION');
  const extra='sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
  await client.query(`GRANT EXECUTE ON FUNCTION ${extra} TO ${role}`);
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${login}`);
  await assert.rejects(()=>assertB3H6LoginSurface({pool,expectedLogin:login}),
   /invalid_b3_h6_reader_capabilities/);
  await client.query('RESET SESSION AUTHORIZATION');
  await client.query(`REVOKE EXECUTE ON FUNCTION ${extra} FROM ${role}`);
  await client.query(`GRANT EXECUTE ON FUNCTION ${readerRound} TO ${login}`);
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${login}`);
  await assert.rejects(()=>assertB3H6LoginSurface({pool,expectedLogin:login}),
   /invalid_b3_h6_reader_capabilities/);
 });
});


test('PG17 F12 customer and waiter live identity preflights use separate restricted logins',async()=>{
 await transaction(async client=>{
  const cases=[
   ['sabora_f12_customer_runtime','sabora_f12_customer_probe',
    ['sabora.request_customer_table_change_h6_resolved_candidate(bytea)',
     'sabora.read_customer_table_change_h6_candidate(bytea)',
     'sabora.read_customer_table_change_outbox_h6_candidate(bytea,bigint,integer)']],
   ['sabora_f12_operations_runtime','sabora_f12_operations_probe',
    ['sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)']]
  ];
  for(const [role,login,signatures] of cases){
   await client.query(`CREATE ROLE ${login} LOGIN NOINHERIT`);
   await client.query(`GRANT ${role} TO ${login} WITH SET TRUE, INHERIT FALSE`);
  }
  const pool={connect:async()=>({query:(sql,params)=>client.query(sql,params),release:()=>{}})};
  for(const [role,login] of cases){
   await client.query(`SET LOCAL SESSION AUTHORIZATION ${login}`);
   assert.deepEqual(await assertF12SqlIdentity({pool,expectedLogin:login,capability:role}),
    {validated:true,capability:role,login});
   await client.query('RESET SESSION AUTHORIZATION');
  }
  const [customerRole,customerLogin]=cases[0];
  const extra='sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)';
  await client.query(`GRANT EXECUTE ON FUNCTION ${extra} TO ${customerRole}`);
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${customerLogin}`);
  await assert.rejects(()=>assertF12SqlIdentity({pool,expectedLogin:customerLogin,
   capability:customerRole}),/invalid_f12_sql_capabilities:function-surface/);
 });
});


test('PG17 B3 fifth customer-flow login validates six exact RPCs and one SET ROLE',async()=>{
 await transaction(async client=>{
  const role='sabora_customer_flow_runtime',login='sabora_b3_customer_flow_probe';
  const signatures=[
   'sabora.authorize_customer_visit_candidate(bytea,uuid,text,text,text,timestamp with time zone)',
   'sabora.insert_customer_quote_candidate(bytea,uuid,text,text,text,uuid,uuid,bigint,jsonb,timestamp with time zone)',
   'sabora.lookup_customer_order_attempt_candidate(bytea,uuid,text,text,text,text)',
   'sabora.persist_customer_order_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean)',
   'sabora.prepare_customer_confirmation_line_candidate(bytea,uuid,text,text,text,uuid,uuid)',
   'sabora.prepare_customer_quote_candidate(bytea,uuid,text,text,text,uuid)'
  ];
  await client.query(`CREATE ROLE ${login} LOGIN NOINHERIT`);
  await client.query(`GRANT ${role} TO ${login} WITH SET TRUE, INHERIT FALSE`);
  for(const signature of signatures){
   const found=(await client.query('SELECT to_regprocedure($1) IS NOT NULL AS found',[signature])).rows[0].found;
   assert.equal(found,true,`expected existing customer flow RPC: ${signature}`);
  }
  const pool={connect:async()=>({query:(sql,params)=>client.query(sql,params),release:()=>{}})};
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${login}`);
  assert.deepEqual(await assertCustomerFlowSqlCapabilities({pool,expectedLogin:login}),
   {validated:true,login});
  assert.deepEqual(await assertB3CustomerFlowExactSetRole({pool}),{validated:true});
  await client.query('RESET SESSION AUTHORIZATION');
  const extra='sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
  await client.query(`GRANT EXECUTE ON FUNCTION ${extra} TO ${role}`);
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${login}`);
  await assert.rejects(()=>assertCustomerFlowSqlCapabilities({pool,expectedLogin:login}),
   /invalid_customer_production_sql_capabilities:function-surface/);
  await client.query('RESET SESSION AUTHORIZATION');
  await client.query(`REVOKE EXECUTE ON FUNCTION ${extra} FROM ${role}`);
  await client.query('CREATE ROLE sabora_b3_customer_flow_extra NOLOGIN');
  await client.query(`GRANT sabora_b3_customer_flow_extra TO ${login} WITH SET TRUE, INHERIT FALSE`);
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${login}`);
  await assert.rejects(()=>assertB3CustomerFlowExactSetRole({pool}),
   /invalid_b3_customer_flow_set_roles/);
 });
});


test('PG17 B3 combined five-identity preflight accepts only independently scoped capabilities',async()=>{
 await transaction(async client=>{
  const specs=[
   {role:'sabora_f12_customer_runtime',login:'sabora_b3_combined_request',
    functions:['sabora.request_customer_table_change_h6_resolved_candidate(bytea)',
     'sabora.read_customer_table_change_h6_candidate(bytea)',
     'sabora.read_customer_table_change_outbox_h6_candidate(bytea,bigint,integer)']},
   {role:'sabora_f12_operations_runtime',login:'sabora_b3_combined_decision',
    functions:['sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)']},
   {role:'sabora_b3_confirmation_runtime',login:'sabora_b3_combined_writer',
    functions:['sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)',
     'sabora.resubmit_customer_order_revision_h6_candidate(bytea,uuid,text,text,text,uuid,integer,text,jsonb,boolean)']},
   {role:'sabora_b3_h6_reader_runtime',login:'sabora_b3_combined_reader',
    functions:['sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)',
     'sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)',
     'sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)']},
   {role:'sabora_customer_flow_runtime',login:'sabora_b3_combined_basket',functions:[]}
  ];
  for(const spec of specs){
   await client.query(`CREATE ROLE ${spec.login} LOGIN NOINHERIT`);
   await client.query(`GRANT ${spec.role} TO ${spec.login} WITH SET TRUE, INHERIT FALSE`);
  }
  const pool={connect:async()=>({query:(sql,args)=>client.query(sql,args),release:()=>{}})};
  const [request,decision,writer,reader,basket]=specs;
  for(const spec of specs){
   await client.query(`SET LOCAL SESSION AUTHORIZATION ${spec.login}`);
   const who=(await client.query('SELECT current_user,session_user')).rows[0];
   assert.equal(who.current_user,spec.login);
   assert.equal(who.session_user,spec.login);
   if(spec===request||spec===decision){
    assert.deepEqual(await assertF12SqlIdentity({pool,expectedLogin:spec.login,
     capability:spec.role}),{validated:true,login:spec.login,capability:spec.role});
   }else if(spec===writer){
    assert.deepEqual(await assertB3ConfirmationCapabilities({pool,expectedLogin:spec.login}),
     {validated:true,login:spec.login,capability:spec.role});
   }else if(spec===reader){
    assert.deepEqual(await assertB3H6LoginSurface({pool,expectedLogin:spec.login}),
     {validated:true});
   }else{
    assert.deepEqual(await assertCustomerFlowSqlCapabilities({pool,expectedLogin:spec.login}),
     {validated:true,login:spec.login});
    assert.deepEqual(await assertB3CustomerFlowExactSetRole({pool}),{validated:true});
   }
   await client.query('RESET SESSION AUTHORIZATION');
  }
  const writerSignature=writer.functions[0];
  await client.query(`GRANT EXECUTE ON FUNCTION ${writerSignature} TO ${reader.role}`);
  await client.query(`SET LOCAL SESSION AUTHORIZATION ${reader.login}`);
  await assert.rejects(()=>assertB3H6LoginSurface({pool,expectedLogin:reader.login}),
   /invalid_b3_h6_reader_capabilities/);
 });
});


test('PG17 B3 six isolated logins complete PWA customer A to waiter to economic B journey',async()=>{
 const priorB3Flag=process.env.VITE_SABORA_ENABLE_B3_TABLE_CHANGE;
 process.env.VITE_SABORA_ENABLE_B3_TABLE_CHANGE='isolated_pg17';
 const suffix=process.pid.toString(36);
 const specs=[
  {role:'sabora_f12_customer_runtime',login:'sabora_b3_physical_request_'+suffix,
   signatures:['sabora.request_customer_table_change_h6_resolved_candidate(bytea)',
     'sabora.read_customer_table_change_h6_candidate(bytea)',
     'sabora.read_customer_table_change_outbox_h6_candidate(bytea,bigint,integer)']},
  {role:'sabora_f12_operations_runtime',login:'sabora_b3_physical_decision_'+suffix,
   signatures:['sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)']},
  {role:'sabora_b3_confirmation_runtime',login:'sabora_b3_physical_writer_'+suffix,
   signatures:['sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)',
    'sabora.resubmit_customer_order_revision_h6_candidate(bytea,uuid,text,text,text,uuid,integer,text,jsonb,boolean)']},
  {role:'sabora_b3_h6_reader_runtime',login:'sabora_b3_physical_reader_'+suffix,
   signatures:['sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)',
    'sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)',
    'sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)']},
  {role:'sabora_customer_flow_runtime',login:'sabora_b3_physical_basket_'+suffix,
   signatures:[]},
  {role:'sabora_f12_pending_reader_runtime',login:'sabora_b3_physical_pending_'+suffix,
   signatures:[]},
  {role:'sabora_b3_cash_runtime',login:'sabora_b3_physical_cash_'+suffix,
   signatures:['sabora.settle_h6_account_cash_authorized_candidate(text,text,uuid,text,uuid,bigint,text,bigint,bigint,text)']},
  {role:'sabora_h6_provider_runtime',login:'sabora_b3_physical_provider_'+suffix,
   signatures:[]},
  {role:'sabora_h6_operations_runtime',login:'sabora_b3_physical_oper_'+suffix,
   signatures:[]},
  {role:'sabora_staff_reader',login:'sabora_b3_physical_staff_auth_'+suffix,
   signatures:[]},
  // Runtime closure must not expand the exact H6 operations capability.
  {role:'sabora_h6_account_close_runtime',login:'sabora_b3_physical_close_'+suffix,
   signatures:['sabora.close_h6_account_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)']},
  // Kitchen transitions have a separate signed login and a single exact
  // function grant: no browser or generic operational direct table access.
  {role:'sabora_b3_h4_transition_runtime',login:'sabora_b3_physical_h4_'+suffix,
   signatures:['sabora.transition_order_line_authorized_candidate(text,text,uuid,uuid,text,text,bigint,bigint,text)',
    'sabora.read_order_operations_delivery_pickup_board_h6_candidate(text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)',
    'sabora.read_order_operations_history_authorized_candidate(text,text,uuid,text,uuid,integer,bigint,bigint,text)']},
  // Customer outbox delivery is a one-function read capability; it cannot
  // execute the legacy H6 confirmation entrypoint.
  {role:'sabora_m2_customer_event_runtime',login:'sabora_b3_physical_events_'+suffix,
   signatures:['sabora.read_customer_event_backlog_h6_candidate(bytea,uuid,text,uuid,bigint,integer)']},
  {role:'sabora_catalog_reader',login:'sabora_b3_physical_catalog_'+suffix,signatures:[]},
  {role:'sabora_customer_registration_runtime',login:'sabora_b3_physical_register_'+suffix,signatures:[]},
  {role:'sabora_customer_session_runtime',login:'sabora_b3_physical_session_'+suffix,signatures:[]},
  {role:'sabora_m3_tables_runtime',login:'sabora_b3_physical_m3_tables_'+suffix,signatures:[]},
  {role:'sabora_m3_catalog_runtime',login:'sabora_b3_physical_m3_catalog_'+suffix,signatures:[]}
 ];
 const createdRoles=[],pools=[],connections=[];
 let customerEventNotifier=null;
 const password='sabora_b3_disposable_'+suffix+'_only';
 try{
  for(const spec of specs){
   if(!['sabora_customer_flow_runtime','sabora_f12_customer_runtime',
       'sabora_f12_operations_runtime','sabora_b3_confirmation_runtime',
       'sabora_b3_h6_reader_runtime','sabora_f12_pending_reader_runtime',
       'sabora_h6_provider_runtime','sabora_h6_operations_runtime',
       'sabora_b3_h4_transition_runtime',
       'sabora_staff_reader','sabora_h6_account_close_runtime',
       'sabora_m2_customer_event_runtime','sabora_catalog_reader',
       'sabora_customer_registration_runtime','sabora_customer_session_runtime',
       'sabora_m3_tables_runtime','sabora_m3_catalog_runtime'].includes(spec.role)){
    const exists=(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[spec.role])).rowCount;
    assert.equal(exists,0,'disposable PG17 roles must not preexist');
    await admin.query('CREATE ROLE '+spec.role+' NOLOGIN NOINHERIT');
    createdRoles.push(spec.role);
    await admin.query('GRANT USAGE ON SCHEMA sabora TO '+spec.role);
    for(const signature of spec.signatures)
     await admin.query('GRANT EXECUTE ON FUNCTION '+signature+' TO '+spec.role);
   }
   await admin.query('CREATE ROLE '+spec.login+' LOGIN NOINHERIT PASSWORD '+
    "'"+password+"'");
   createdRoles.push(spec.login);
   if(spec.role==='sabora_staff_reader'){
    await admin.query('GRANT USAGE ON SCHEMA sabora TO '+spec.login);
    await admin.query('GRANT SELECT(user_id,role,state) ON sabora.staff_members TO '+spec.login);
    await admin.query('CREATE POLICY ci_b3_staff_login_'+suffix+
     ' ON sabora.staff_members FOR SELECT TO '+spec.login+' USING (true)');
   }else{
    await admin.query('GRANT '+spec.role+' TO '+spec.login+
     ' WITH SET TRUE, INHERIT FALSE');
   }
  }
  for(const spec of specs){
   const loginUrl=new URL(url);
   loginUrl.username=spec.login;
   loginUrl.password=password;
   // Two genuinely concurrent staff decision RPCs must not wait for a
   // spare connection while the pool also serves its pinned preflight login
   // and the durable staff-event notifier.
   const pool=new Pool({connectionString:loginUrl.toString(),
    max:['sabora_f12_operations_runtime','sabora_h6_operations_runtime'].includes(spec.role)?5:3,
    connectionTimeoutMillis:3000,
    options:'-c statement_timeout=15000'});
   pools.push(pool);
   const connection=await pool.connect();
   connections.push(connection);
   const identity=(await connection.query('SELECT current_user,session_user')).rows[0];
   assert.equal(identity.current_user,spec.login);
   assert.equal(identity.session_user,spec.login);
   const capabilities=(await connection.query(F12_FUNCTION_SQL,[spec.login])).rows[0].names;
   assert.deepEqual(capabilities,[],
    'authenticated login must not inherit or directly execute any Sabora RPC');
   if(spec.signatures.length){
    const allowed=(await connection.query(
     'SELECT pg_has_role(current_user,$1::name,\'SET\') AS can_set',
     [spec.role])).rows[0].can_set;
    assert.equal(allowed,true,'login must be able to assume only its scoped role');
   }
  }
  const scopedPools=connections.map(connection=>({
   connect:async()=>({query:(sql,args)=>connection.query(sql,args),release:()=>{}})
  }));
  const checks=[
   assertF12SqlIdentity({pool:scopedPools[0],expectedLogin:specs[0].login,
    capability:specs[0].role}),
   assertF12SqlIdentity({pool:scopedPools[1],expectedLogin:specs[1].login,
    capability:specs[1].role}),
   assertB3ConfirmationCapabilities({pool:scopedPools[2],expectedLogin:specs[2].login}),
   assertB3H6LoginSurface({pool:scopedPools[3],expectedLogin:specs[3].login}),
   assertCustomerFlowSqlCapabilities({pool:scopedPools[4],expectedLogin:specs[4].login}),
   assertPendingReaderCapabilities({pool:scopedPools[5],expectedLogin:specs[5].login})
  ];
  const results=await Promise.all(checks);
  assert.equal(results.length,6);
  assert.ok(results.every(result=>result.validated===true));
  assert.deepEqual(await assertB3CustomerFlowExactSetRole({pool:scopedPools[4]}),
   {validated:true});
  await preflightOrderTransitionStaffIdentity({pool:pools[9],role:specs[9].login});
  const staffAuthRole=(await connections[9].query(
   'SELECT current_user AS login,session_user AS session')).rows[0];
  assert.deepEqual(staffAuthRole,{login:specs[9].login,session:specs[9].login});
  // staff_members currently contains only these three publicly readable-to-staff
  // columns. SELECT * is consequently not a negative privilege assertion.
  // Enforce the intended read-only boundary using UPDATE and private accounts.
  await assert.rejects(connections[9].query(
   "UPDATE sabora.staff_members SET state='revoked' WHERE user_id=$1",
   ['b0a00000-0000-4000-8000-000000000307']),/permission denied/);
  await assert.rejects(connections[9].query('SELECT * FROM sabora.customer_accounts'),
   /permission denied/);
  await assert.rejects(connections[9].query('SET ROLE sabora_h6_fn_owner'),
   /permission denied/);
  const cashFunctions=(await connections[6].query(F12_FUNCTION_SQL,[specs[6].role])).rows[0].names;
  assert.deepEqual(cashFunctions,specs[6].signatures,
   'F20 cash role executes exactly the reviewed settlement RPC');
  await assert.rejects(connections[6].query('SELECT * FROM sabora.customer_accounts'),
   /permission denied/);
  await assert.rejects(connections[6].query('SET ROLE sabora_h6_fn_owner'),/permission denied/);
  await assertH6RuntimeIdentity({pool:scopedPools[7],
   expectedLogin:specs[7].login,capability:specs[7].role});
  await assertH6RuntimeIdentity({pool:scopedPools[8],
   expectedLogin:specs[8].login,capability:specs[8].role});
  await assertM2CustomerEventCapability({pool:scopedPools[12],
   expectedLogin:specs[12].login});
  for(const index of [7,8,10]){
   await assert.rejects(connections[index].query('SELECT * FROM sabora.payment_attempts'),
    /permission denied/);
   await assert.rejects(connections[index].query('SET ROLE sabora_h6_fn_owner'),
    /permission denied/);
  }
  assert.deepEqual((await connections[10].query(
   F12_FUNCTION_SQL,[specs[10].role])).rows[0].names,specs[10].signatures,
   'close-only role executes one reviewed RPC and no existing H6 operations');
  // Unlike the pinned preflight connection, runtime customer requests must
  // check out distinct physical clients to exercise concurrent transactions.
  // One client stays pinned for identity assertions; two remain available.
  scopedPools[0]={connect:()=>pools[0].connect()};
   // Concurrent staff decision transactions require distinct physical
   // authenticated connections, not the pinned preflight connection.
   scopedPools[1]={connect:()=>pools[1].connect()};
  // F22 concurrent customer confirmations must use distinct authenticated
  // writer, H6 read and flow connections rather than the pinned preflight
  // handles. Customer SSE/revision reads can overlap a confirmation replay;
  // sharing the preflight client would interleave BEGIN/SET LOCAL and test a
  // connection state that no production pool is allowed to expose.
  scopedPools[2]={connect:()=>pools[2].connect()};
  scopedPools[3]={connect:()=>pools[3].connect()};
  scopedPools[4]={connect:()=>pools[4].connect()};
  // React StrictMode may start overlapping GETs for the queue on mount.
  // A pinned preflight connection cannot serve concurrent SQL transactions:
  // use the dedicated physical pending login's real pool at runtime, preserving
  // the one-function SET ROLE allowlist and the two remaining pool clients.
  scopedPools[5]={connect:()=>pools[5].connect()};
  scopedPools[6]={connect:()=>pools[6].connect()};
  scopedPools[7]={connect:()=>pools[7].connect()};
  scopedPools[8]={connect:()=>pools[8].connect()};
  scopedPools[10]={connect:()=>pools[10].connect()};
  scopedPools[12]={connect:()=>pools[12].connect()};
  const {privateKey:ciPrivateKey,publicKey:ciPublicKey}=generateKeyPairSync('rsa',
   {modulusLength:2048,publicExponent:0x10001});
  const ciIssuer='https://sabora-disposable.test/auth/v1';
  const ciJwk=Object.freeze({...ciPublicKey.export({format:'jwk'}),
   kid:'b3-ci-staff-'+suffix,kty:'RSA',alg:'RS256',use:'sig'});
  const staffJwt=(userId,{expiresIn=3600,role='authenticated'}={})=>{
   const now=Math.floor(Date.now()/1000);
   const head=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:ciJwk.kid}))
    .toString('base64url');
   const body=Buffer.from(JSON.stringify({iss:ciIssuer,aud:'authenticated',
    sub:userId,role,iat:now,exp:now+expiresIn})).toString('base64url');
   return head+'.'+body+'.'+sign('RSA-SHA256',
    Buffer.from(head+'.'+body),ciPrivateKey).toString('base64url');
  };
  const jwtWaiter=staffJwt('b0a00000-0000-4000-8000-000000000307');
  // Two REAL personnel identities, not two sessions impersonating one user.
  const secondWaiterId='b0a00000-0000-4000-8000-000000000311';
  const jwtSecondWaiter=staffJwt(secondWaiterId);
  const jwtKitchen=staffJwt('b0a00000-0000-4000-8000-000000000310');
  const jwtCustomer=staffJwt('b0a00000-0000-4000-8000-000000000301');
  const jwtExpired=staffJwt('b0a00000-0000-4000-8000-000000000307',
   {expiresIn:-30});
  const ciVerifiedStaffHeaders=()=>({authorization:'Bearer '+jwtWaiter});
  const ciSecondWaiterHeaders=()=>({authorization:'Bearer '+jwtSecondWaiter});
  const ciStaffRoles=createStaffProtectedHooksFromPool({
   pool:pools[9],issuer:ciIssuer,getTrustedKeys:async()=>[ciJwk]
  });
  const cashSigningKeyId='b3_f20_cash_'+suffix,cashSigningSecret=randomBytes(32);
  const m3TablesIssuer=createM3ManagementCapabilityIssuer({keyId:cashSigningKeyId,
   secret:cashSigningSecret,databaseRole:specs[16].login});
  const m3CatalogIssuer=createM3ManagementCapabilityIssuer({keyId:cashSigningKeyId,
   secret:cashSigningSecret,databaseRole:specs[17].login});
  const cashIssuer=createH6StaffCapabilityIssuer({keyId:cashSigningKeyId,
   secret:cashSigningSecret,databaseRole:specs[6].login});
  const cashSql=createRoleScopedPostgresTransaction({pool:scopedPools[6],
   role:specs[6].role,allowedSql:new Set([SETTLE_CASH_H6_SQL])});
  const cashOperations=createH6OperationsCoordinator({
   repository:createH6OperationsRepository({withTransaction:cashSql}),
   issueCapability:cashIssuer
  });
  const providerTx=createRoleScopedPostgresTransaction({pool:scopedPools[7],
   role:specs[7].role,allowedSql:new Set([LIST_SCHEDULABLE_H6_SQL,REQUEST_DUE_CAPTURE_H6_SQL,
    RECORD_AUTHORIZATION_H6_SQL,
    REQUEST_CAPTURE_H6_SQL,RECORD_CAPTURE_H6_SQL,INGEST_STRIPE_WEBHOOK_H6_SQL,
    REQUEST_REFUND_H6_SQL,RECORD_REFUND_H6_SQL])});
  const h6Provider=createH6ProviderRepository({withTransaction:providerTx});
  const staffTx=createRoleScopedPostgresTransaction({pool:scopedPools[8],
   role:specs[8].role,allowedSql:new Set([ACK_DISPATCH_H6_SQL,
    REPORT_INCIDENT_H6_SQL,READ_STAFF_EVENTS_H6_SQL,MANAGE_PICKUP_TASK_H6_SQL,
    SET_CATALOG_SOLD_OUT_H6_SQL])});
  const staffIssuer=createH6StaffCapabilityIssuer({keyId:cashSigningKeyId,
   secret:cashSigningSecret,databaseRole:specs[8].login});
  const providerStaff=createH6OperationsCoordinator({
   repository:createH6OperationsRepository({withTransaction:staffTx}),
   issueCapability:staffIssuer
  });
  const customerEventsTx=createRoleScopedPostgresTransaction({pool:scopedPools[12],
   role:specs[12].role,allowedSql:new Set([READ_CUSTOMER_EVENTS_H6_SQL])});
  const customerEvents=createH6CustomerEventRepository({withTransaction:customerEventsTx});
  // Dedicated SQL statement allowlist: closing is not a cash receipt, a
  // kitchen acknowledgement or a generic role-granted table UPDATE.
  // Closure races require independent physical PG17 sockets. scopedPools[10]
  // wraps a pinned preflight client and cannot safely execute two BEGINs.
  const closeTx=createRoleScopedPostgresTransaction({pool:pools[10],
   role:specs[10].role,allowedSql:new Set([CLOSE_ACCOUNT_H6_SQL])});
  const closeIssuer=createH6StaffCapabilityIssuer({keyId:cashSigningKeyId,
   secret:cashSigningSecret,databaseRole:specs[10].login});
  const closeOperations=createH6OperationsCoordinator({
   repository:createH6OperationsRepository({withTransaction:closeTx}),
   issueCapability:closeIssuer
  });
  // Reuse the existing H4 signed RPC; this route is transition-only and
  // explicitly forbids retired physical pickup. The kitchen actor is
  // verified by JWT, PostgreSQL staff membership and the H4 HMAC.
  const h4KitchenTx=createRoleScopedPostgresTransaction({pool:pools[11],
   role:specs[11].role,allowedSql:new Set([TRANSITION_ORDER_LINE_SQL,
    READ_H6_DELIVERY_BOARD_SQL,READ_ORDER_HISTORY_SQL])});
  const h4KitchenIssuer=createOrderOperationCapabilityIssuer({
   keyId:cashSigningKeyId,secret:cashSigningSecret,databaseRole:specs[11].login});
  const h4ReadIssuer=createOrderOperationReadCapabilityIssuer({
   keyId:cashSigningKeyId,secret:cashSigningSecret,databaseRole:specs[11].login});
  const h4KitchenOperations=createOrderOperationsCoordinator({
   withTransaction:h4KitchenTx,
   repository:createOrderOperationsRepository({deliveryBoardCandidate:true}),
   issueTransitionCapability:h4KitchenIssuer,issueReadCapability:h4ReadIssuer
  });
  const signedStripeSecret='whsec_B3F20IsolatedCandidate_0001';
  const verifiedStripeWebhook=createH6StripeWebhookHandler({
   providerRepository:h6Provider,secret:signedStripeSecret,expectedLivemode:false
  });
  const signStripeEvent=(event,{secret=signedStripeSecret,timestamp=Math.floor(Date.now()/1000)}={})=>{
   const rawBody=Buffer.from(JSON.stringify(event));
   const signature=createHmac('sha256',secret)
    .update(String(timestamp)+'.').update(rawBody).digest('hex');
   return {rawBody,signatureHeader:'t='+timestamp+',v1='+signature};
  };
  const candidate=await createVerifiedTableChangeB3CustomerFlowCandidate({
   customerPool:scopedPools[0],operationsPool:scopedPools[1],
   confirmationPool:scopedPools[2],h6ReadPool:scopedPools[3],flowPool:scopedPools[4],
   expectedCustomerLogin:specs[0].login,expectedOperationsLogin:specs[1].login,
   expectedConfirmationLogin:specs[2].login,expectedH6ReadLogin:specs[3].login,
   expectedFlowLogin:specs[4].login,
   hashSession:hashCustomerSessionToken,
   verifyStaff:async()=>({role:'waiter'}),
   secretKey:'sabora_b3_ephemeral_test_secret_key_32_bytes_minimum'
  });
  assert.equal(typeof candidate.tableChange.request,'function');
  assert.equal(typeof candidate.tableChange.decide,'function');
  assert.equal(typeof candidate.confirmation.confirm,'function');
  // Exercise Fastify registration after six independent PG17 login
  // preflights. Authentication must reject HTTP before any business RPC.
  const Fastify=createRequire(new URL('../../apps/api/package.json',import.meta.url))('fastify');
  const http=Fastify({logger:false});
  customerEventNotifier=await createPostgresH6OutboxNotifier({pool:pools[12]});
  const streamFailures=[];
  // F18: one remaining guest at A and one incumbent at B, with distinct
  // customer identities, sessions, accounts, orders and delivery histories.
  const peers=[
   {seat:'A',customer:'b0a00000-0000-4000-8000-000000000351',
    account:'b0a00000-0000-4000-8000-000000000352',
    order:'b0a00000-0000-4000-8000-000000000353',
    round:'b0a00000-0000-4000-8000-000000000354',
    token:'u'.repeat(42)+'s',publicId:'SB-CDCDCDCDCDCP',alias:'Comensal A',
    visitKey:'b3_peer_a_0351_integral',balance:1800},
   {seat:'B',customer:'b0a00000-0000-4000-8000-000000000361',
    account:'b0a00000-0000-4000-8000-000000000362',
    order:'b0a00000-0000-4000-8000-000000000363',
    round:'b0a00000-0000-4000-8000-000000000364',
    token:'v'.repeat(42)+'s',publicId:'SB-EFEFEFEFEFEP',alias:'Comensal B',
    visitKey:'b3_peer_b_0361_integral',balance:2500}
  ];
  // Fourth independent customer only for two-destination confirmation race.
  const rival={
   customer:'b0a00000-0000-4000-8000-000000000371',
   account:'b0a00000-0000-4000-8000-000000000372',
   order:'b0a00000-0000-4000-8000-000000000373',
   round:'b0a00000-0000-4000-8000-000000000374',
   token:'w'.repeat(42)+'s',publicId:'SB-GHGHGHGHGHGP',
   alias:'Comensal de carrera',visitKey:'b3_race_origin_0371_integral',
   balance:1600
  };
  const rollbackDiner={
   customer:'b0a00000-0000-4000-8000-000000000381',
   account:'b0a00000-0000-4000-8000-000000000382',
   order:'b0a00000-0000-4000-8000-000000000383',
   round:'b0a00000-0000-4000-8000-000000000384',
   token:'x'.repeat(42)+'s',publicId:'SB-JKJKJKJKJKJP',
   alias:'Comensal rollback',visitKey:'b3_rollback_origin_0381_integral',
   balance:900
  };
  // Concurrent revocation uses distinct account holders and an otherwise
  // unoccupied destination D, never interfering with original A/B/C diners.
  const rotatedDiner={
   customer:'b0a00000-0000-4000-8000-000000000392',
   account:'b0a00000-0000-4000-8000-000000000393',
   order:'b0a00000-0000-4000-8000-000000000394',
   round:'b0a00000-0000-4000-8000-000000000395',
   token:'y'.repeat(42)+'s',publicId:'SB-MNMNMNMNMNMP',
   alias:'Comensal QR concurrente',visitKey:'b3_qr_race_origin_0392_integral',
   balance:1100
  };
  const revokedDiner={
   customer:'b0a00000-0000-4000-8000-000000000396',
   account:'b0a00000-0000-4000-8000-000000000397',
   order:'b0a00000-0000-4000-8000-000000000398',
   round:'b0a00000-0000-4000-8000-000000000399',
   token:'z'.repeat(42)+'s',publicId:'SB-NPNPNPNPNPNP',
   alias:'Comensal sesion concurrente',visitKey:'b3_revoke_race_origin_0396_integral',
   balance:1300
  };
  // Post-consumption race: two independent economic accounts so session
  // revocation and destination QR rotation cannot interfere with one another.
  const postConsumeSessionDiner={
   customer:'b0a00000-0000-4000-8000-000000000421',
   account:'b0a00000-0000-4000-8000-000000000422',
   order:'b0a00000-0000-4000-8000-000000000423',
   round:'b0a00000-0000-4000-8000-000000000424',
   token:'m'.repeat(42)+'s',publicId:'SB-UVUVUVUVUVUP',
   alias:'Comensal carrera commit sesion',visitKey:'b3_postconsume_session_0421',balance:1500
  };
  const postConsumeQrDiner={
   customer:'b0a00000-0000-4000-8000-000000000431',
   account:'b0a00000-0000-4000-8000-000000000432',
   order:'b0a00000-0000-4000-8000-000000000433',
   round:'b0a00000-0000-4000-8000-000000000434',
   token:'n'.repeat(42)+'s',publicId:'SB-VWVWVWVWVWVP',
   alias:'Comensal carrera commit QR',visitKey:'b3_postconsume_qr_0431',balance:1700
  };
  // F20/R05: exercise transfers with two distinct historical payment states
  // in the same full PG17/Fastify/Chromium confirmation journey.
  const payNowDiner={
   customer:'b0a00000-0000-4000-8000-000000000401',
   account:'b0a00000-0000-4000-8000-000000000402',
   order:'b0a00000-0000-4000-8000-000000000403',
   round:'b0a00000-0000-4000-8000-000000000404',
   token:'k'.repeat(42)+'s',publicId:'SB-PQPQPQPQPQPQ',
   alias:'Comensal Stripe pendiente',visitKey:'b3_h6_stripe_origin_0401_integral',
   balance:0,mode:'pay_now',historicAmount:1200
  };
  const cashHistoryDiner={
   customer:'b0a00000-0000-4000-8000-000000000411',
   account:'b0a00000-0000-4000-8000-000000000412',
   order:'b0a00000-0000-4000-8000-000000000413',
   round:'b0a00000-0000-4000-8000-000000000414',
   token:'l'.repeat(42)+'s',publicId:'SB-RTRTRTRTRTRT',
   alias:'Comensal con efectivo previo',visitKey:'b3_h6_cash_origin_0411_integral',
   balance:1200,mode:'pay_at_end',historicAmount:1200,cashSettled:0
  };
  // Fresh table: unlike the historical A/D fixtures, this customer has no
  // account, order, visit or first_confirmed_at before the browser checks out.
  const naturalGroupingDiner={
   customer:'b0a00000-0000-4000-8000-000000000451',
   token:'o'.repeat(42)+'s',publicId:'SB-XYXYXYXYXYXY',
   alias:'Comensal agrupación natural'
  };
  const customerCookieAuth=Object.freeze({
   requireSameOrigin:()=>true,
   authenticate:async(request,reply)=>{
    if(request.headers.cookie==='__Secure-sabora_customer='+'s'.repeat(43)){
     request.customerIdentity={publicId:'SB-BABABABABABP',alias:'PG17',company:null};
     return;
    }
    const peer=[...peers,rival,rollbackDiner,rotatedDiner,revokedDiner,
     postConsumeSessionDiner,postConsumeQrDiner,payNowDiner,cashHistoryDiner,
     naturalGroupingDiner].find(row=>
     request.headers.cookie==='__Secure-sabora_customer='+row.token);
    if(peer){
     request.customerIdentity={publicId:peer.publicId,alias:peer.alias,company:null};
     return;
    }
    return reply.code(401).send({error:'unauthorized'});
   },
   logout:async()=>{}
  });
  try{
   assert.deepEqual(await mountVerifiedTableChangeB3JwtHttpCandidate(http,{
    staffReaderPool:pools[9],expectedStaffReaderLogin:specs[9].login,
    issuer:ciIssuer,getTrustedKeys:async()=>[ciJwk],
    customerPool:scopedPools[0],operationsPool:scopedPools[1],
    confirmationPool:scopedPools[2],h6ReadPool:scopedPools[3],flowPool:scopedPools[4],
    pendingPool:scopedPools[5],expectedPendingLogin:specs[5].login,
    notificationPool:pools[1],
    observeStreamFailure:failure=>streamFailures.push(failure),
    expectedCustomerLogin:specs[0].login,
    expectedOperationsLogin:specs[1].login,
    expectedConfirmationLogin:specs[2].login,
    expectedH6ReadLogin:specs[3].login,
    expectedFlowLogin:specs[4].login,
    hashSession:hashCustomerSessionToken,
    secretKey:'sabora_b3_ephemeral_test_secret_key_32_bytes_minimum',
    cookieAuth:customerCookieAuth,
   }),{mounted:true});
   registerH6CustomerEventStreamHttp(http,{cookieAuth:customerCookieAuth,
    events:customerEvents,subscribeCommitted:customerEventNotifier.subscribe,
    heartbeatMs:5000});
   // Seventh sealed cash RPC and the staff decision/queue now share the
   // same verified RS256 JWT and live PostgreSQL membership checks. The
   // tenth login can read only user_id/role/state and never payment tables.
   registerH6OperationsHttp(http,{
    operations:Object.freeze({...cashOperations,
     acknowledgeDispatch:providerStaff.acknowledgeDispatch,
     managePickup:providerStaff.managePickup,
     setCatalogSoldOut:providerStaff.setCatalogSoldOut,
     closeAccount:closeOperations.closeAccount}),
    forRoles:ciStaffRoles
   });
   registerOrderOperationsHttp(http,{forRoles:ciStaffRoles,
    operations:h4KitchenOperations,legacyPickupDisabled:true});
   // Test-only public catalog projection; checkout still revalidates the
   // published SQL fixture through the production quote/confirmation RPCs.
   http.get('/api/v1/catalog',async()=>{
    const rows=(await admin.query(`SELECT id,published_snapshot,sold_out,withdrawn_at
     FROM sabora.catalog_items WHERE id=ANY($1::uuid[]) ORDER BY id`,[[
      'b0a00000-0000-4000-8000-000000000330',
      'b0a00000-0000-4000-8000-000000000331']])).rows;
    return rows.map(row=>({id:row.id,name:row.published_snapshot.name,
     category:row.published_snapshot.category,
     priceCents:row.published_snapshot.priceCents,
     available:!row.sold_out&&!row.withdrawn_at,allergens:row.published_snapshot.allergens}));
   });
   await http.ready();
   for(const endpoint of ['/api/v1/customer/visits',
    '/api/v1/customer/quotes','/api/v1/customer/orders/confirm',
    '/api/v1/customer/table-change/requests']){
    const response=await http.inject({method:'POST',url:endpoint,payload:{}});
    assert.equal(response.statusCode,401,endpoint);
   }
   const privateStream=await http.inject({method:'GET',
    url:'/api/v1/customer/table-change/events'});
   assert.equal(privateStream.statusCode,401,'no anonymous customer SSE');
   const denied=await http.inject({method:'POST',
    url:'/api/v1/operations/table-change/decisions',payload:{}});
   assert.equal(denied.statusCode,401);
   // Cryptographic JWT verification precedes all staff SQL and cannot be
   // bypassed by the removed header-only fixture.
   const badSignature=jwtWaiter.slice(0,-2)+
    (jwtWaiter.at(-2)==='A'?'B':'A')+jwtWaiter.at(-1);
   for(const headers of [
    {'x-ci-staff':'authorized-waiter'},
    {authorization:'Bearer '+jwtExpired},
    {authorization:'Bearer '+badSignature},
    {authorization:'Bearer invalid.bearer.payload'}
   ]){
    const probe=await http.inject({method:'GET',
     url:'/api/v1/operations/table-change/pending',headers});
    assert.equal(probe.statusCode,401,
     'an unverified JWT/header cannot access the restricted staff queue');
   }
   // A valid HTTP cookie must cross the real five-login SQL boundary.
   // This deliberately has no matching customer fixture: the database RPC,
   // not a mock or the HTTP authentication layer, must reject the scope.
   const forbidden=await http.inject({method:'POST',
    url:'/api/v1/customer/table-change/requests',
    headers:{cookie:'__Secure-sabora_customer='+ 's'.repeat(43),
     'content-type':'application/json'},payload:{}});
   assert.equal(forbidden.statusCode,403);
   assert.deepEqual(forbidden.json(),{error:'customer_context_forbidden'});
   // Positive request: commit a disposable business fixture so the
   // physically separate customer login can see it. The first HTTP call
   // must create exactly one pending grant; a replay must hit cooldown.
   const httpFixture=Object.freeze({
    customer:'b0a00000-0000-4000-8000-000000000301',
    sourceTable:'b0a00000-0000-4000-8000-000000000302',
    destinationTable:'b0a00000-0000-4000-8000-000000000303',
    blockedTable:'b0a00000-0000-4000-8000-000000000308',
    blockedSession:'b0a00000-0000-4000-8000-000000000309',
    concurrentTable:'b0a00000-0000-4000-8000-000000000390',
    concurrentSession:'b0a00000-0000-4000-8000-000000000391',
    naturalTable:'b0a00000-0000-4000-8000-000000000452',
    naturalSession:'b0a00000-0000-4000-8000-000000000453',
    sourceSession:'b0a00000-0000-4000-8000-000000000304',
    destinationSession:'b0a00000-0000-4000-8000-000000000305',
    sourceAccount:'b0a00000-0000-4000-8000-000000000306',
    waiter:'b0a00000-0000-4000-8000-000000000307',
    sourceVisit:'b3_http_source_visit_0301'
   });
   const fixture=await admin.connect();
   try{
    await fixture.query('BEGIN');
    await fixture.query(`INSERT INTO sabora.customer_profiles(id,public_id,alias)
     VALUES($1,'SB-BABABABABABP','B3 HTTP PG17')`,[httpFixture.customer]);
    await fixture.query(`INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour')`,
     [httpFixture.customer,Buffer.alloc(32,230)]);
    await fixture.query(`INSERT INTO sabora.dining_tables
     (id,number,capacity,qr_token_hash,session_id,ordering_state,readiness_state)
     VALUES($1,981301,4,$5,$6,'open','LISTA'),($2,981302,4,$5,$7,'open','LISTA'),
      ($3,981303,4,$5,$8,'open','LISTA'),($4,981304,4,$5,$9,'open','LISTA'),
      ($10,981305,4,$5,$11,'open','LISTA')`,
     [httpFixture.sourceTable,httpFixture.destinationTable,
      httpFixture.blockedTable,httpFixture.concurrentTable,qrHash,
      httpFixture.sourceSession,httpFixture.destinationSession,
      httpFixture.blockedSession,httpFixture.concurrentSession,
      httpFixture.naturalTable,httpFixture.naturalSession]);
    await fixture.query(`INSERT INTO sabora.customer_table_visits
     (table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
     VALUES($1,$2,$3::uuid,$4,($3::uuid)::text,1,clock_timestamp()+interval '1 hour')`,
     [httpFixture.sourceTable,httpFixture.sourceSession,httpFixture.customer,
      httpFixture.sourceVisit]);
    await fixture.query(`INSERT INTO sabora.customer_profiles(id,public_id,alias)
     VALUES($1,$2,$3)`,[naturalGroupingDiner.customer,
      naturalGroupingDiner.publicId,naturalGroupingDiner.alias]);
    await fixture.query(`INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour')`,
     [naturalGroupingDiner.customer,hashCustomerSessionToken(naturalGroupingDiner.token)]);
    await fixture.query(`INSERT INTO sabora.customer_accounts
     (id,table_id,session_id,visit_key,customer_id,payment_mode,
      payment_mode_selected_at,outstanding_cents)
     VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),2400)`,
     [httpFixture.sourceAccount,httpFixture.sourceTable,httpFixture.sourceSession,httpFixture.sourceVisit,httpFixture.customer]);
    await fixture.query(`INSERT INTO sabora.customer_account_operational_bindings
     (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
     [httpFixture.sourceAccount,httpFixture.sourceTable,httpFixture.sourceSession,httpFixture.sourceVisit]);
    // Both co-diners have committed account scopes before the moving customer asks.
    for(const peer of peers){
     const table=peer.seat==='A'?httpFixture.sourceTable:httpFixture.destinationTable;
     const session=peer.seat==='A'?httpFixture.sourceSession:httpFixture.destinationSession;
     await fixture.query(`INSERT INTO sabora.customer_profiles(id,public_id,alias)
      VALUES($1,$2,$3)`,[peer.customer,peer.publicId,peer.alias]);
     await fixture.query(`INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
      VALUES($1,$2,clock_timestamp()+interval '1 hour')`,
      [peer.customer,hashCustomerSessionToken(peer.token)]);
     await fixture.query(`INSERT INTO sabora.customer_table_visits
      (table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
      VALUES($1,$2,$3::uuid,$4,($3::uuid)::text,1,clock_timestamp()+interval '1 hour')`,
      [table,session,peer.customer,peer.visitKey]);
     await fixture.query(`INSERT INTO sabora.customer_accounts
      (id,table_id,session_id,visit_key,customer_id,payment_mode,
       payment_mode_selected_at,outstanding_cents)
      VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),$6)`,
      [peer.account,table,session,peer.visitKey,peer.customer,peer.balance]);
     await fixture.query(`INSERT INTO sabora.customer_account_operational_bindings
      (account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
      [peer.account,table,session,peer.visitKey]);
    }
    await fixture.query(`INSERT INTO sabora.restaurant_settings(singleton,name)
     VALUES(true,'Sabora PG17 isolated test') ON CONFLICT(singleton) DO NOTHING`);
    await fixture.query(`INSERT INTO sabora.staff_members(user_id,role,state)
     VALUES($1,'waiter','active'),($2,'kitchen','active'),($3,'waiter','active')`,
     [httpFixture.waiter,'b0a00000-0000-4000-8000-000000000310',
      secondWaiterId]);
    // H6 pickup claims require the employee's real compact operational
    // identity, not merely an active JWT/role. Mirror the existing H4
    // enrollment fixture inside this disposable PG17 transaction; do not
    // bypass bind_pickup_claimed_display_id_candidate or relax its check.
    const kitchenActor='b0a00000-0000-4000-8000-000000000310';
    const staffActors=[httpFixture.waiter,kitchenActor,secondWaiterId];
    await fixture.query(`INSERT INTO sabora.staff_enrollments(
     id,invitee_email_hash,requested_role,state,auth_user_id,invite_token_hash,
     credential_evidence_hash,created_by,created_at,last_invited_at,accepted_at,
     credential_registered_at,activated_at,updated_at,given_name,family_name,
     employee_code,operational_display_id)
     SELECT gen_random_uuid(),sha256(convert_to(source.email,'UTF8')),
      source.role,'active',source.user_id,
      sha256(convert_to(source.token,'UTF8')),
      sha256(convert_to(source.credential,'UTF8')),
      $1,clock_timestamp(),clock_timestamp(),clock_timestamp(),
      clock_timestamp(),clock_timestamp(),clock_timestamp(),
      source.given_name,source.family_name,source.code,source.display_id
     FROM (VALUES
      ($1::uuid,'waiter','b3-waiter-a@example.invalid',
       'b3-waiter-a-token','b3-waiter-a-passkey','Mario','Sala','839','MS-839'),
      ($2::uuid,'kitchen','b3-kitchen@example.invalid',
       'b3-kitchen-token','b3-kitchen-passkey','Karla','Cocina','840','KC-840'),
      ($3::uuid,'waiter','b3-waiter-b@example.invalid',
       'b3-waiter-b-token','b3-waiter-b-passkey','Lucia','Sala','841','LS-841')
     ) source(user_id,role,email,token,credential,given_name,family_name,code,display_id)`,
     staffActors);
    const assignedCodes=await fixture.query(`UPDATE sabora.staff_employee_code_pool pool
     SET enrollment_id=enrollment.id,reserved_at=clock_timestamp()
     FROM sabora.staff_enrollments enrollment
     WHERE pool.code=enrollment.employee_code
       AND enrollment.auth_user_id=ANY($1::uuid[])
       AND pool.enrollment_id IS NULL`,[staffActors]);
    assert.equal(assignedCodes.rowCount,3,
     'all three isolated staff actors need reserved compact display IDs');
    await fixture.query(`INSERT INTO sabora.order_operation_signing_keys
     (key_id,hmac_key,not_before,expires_at)
     VALUES($1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')`,
     [cashSigningKeyId,cashSigningSecret]);
    // Historical A order has a completed pickup and a still-pending line.
    // The integrated B checkout must redirect only the pending destination.
    const priorOrder='b0a00000-0000-4000-8000-000000000340';
    const priorRound='b0a00000-0000-4000-8000-000000000341';
    const qrToken='Q'.repeat(42)+'A';
    const itemId='b0a00000-0000-4000-8000-000000000330';
    const replacementItemId='b0a00000-0000-4000-8000-000000000331';
    const snapshot={name:'Plato de integración',category:'Primeros',
     priceCents:700,allergens:[],options:[],extras:[],discount:null};
    const replacementSnapshot={name:'Alternativa de temporada',category:'Primeros',
     priceCents:600,allergens:[],options:[],extras:[],discount:null};
    await fixture.query('UPDATE sabora.dining_tables SET qr_token_hash=$1 WHERE id=ANY($2::uuid[])',
     [createHash('sha256').update(qrToken).digest(),
      [httpFixture.sourceTable,httpFixture.destinationTable,
       httpFixture.blockedTable,httpFixture.concurrentTable,
       httpFixture.naturalTable]]);
    await fixture.query(`INSERT INTO sabora.catalog_items
     (id,draft,draft_revision,published_revision,published_snapshot,published_at)
     VALUES($1,$2,1,1,$2,clock_timestamp()),
           ($3,$4,1,1,$4,clock_timestamp())`,
     [itemId,snapshot,replacementItemId,replacementSnapshot]);
    await fixture.query(`INSERT INTO sabora.orders
     (id,table_id,session_id,company,employee_number,customer_alias,customer_identifier,
      customer_visit_key,economic_snapshot,confirmed_at,grouping,items)
     VALUES($1,$2,$3,NULL,NULL,'Histórico A',$4,$5,'{"schemaVersion":"1"}'::jsonb,
      clock_timestamp(),'first','[{"category":"main","name":"Recogido","quantity":1},{"category":"main","name":"Pendiente","quantity":1}]'::jsonb)`,
     [priorOrder,httpFixture.sourceTable,httpFixture.sourceSession,'SB-BABABABABABP',httpFixture.sourceVisit]);
    await fixture.query(`INSERT INTO sabora.order_rounds
     (id,order_id,account_id,amount_cents,payment_mode,payment_policy_version,
      grouping_deadline,state)
     VALUES($1,$2,$3,1200,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')`,
     [priorRound,priorOrder,httpFixture.sourceAccount]);
    await fixture.query("UPDATE sabora.order_lines SET status='picked_up' WHERE order_id=$1 AND line_number=1",
     [priorOrder]);
    await fixture.query(`INSERT INTO sabora.order_round_delivery_destinations
     (round_id,account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4,$5)`,
     [priorRound,httpFixture.sourceAccount,httpFixture.sourceTable,
      httpFixture.sourceSession,httpFixture.sourceVisit]);
    const priorLines=(await fixture.query('SELECT id FROM sabora.order_lines WHERE order_id=$1 ORDER BY line_number',
     [priorOrder])).rows;
    assert.equal(priorLines.length,2);
    for(const line of priorLines)await fixture.query(`INSERT INTO sabora.order_line_delivery_destinations
     (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
     [line.id,priorRound,httpFixture.sourceAccount,priorOrder,httpFixture.sourceTable,
      httpFixture.sourceSession,httpFixture.sourceVisit]);
    // Each co-diner has historical consumption and a pending delivery.
    for(const peer of peers){
     const table=peer.seat==='A'?httpFixture.sourceTable:httpFixture.destinationTable;
     const session=peer.seat==='A'?httpFixture.sourceSession:httpFixture.destinationSession;
     await fixture.query(`INSERT INTO sabora.orders
      (id,table_id,session_id,company,employee_number,customer_alias,
       customer_identifier,customer_visit_key,economic_snapshot,confirmed_at,grouping,items)
      VALUES($1,$2,$3,NULL,NULL,$4,$5,$6,'{"schemaVersion":"1"}'::jsonb,
       clock_timestamp(),'first','[{"category":"main","name":"Consumo previo","quantity":1}]'::jsonb)`,
      [peer.order,table,session,peer.alias,peer.publicId,peer.visitKey]);
     await fixture.query(`INSERT INTO sabora.order_rounds
      (id,order_id,account_id,amount_cents,payment_mode,payment_policy_version,
       grouping_deadline,state)
      VALUES($1,$2,$3,$4,'pay_at_end',1,clock_timestamp()+interval '5 minutes','grouping')`,
      [peer.round,peer.order,peer.account,peer.balance]);
     await fixture.query(`INSERT INTO sabora.order_round_delivery_destinations
      (round_id,account_id,table_id,session_id,visit_key)
      VALUES($1,$2,$3,$4,$5)`,[peer.round,peer.account,table,session,peer.visitKey]);
     const lineIds=(await fixture.query(
      'SELECT id FROM sabora.order_lines WHERE order_id=$1',[peer.order])).rows;
     assert.equal(lineIds.length,1);
     await fixture.query(`INSERT INTO sabora.order_line_delivery_destinations
      (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [lineIds[0].id,peer.round,peer.account,peer.order,table,session,peer.visitKey]);
    }
    await fixture.query('COMMIT');
    const positiveToken='s'.repeat(43);
    // The SQL session hash must match the cookie passed to the HTTP adapter.
    await admin.query(`UPDATE sabora.customer_sessions SET token_hash=$1
     WHERE customer_id=$2`,[hashCustomerSessionToken(positiveToken),httpFixture.customer]);
    const requestHeaders={cookie:'__Secure-sabora_customer='+positiveToken,
     'content-type':'application/json'};
    // Diagnostic is inside the same integrated HTTP/PG17/browser scenario:
    // report the exact sealed PostgreSQL error without leaking it to HTTP.
    let scopedStateError=null;
    try{
     await connections[0].query('BEGIN');
     await connections[0].query('SET LOCAL ROLE sabora_f12_customer_runtime');
     const stateSql=await connections[0].query(
      'SELECT bound_table_id,change_state,change_expires_at,server_time FROM sabora.read_customer_table_change_h6_candidate($1::bytea)',
      [hashCustomerSessionToken(positiveToken)]);
     assert.equal(stateSql.rows.length,1);
     assert.equal(stateSql.rows[0].bound_table_id,httpFixture.sourceTable);
     assert.equal(stateSql.rows[0].change_state,'bound');
    }catch(error){scopedStateError=error;}
    finally{await connections[0].query('ROLLBACK');}
    assert.equal(scopedStateError,null,
     'real isolated role state query failed: '+(scopedStateError?.message??'')+
     ' / SQLSTATE '+(scopedStateError?.code??''));
    const stateProbe=await http.inject({method:'GET',
     url:'/api/v1/customer/table-change/state',headers:requestHeaders});
    assert.equal(stateProbe.statusCode,200,
     'sealed customer state must be readable before opening B QR: '+stateProbe.body);
    assert.equal(stateProbe.json().state,'bound');
    assert.equal(stateProbe.json().boundTableId,httpFixture.sourceTable);
    // Integrated customer PWA -> Fastify -> six physical PG17 roles:
    // cancel the warning once (must not write any request), then submit
    // the destination-free request from the actual browser and leave A intact.
    const {pathToFileURL:requestPathToFileURL,fileURLToPath:requestFileURLToPath}
     =await import('node:url');
    const {chromium:requestChromium}=await import(
     requestPathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
    const requestRequire=createRequire(new URL('../../apps/client/package.json',import.meta.url));
    const {createServer:createRequestViteServer}=await import(
     requestPathToFileURL(requestRequire.resolve('vite')).href);
    let requestVite,requestBrowser,requestContext;
    try{
     if(!http.server.listening)await http.listen({host:'127.0.0.1',port:0});
     const apiAddress=http.server.address();
     assert.ok(apiAddress&&typeof apiAddress==='object'&&apiAddress.port>0);
     requestVite=await createRequestViteServer({
      root:requestFileURLToPath(new URL('../../apps/client/',import.meta.url)),
      mode:'test',logLevel:'error',
      server:{host:'127.0.0.1',port:0,strictPort:false,
       proxy:{'/api':{target:'http://127.0.0.1:'+apiAddress.port,changeOrigin:false}}}
     });
     await requestVite.listen();
     const uiAddress=requestVite.httpServer?.address();
     assert.ok(uiAddress&&typeof uiAddress==='object'&&uiAddress.port>0);
     requestBrowser=await requestChromium.launch({headless:true});
     requestContext=await requestBrowser.newContext({
      viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'
     });
     await requestContext.addCookies([{name:'__Secure-sabora_customer',
      value:positiveToken,domain:'127.0.0.1',path:'/',secure:true,
      httpOnly:true,sameSite:'Lax'}]);
     const requestPage=await requestContext.newPage();
     const customerRequests=[];
     requestPage.on('request',r=>{
      if(new URL(r.url()).pathname.startsWith('/api/v1/customer/table-change/'))
       customerRequests.push({method:r.method(),
        path:new URL(r.url()).pathname,
        body:r.method()==='POST'?r.postDataJSON():null});
     });
     const deepLink='http://127.0.0.1:'+uiAddress.port+'/qr/v1/SABORA/'+
      httpFixture.destinationTable+'#'+qrToken;
     await requestPage.goto(deepLink);
     try{
      await requestPage.getByRole('button',{name:'Solicitar cambio de mesa'})
       .waitFor({timeout:15000});
     }catch(error){
      const body=(await requestPage.locator('body').innerText()).slice(-1800);
      throw Error('pg17_customer_change_prompt_not_visible:'+
       JSON.stringify({body,requests:customerRequests})+': '+error.message);
     }
     assert.equal((await admin.query(
      'SELECT count(*)::int AS n FROM sabora.customer_table_change_requests WHERE account_id=$1',
      [httpFixture.sourceAccount])).rows[0].n,0,
      'QR scan alone must not create a request or move the account');
     await requestPage.getByRole('button',{name:'Cancelar',exact:true}).click();
     assert.equal((await admin.query(
      'SELECT count(*)::int AS n FROM sabora.customer_table_change_requests WHERE account_id=$1',
      [httpFixture.sourceAccount])).rows[0].n,0,
      'cancel the UI prompt without any business mutation');
     await requestPage.goto(deepLink);
     await requestPage.getByRole('button',{name:'Solicitar cambio de mesa'})
      .waitFor({timeout:25000});
     await requestPage.getByRole('button',{name:'Solicitar cambio de mesa'}).click();
     await requestPage.getByText('Solicitud enviada al personal').waitFor();
     assert.ok(customerRequests.some(r=>r.method==='GET'&&r.path.endsWith('/state')),
      'customer reads the real sealed PG17 binding state');
     assert.deepEqual(customerRequests.filter(r=>r.path.endsWith('/requests')),
      [{method:'POST',path:'/api/v1/customer/table-change/requests',body:{}}],
      'the customer must never send the destination in the request');
     const {mkdir}=await import('node:fs/promises');
     const {join}=await import('node:path');
     const evidenceDir=join(process.env.RUNNER_TEMP,'sabora-h6-acceptance');
     await mkdir(evidenceDir,{recursive:true});
     await requestPage.screenshot({path:join(evidenceDir,'b3-customer-pg17-request-mobile.png'),
      fullPage:true});
     await requestPage.setViewportSize({width:1440,height:900});
     await requestPage.screenshot({path:join(evidenceDir,'b3-customer-pg17-request-desktop.png'),
      fullPage:true});
    }finally{
     if(requestContext)await requestContext.close();
     if(requestBrowser)await requestBrowser.close();
     if(requestVite)await requestVite.close();
    }
    const requestRecord=(await admin.query(
     'SELECT id,status FROM sabora.customer_table_change_requests WHERE account_id=$1',
     [httpFixture.sourceAccount])).rows;
    assert.equal(requestRecord.length,1);
    assert.equal(requestRecord[0].status,'pending');
    const created={json:()=>({id:requestRecord[0].id})};
    const saved=(await admin.query(`SELECT q.status,q.account_id,
     b.table_id AS bound_table,b.binding_version
     FROM sabora.customer_table_change_requests q
     JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
     WHERE q.id=$1`,[created.json().id])).rows[0];
    assert.equal(saved.status,'pending');
    assert.equal(saved.account_id,httpFixture.sourceAccount);
    assert.equal(saved.bound_table,httpFixture.sourceTable,
     'request must not transfer the account');
    // A forged waiter assertion must not be enough to approve the grant.
    // Exercise the actual operations SQL login/RPC with a UUID that belongs
    // to a customer rather than an authorized staff member.
    const forgedDecision=await http.inject({method:'POST',
     url:'/api/v1/operations/table-change/decisions',
     headers:{authorization:'Bearer '+jwtCustomer,'content-type':'application/json'},
     payload:{requestId:created.json().id,decision:'approved'}});
    assert.equal(forgedDecision.statusCode,403,forgedDecision.body);
    const afterForgery=(await admin.query(`SELECT q.status,
     q.decided_at,b.table_id,b.binding_version,a.outstanding_cents
     FROM sabora.customer_table_change_requests q
     JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
     JOIN sabora.customer_accounts a ON a.id=q.account_id
     WHERE q.id=$1`,[created.json().id])).rows[0];
    assert.equal(afterForgery.status,'pending');
    assert.equal(afterForgery.decided_at,null);
    assert.equal(afterForgery.table_id,httpFixture.sourceTable);
    assert.equal(afterForgery.outstanding_cents,'2400');
    // Real management PWA bearer transport -> Fastify -> two separately
    // authenticated PostgreSQL roles for reading and deciding.
    const managementGateway=createAuthenticatedOrderOperationsGateway({
     getAccessToken:async()=>jwtWaiter,
     fetchImpl:async(path,options)=>{
      const response=await http.inject({method:options.method,url:path,
       headers:Object.fromEntries(options.headers.entries()),payload:options.body});
      return new Response(response.body,{status:response.statusCode,
       headers:{'content-type':response.headers['content-type']??'application/json'}});
     }
    });
    try{
     const pending=await managementGateway.listPendingTableChanges();
     assert.equal(pending.length,1);
     assert.equal(pending[0].requestId,created.json().id);
     assert.equal(pending[0].sourceTableNumber,981301);
     const kitchen=await http.inject({method:'GET',
      url:'/api/v1/operations/table-change/pending',
      headers:{authorization:'Bearer '+jwtKitchen}});
     assert.equal(kitchen.statusCode,403);
     // Same disposable PostgreSQL 17 database and Fastify instance now
     // drive the real management PWA in Chromium. The browser approves the
     // request; an injected SQL mock cannot substitute for this boundary.
     const {pathToFileURL,fileURLToPath}=await import('node:url');
     const {chromium}=await import(pathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
     const manageRequire=createRequire(new URL('../../apps/management/package.json',import.meta.url));
     const {createServer}=await import(pathToFileURL(manageRequire.resolve('vite')).href);
     let vite,browser,context;
     const browserErrors=[],browserRequests=[];
     try{
      if(!http.server.listening)await http.listen({host:'127.0.0.1',port:0});
      const apiAddress=http.server.address();
      assert.ok(apiAddress&&typeof apiAddress==='object'&&apiAddress.port>0);
      vite=await createServer({
       root:fileURLToPath(new URL('../../apps/management/',import.meta.url)),
       logLevel:'error',
       server:{host:'127.0.0.1',port:0,strictPort:false,
        proxy:{'/api':{target:'http://127.0.0.1:'+apiAddress.port,
         changeOrigin:false}}}
      });
      await vite.listen();
      const uiAddress=vite.httpServer?.address();
      assert.ok(uiAddress&&typeof uiAddress==='object'&&uiAddress.port>0);
      const managementOrigin='http://127.0.0.1:'+uiAddress.port;
      const probe=await fetch(managementOrigin+'/api/v1/operations/table-change/pending',{
       headers:{authorization:'Bearer '+jwtWaiter}
      });
      const probeBody=await probe.text();
      assert.equal(probe.status,200,
       'Vite proxy and live Fastify/PG17 queue must agree: '+probeBody);
      assert.equal(JSON.parse(probeBody).items.length,1,
       'live proxy must return the just-created pending request');
      browser=await chromium.launch({headless:true});
      context=await browser.newContext({viewport:{width:390,height:844},
       reducedMotion:'reduce'});
      const page=await context.newPage();
      const browserResponses=[];
      page.on('pageerror',error=>browserErrors.push(error.message));
      page.on('response',response=>{
       if(new URL(response.url()).pathname.startsWith('/api/v1/operations/table-change/'))
        browserResponses.push({status:response.status(),url:response.url()});
      });
      page.on('requestfailed',request=>
       browserErrors.push('requestfailed:'+request.url()+':'+request.failure()?.errorText));
      page.on('request',request=>{
       if(new URL(request.url()).pathname.startsWith('/api/v1/operations/table-change/'))
        browserRequests.push({method:request.method(),
         authorization:request.headers().authorization});
      });
      await page.goto('http://127.0.0.1:'+uiAddress.port+'/#mesas');
      await page.evaluate(async jwt=>{
       const {mountAuthenticatedManagementApp}=await import('/src/main.tsx');
       window.__saboraCiDispose=mountAuthenticatedManagementApp({
        element:document.getElementById('root'),
        getAccessToken:async()=>jwt,enableTableChangeQueue:true
       });
      },jwtWaiter);
      await page.getByRole('heading',{name:'Solicitudes de cambio de mesa'}).waitFor();
      try{
       await page.getByText('Mesa 981301').first().waitFor({timeout:12000});
      }catch(error){
       const visible=(await page.locator('body').innerText()).slice(-1800);
       throw Error('pg17_pending_not_visible_in_browser: '+
        JSON.stringify({visible,browserRequests,browserResponses,browserErrors})+
        ': '+error.message);
      }
      assert.equal(await page.getByRole('button',{name:'Aprobar cambio'}).isEnabled(),true);
      // This is real pending SQL data, not a route mock. Save the approved
      // interface at both breakpoints in the existing H6 CI artifact.
      const {mkdir}=await import('node:fs/promises');
      const {join}=await import('node:path');
      assert.ok(process.env.RUNNER_TEMP,'disposable_actions_artifact_dir_required');
      const evidenceDir=join(process.env.RUNNER_TEMP,'sabora-h6-acceptance');
      await mkdir(evidenceDir,{recursive:true});
      await page.screenshot({path:join(evidenceDir,'b3-pending-pg17-mobile.png'),
       fullPage:true});
      await page.setViewportSize({width:1440,height:900});
      await page.screenshot({path:join(evidenceDir,'b3-pending-pg17-desktop.png'),
       fullPage:true});
      // The SAME PG17/Fastify/management scenario now keeps a second real
      // Chromium customer PWA online: staff decisions must arrive over SSE,
      // not through a manually triggered GET or UI mock.
      let liveClientVite,liveClientBrowser,liveClientContext;
      const peerContexts=[],peerScreens=[];
      const liveClientErrors=[];
      try{
       const clientRequire=createRequire(new URL('../../apps/client/package.json',import.meta.url));
       const {createServer:createClientVite}=await import(
        pathToFileURL(clientRequire.resolve('vite')).href);
       liveClientVite=await createClientVite({
        root:fileURLToPath(new URL('../../apps/client/',import.meta.url)),
        mode:'test',logLevel:'error',
        server:{host:'127.0.0.1',port:0,strictPort:false,
         proxy:{'/api':{target:'http://127.0.0.1:'+apiAddress.port,changeOrigin:false}}}
       });
       await liveClientVite.listen();
       const liveAddress=liveClientVite.httpServer?.address();
       assert.ok(liveAddress&&typeof liveAddress==='object'&&liveAddress.port>0);
       liveClientBrowser=await chromium.launch({headless:true});
       liveClientContext=await liveClientBrowser.newContext({
        viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'
       });
       await liveClientContext.addCookies([{name:'__Secure-sabora_customer',
        value:positiveToken,domain:'127.0.0.1',path:'/',secure:true,
        httpOnly:true,sameSite:'Lax'}]);
       const livePage=await liveClientContext.newPage();
       await livePage.addInitScript(()=>{
        const Native=window.EventSource;
        window.__b3StreamFrames=[];
        window.EventSource=class extends Native{
         constructor(url,options){
          super(url,options);
          for(const name of ['sabora.table_change.state','sabora.table_change.approved',
           'sabora.table_change.rejected','resync-required','access-revoked']){
           this.addEventListener(name,event=>window.__b3StreamFrames.push({
            name,data:event.data,lastEventId:event.lastEventId
           }));
          }
         }
        };
       });
       livePage.on('pageerror',error=>liveClientErrors.push(error.message));
       const manualStateReads=[];
       livePage.on('request',request=>{
        if(new URL(request.url()).pathname==='/api/v1/customer/table-change/state')
         manualStateReads.push(request.url());
       });
       const streamReady=livePage.waitForResponse(response=>
        new URL(response.url()).pathname==='/api/v1/customer/table-change/events'&&
        response.status()===200,{timeout:20000});
       await livePage.goto('http://127.0.0.1:'+liveAddress.port+
        '/qr/v1/SABORA/'+httpFixture.destinationTable+'#'+qrToken);
       await streamReady;
       await livePage.getByText('Solicitud enviada al personal').waitFor({timeout:20000});
       // Two independently authenticated PWA browsers watch the decision,
       // without sharing session, economic identity or SSE event cursors.
       for(const peer of peers){
        const context=await liveClientBrowser.newContext({
         viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'
        });
        peerContexts.push(context);
        await context.addCookies([{name:'__Secure-sabora_customer',
         value:peer.token,domain:'127.0.0.1',path:'/',secure:true,
         httpOnly:true,sameSite:'Lax'}]);
        const otherPage=await context.newPage();
        await otherPage.addInitScript(()=>{
         const Native=window.EventSource;
         window.__b3PeerFrames=[];
         window.EventSource=class extends Native{
          constructor(url,options){
           super(url,options);
           for(const name of ['sabora.table_change.state',
            'sabora.table_change.approved','sabora.table_change.rejected',
            'access-revoked']){
            this.addEventListener(name,event=>window.__b3PeerFrames.push({
             name,data:event.data
            }));
           }
          }
         };
        });
        otherPage.on('pageerror',error=>
         liveClientErrors.push('peer-'+peer.seat+':'+error.message));
        const peerStream=otherPage.waitForResponse(response=>
         new URL(response.url()).pathname==='/api/v1/customer/table-change/events'&&
         response.status()===200,{timeout:20000});
        await otherPage.goto('http://127.0.0.1:'+liveAddress.port+'/');
        await peerStream;
        await otherPage.waitForFunction(()=>Array.isArray(window.__b3PeerFrames)&&
         window.__b3PeerFrames.some(row=>
          row.name==='sabora.table_change.state'&&
          JSON.parse(row.data).state==='bound'),null,{timeout:20000});
        peerScreens.push({peer,page:otherPage});
       }
       const readsBeforeDecision=manualStateReads.length;
       const decisionResponsePromise=page.waitForResponse(response=>
        new URL(response.url()).pathname==='/api/v1/operations/table-change/decisions',
        {timeout:20000});
       await page.getByRole('button',{name:'Aprobar cambio'}).click();
       const decisionResponse=await decisionResponsePromise;
       assert.equal(decisionResponse.status(),200,
        'PG17 decision and transactional outbox must both commit: '+
        await decisionResponse.text());
       let durableRead,readFailure;
       try{
        durableRead=await candidate.tableChange.readDecisions({
         customerSessionToken:positiveToken,afterCursor:0,limit:100
        });
       }catch(error){readFailure=error;}
       if(readFailure){
        const raw=(await admin.query(
         'SELECT sabora.read_customer_table_change_outbox_h6_candidate($1::bytea,0,100) AS backlog',
         [hashCustomerSessionToken(positiveToken)])).rows[0].backlog;
        throw Error('b3_outbox_reader_failed:'+
         JSON.stringify({message:readFailure.message,code:readFailure.code,
          sql:readFailure.cause?.message,raw}));
       }
       assert.equal(durableRead.events.length,1,
        'approved grant must emit exactly one authorized durable outbox event');
       assert.equal(durableRead.events[0].type,'sabora.table_change.approved');
       for(const {peer,page:otherPage} of peerScreens){
        const own=await candidate.tableChange.readDecisions({
         customerSessionToken:peer.token,afterCursor:0,limit:100});
        assert.deepEqual(own.events,[],
         'a customer at '+peer.seat+' must not read another account decision');
        const peerFrames=await otherPage.evaluate(()=>window.__b3PeerFrames);
        assert.ok(peerFrames.every(row=>
         !['sabora.table_change.approved','sabora.table_change.rejected'].includes(row.name)),
         'live peer PWA must not receive a cross-account H6 decision');
        const peerState=await http.inject({method:'GET',
         url:'/api/v1/customer/table-change/state',
         headers:{cookie:'__Secure-sabora_customer='+peer.token}});
        assert.equal(peerState.statusCode,200);
        assert.equal(peerState.json().state,'bound');
       }
       const normativeApproval='Cambio de mesa aprobado. Ya puedes escanear el código QR de tu nueva mesa y continuar realizando pedidos';
       try{
        await livePage.getByText(normativeApproval).first().waitFor({timeout:20000});
       }catch(error){
        const body=(await livePage.locator('body').innerText()).slice(-1400);
        const frames=await livePage.evaluate(()=>window.__b3StreamFrames);
        const rows=(await admin.query(`SELECT event_type,aggregate_id FROM
         sabora.event_outbox WHERE customer_id=$1 AND account_id=$2
         AND event_type LIKE 'sabora.table_change.%' ORDER BY id`,
         [httpFixture.customer,httpFixture.sourceAccount])).rows;
        let state,stateError;
        try{state=await candidate.tableChange.readState({
         customerSessionToken:positiveToken});}
        catch(failure){stateError=failure.message;}
        throw Error('b3_durable_decision_not_delivered: '+
         JSON.stringify({body,rows,frames,state,stateError,streamFailures})+': '+error.message);
       }
       assert.equal(manualStateReads.length,readsBeforeDecision,
        'staff decision must notify the customer without manual state refresh');
       await livePage.screenshot({path:join(evidenceDir,
        'b3-customer-pg17-auto-approved-mobile.png'),fullPage:true});
       // A device that already acknowledged approval must resume from its
       // committed outbox cursor, restore the *authorized state* and never
       // emit the same user alert a second time.
       const approvedCursor=await livePage.evaluate(()=>{
        const key=Object.keys(localStorage).find(name=>
         name.startsWith('sabora.table-change.cursor.'));
        return Number(key?localStorage.getItem(key):0);
       });
       assert.ok(Number.isSafeInteger(approvedCursor)&&approvedCursor>0,
        'approved notification must persist an H6 event cursor');
       const streamReconnected=livePage.waitForResponse(response=>
        new URL(response.url()).pathname==='/api/v1/customer/table-change/events'&&
        response.status()===200,{timeout:20000});
       await livePage.reload();
       await streamReconnected;
       await livePage.waitForFunction(()=>
        Array.isArray(window.__b3StreamFrames)&&
        window.__b3StreamFrames.some(row=>
         row.name==='sabora.table_change.state'&&
         JSON.parse(row.data).state==='approved'),null,{timeout:20000});
       assert.equal(await livePage.locator('.table-change-live-notice').count(),0,
        'reconnected device must not duplicate an already-read approval');
       const recovered=await livePage.evaluate(()=>({
        frames:window.__b3StreamFrames,
        cursors:Object.entries(localStorage).filter(([key])=>
         key.startsWith('sabora.table-change.cursor.'))
       }));
       assert.equal(recovered.cursors.length,1);
       assert.equal(Number(recovered.cursors[0][1]),approvedCursor);
       assert.ok(recovered.frames.every(row=>row.name!=='sabora.table_change.approved'),
        'cursor replay must not deliver already-acknowledged events');
       await livePage.screenshot({path:join(evidenceDir,
        'b3-customer-pg17-approved-state-reconnected-mobile.png'),fullPage:true});
       assert.deepEqual(liveClientErrors,[]);
      }finally{
       for(const context of peerContexts)await context.close();
       if(liveClientContext)await liveClientContext.close();
       if(liveClientBrowser)await liveClientBrowser.close();
       if(liveClientVite)await liveClientVite.close();
      }
      await page.getByText('Sin solicitudes pendientes').first().waitFor();
      assert.ok(browserRequests.some(row=>row.method==='GET'));
      assert.ok(browserRequests.some(row=>row.method==='POST'));
      assert.ok(browserRequests.every(row=>
       row.authorization==='Bearer '+jwtWaiter));
      const approvedInSql=(await admin.query(
       'SELECT status FROM sabora.customer_table_change_requests WHERE id=$1',
       [created.json().id])).rows[0];
      assert.equal(approvedInSql.status,'approved');
      await page.evaluate(()=>window.__saboraCiDispose());
      assert.equal(await page.getByRole('button',{name:'Aprobar cambio'}).count(),0);
      assert.deepEqual(browserErrors,[]);
     }finally{
      if(context)await context.close();
      if(browser)await browser.close();
      if(vite)await vite.close();
     }
     assert.deepEqual(await managementGateway.listPendingTableChanges(),[]);
    }finally{managementGateway.revoke();}
    const replay=await http.inject({method:'POST',
     url:'/api/v1/customer/table-change/requests',headers:requestHeaders,payload:{}});
    assert.equal(replay.statusCode,409,replay.body);
    assert.deepEqual(replay.json(),{error:'table_change_request_locked'});
    // Two independent physical SQL connections race the same HTTP request.
    // The database must serialize the business transition, not the test pool.
    const concurrent=await Promise.all(Array.from({length:2},()=>http.inject({
     method:'POST',url:'/api/v1/customer/table-change/requests',
     headers:requestHeaders,payload:{}
    })));
    for(const response of concurrent){
     assert.equal(response.statusCode,409,response.body);
     assert.deepEqual(response.json(),{error:'table_change_request_locked'});
    }
    const afterRace=(await admin.query(`SELECT q.status,
     b.table_id,a.outstanding_cents
     FROM sabora.customer_table_change_requests q
     JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
     JOIN sabora.customer_accounts a ON a.id=q.account_id
     WHERE q.id=$1`,[created.json().id])).rows[0];
    assert.equal(afterRace.status,'approved');
    assert.equal(afterRace.table_id,httpFixture.sourceTable);
    assert.equal(afterRace.outstanding_cents,'2400');
    const count=(await admin.query(`SELECT count(*)::int AS total
     FROM sabora.customer_table_change_requests WHERE account_id=$1`,
     [httpFixture.sourceAccount])).rows[0].total;
    assert.equal(count,1,'cooldown must not create a second grant');

    // Real client PWA transport -> Fastify -> five SQL capabilities,
    // finishing the deferred B transfer with an actual confirmed order.
    const before=(await admin.query(`SELECT b.table_id,
     a.outstanding_cents, q.status AS grant
     FROM sabora.customer_accounts a
     JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
     JOIN sabora.customer_table_change_requests q ON q.account_id=a.id
     WHERE a.id=$1`,[httpFixture.sourceAccount])).rows[0];
    assert.equal(before.table_id,httpFixture.sourceTable);
    assert.equal(before.outstanding_cents,'2400');
    assert.equal(before.grant,'approved');
    // The real client PWA now joins the SAME disposable PostgreSQL 17,
    // Fastify and management-browser journey. Only the public catalog
    // presentation is an explicitly isolated HTTP fixture: the order,
    // quote, session, QR and account transfer use the live SQL functions.
    const {pathToFileURL,fileURLToPath}=await import('node:url');
    const {chromium}=await import(pathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
    const clientRequire=createRequire(new URL('../../apps/client/package.json',import.meta.url));
    const {createServer}=await import(pathToFileURL(clientRequire.resolve('vite')).href);
    let clientVite,clientBrowser,clientContext;
    let confirmedOrderBody=null;
    const customerBrowserErrors=[];
    try{
     assert.equal(http.server.listening,true,'management and client must use one live API');
     const address=http.server.address();
     assert.ok(address&&typeof address==='object'&&address.port>0);
     clientVite=await createServer({
      root:fileURLToPath(new URL('../../apps/client/',import.meta.url)),
      mode:'test',logLevel:'error',
      server:{host:'127.0.0.1',port:0,strictPort:false,
       proxy:{'/api':{target:'http://127.0.0.1:'+address.port,changeOrigin:false}}}
     });
     await clientVite.listen();
     const uiAddress=clientVite.httpServer?.address();
     assert.ok(uiAddress&&typeof uiAddress==='object'&&uiAddress.port>0);
     const origin='http://127.0.0.1:'+uiAddress.port;
     clientBrowser=await chromium.launch({headless:true});
     clientContext=await clientBrowser.newContext({
      viewport:{width:390,height:844},reducedMotion:'reduce',
      serviceWorkers:'block'
     });
     // The browser must carry the real test-only HttpOnly cookie through Vite
     // into Fastify. No interception of order or visit API calls is allowed.
     await clientContext.addCookies([{name:'__Secure-sabora_customer',
      value:positiveToken,domain:'127.0.0.1',path:'/',secure:true,
      httpOnly:true,sameSite:'Lax'}]);
     await clientContext.addInitScript(({id})=>{
      localStorage.setItem('sabora.client.selection.v1',
       JSON.stringify([{itemId:id,name:'Plato de integración',
        priceCents:700,quantity:1}]));
     },{id:itemId});
     const customerPage=await clientContext.newPage();
     customerPage.on('pageerror',error=>customerBrowserErrors.push(error.message));
     customerPage.on('request',request=>{
      if(new URL(request.url()).pathname==='/api/v1/customer/orders/confirm')
       confirmedOrderBody=request.postDataJSON();
     });
     // F17 integrated negative-to-positive journey: the same approved grant
     // must survive a blocked B destination, with no partial account/round
     // mutation. Restore the disposable PG17 table and finish B checkout.
     await admin.query(`UPDATE sabora.dining_tables SET ordering_state='closed'
      WHERE id=$1`,[httpFixture.blockedTable]);
     try{
      await customerPage.goto(origin+'/qr/v1/SABORA/'+
       httpFixture.blockedTable+'#'+qrToken);
      await customerPage.getByRole('button',
       {name:'Continuar con la mesa escaneada'}).waitFor({timeout:20000});
      const blockedVisit=customerPage.waitForResponse(response=>
       new URL(response.url()).pathname==='/api/v1/customer/visits',
       {timeout:20000});
      await customerPage.getByRole('button',
       {name:'Continuar con la mesa escaneada'}).click();
      const blockedResponse=await blockedVisit;
      assert.ok(blockedResponse.status()>=400,
       'closed B must deny actual PWA visit authorization: '+
       await blockedResponse.text());
      const unchanged=(await admin.query(`SELECT q.status,b.table_id,
       a.outstanding_cents FROM sabora.customer_table_change_requests q
       JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
       JOIN sabora.customer_accounts a ON a.id=q.account_id
       WHERE q.id=$1`,[created.json().id])).rows[0];
      assert.equal(unchanged.status,'approved');
      assert.equal(unchanged.table_id,httpFixture.sourceTable);
      assert.equal(unchanged.outstanding_cents,'2400');
      assert.equal((await admin.query(`SELECT count(*)::int AS n
       FROM sabora.order_rounds WHERE account_id=$1`,
       [httpFixture.sourceAccount])).rows[0].n,1,
       'blocked destination must not create an economic round');
     }finally{
      await admin.query(`UPDATE sabora.dining_tables SET ordering_state='open'
       WHERE id=$1`,[httpFixture.blockedTable]);
     }
     // F17 critical confirmation gate. An approval is not a shortcut:
     // even AFTER an authorized visit and a genuine SQL quote, revocation or
     // table closure must abort the entire destination order. The same PWA,
     // HTTP cookie, SQL roles, original account and outstanding delivery are
     // used for both forbidden attempts and the successful B checkout below.
     const rotatedQrToken='R'.repeat(42)+'A';
     const assertStillInA=async label=>{
      const snapshot=(await admin.query(`SELECT q.status,b.table_id,
       a.outstanding_cents,
       (SELECT count(*)::int FROM sabora.order_rounds r
        WHERE r.account_id=a.id) AS rounds,
       (SELECT count(*)::int FROM sabora.payment_attempts p
        WHERE p.account_id=a.id) AS payments,
       (SELECT count(*)::int FROM sabora.order_line_delivery_destinations d
        WHERE d.account_id=a.id AND d.table_id=$2) AS original_deliveries
       FROM sabora.customer_table_change_requests q
       JOIN sabora.customer_account_operational_bindings b
        ON b.account_id=q.account_id
       JOIN sabora.customer_accounts a ON a.id=q.account_id
       WHERE q.id=$1`,
       [created.json().id,httpFixture.sourceTable])).rows[0];
      assert.equal(snapshot.status,'approved',label+': grant retained');
      assert.equal(snapshot.table_id,httpFixture.sourceTable,
       label+': operational binding retained');
      assert.equal(snapshot.outstanding_cents,'2400',label+': debt intact');
      assert.equal(snapshot.rounds,1,label+': no extra order round');
      assert.equal(snapshot.payments,0,label+': no charged attempt');
      assert.equal(snapshot.original_deliveries,2,
       label+': historic and pending delivery remain at A');
      assert.equal((await admin.query(`SELECT count(*)::int AS total
       FROM sabora.orders WHERE table_id=$1`,
       [httpFixture.blockedTable])).rows[0].total,0,
       label+': no destination order written');
     };
     const brokenDestinationCases=[
      {name:'QR revocado después de cotizar',token:qrToken,breakDestination:async()=>{
       await admin.query(`UPDATE sabora.dining_tables
        SET qr_version=qr_version+1,qr_token_hash=$1 WHERE id=$2`,
        [createHash('sha256').update(rotatedQrToken).digest(),
         httpFixture.blockedTable]);
      }},
      {name:'Mesa cerrada después de cotizar',token:rotatedQrToken,breakDestination:async()=>{
       await admin.query(`UPDATE sabora.dining_tables
        SET ordering_state='closed' WHERE id=$1`,
        [httpFixture.blockedTable]);
      }}
     ];
     for(const scenario of brokenDestinationCases){
      await customerPage.goto(origin+'/qr/v1/SABORA/'+
       httpFixture.blockedTable+'#'+scenario.token);
      await customerPage.getByRole('button',
       {name:'Continuar con la mesa escaneada'}).waitFor({timeout:20000});
      const visitPromise=customerPage.waitForResponse(response=>
       new URL(response.url()).pathname==='/api/v1/customer/visits',
       {timeout:20000});
      await customerPage.getByRole('button',
       {name:'Continuar con la mesa escaneada'}).click();
      assert.equal((await visitPromise).status(),201,
       scenario.name+': valid QR before invalidation');
      await customerPage.getByText('Mesa verificada').waitFor({timeout:20000});
      const quotePromise=customerPage.waitForResponse(response=>
       new URL(response.url()).pathname==='/api/v1/customer/quotes',
       {timeout:20000});
      await customerPage.getByRole('button',
       {name:'Continuar con el pedido'}).click();
      assert.equal((await quotePromise).status(),201,
       scenario.name+': real quote prepared while authorized');
      await customerPage.getByRole('radio',{name:/Pagar al terminar/}).check();
      await customerPage.getByRole('button',
       {name:'Confirmar pedido'}).waitFor({timeout:20000});
      await scenario.breakDestination();
      const deniedConfirmation=customerPage.waitForResponse(response=>
       new URL(response.url()).pathname==='/api/v1/customer/orders/confirm',
       {timeout:20000});
      await customerPage.getByRole('button',{name:'Confirmar pedido'}).click();
      const rejectedConfirmation=await deniedConfirmation;
      assert.ok([403,409].includes(rejectedConfirmation.status()),
       scenario.name+': stale visit/quote must be denied during actual confirm: '+
        await rejectedConfirmation.text());
      await assertStillInA(scenario.name);
     }
     // C is the isolated adversarial destination. It has no co-diners;
     // restoring its session has no effect on B, where a third diner remains.
     await admin.query(`UPDATE sabora.dining_tables SET ordering_state='open'
      WHERE id=$1`,[httpFixture.blockedTable]);
     await assertStillInA('before recovered B transfer');
     // Enter through the real QR deep link after restoring destination B.
     // Its token must be scrubbed from browser history before ordering.
     await customerPage.goto(origin+'/qr/v1/SABORA/'+
      httpFixture.destinationTable+'#'+qrToken);
     // Approval must be visible and explicit before authorizing the new
     // technical visit. The economic account remains at A until confirmation.
     await customerPage.getByRole('button',
      {name:'Continuar con la mesa escaneada'}).waitFor({timeout:20000});
     await customerPage.getByLabel('QR de mesa').getByText(
      'Cambio de mesa aprobado. Ya puedes escanear el código QR de tu nueva mesa y continuar realizando pedidos').waitFor();
     await customerPage.getByRole('button',
      {name:'Continuar con la mesa escaneada'}).click();
     await customerPage.getByText('Mesa verificada').waitFor({timeout:20000});
     assert.equal(new URL(customerPage.url()).hash,'',
      'QR bearer fragment must be scrubbed from browser history');
     assert.equal(new URL(customerPage.url()).pathname,'/');
     const {mkdir}=await import('node:fs/promises');
     const {join}=await import('node:path');
     assert.ok(process.env.RUNNER_TEMP,'disposable_actions_artifact_dir_required');
     const evidence=join(process.env.RUNNER_TEMP,'sabora-h6-acceptance');
     await mkdir(evidence,{recursive:true});
     await customerPage.screenshot({path:join(evidence,
      'b3-customer-pg17-qr-mobile.png'),fullPage:true});
     await customerPage.getByRole('button',
      {name:'Continuar con el pedido'}).click();
     await customerPage.getByRole('radio',{name:/Pagar al terminar/}).check();
     const confirmedResponsePromise=customerPage.waitForResponse(response=>
      new URL(response.url()).pathname==='/api/v1/customer/orders/confirm',
      {timeout:20000});
     await customerPage.getByRole('button',{name:'Confirmar pedido'}).click();
     const confirmedResponse=await confirmedResponsePromise;
     assert.equal(confirmedResponse.status(),201,
      'real customer browser must confirm through authenticated Fastify/PG17');
     const confirmed=await confirmedResponse.json();
     assert.equal(confirmed.status,'confirmed');
     assert.equal(confirmed.accountId,httpFixture.sourceAccount,
      'the historical A and new B orders must belong to one economic account');
     await customerPage.getByText('Pedido confirmado').waitFor();
     assert.ok(confirmedOrderBody,
      'the browser must send the real checkout request, not a mock');
     await customerPage.screenshot({path:join(evidence,
      'b3-customer-pg17-confirmed-mobile.png'),fullPage:true});
     await customerPage.setViewportSize({width:1440,height:900});
     await customerPage.screenshot({path:join(evidence,
      'b3-customer-pg17-confirmed-desktop.png'),fullPage:true});
     assert.deepEqual(customerBrowserErrors,[]);
     // Idempotency is replayed through the SAME real browser cookie/API/SQL.
     const replay=await customerPage.evaluate(async body=>{
      const response=await fetch('/api/v1/customer/orders/confirm',{
       method:'POST',credentials:'same-origin',
       headers:{'Content-Type':'application/json'},
       body:JSON.stringify(body)
      });
      return {status:response.status,result:await response.json()};
     },confirmedOrderBody);
     assert.equal(replay.status,200,'replay must not create another order');
     assert.equal(replay.result.status,'replayed');
     assert.equal(replay.result.accountId,httpFixture.sourceAccount);
     // F18 complete journey: the co-diners at A and B keep ordering from
     // separate real Chromium PWAs, each on its own PG17 account.
     for(const peer of peers){
      const otherContext=await clientBrowser.newContext({
       viewport:{width:390,height:844},reducedMotion:'reduce',
       serviceWorkers:'block'
      });
      try{
       await otherContext.addCookies([{name:'__Secure-sabora_customer',
        value:peer.token,domain:'127.0.0.1',path:'/',secure:true,
        httpOnly:true,sameSite:'Lax'}]);
       await otherContext.addInitScript(({id})=>{
        localStorage.setItem('sabora.client.selection.v1',
         JSON.stringify([{itemId:id,name:'Plato de integración',
          priceCents:700,quantity:1}]));
       },{id:itemId});
       const otherPage=await otherContext.newPage();
       otherPage.on('pageerror',error=>customerBrowserErrors.push(
        'peer-'+peer.seat+':'+error.message));
       const peerTable=peer.seat==='A'?
        httpFixture.sourceTable:httpFixture.destinationTable;
       await otherPage.goto(origin+'/qr/v1/SABORA/'+peerTable+'#'+qrToken);
       await otherPage.getByText('Mesa verificada').waitFor({timeout:20000});
       await otherPage.getByRole('button',{name:'Continuar con el pedido'}).click();
       await otherPage.getByRole('radio',{name:/Pagar al terminar/}).check();
       const resultPromise=otherPage.waitForResponse(response=>
        new URL(response.url()).pathname==='/api/v1/customer/orders/confirm',
        {timeout:20000});
       await otherPage.getByRole('button',{name:'Confirmar pedido'}).click();
       const result=await resultPromise;
       if(result.status()!==201){
        const diagnostic=(await admin.query(`SELECT t.id,t.ordering_state,t.qr_version,
         t.session_id,v.visit_key,v.authorized_qr_version,v.revoked_at,
         v.expires_at,b.visit_key AS bound_visit,b.session_id AS bound_session
         FROM sabora.dining_tables t
         LEFT JOIN sabora.customer_table_visits v ON v.table_id=t.id
          AND v.customer_id=$2
         LEFT JOIN sabora.customer_account_operational_bindings b ON b.account_id=$3
         WHERE t.id=$1 ORDER BY v.granted_at DESC LIMIT 1`,
         [peerTable,peer.customer,peer.account])).rows;
        throw Error('peer '+peer.seat+' PG17 checkout: '+await result.text()+
         '; table_visit_binding='+JSON.stringify(diagnostic));
       }
       const receipt=await result.json();
       assert.equal(receipt.status,'confirmed');
       assert.equal(receipt.accountId,peer.account,
        'transfer must not redirect a co-diner checkout to another account');
       await otherPage.getByText('Pedido confirmado').waitFor();
       await otherPage.screenshot({path:join(evidence,
        'b3-f18-codiner-'+peer.seat.toLowerCase()+'-confirmed-mobile.png'),
        fullPage:true});
      }finally{await otherContext.close();}
     }
     // F22/R03: a fourth account in A races two separate real PWA
     // checkouts at B and C under a SINGLE approved departure grant.
     // All of these use the same disposable PG17/Fastify/Chromium system.
     const raceFixture=await admin.connect();
     try{
      await raceFixture.query('BEGIN');
      for(const diner of [rival,rollbackDiner,rotatedDiner,revokedDiner,
       postConsumeSessionDiner,postConsumeQrDiner,
       payNowDiner,cashHistoryDiner]){
      await raceFixture.query(`INSERT INTO sabora.customer_profiles
       (id,public_id,alias) VALUES($1,$2,$3)`,
       [diner.customer,diner.publicId,diner.alias]);
      await raceFixture.query(`INSERT INTO sabora.customer_sessions
       (customer_id,token_hash,expires_at)
       VALUES($1,$2,clock_timestamp()+interval '1 hour')`,
       [diner.customer,hashCustomerSessionToken(diner.token)]);
      await raceFixture.query(`INSERT INTO sabora.customer_table_visits
       (table_id,session_id,customer_id,visit_key,actor_id,
        authorized_qr_version,expires_at)
       VALUES($1,$2,$3::uuid,$4,($3::uuid)::text,1,clock_timestamp()+interval '1 hour')`,
       [httpFixture.sourceTable,httpFixture.sourceSession,
        diner.customer,diner.visitKey]);
      await raceFixture.query(`INSERT INTO sabora.customer_accounts
       (id,table_id,session_id,visit_key,customer_id,payment_mode,
        payment_mode_selected_at,outstanding_cents,cash_settled_cents)
       VALUES($1,$2,$3,$4,$5,$6,clock_timestamp(),$7,$8)`,
       [diner.account,httpFixture.sourceTable,httpFixture.sourceSession,
        diner.visitKey,diner.customer,diner.mode??'pay_at_end',diner.balance,
        diner.cashSettled??0]);
      await raceFixture.query(`INSERT INTO
       sabora.customer_account_operational_bindings
       (account_id,table_id,session_id,visit_key)
       VALUES($1,$2,$3,$4)`,
       [diner.account,httpFixture.sourceTable,httpFixture.sourceSession,
        diner.visitKey]);
      await raceFixture.query(`INSERT INTO sabora.orders
       (id,table_id,session_id,company,employee_number,customer_alias,
        customer_identifier,customer_visit_key,economic_snapshot,confirmed_at,
        grouping,items)
       VALUES($1,$2,$3,NULL,NULL,$4,$5,$6,
        '{"schemaVersion":"1"}'::jsonb,clock_timestamp(),'first',
        '[{"category":"main","name":"Pendiente carrera","quantity":1}]'::jsonb)`,
       [diner.order,httpFixture.sourceTable,httpFixture.sourceSession,
        diner.alias,diner.publicId,diner.visitKey]);
      await raceFixture.query(`INSERT INTO sabora.order_rounds
       (id,order_id,account_id,amount_cents,payment_mode,
        payment_policy_version,grouping_deadline,state)
       VALUES($1,$2,$3,$4,$5,1,
        clock_timestamp()+interval '5 minutes',$6)`,
       [diner.round,diner.order,diner.account,
        diner.historicAmount??diner.balance,diner.mode??'pay_at_end',
        diner.mode==='pay_now'?'awaiting_authorization':'grouping']);
      await raceFixture.query(`INSERT INTO
       sabora.order_round_delivery_destinations
       (round_id,account_id,table_id,session_id,visit_key)
       VALUES($1,$2,$3,$4,$5)`,
       [diner.round,diner.account,httpFixture.sourceTable,
        httpFixture.sourceSession,diner.visitKey]);
      const raceLine=(await raceFixture.query(`SELECT id
       FROM sabora.order_lines WHERE order_id=$1`,[diner.order])).rows[0];
      assert.ok(raceLine?.id,'historical order requires line');
      await raceFixture.query(`INSERT INTO
       sabora.order_line_delivery_destinations
       (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
       [raceLine.id,diner.round,diner.account,diner.order,
        httpFixture.sourceTable,httpFixture.sourceSession,diner.visitKey]);
      }
      // Immutable payment history fixtures, not invocations of a cash or
      // Stripe provider. The real HTTP/SQL/PWA transaction happens below.
      await raceFixture.query(`INSERT INTO sabora.payment_attempts
       (round_id,account_id,amount_cents,authorization_key,capture_key,
        state,provider_intent_id)
       VALUES($1,$2,1200,'h6_auth_f20_history_pending_00001',
        'h6_capture_f20_history_pending_00001','requires_action',
        'pi_F20HistoryPending12345')`,
       [payNowDiner.round,payNowDiner.account]);
      // The partial cash receipt will be performed by signed HTTP + PG17, not seeded.
      await raceFixture.query('COMMIT');
     }catch(error){await raceFixture.query('ROLLBACK').catch(()=>{});throw error;}
     finally{raceFixture.release();}
     // Before A->D, a waiter performs an actual 300-cent partial receipt over
     // signed Fastify/PG17. Concurrent replay and overpayment must not mutate
     // the same account a second time. The old direct cash insert is gone.
     const preCashUrl='/api/v1/operations/accounts/'+cashHistoryDiner.account+'/cash-settlements';
     const cashHeaders={authorization:'Bearer '+jwtWaiter,'content-type':'application/json'};
     const preCashBody={amountCents:300,correlationId:'f20_pre_transfer_cash_300'};
     const forbiddenCash=await http.inject({method:'POST',url:preCashUrl,
      payload:preCashBody});
     assert.equal(forbiddenCash.statusCode,401,
      'anonymous cash settlement is rejected at the JWT authentication gate');
     const preReceipts=await Promise.all([1,2].map(()=>http.inject({
      method:'POST',url:preCashUrl,headers:cashHeaders,payload:preCashBody})));
     assert.ok(preReceipts.every(r=>r.statusCode===201),
      preReceipts.map(r=>r.body).join(' '));
     assert.deepEqual(preReceipts.map(r=>r.json().repeated).sort(),[false,true]);
     assert.ok(preReceipts.every(r=>r.json().accountId===cashHistoryDiner.account));
     assert.ok(preReceipts.every(r=>r.json().outstandingCents===900));
     assert.ok(preReceipts.every(r=>r.json().state==='partial'));
     const refusedCash=await http.inject({method:'POST',url:preCashUrl,
      headers:cashHeaders,payload:{amountCents:1200,correlationId:'f20_overpay_forbidden'}});
     assert.equal(refusedCash.statusCode,409,'overpayment must fail before ledger write');
     const originalCash=(await admin.query(`SELECT state,outstanding_cents,cash_settled_cents
      FROM sabora.customer_accounts WHERE id=$1`,[cashHistoryDiner.account])).rows[0];
     assert.deepEqual(originalCash,{state:'open',outstanding_cents:'900',
      cash_settled_cents:'300'});
     assert.equal((await admin.query(`SELECT count(*)::int AS n
      FROM sabora.cash_settlements WHERE account_id=$1`,
      [cashHistoryDiner.account])).rows[0].n,1);
     cashHistoryDiner.balance=900;
     cashHistoryDiner.cashSettled=300;
     const raceRequest=await http.inject({method:'POST',
      url:'/api/v1/customer/table-change/requests',
      headers:{cookie:'__Secure-sabora_customer='+rival.token,
       'content-type':'application/json'},payload:{}});
     assert.equal(raceRequest.statusCode,201,raceRequest.body);
     const raceGrant=(await admin.query(`SELECT id,status
      FROM sabora.customer_table_change_requests
      WHERE account_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [rival.account])).rows[0];
     assert.equal(raceGrant.status,'pending');
     const raceApproval=await http.inject({method:'POST',
      url:'/api/v1/operations/table-change/decisions',
      headers:{authorization:'Bearer '+jwtWaiter,'content-type':'application/json'},
      payload:{requestId:raceGrant.id,decision:'approved'}});
     assert.equal(raceApproval.statusCode,200,raceApproval.body);
     assert.equal((await admin.query(`SELECT status FROM
      sabora.customer_table_change_requests WHERE id=$1`,
      [raceGrant.id])).rows[0].status,'approved');
     const probeWriterConnections=await Promise.all([
      pools[2].connect(),pools[2].connect()]);
     try{
      const backendPids=await Promise.all(probeWriterConnections.map(link=>
       link.query('SELECT pg_backend_pid() AS pid')));
      assert.notEqual(backendPids[0].rows[0].pid,backendPids[1].rows[0].pid,
       'competing confirmations need independent real PG17 backends');
     }finally{for(const link of probeWriterConnections)link.release();}
     const contenders=[
      {seat:'B',table:httpFixture.destinationTable,qrToken},
      {seat:'C',table:httpFixture.blockedTable,qrToken:rotatedQrToken}
     ];
     const rivalContexts=[],rivalPages=[];
     try{
      for(const contender of contenders){
       const context=await clientBrowser.newContext({
        viewport:{width:390,height:844},reducedMotion:'reduce',
        serviceWorkers:'block'
       });
       rivalContexts.push(context);
       await context.addCookies([{name:'__Secure-sabora_customer',
        value:rival.token,domain:'127.0.0.1',path:'/',secure:true,
        httpOnly:true,sameSite:'Lax'}]);
       await context.addInitScript(({id})=>{
        localStorage.setItem('sabora.client.selection.v1',
         JSON.stringify([{itemId:id,name:'Plato de integración',
          priceCents:700,quantity:1}]));
       },{id:itemId});
       const contenderPage=await context.newPage();
       contenderPage.on('pageerror',error=>
        customerBrowserErrors.push('rival-'+contender.seat+':'+error.message));
       let confirmationBody=null;
       contenderPage.on('request',request=>{
        if(new URL(request.url()).pathname==='/api/v1/customer/orders/confirm')
         confirmationBody=request.postDataJSON();
       });
       await contenderPage.goto(origin+'/qr/v1/SABORA/'+
        contender.table+'#'+contender.qrToken);
       await contenderPage.getByRole('button',
        {name:'Continuar con la mesa escaneada'}).waitFor({timeout:20000});
       await contenderPage.getByRole('button',
        {name:'Continuar con la mesa escaneada'}).click();
       await contenderPage.getByText('Mesa verificada').waitFor({timeout:20000});
       await contenderPage.getByRole('button',
        {name:'Continuar con el pedido'}).click();
       await contenderPage.getByRole('radio',
        {name:/Pagar al terminar/}).check();
       await contenderPage.getByRole('button',
        {name:'Confirmar pedido'}).waitFor({timeout:20000});
       rivalPages.push({...contender,page:contenderPage,
        getConfirmationBody:()=>confirmationBody});
      }
      const responsesPending=rivalPages.map(({page})=>page.waitForResponse(
       response=>new URL(response.url()).pathname==='/api/v1/customer/orders/confirm',
       {timeout:30000}));
      await Promise.all(rivalPages.map(({page})=>
       page.getByRole('button',{name:'Confirmar pedido'}).click()));
      const responses=await Promise.all(responsesPending);
      assert.deepEqual(responses.map(value=>value.status()).sort((a,b)=>a-b),
       [201,409],'one of two valid destination checkouts must win');
      const winnerIndex=responses.findIndex(value=>value.status()===201);
      const winner=rivalPages[winnerIndex],loser=rivalPages[1-winnerIndex];
      const success=await responses[winnerIndex].json();
      assert.equal(success.status,'confirmed');
      assert.equal(success.accountId,rival.account);
      assert.deepEqual(await responses[1-winnerIndex].json(),
       {error:'table_change_confirmation_conflict'});
      const final=(await admin.query(`SELECT q.status,q.destination_table_id,
       b.table_id,b.session_id,a.outstanding_cents
       FROM sabora.customer_table_change_requests q
       JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
       JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
       [raceGrant.id])).rows[0];
      assert.equal(final.status,'consumed');
      assert.equal(final.destination_table_id,winner.table);
      assert.equal(final.table_id,winner.table);
      assert.equal(final.outstanding_cents,'2300');
      const rounds=(await admin.query(`SELECT r.id,o.table_id
       FROM sabora.order_rounds r JOIN sabora.orders o ON o.id=r.order_id
       WHERE r.account_id=$1 ORDER BY o.confirmed_at`,
       [rival.account])).rows;
      assert.equal(rounds.length,2,'exactly one new round after B/C race');
      assert.ok(rounds.some(row=>row.table_id===httpFixture.sourceTable));
      assert.ok(rounds.some(row=>row.table_id===winner.table));
      assert.equal(rounds.some(row=>row.table_id===loser.table),false,
       'loser destination must never persist an order');
      const oldRound=(await admin.query(`SELECT o.table_id AS historical,
       d.table_id AS delivery FROM sabora.orders o
       JOIN sabora.order_rounds r ON r.order_id=o.id
       JOIN sabora.order_round_delivery_destinations d ON d.round_id=r.id
       WHERE o.id=$1`,[rival.order])).rows[0];
      assert.equal(oldRound.historical,httpFixture.sourceTable,
       'historical A order origin must be immutable');
      assert.equal(oldRound.delivery,winner.table,
       'pending delivery follows the sole winning transfer');
      const pendingLines=(await admin.query(`SELECT d.table_id
       FROM sabora.order_line_delivery_destinations d
       WHERE d.account_id=$1 AND d.order_id=$2`,
       [rival.account,rival.order])).rows;
      assert.equal(pendingLines.length,1);
      assert.equal(pendingLines[0].table_id,winner.table);
      assert.equal((await admin.query(`SELECT count(*)::int AS n FROM
       sabora.payment_attempts WHERE account_id=$1`,
       [rival.account])).rows[0].n,0);
      const sameBody=winner.getConfirmationBody();
      assert.ok(sameBody,'winning browser must expose its submitted request');
      const replay=await winner.page.evaluate(async body=>{
       const response=await fetch('/api/v1/customer/orders/confirm',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
       });
       return {status:response.status,result:await response.json()};
      },sameBody);
      assert.equal(replay.status,200,'winning replay must be idempotent');
      assert.equal(replay.result.status,'replayed');
      assert.equal(replay.result.accountId,rival.account);
      assert.equal((await admin.query(`SELECT count(*)::int AS n FROM
       sabora.order_rounds WHERE account_id=$1`,
       [rival.account])).rows[0].n,2,
       'replay must not produce a third round');
      await winner.page.getByText('Pedido confirmado').waitFor({timeout:20000});
      await winner.page.screenshot({path:join(evidence,
       'b3-f22-rival-winner-'+winner.seat.toLowerCase()+'-mobile.png'),
       fullPage:true});
     }finally{for(const context of rivalContexts)await context.close();}
     // F23/R04: deliberately fail AFTER the candidate SQL consumes a grant
     // but BEFORE its transaction can commit the order, payment or delivery.
     // Injection is strictly ephemeral PG17 test DDL, never an app migration.
     const sqlDefinition=(await admin.query(`SELECT pg_get_functiondef(
      'sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)'::regprocedure
      ) AS definition`)).rows[0].definition.toLowerCase();
     const grantPoint=sqlDefinition.indexOf('consume_customer_table_change_h6_candidate(');
     const dispatchPoint=sqlDefinition.indexOf('insert into sabora.kitchen_dispatches');
     assert.ok(grantPoint>0&&dispatchPoint>grantPoint,
      'F23 injected dispatch failure must occur after attempted grant consumption');
     const failedGrant=await http.inject({method:'POST',
      url:'/api/v1/customer/table-change/requests',
      headers:{cookie:'__Secure-sabora_customer='+rollbackDiner.token,
       'content-type':'application/json'},payload:{}});
     assert.equal(failedGrant.statusCode,201,failedGrant.body);
     const rollbackGrant=(await admin.query(`SELECT id,status FROM
      sabora.customer_table_change_requests WHERE account_id=$1
      ORDER BY created_at DESC LIMIT 1`,
      [rollbackDiner.account])).rows[0];
     assert.equal(rollbackGrant.status,'pending');
     const rollbackApproved=await http.inject({method:'POST',
      url:'/api/v1/operations/table-change/decisions',
      headers:{authorization:'Bearer '+jwtWaiter,'content-type':'application/json'},
      payload:{requestId:rollbackGrant.id,decision:'approved'}});
     assert.equal(rollbackApproved.statusCode,200,rollbackApproved.body);
     const rollbackContext=await clientBrowser.newContext({
      viewport:{width:390,height:844},reducedMotion:'reduce',
      serviceWorkers:'block'
     });
     try{
      await rollbackContext.addCookies([{name:'__Secure-sabora_customer',
       value:rollbackDiner.token,domain:'127.0.0.1',path:'/',secure:true,
       httpOnly:true,sameSite:'Lax'}]);
      await rollbackContext.addInitScript(({id})=>{
       localStorage.setItem('sabora.client.selection.v1',
        JSON.stringify([{itemId:id,name:'Plato de integración',
         priceCents:700,quantity:1}]));
      },{id:itemId});
      const rollbackPage=await rollbackContext.newPage();
      rollbackPage.on('pageerror',error=>
       customerBrowserErrors.push('rollback-diner:'+error.message));
      let rollbackOrderBody=null;
      rollbackPage.on('request',request=>{
       if(new URL(request.url()).pathname==='/api/v1/customer/orders/confirm')
        rollbackOrderBody=request.postDataJSON();
      });
      await rollbackPage.goto(origin+'/qr/v1/SABORA/'+
       httpFixture.blockedTable+'#'+rotatedQrToken);
      await rollbackPage.getByRole('button',
       {name:'Continuar con la mesa escaneada'}).waitFor({timeout:20000});
      await rollbackPage.getByRole('button',
       {name:'Continuar con la mesa escaneada'}).click();
      await rollbackPage.getByText('Mesa verificada').waitFor({timeout:20000});
      await rollbackPage.getByRole('button',
       {name:'Continuar con el pedido'}).click();
      await rollbackPage.getByRole('radio',{name:/Pagar al terminar/}).check();
      await rollbackPage.getByRole('button',
       {name:'Confirmar pedido'}).waitFor({timeout:20000});
      // A temporary trigger intercepts kitchen_dispatches, which the
      // confirmation inserts AFTER consume_customer_table_change_h6_candidate.
      // No permanent SQL function or customer role capability is modified.
      await admin.query(`CREATE FUNCTION sabora.ci_f23_post_consume_failure()
       RETURNS trigger LANGUAGE plpgsql AS $f23$
       BEGIN
        RAISE EXCEPTION 'ci_f23_forced_post_consume_failure'
         USING ERRCODE='P0001';
       END $f23$`);
      let triggerActive=false;
      try{
       await admin.query(`CREATE TRIGGER ci_f23_post_consume_abort
        BEFORE INSERT ON sabora.kitchen_dispatches
        FOR EACH ROW EXECUTE FUNCTION sabora.ci_f23_post_consume_failure()`);
       triggerActive=true;
       const failedResponsePromise=rollbackPage.waitForResponse(response=>
        new URL(response.url()).pathname==='/api/v1/customer/orders/confirm',
        {timeout:30000});
       await rollbackPage.getByRole('button',
        {name:'Confirmar pedido'}).click();
       const failedResponse=await failedResponsePromise;
       assert.equal(failedResponse.status(),503,
        'forced post-consumption SQL error should remain private HTTP failure');
       assert.deepEqual(await failedResponse.json(),
        {error:'customer_flow_unavailable'});
       assert.ok(rollbackOrderBody,'PWA must submit the genuine failed order');
       const undone=(await admin.query(`SELECT q.status,b.table_id,
        a.outstanding_cents,
        (SELECT count(*)::int FROM sabora.order_rounds r
         WHERE r.account_id=a.id) AS rounds,
        (SELECT count(*)::int FROM sabora.payment_attempts p
         WHERE p.account_id=a.id) AS payments,
        (SELECT count(*)::int FROM sabora.orders o
         WHERE o.customer_identifier=$2) AS orders,
        (SELECT count(*)::int FROM sabora.order_line_delivery_destinations d
         WHERE d.account_id=a.id AND d.table_id=$3) AS prior_deliveries
        FROM sabora.customer_table_change_requests q
        JOIN sabora.customer_account_operational_bindings b
         ON b.account_id=q.account_id
        JOIN sabora.customer_accounts a ON a.id=q.account_id
        WHERE q.id=$1`,
        [rollbackGrant.id,rollbackDiner.publicId,httpFixture.sourceTable])).rows[0];
       assert.equal(undone.status,'approved','forced rollback retains grant');
       assert.equal(undone.table_id,httpFixture.sourceTable);
       assert.equal(undone.outstanding_cents,'900');
       assert.equal(undone.rounds,1);
       assert.equal(undone.payments,0);
       assert.equal(undone.orders,1);
       assert.equal(undone.prior_deliveries,1,
        'failed transfer may not redirect pending historical delivery');
       const noDispatch=(await admin.query(`SELECT count(*)::int AS n
        FROM sabora.kitchen_dispatches k JOIN sabora.order_rounds r
        ON r.id=k.round_id WHERE r.account_id=$1`,
        [rollbackDiner.account])).rows[0].n;
       assert.equal(noDispatch,0,'injected failure must roll back dispatch');
      }finally{
       if(triggerActive)await admin.query(`DROP TRIGGER
        ci_f23_post_consume_abort ON sabora.kitchen_dispatches`);
       await admin.query('DROP FUNCTION IF EXISTS sabora.ci_f23_post_consume_failure()');
      }
      // A 503 is ambiguous to the PWA. Look up the original request first,
      // then retry the SAME request key (never emit a replacement order).
      const body=rollbackOrderBody;
      const checked=await rollbackPage.evaluate(async input=>{
       const response=await fetch('/api/v1/customer/orders/lookup',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(input)
       });
       return {status:response.status,result:await response.json()};
      },{tableId:body.tableId,qrToken:body.qrToken,visitId:body.visitId,
       basketId:body.basketId,requestKey:body.requestKey});
      assert.equal(checked.status,200);
      assert.equal(checked.result.status,'not_found',
       'rolled-back confirmation must not remain as an uncertain order');
      const retry=await rollbackPage.evaluate(async input=>{
       const response=await fetch('/api/v1/customer/orders/confirm',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(input)
       });
       return {status:response.status,result:await response.json()};
      },body);
      assert.equal(retry.status,201,
       'same original checkout must succeed after injected failure');
      assert.equal(retry.result.status,'confirmed');
      assert.equal(retry.result.accountId,rollbackDiner.account);
      const committed=(await admin.query(`SELECT q.status,q.destination_table_id,
       b.table_id,a.outstanding_cents,
       (SELECT count(*)::int FROM sabora.order_rounds r
        WHERE r.account_id=a.id) AS rounds,
       (SELECT count(*)::int FROM sabora.payment_attempts p
        WHERE p.account_id=a.id) AS payments
       FROM sabora.customer_table_change_requests q
       JOIN sabora.customer_account_operational_bindings b
        ON b.account_id=q.account_id
       JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
       [rollbackGrant.id])).rows[0];
      assert.equal(committed.status,'consumed');
      assert.equal(committed.destination_table_id,httpFixture.blockedTable);
      assert.equal(committed.table_id,httpFixture.blockedTable);
      assert.equal(committed.outstanding_cents,'1600');
      assert.equal(committed.rounds,2);
      assert.equal(committed.payments,0);
      const history=(await admin.query(`SELECT o.table_id AS historical,
       d.table_id AS delivery FROM sabora.orders o
       JOIN sabora.order_rounds r ON r.order_id=o.id
       JOIN sabora.order_round_delivery_destinations d ON d.round_id=r.id
       WHERE o.id=$1`,[rollbackDiner.order])).rows[0];
      assert.equal(history.historical,httpFixture.sourceTable);
      assert.equal(history.delivery,httpFixture.blockedTable);
      const stable=await rollbackPage.evaluate(async input=>{
       const response=await fetch('/api/v1/customer/orders/confirm',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(input)
       });
       return {status:response.status,result:await response.json()};
      },body);
      assert.equal(stable.status,200,'confirmed retry is now idempotent');
      assert.equal(stable.result.status,'replayed');
      assert.equal(stable.result.accountId,rollbackDiner.account);
      assert.equal((await admin.query(`SELECT count(*)::int AS n
       FROM sabora.order_rounds WHERE account_id=$1`,
       [rollbackDiner.account])).rows[0].n,2);
      await rollbackPage.screenshot({path:join(evidence,
       'b3-f23-injected-post-consume-rollback-recovered-mobile.png'),
       fullPage:true});
     }finally{await rollbackContext.close();}
     // F16/F17/R03: deliberately interleave real QR/session revocation
     // while the H6 CONFIRMATION transaction waits on its per-customer
     // advisory lock. pg_blocking_pids proves it reached the database
     // boundary; merely sending HTTP requests together is not enough.
     // The same integral Fastify/PG17/Chromium scene and account fixtures
     // exercise both denial and subsequent authorized QR recovery.
     let dQr=qrToken;
     const dQrAfterRotation='D'.repeat(42)+'A';
     const dContexts=[];
     const dHeaders=diner=>({cookie:'__Secure-sabora_customer='+diner.token,
      'content-type':'application/json'});
     const checkUnmoved=async(diner,grantId,why)=>{
      const state=(await admin.query(`SELECT q.status,b.table_id,
       a.outstanding_cents,(SELECT count(*)::int
       FROM sabora.order_rounds r WHERE r.account_id=a.id) AS rounds,
       (SELECT count(*)::int FROM sabora.payment_attempts p
       WHERE p.account_id=a.id) AS payments,
       (SELECT count(*)::int FROM sabora.order_line_delivery_destinations d
       WHERE d.account_id=a.id AND d.order_id=$2 AND d.table_id=$3) AS historic_delivery,
       (SELECT count(*)::int FROM sabora.orders o
       WHERE o.customer_identifier=$4) AS orders
       FROM sabora.customer_table_change_requests q
       JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
       JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
       [grantId,diner.order,httpFixture.sourceTable,diner.publicId])).rows[0];
      assert.equal(state.status,'approved',why+': grant must remain approved');
      assert.equal(state.table_id,httpFixture.sourceTable,why+': binding remains in A');
      assert.equal(state.outstanding_cents,String(diner.balance),why+': unchanged debt');
      assert.equal(state.rounds,1,why+': no new round');
      assert.equal(state.payments,0,why+': no payment');
      assert.equal(state.orders,1,why+': no destination order');
      assert.equal(state.historic_delivery,1,why+': pending delivery still in A');
     };
     const prepareD=async(diner,token,mode='pay_at_end')=>{
      const context=await clientBrowser.newContext({
       viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'
      });
      dContexts.push(context);
      await context.addCookies([{name:'__Secure-sabora_customer',
       value:diner.token,domain:'127.0.0.1',path:'/',secure:true,
       httpOnly:true,sameSite:'Lax'}]);
      await context.addInitScript(({id})=>{
       localStorage.setItem('sabora.client.selection.v1',
        JSON.stringify([{itemId:id,name:'Plato de integración',priceCents:700,quantity:1}]));
      },{id:itemId});
      const page=await context.newPage();
      page.on('pageerror',error=>customerBrowserErrors.push(
       'concurrent-'+diner.publicId+':'+error.message));
      await page.goto(origin+'/qr/v1/SABORA/'+httpFixture.concurrentTable+'#'+token);
      await page.getByRole('button',
       {name:'Continuar con la mesa escaneada'}).waitFor({timeout:20000});
      await page.getByRole('button',
       {name:'Continuar con la mesa escaneada'}).click();
      await page.getByText('Mesa verificada').waitFor({timeout:20000});
      await page.getByRole('button',{name:'Continuar con el pedido'}).click();
      await page.getByRole('radio',{name:mode==='pay_now'?/Pagar ahora/:/Pagar al terminar/}).check();
      await page.getByRole('button',{name:'Confirmar pedido'}).waitFor({timeout:20000});
      return page;
     };
     try{
      for(const scenario of [
       {diner:rotatedDiner,change:'qr'},
       {diner:revokedDiner,change:'session'}
      ]){
       const {diner,change}=scenario;
       const request=await http.inject({method:'POST',
        url:'/api/v1/customer/table-change/requests',
        headers:dHeaders(diner),payload:{}});
       assert.equal(request.statusCode,201,change+': '+request.body);
       const grantId=(await admin.query(`SELECT id FROM
        sabora.customer_table_change_requests WHERE account_id=$1
        ORDER BY created_at DESC LIMIT 1`,[diner.account])).rows[0].id;
       const approved=await http.inject({method:'POST',
        url:'/api/v1/operations/table-change/decisions',
        headers:{authorization:'Bearer '+jwtWaiter,'content-type':'application/json'},
        payload:{requestId:grantId,decision:'approved'}});
       assert.equal(approved.statusCode,200,change+': '+approved.body);
       const page=await prepareD(diner,dQr);
       const lockHolder=await admin.connect();
       let held=false;
       try{
        await lockHolder.query('BEGIN');
        held=true;
        const holderPid=(await lockHolder.query(
         'SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const key=(await lockHolder.query(`SELECT
         pg_catalog.hashtextextended($1::text,140630)::bigint AS key`,
         [diner.customer])).rows[0].key;
        await lockHolder.query('SELECT pg_advisory_xact_lock($1::bigint)',[key]);
        const resultPromise=page.waitForResponse(response=>
         new URL(response.url()).pathname==='/api/v1/customer/orders/confirm',
         {timeout:30000});
        await page.getByRole('button',{name:'Confirmar pedido'}).click();
        let blocked=false;
        for(let attempt=0;attempt<145;attempt++){
         const active=(await admin.query(`SELECT count(*)::int AS n
          FROM pg_catalog.pg_stat_activity a
          WHERE a.pid<>$1::int AND a.wait_event_type='Lock'
          AND a.wait_event='advisory'
          AND $1::int=ANY(pg_catalog.pg_blocking_pids(a.pid))
          AND a.query LIKE '%confirm_customer_round_h6_transfer_integration_candidate%'`,
          [holderPid])).rows[0].n;
         if(active>0){blocked=true;break;}
         await new Promise(resolve=>setTimeout(resolve,40));
        }
        assert.equal(blocked,true,change+
         ': H6 writer must be blocked in PostgreSQL behind our actual advisory lock');
        if(change==='qr'){
         await admin.query(`UPDATE sabora.dining_tables
          SET qr_version=qr_version+1,qr_token_hash=$1
          WHERE id=$2`,[createHash('sha256').update(dQrAfterRotation).digest(),
          httpFixture.concurrentTable]);
         dQr=dQrAfterRotation;
        }else{
         await admin.query(`UPDATE sabora.customer_sessions
          SET revoked_at=clock_timestamp()
          WHERE customer_id=$1 AND revoked_at IS NULL`,[diner.customer]);
        }
        // COMMIT the adversarial change before the waiting confirmation may
        // resume. An asynchronous click without this ordering proves nothing.
        await lockHolder.query('COMMIT');
        held=false;
        const denied=await resultPromise;
        assert.equal(denied.status(),403,
         change+': stale in-flight confirmation must deny at SQL boundary: '+
         await denied.text());
        assert.deepEqual(await denied.json(),{error:'customer_context_forbidden'});
        await checkUnmoved(diner,grantId,change+' in-flight revocation');
       }finally{
        if(held)await lockHolder.query('ROLLBACK').catch(()=>{});
        lockHolder.release();
       }
       if(change==='qr'){
        // Revoking QR does not revoke this customer's one-use staff approval.
        // A fresh QR + new visit/quote can still consume it once.
        const renewed=await prepareD(diner,dQr);
        const successPending=renewed.waitForResponse(response=>
         new URL(response.url()).pathname==='/api/v1/customer/orders/confirm',
         {timeout:20000});
        await renewed.getByRole('button',{name:'Confirmar pedido'}).click();
        const response=await successPending;
        assert.equal(response.status(),201,
         'authorized customer must recover from QR race by rescanning: '+
         await response.text());
        const receipt=await response.json();
        assert.equal(receipt.accountId,diner.account);
        assert.equal(receipt.status,'confirmed');
        const done=(await admin.query(`SELECT q.status,q.destination_table_id,
         b.table_id,a.outstanding_cents,
         (SELECT count(*)::int FROM sabora.order_rounds r
          WHERE r.account_id=a.id) AS rounds,
         (SELECT count(*)::int FROM sabora.payment_attempts p
          WHERE p.account_id=a.id) AS payments
         FROM sabora.customer_table_change_requests q
         JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
         JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
         [grantId])).rows[0];
        assert.equal(done.status,'consumed');
        assert.equal(done.destination_table_id,httpFixture.concurrentTable);
        assert.equal(done.table_id,httpFixture.concurrentTable);
        assert.equal(done.outstanding_cents,'1800');
        assert.equal(done.rounds,2);
        assert.equal(done.payments,0);
        const pending=(await admin.query(`SELECT d.table_id
         FROM sabora.order_line_delivery_destinations d
         WHERE d.account_id=$1 AND d.order_id=$2`,
         [diner.account,diner.order])).rows;
        assert.equal(pending.length,1);
        assert.equal(pending[0].table_id,httpFixture.concurrentTable);
        await renewed.getByText('Pedido confirmado').waitFor({timeout:20000});
        await renewed.screenshot({path:join(evidence,
         'b3-f17-inflight-qr-rotation-recovered-mobile.png'),fullPage:true});
       }else{
        // Session revocation is terminal. Neither new customer requests nor
        // outbox reads may revive the staff grant or disclose another account.
        const rejected=await http.inject({method:'POST',
         url:'/api/v1/customer/table-change/requests',
         headers:dHeaders(diner),payload:{}});
        assert.equal(rejected.statusCode,403);
        assert.equal((await admin.query(`SELECT status FROM
         sabora.customer_table_change_requests WHERE id=$1`,
         [grantId])).rows[0].status,'approved',
         'stale approval persists for audit but is unusable by revoked session');
       }
      }
      // F20/R05/R06: the original account is preserved across a new
      // client checkout even with a pre-existing Stripe authorization
      // still pending or an immutable prior cash payment. Provider and cash
      // history are fixture SETUP only; the transfer/quote/confirm/replay
      // below run through real PWA, Fastify, six PG17 roles and H6 SQL.
      for(const scenario of [
       {diner:payNowDiner,mode:'pay_now',balance:'0',attempts:2,cash:0},
       {diner:cashHistoryDiner,mode:'pay_at_end',balance:'1600',
        attempts:0,cash:1}
      ]){
       const {diner,mode}=scenario;
       const historicalPayments=(await admin.query(`SELECT id,round_id,
        amount_cents,state,provider_intent_id,authorization_key,capture_key
        FROM sabora.payment_attempts WHERE account_id=$1`,
        [diner.account])).rows;
       assert.equal(historicalPayments.length,mode==='pay_now'?1:0);
       const historicalCash=(await admin.query(`SELECT id,actor_user_id,
        correlation_id,amount_cents,kind FROM sabora.cash_settlements
        WHERE account_id=$1`,[diner.account])).rows;
       assert.equal(historicalCash.length,scenario.cash);
       if(mode==='pay_now'){
        assert.equal(historicalPayments[0].round_id,diner.round);
        assert.equal(historicalPayments[0].state,'requires_action');
        assert.equal(historicalPayments[0].amount_cents,'1200');
        assert.equal(historicalPayments[0].provider_intent_id,
         'pi_F20HistoryPending12345');
       }else{
        assert.equal(historicalCash[0].amount_cents,'300');
        assert.equal(historicalCash[0].kind,'payment');
       }
       const requested=await http.inject({method:'POST',
        url:'/api/v1/customer/table-change/requests',
        headers:dHeaders(diner),payload:{}});
       assert.equal(requested.statusCode,201,mode+': '+requested.body);
       const grantId=(await admin.query(`SELECT id FROM
        sabora.customer_table_change_requests WHERE account_id=$1
        ORDER BY created_at DESC LIMIT 1`,[diner.account])).rows[0].id;
       const approval=await http.inject({method:'POST',
        url:'/api/v1/operations/table-change/decisions',
        headers:{authorization:'Bearer '+jwtWaiter,'content-type':'application/json'},
        payload:{requestId:grantId,decision:'approved'}});
       assert.equal(approval.statusCode,200,mode+': '+approval.body);
       const page=await prepareD(diner,dQr,mode);
       let payload=null;
       page.on('request',request=>{
        if(new URL(request.url()).pathname==='/api/v1/customer/orders/confirm')
         payload=request.postDataJSON();
       });
       const resultPromise=page.waitForResponse(response=>
        new URL(response.url()).pathname==='/api/v1/customer/orders/confirm',
        {timeout:20000});
       await page.getByRole('button',{name:'Confirmar pedido'}).click();
       const response=await resultPromise;
       assert.equal(response.status(),201,mode+': '+await response.text());
       const confirmed=await response.json();
       assert.equal(confirmed.status,'confirmed');
       assert.equal(confirmed.accountId,diner.account);
       assert.equal(confirmed.paymentMode,mode);
       assert.equal(confirmed.amountCents,700);
       assert.equal(confirmed.roundState,mode==='pay_now'?
        'awaiting_authorization':'grouping');
       const state=(await admin.query(`SELECT q.status,q.destination_table_id,
        b.table_id,a.customer_id,a.payment_mode,a.outstanding_cents,
        a.cash_settled_cents,
        (SELECT count(*)::int FROM sabora.order_rounds r
         WHERE r.account_id=a.id) AS rounds,
        (SELECT count(*)::int FROM sabora.payment_attempts p
         WHERE p.account_id=a.id) AS payments,
        (SELECT count(*)::int FROM sabora.cash_settlements c
         WHERE c.account_id=a.id) AS cash_records
        FROM sabora.customer_table_change_requests q
        JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
        JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
        [grantId])).rows[0];
       assert.equal(state.status,'consumed');
       assert.equal(state.destination_table_id,httpFixture.concurrentTable);
       assert.equal(state.table_id,httpFixture.concurrentTable);
       assert.equal(state.customer_id,diner.customer);
       assert.equal(state.payment_mode,mode);
       assert.equal(state.outstanding_cents,scenario.balance);
       assert.equal(state.cash_settled_cents,String(diner.cashSettled??0));
       assert.equal(state.rounds,2);
       assert.equal(state.payments,scenario.attempts);
       assert.equal(state.cash_records,scenario.cash);
       const subsequentPayments=(await admin.query(`SELECT id,round_id,
        amount_cents,state,provider_intent_id,authorization_key,capture_key
        FROM sabora.payment_attempts WHERE account_id=$1`,
        [diner.account])).rows;
       if(mode==='pay_now'){
        const original=subsequentPayments.find(p=>p.id===historicalPayments[0].id);
        const current=subsequentPayments.find(p=>p.round_id===confirmed.roundId);
        assert.deepEqual(original,historicalPayments[0],
         'Stripe pending provider state and keys survive transfer unchanged');
        assert.ok(current);
        assert.notEqual(current.id,original.id);
        assert.notEqual(current.authorization_key,original.authorization_key);
        assert.notEqual(current.capture_key,original.capture_key);
        assert.equal(current.state,'authorization_requested');
        assert.equal(current.amount_cents,'700');
        assert.equal(current.provider_intent_id,null,
         'no provider authorization has been falsely claimed');
       }else{
        const afterCash=(await admin.query(`SELECT id,actor_user_id,
         correlation_id,amount_cents,kind FROM sabora.cash_settlements
         WHERE account_id=$1`,[diner.account])).rows;
        assert.deepEqual(afterCash,historicalCash,
         'prior cash receipt must remain append-only and intact');
       }
       const history=(await admin.query(`SELECT o.table_id AS source,
        r.amount_cents AS amount,d.table_id AS operational
        FROM sabora.orders o JOIN sabora.order_rounds r ON r.order_id=o.id
        JOIN sabora.order_round_delivery_destinations d ON d.round_id=r.id
        WHERE o.id=$1`,[diner.order])).rows[0];
       assert.equal(history.source,httpFixture.sourceTable);
       assert.equal(history.operational,httpFixture.concurrentTable);
       assert.equal(history.amount,'1200');
       const historyLine=(await admin.query(`SELECT d.table_id FROM
        sabora.order_line_delivery_destinations d
        WHERE d.account_id=$1 AND d.order_id=$2`,
        [diner.account,diner.order])).rows;
       assert.equal(historyLine.length,1);
       assert.equal(historyLine[0].table_id,httpFixture.concurrentTable);
       assert.ok(payload,'real PWA must submit confirm body for same-key replay');
       const replay=await page.evaluate(async input=>{
        const response=await fetch('/api/v1/customer/orders/confirm',{
         method:'POST',credentials:'same-origin',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify(input)
        });
        return {status:response.status,result:await response.json()};
       },payload);
       assert.equal(replay.status,200,'replay cannot make another payment');
       assert.equal(replay.result.status,'replayed');
       assert.equal(replay.result.accountId,diner.account);
       const postReplay=(await admin.query(`SELECT
        (SELECT count(*)::int FROM sabora.order_rounds r
         WHERE r.account_id=$1) AS rounds,
        (SELECT count(*)::int FROM sabora.payment_attempts p
         WHERE p.account_id=$1) AS payments,
        (SELECT count(*)::int FROM sabora.cash_settlements c
         WHERE c.account_id=$1) AS cash`,[diner.account])).rows[0];
       assert.equal(postReplay.rounds,2);
       assert.equal(postReplay.payments,scenario.attempts);
       assert.equal(postReplay.cash,scenario.cash);
       await page.getByText('Pedido confirmado').waitFor({timeout:20000});
       if(mode==='pay_now'){
        await page.getByText(/la autorización de Stripe sigue pendiente/).waitFor();
        await page.getByText(/No se ha confirmado ningún cobro ni envío a cocina/).waitFor();
       }else{
        await page.getByText(/El envío a cocina respetará la ventana/).waitFor();
       }
       await page.screenshot({path:join(evidence,
        'b3-f20-economic-'+mode.replaceAll('_','-')+'-mobile.png'),
        fullPage:true});
       if(mode==='pay_now'){
        // F20 provider journey: a *simulated* Stripe service result is applied
        // by real sealed H6 PostgreSQL RPCs under a distinct physical login.
        // No Stripe network, real funds or production webhook secret is used.
        const orderId=confirmed.orderId,roundId=confirmed.roundId;
        const providerIntentId='pi_F20PostTransferIntent001';
        const providerChargeId='ch_F20PostTransferCharge001';
        // The existing Stripe adapter and orchestrator are used, but their
        // network transport is a deterministic test double. All ledger effects
        // go through the real, isolated PG17 provider login and H6 SQL.
        const outboundStripe=[];
        const stripe=createH6StripeAdapter({
         credential:'sk_test_F20_Integration_Candidate_No_Network',
         request:async call=>{
          outboundStripe.push(call);
          if(call.path==='/v1/payment_intents'&&call.method==='POST')
           return {id:providerIntentId,status:'requires_capture',
            latest_charge:{payment_method_details:{card:{
             capture_before:Math.floor(Date.now()/1000)+86400}}}};
          if(call.path==='/v1/payment_intents/'+providerIntentId+'/capture')
           throw Error('simulated_stripe_capture_timeout');
          if(call.path==='/v1/refunds')throw Error('simulated_stripe_refund_timeout');
          throw Error('unexpected_external_provider_call:'+call.path);
         }
        });
        const payments=createH6PaymentOrchestrator({stripe,repository:h6Provider,
         // Move only the worker's virtual grouping deadline to preserve the
         // five-minute production policy without a five-minute CI sleep.
         clock:()=>Date.now()+360000});
        const authorizationKey=(await admin.query(`SELECT authorization_key
         FROM sabora.payment_attempts WHERE round_id=$1`,[roundId])).rows[0].authorization_key;
        const auth=await payments.authorize({orderId,amountCents:700,authorizationKey});
        assert.equal(auth.payment_state,'authorized');
        assert.equal(outboundStripe.length,1);
        assert.equal(outboundStripe[0].headers['idempotency-key'],authorizationKey);
        const quotedCharge=new URLSearchParams(outboundStripe[0].body);
        assert.equal(quotedCharge.get('capture_method'),'manual');
        assert.equal(quotedCharge.get('amount'),'700');
        assert.equal(quotedCharge.get('currency'),'eur');
        const pending=await payments.captureOrDispatch({orderId});
        assert.equal(pending.payment_state,'capture_unknown');
        assert.equal(pending.dispatch_state,'blocked',
         'ambiguous Stripe result must not dispatch to kitchen');
        assert.equal(outboundStripe.length,2);
        const capturedKey=outboundStripe[1].headers['idempotency-key'];
        assert.match(capturedKey,/^h6_capture_/);
        const retry=await h6Provider.requestCapture({orderId,
         now:new Date(Date.now()+360000)});
        assert.equal(retry.action,'capture');
        assert.equal(retry.repeated,true);
        assert.equal(retry.provider_intent_id,providerIntentId);
        assert.equal(retry.capture_key,capturedKey,
         'unknown capture must retain the same durable idempotency key');
        const successEvent={id:'evt_F20AfterTransferCapture001',object:'event',
         livemode:false,created:Math.floor(Date.now()/1000),
         type:'payment_intent.succeeded',
         data:{object:{object:'payment_intent',id:providerIntentId,
          latest_charge:providerChargeId,status:'succeeded'}}};
        await assert.rejects(()=>verifiedStripeWebhook(signStripeEvent(successEvent,{
         secret:randomBytes(32)})),/invalid_stripe_webhook_signature/);
        await assert.rejects(()=>verifiedStripeWebhook(signStripeEvent(successEvent,{
         timestamp:Math.floor(Date.now()/1000)-601})),/invalid_stripe_webhook_signature/);
        await assert.rejects(()=>verifiedStripeWebhook(signStripeEvent({
         ...successEvent,livemode:true})),/invalid_stripe_webhook_payload/);
        const applied=await verifiedStripeWebhook(signStripeEvent(successEvent));
        assert.equal(applied.outcome,'applied');
        assert.equal(applied.repeated,false);
        const replayEvent=await verifiedStripeWebhook(signStripeEvent(successEvent));
        assert.equal(replayEvent.outcome,'applied');
        assert.equal(replayEvent.repeated,true);
        const failedLate=await verifiedStripeWebhook(signStripeEvent({
         ...successEvent,id:'evt_F20StaleFailedAfterCaptured01',
         type:'payment_intent.payment_failed',
         data:{object:{object:'payment_intent',id:providerIntentId,
          status:'requires_payment_method'}}}));
        assert.equal(failedLate.outcome,'stale');
        const evidencePay=(await admin.query(`SELECT p.id AS payment_attempt_id,p.state,p.provider_intent_id,
         p.provider_charge_id,r.state AS round_state,d.id AS dispatch_id,
         d.state AS dispatch_state FROM sabora.payment_attempts p
         JOIN sabora.order_rounds r ON r.id=p.round_id
         JOIN sabora.kitchen_dispatches d ON d.round_id=r.id
         WHERE r.id=$1`,[roundId])).rows[0];
        assert.equal(evidencePay.state,'captured');
        assert.equal(evidencePay.provider_intent_id,providerIntentId);
        assert.equal(evidencePay.provider_charge_id,providerChargeId);
        assert.equal(evidencePay.round_state,'dispatch_requested');
        assert.equal(evidencePay.dispatch_state,'requested');
        assert.equal((await admin.query(`SELECT count(*)::int AS n
         FROM sabora.kitchen_dispatches WHERE order_id=$1`,[orderId])).rows[0].n,1);
        const kitchenUser='b0a00000-0000-4000-8000-000000000310';
        const kitchenAck=await providerStaff.acknowledgeDispatch({
         verifiedIdentity:{userId:kitchenUser},verifiedStaff:{userId:kitchenUser,role:'kitchen'}},{
         dispatchId:evidencePay.dispatch_id,correlationId:'f20_after_move_kitchen_ack'});
        assert.equal(kitchenAck.state,'acknowledged');
        const kitchenEvents=(await admin.query(`SELECT event_type,table_id FROM
         sabora.event_outbox WHERE aggregate_id=$1
         AND event_type IN ('sabora.kitchen.dispatch_requested',
          'sabora.kitchen.dispatch_acknowledged') ORDER BY id`,
         [evidencePay.dispatch_id])).rows;
        assert.ok(kitchenEvents.some(e=>e.event_type==='sabora.kitchen.dispatch_requested'));
        assert.ok(kitchenEvents.some(e=>e.event_type==='sabora.kitchen.dispatch_acknowledged'));
        assert.ok(kitchenEvents.every(e=>e.table_id===httpFixture.concurrentTable),
         'dispatch and acknowledgement must follow the operational destination D');
        const staff={verifiedIdentity:{userId:httpFixture.waiter},
         verifiedStaff:{userId:httpFixture.waiter,role:'waiter'}};
        const incident=await providerStaff.reportIncident(staff,{
         roundId,lineId:null,origin:'waiter_restaurant',
         reason:'Plato no prestado: devolución al pagador de la ronda',
         affectedCents:300,correlationId:'f20_after_move_restaurant_incident'});
        assert.equal(incident.state,'refund_due');
        assert.equal(incident.requiresArbitration,false);
        const refundId=(await admin.query(`SELECT id,amount_cents
         FROM sabora.refund_attempts WHERE incident_id=$1`,
         [incident.incidentId])).rows[0];
        assert.equal(refundId.amount_cents,'300');
        const requested=await h6Provider.requestRefund({refundAttemptId:refundId.id});
        assert.equal(requested.action,'refund');
        assert.equal(requested.provider_charge_id,providerChargeId);
        assert.equal(requested.amount_cents,'300');
        const unknownRefund=await payments.refund({refundAttemptId:refundId.id});
        assert.equal(unknownRefund.state,'unknown');
        assert.equal(outboundStripe.length,3);
        assert.equal(outboundStripe[2].path,'/v1/refunds');
        assert.equal(outboundStripe[2].headers['idempotency-key'],
         requested.idempotency_key);
        const refundBody=new URLSearchParams(outboundStripe[2].body);
        assert.equal(refundBody.get('charge'),providerChargeId);
        assert.equal(refundBody.get('amount'),'300');
        assert.equal(refundBody.get('metadata[sabora_refund_attempt_id]'),refundId.id);
        const refundRetry=await h6Provider.requestRefund({refundAttemptId:refundId.id});
        assert.equal(refundRetry.idempotency_key,requested.idempotency_key);
        assert.equal(refundRetry.repeated,true);
        const refundEvent={id:'evt_F20AfterTransferRefund001',object:'event',
         livemode:false,created:Math.floor(Date.now()/1000),
         type:'refund.updated',data:{object:{object:'refund',
          id:'re_F20PostTransferRefund001',charge:providerChargeId,status:'succeeded',
          metadata:{sabora_refund_attempt_id:refundId.id}}}};
        // Even an otherwise correctly signed refund event cannot settle an
        // incident if it references another charge: binding is checked in SQL.
        const misbound=await verifiedStripeWebhook(signStripeEvent({
         ...refundEvent,id:'evt_F20WrongOriginalCharge001',
         data:{object:{...refundEvent.data.object,
          charge:'ch_F20OtherAccountWrongCharge01'}}}));
        assert.equal(misbound.outcome,'ignored');
        assert.equal((await admin.query(`SELECT state FROM sabora.refund_attempts
         WHERE id=$1`,[refundId.id])).rows[0].state,'unknown');
        const refundDone=await verifiedStripeWebhook(signStripeEvent(refundEvent));
        assert.equal(refundDone.outcome,'applied');
        assert.equal(refundDone.repeated,false);
        const refundReplay=await verifiedStripeWebhook(signStripeEvent(refundEvent));
        assert.equal(refundReplay.repeated,true);
        const final=(await admin.query(`SELECT f.state AS refund_state,
         f.amount_cents,f.provider_refund_id,i.state AS incident_state,
         r.account_id FROM sabora.refund_attempts f
         JOIN sabora.incident_cases i ON i.id=f.incident_id
         JOIN sabora.order_rounds r ON r.id=i.round_id
         WHERE f.id=$1`,[refundId.id])).rows[0];
        assert.equal(final.refund_state,'succeeded');
        assert.equal(final.amount_cents,'300');
        assert.equal(final.provider_refund_id,'re_F20PostTransferRefund001');
        assert.equal(final.incident_state,'resolved');
        assert.equal(final.account_id,diner.account);
        const scopedEvents=(await admin.query(`SELECT event_type,table_id
         FROM sabora.event_outbox WHERE account_id=$1
         AND aggregate_id=ANY($2::uuid[]) ORDER BY id`,
         [diner.account,[evidencePay.payment_attempt_id,refundId.id,incident.incidentId]])).rows;
        assert.ok(scopedEvents.some(e=>e.event_type==='sabora.payment.authorized'));
        assert.ok(scopedEvents.some(e=>e.event_type==='sabora.stripe.webhook_applied'));
        assert.ok(scopedEvents.some(e=>e.event_type==='sabora.refund.succeeded'));
        assert.ok(scopedEvents.every(e=>e.table_id===httpFixture.concurrentTable),
         'customer payment and refund events must use operational destination D');
        const otherCash=(await admin.query(`SELECT cash_settled_cents,
         outstanding_cents FROM sabora.customer_accounts WHERE id=$1`,
         [cashHistoryDiner.account])).rows[0];
        // The other diner has independent signed-cash history, not this Stripe refund.
        assert.equal(otherCash.cash_settled_cents,'300');
        assert.equal(otherCash.outstanding_cents,'900');
       }
       if(mode==='pay_at_end'){
        // After A->D, repeat a genuinely authorized partial receipt and then
        // liquidate the remaining debt. The economic account stays OPEN so
        // later orders may reuse it, irrespective of a zero outstanding balance.
        const cashUrl='/api/v1/operations/accounts/'+diner.account+'/cash-settlements';
        const cashHeaders={authorization:'Bearer '+jwtWaiter,'content-type':'application/json'};
        const partialBody={amountCents:400,correlationId:'f20_after_transfer_cash_400'};
        const partial=await http.inject({method:'POST',url:cashUrl,
         headers:cashHeaders,payload:partialBody});
        assert.equal(partial.statusCode,201,partial.body);
        assert.equal(partial.json().accountId,diner.account);
        assert.equal(partial.json().state,'partial');
        assert.equal(partial.json().outstandingCents,1200);
        assert.equal(partial.json().accountState,'open');
        const partialReplay=await http.inject({method:'POST',url:cashUrl,
         headers:cashHeaders,payload:partialBody});
        assert.equal(partialReplay.statusCode,201);
        assert.equal(partialReplay.json().repeated,true);
        const full=await http.inject({method:'POST',url:cashUrl,
         headers:cashHeaders,payload:{amountCents:1200,correlationId:'f20_after_transfer_cash_full'}});
        assert.equal(full.statusCode,201,full.body);
        assert.equal(full.json().state,'settled');
        assert.equal(full.json().outstandingCents,0);
        assert.equal(full.json().accountState,'open');
        const account=(await admin.query(`SELECT id,customer_id,state,outstanding_cents,
         cash_settled_cents FROM sabora.customer_accounts WHERE id=$1`,
         [diner.account])).rows[0];
        assert.equal(account.id,diner.account);
        assert.equal(account.customer_id,diner.customer);
        assert.equal(account.state,'open');
        assert.equal(account.outstanding_cents,'0');
        assert.equal(account.cash_settled_cents,'1900');
        const receipts=(await admin.query(`SELECT amount_cents,kind FROM sabora.cash_settlements
         WHERE account_id=$1 ORDER BY created_at,id`,[diner.account])).rows;
        assert.deepEqual(receipts.map(r=>[r.amount_cents,r.kind]),
         [['300','payment'],['400','payment'],['1200','payment']]);
        const notices=(await admin.query(`SELECT event_type,table_id,account_id,
         payload->>'outstandingCents' AS remaining FROM sabora.event_outbox
         WHERE account_id=$1 AND event_type LIKE 'sabora.account.cash_%'
         ORDER BY id`,[diner.account])).rows;
        assert.deepEqual(notices.map(n=>n.event_type),[
         'sabora.account.cash_partially_paid','sabora.account.cash_partially_paid',
         'sabora.account.cash_settled']);
        assert.deepEqual(notices.map(n=>n.table_id),[
         httpFixture.sourceTable,httpFixture.concurrentTable,httpFixture.concurrentTable],
         'post-transfer cash events must follow the live table D, never historical A');
        assert.deepEqual(notices.map(n=>n.remaining),['900','1200','0']);
        assert.ok(notices.every(n=>n.account_id===diner.account));
        // F20/F23/R03/R05: explicit account closure is not implicit cash
        // settlement. Exercise the new authenticated JWT + scoped HMAC + PG17
        // RPC in the SAME customer PWA/checkout/cash/transfer scenario.
        const closeUrl='/api/v1/operations/accounts/'+diner.account+'/close';
        const closingHeaders={authorization:'Bearer '+jwtWaiter,
         'content-type':'application/json'};
        const unresolvedClose=await http.inject({method:'POST',url:closeUrl,
         headers:closingHeaders,payload:{correlationId:'b3_f20_close_early_unresolved'}});
        assert.equal(unresolvedClose.statusCode,409,unresolvedClose.body);
        assert.equal((await admin.query(`SELECT state FROM sabora.customer_accounts
         WHERE id=$1`,[diner.account])).rows[0].state,'open',
         'zero debt must not close account with undelivered order lines');
        // The departure approval remains possible while fully paid but open.
        // Respect the real server cooldown, not a synthetic SQL date shift.
        const latestGrantClock=(await admin.query(`SELECT q.created_at,
         clock_timestamp() AS server_now,rs.table_change_response_seconds AS seconds
         FROM sabora.customer_table_change_requests q
         CROSS JOIN sabora.restaurant_settings rs
         WHERE q.account_id=$1 AND rs.singleton=true
         ORDER BY q.created_at DESC,q.id DESC LIMIT 1`,[diner.account])).rows[0];
        if(latestGrantClock){
         const cooldownEnd=latestGrantClock.created_at.getTime()+
          Number(latestGrantClock.seconds)*1000;
         const remaining=Math.max(0,cooldownEnd-latestGrantClock.server_now.getTime()+150);
         if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
        }
        const leaveD=await http.inject({method:'POST',
         url:'/api/v1/customer/table-change/requests',
         headers:dHeaders(diner),payload:{}});
        assert.equal(leaveD.statusCode,201,leaveD.body);
        const closeGrant=(await admin.query(`SELECT id,status FROM
         sabora.customer_table_change_requests WHERE account_id=$1
         ORDER BY created_at DESC,id DESC LIMIT 1`,[diner.account])).rows[0];
        assert.equal(closeGrant.status,'pending');
        const leaveApproved=await http.inject({method:'POST',
         url:'/api/v1/operations/table-change/decisions',
         headers:closingHeaders,
         payload:{requestId:closeGrant.id,decision:'approved'}});
        assert.equal(leaveApproved.statusCode,200,leaveApproved.body);
        assert.equal((await admin.query(`SELECT status FROM
         sabora.customer_table_change_requests WHERE id=$1`,
         [closeGrant.id])).rows[0].status,'approved');
        // Use the dormant server-side deferred dispatcher against the SAME
        // real PostgreSQL 17 ledger and scoped provider login. Only time is
        // advanced in this disposable fixture; no dispatch state is forced.
        // Kitchen receipt, preparation and pickup remain authenticated HTTP.
        // The five-minute natural-clock delay remains a separate acceptance
        // gap: this case checks due execution/recovery, not five minutes elapsed.
        // The manually seeded historical A round predates the H6 test
        // dispatch projection and has NO kitchen_dispatch row. Backfill
        // just this disposable fixture, never the live data or migrations,
        // before exercising BOTH rounds through real signed kitchen actions.
        const historicDispatch=(await admin.query(`SELECT count(*)::int AS n
         FROM sabora.kitchen_dispatches WHERE order_id=$1`,
         [diner.order])).rows[0].n;
        assert.equal(historicDispatch,0,
         'only the synthetic historic round lacks its H6 dispatch fixture');
        await admin.query(`INSERT INTO sabora.kitchen_dispatches(
         round_id,order_id,revision_number,dispatch_key,state)
         SELECT r.id,r.order_id,r.revision_number,
         'h6_dispatch_'||replace(r.order_id::text,'-','_'),'blocked'
         FROM sabora.order_rounds r
         WHERE r.order_id=$1 AND r.account_id=$2
         AND NOT EXISTS(SELECT 1 FROM sabora.kitchen_dispatches d
          WHERE d.round_id=r.id)`,[diner.order,diner.account]);
        const stagedDispatches=(await admin.query(`SELECT k.id,r.order_id,
         k.state FROM sabora.kitchen_dispatches k
         JOIN sabora.order_rounds r ON r.id=k.round_id
         WHERE r.account_id=$1 ORDER BY r.created_at,r.id`,
         [diner.account])).rows;
        assert.equal(stagedDispatches.length,2);
        assert.ok(stagedDispatches.every(row=>row.state==='blocked'));
        // Explicit disposable time fixture, never a mutation of delivery,
        // payment, outbox or kitchen dispatch status. The scheduler itself
        // must write the two due dispatches through the existing sealed RPC.
        // The historical fixture was already overdue. Keep the genuinely
        // confirmed new round in a future deadline to verify the live timer.
        await admin.query(`UPDATE sabora.order_rounds SET
         grouping_deadline=CASE WHEN order_id=$2 THEN
          clock_timestamp()-interval '1 second'
         ELSE clock_timestamp()+interval '2 seconds' END
         WHERE account_id=$1 AND state IN ('grouping','free_grouping')`,
         [diner.account,diner.order]);
        const dispatchNotifier=await createPostgresH6OutboxNotifier({pool:pools[8]});
        const dispatchFailures=[];
        let resolveTimedDispatch;
        const timedDispatch=new Promise(resolve=>{resolveTimedDispatch=resolve;});
        const dispatchScheduler=createH6DeferredDispatchScheduler({
         listSchedulable:options=>h6Provider.listSchedulable(options),
         dispatchDue:async({orderId})=>{
          const result=await h6Provider.requestDueCapture({orderId});
          if(orderId!==diner.order)resolveTimedDispatch(result);
          return result;
         },
         subscribeCommitted:dispatchNotifier.subscribe,
         onFailure:error=>dispatchFailures.push(error)
        });
        try{
         await dispatchScheduler.start(); // rehydrates overdue historic order
         assert.deepEqual(dispatchFailures,[]);
         const early=(await admin.query(`SELECT k.state,r.order_id,
          r.state AS round_state FROM sabora.kitchen_dispatches k
          JOIN sabora.order_rounds r ON r.id=k.round_id
          WHERE r.account_id=$1`,[diner.account])).rows;
         assert.equal(early.length,2);
         assert.equal(early.find(v=>v.order_id===diner.order).state,'requested');
         assert.equal(early.find(v=>v.order_id!==diner.order).state,'blocked',
          'the confirmed new round cannot be sent before its deadline');
         await Promise.race([timedDispatch,new Promise((_,reject)=>setTimeout(()=>
          reject(Error('h6_deferred_dispatch_deadline_not_reached')),10000))]);
         const requested=(await admin.query(`SELECT k.state,r.state AS round_state
          FROM sabora.kitchen_dispatches k JOIN sabora.order_rounds r
          ON r.id=k.round_id WHERE r.account_id=$1`,[diner.account])).rows;
         assert.equal(requested.length,2);
         assert.ok(requested.every(v=>v.state==='requested' &&
           v.round_state==='dispatch_requested'),
           'scheduler dispatched both rounds without directly changing state');
         await dispatchScheduler.wake(); // replay must not duplicate events
         const once=(await admin.query(`SELECT count(*)::int AS n FROM sabora.event_outbox e
          WHERE e.event_type='sabora.kitchen.dispatch_requested'
           AND e.aggregate_id=ANY($1::uuid[])`,
          [stagedDispatches.map(d=>d.id)])).rows[0].n;
         assert.equal(once,2,'due dispatch is idempotent across wakeups');
        }finally{
         await dispatchScheduler.close();
         await dispatchNotifier.close();
        }
        const kitchenHeaders={authorization:'Bearer '+jwtKitchen,
         'content-type':'application/json'};
        for(const [index,dispatch] of stagedDispatches.entries()){
         const ack=await http.inject({method:'POST',
          url:'/api/v1/operations/dispatches/'+dispatch.id+'/ack',
          headers:kitchenHeaders,payload:{correlationId:'b3_close_kitchen_ack_'+index}});
         assert.equal(ack.statusCode,200,
          'signed kitchen dispatch acknowledgement '+index+': '+ack.body);
         assert.equal(ack.json().state,'acknowledged');
        }
        // A real authenticated kitchen PWA (not direct http.inject)
        // drives all confirmed->preparing->ready transitions. After close,
        // a second waiter PWA must still be able to claim pickup without
        // falsely marking the food delivered.
        const {pathToFileURL:chefToUrl,fileURLToPath:chefFilePath}=await import('node:url');
        const chefRequire=createRequire(new URL('../../apps/management/package.json',import.meta.url));
        const {createServer:chefServe}=await import(chefToUrl(chefRequire.resolve('vite')).href);
        const {chromium:chefChromium}=await import(chefToUrl(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
        let chefVite=null,chefBrowser=null,chefContext=null,chefWaiterContext=null;
        try{
         chefVite=await chefServe({
          root:chefFilePath(new URL('../../apps/management/',import.meta.url)),
          logLevel:'error',
          server:{host:'127.0.0.1',port:0,strictPort:false,
           proxy:{'/api':{target:'http://127.0.0.1:'+http.server.address().port,
            changeOrigin:false}}}
         });
         await chefVite.listen();
         const chefAddress=chefVite.httpServer.address();
         assert.ok(chefAddress&&typeof chefAddress==='object'&&chefAddress.port>0);
         const chefOrigin='http://127.0.0.1:'+chefAddress.port;
         chefBrowser=await chefChromium.launch({headless:true});
         chefContext=await chefBrowser.newContext({
          viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
         const chefPage=await chefContext.newPage();
         const chefErrors=[];
         chefPage.on('pageerror',error=>chefErrors.push(error.message));
         await chefPage.goto(chefOrigin+'/#comandas');
         await chefPage.evaluate(async jwt=>{
          const {mountAuthenticatedManagementApp}=await import('/src/main.tsx');
          window.__saboraCiDispose=mountAuthenticatedManagementApp({
           element:document.getElementById('root'),getAccessToken:async()=>jwt});
         },jwtKitchen);
        const kitchenLines=(await admin.query(`SELECT l.id,l.status,
         r.order_id FROM sabora.order_lines l
         JOIN sabora.order_rounds r ON r.order_id=l.order_id
         WHERE r.account_id=$1 ORDER BY r.created_at,r.id,l.line_number,l.id`,
         [diner.account])).rows;
        assert.ok(kitchenLines.length>=2);
        // Integrated diagnostic: distinguish server-side read failure from
        // pagination. A kitchen action cannot be tested against an invisible
        // order, even when the SQL fixture contains the line.
        // The HTTP layer deliberately hides database internals as 503.
        // In this disposable PG17 acceptance only, surface the exact SQL
        // failure from the SAME production coordinator to diagnose the
        // missing permission/contract without relaxing fail-closed HTTP.
        try {
         await h4KitchenOperations.listBoard({
          verifiedIdentity:{userId:'b0a00000-0000-4000-8000-000000000310'},
          verifiedStaff:{userId:'b0a00000-0000-4000-8000-000000000310',
           role:'kitchen'}},{status:null,limit:100,cursor:null});
        } catch (cause) {
         throw Error('disposable_pg17_kitchen_board_read_failed:'+
          String(cause?.message??cause),{cause});
        }
        const kitchenBoardResponse=await http.inject({method:'GET',
         url:'/api/v1/operations/order-lines?limit=100',
         headers:{authorization:'Bearer '+jwtKitchen}});
        assert.equal(kitchenBoardResponse.statusCode,200,
         'signed kitchen board read must succeed: '+kitchenBoardResponse.body);
        const kitchenBoardBody=kitchenBoardResponse.json();
        assert.equal(kitchenBoardBody.role,'kitchen');
        assert.ok(Array.isArray(kitchenBoardBody.items));
        const kitchenSqlLineCount=(await admin.query(`SELECT count(*)::int AS n
         FROM sabora.order_lines l
         JOIN sabora.order_line_delivery_destinations d ON d.order_line_id=l.id
         WHERE l.status IN ('confirmed','preparing','ready')`)).rows[0].n;
        assert.ok(kitchenBoardBody.items.length>0,
         'kitchen board must expose SQL confirmed lines; SQL visible='+kitchenSqlLineCount);
        const kitchenApiIds=new Set(kitchenBoardBody.items.map(row=>row.lineId));
        const kitchenMissing=kitchenLines.filter(line=>!kitchenApiIds.has(line.id));
        assert.ok(kitchenMissing.length===0||kitchenBoardBody.nextCursor!==null,
         'signed board omitted confirmed lines without pagination: '+
         JSON.stringify({missing:kitchenMissing.map(x=>x.id),
          returned:kitchenBoardBody.items.length,sqlVisible:kitchenSqlLineCount,
          nextCursor:kitchenBoardBody.nextCursor}));


        // The management board is paginated. Historic CI lines can occupy
        // the first 100 results; the chef must explicitly load further pages
        // rather than silently losing actionable orders.
        const ensureVisibleBoardLine=async(page,lineId)=>{
         for(let pageLoads=0;pageLoads<=20;pageLoads++){
          const row=page.locator('li[data-line-id="'+lineId+'"]');
          if(await row.count())return row;
          const more=page.getByRole('button',{name:'Cargar más comandas'});
          if(!await more.count()){
           // SSE and the initial board read may commit a React render between
           // the two locator checks. Recheck the requested row after the
           // render settles before declaring it absent.
           await row.waitFor({state:'attached',timeout:5000}).catch(()=>{});
           if(await row.count())return row;
          }
          assert.ok(await more.count(),
           'signed management board has no page containing required line '+lineId+
           '; ui='+JSON.stringify((await page.locator('main').allTextContents())
            .map(x=>x.slice(0,1200)))+
           '; visible='+JSON.stringify(await page.locator('li[data-line-id]')
            .evaluateAll(rows=>rows.map(row=>row.getAttribute('data-line-id')))));
          assert.ok(pageLoads<20,'management board cursor failed to terminate');
          const previous=await page.locator('li[data-line-id]').count();
          await more.click();
          await page.waitForFunction(count=>
           document.querySelectorAll('li[data-line-id]').length>count,
           previous,{timeout:20000});
         }
         throw Error('management_board_line_unreachable:'+lineId);
        };
        for(const line of kitchenLines){
         assert.equal(line.status,'confirmed',
          'kitchen transitions must start from real confirmed lines');
         const cardLine=await ensureVisibleBoardLine(chefPage,line.id);
         await cardLine.getByRole('button',{name:'Iniciar preparación'})
          .waitFor({timeout:20000});
         const firstResponse=chefPage.waitForResponse(response=>
          new URL(response.url()).pathname==
           '/api/v1/operations/order-lines/'+line.id+'/transitions',
          {timeout:20000});
         await cardLine.getByRole('button',{name:'Iniciar preparación'}).click();
         const first=await firstResponse;
         assert.equal(first.status(),201,
          'signed kitchen PWA preparing HTTP: '+await first.text());
         assert.equal((await first.json()).currentStatus,'preparing');
         await cardLine.getByRole('button',{name:'Marcar lista'})
          .waitFor({timeout:20000});
         const readyResponse=chefPage.waitForResponse(response=>
          new URL(response.url()).pathname==
           '/api/v1/operations/order-lines/'+line.id+'/transitions',
          {timeout:20000});
         await cardLine.getByRole('button',{name:'Marcar lista'}).click();
         const ready=await readyResponse;
         assert.equal(ready.status(),201,
          'signed kitchen PWA ready HTTP: '+await ready.text());
         assert.equal((await ready.json()).currentStatus,'ready');
        }
        assert.deepEqual(chefErrors,[],'kitchen management PWA has no JS errors');
        const readyBeforeClose=(await admin.query(`SELECT l.id,l.status,
         t.id AS pickup_id,t.state AS pickup_state,t.version
         FROM sabora.order_lines l
         JOIN sabora.order_rounds r ON r.order_id=l.order_id
         JOIN sabora.pickup_tasks t ON t.order_line_id=l.id
         WHERE r.account_id=$1 ORDER BY r.created_at,r.id,l.line_number,l.id`,
         [diner.account])).rows;
        assert.equal(readyBeforeClose.length,kitchenLines.length,
         'real kitchen READY RPC must create one durable H6 task per line');
        assert.ok(readyBeforeClose.every(row=>row.status==='ready'&&
         row.pickup_state==='ready'&&Number(row.version)>=1));
        // F20/R03 inverse interleaving in the SAME A->D/PG17/Chromium
        // scenario: a legitimate newly quoted checkout enters the customer
        // advisory lock BEFORE signed account closure. The economic account
        // is fully paid and operationally READY, so closure would otherwise
        // be permitted. This is not a mock of SQL ordering or API responses.
        const reverseBasket='b3_reverse_close_race_basket_01';
        const reverseQuote=await http.inject({method:'POST',
         url:'/api/v1/customer/quotes',headers:dHeaders(diner),
         payload:{tableId:httpFixture.concurrentTable,qrToken:dQr,
          visitId:payload.visitId,basketId:reverseBasket,
          lines:[{itemId,selection:{options:{},extras:[]},quantity:1}]}});
        assert.equal(reverseQuote.statusCode,201,
         'inverse race must start from server-authorized quote: '+reverseQuote.body);
        const reverseLines=reverseQuote.json().lines;
        assert.equal(reverseLines.length,1);
        const reversePayload={tableId:httpFixture.concurrentTable,qrToken:dQr,
         visitId:payload.visitId,basketId:reverseBasket,
         requestKey:'b3_reverse_close_checkout_01',paymentMode:'pay_at_end',
         lines:[{quoteId:reverseLines[0].quoteId,itemId,
          selection:{options:{},extras:[]},quantity:1}]};
        const reverseHolder=await admin.connect();
        let reverseLocked=false,reverseCheckout=null,reverseClose=null;
        try{
         await reverseHolder.query('BEGIN');reverseLocked=true;
         const holderPid=(await reverseHolder.query(
          'SELECT pg_backend_pid() AS pid')).rows[0].pid;
         await reverseHolder.query(`SELECT pg_advisory_xact_lock(
          pg_catalog.hashtextextended($1::text,140630))`,[diner.customer]);
         reverseCheckout=http.inject({method:'POST',
          url:'/api/v1/customer/orders/confirm',
          headers:dHeaders(diner),payload:reversePayload});
         let customerQueued=false;
         for(let tries=0;tries<150;tries++){
          const row=(await admin.query(`SELECT count(*)::int AS n
           FROM pg_stat_activity a
           WHERE a.pid<>$1::int AND a.wait_event_type='Lock'
            AND a.wait_event='advisory'
            AND a.query LIKE '%confirm_customer_round_h6_transfer_integration_candidate%'
            AND $1::int=ANY(pg_blocking_pids(a.pid))`,
           [holderPid])).rows[0];
          if(row.n>0){customerQueued=true;break;}
          await new Promise(resolve=>setTimeout(resolve,40));
         }
         assert.equal(customerQueued,true,
          'customer checkout must queue FIRST at the actual customer advisory lock');
         reverseClose=http.inject({method:'POST',url:closeUrl,
          headers:closingHeaders,payload:{
           correlationId:'b3_f20_inverse_close_loses_to_new_checkout'}});
         let closerQueued=false;
         for(let tries=0;tries<150;tries++){
          const row=(await admin.query(`SELECT count(*)::int AS n
           FROM pg_stat_activity a
           WHERE a.pid<>$1::int AND a.wait_event_type='Lock'
            AND a.wait_event='advisory'
            AND a.query LIKE '%close_h6_account_authorized_candidate%'
            AND $1::int=ANY(pg_blocking_pids(a.pid))`,
           [holderPid])).rows[0];
          if(row.n>0){closerQueued=true;break;}
          await new Promise(resolve=>setTimeout(resolve,40));
         }
         assert.equal(closerQueued,true,
          'signed close must queue SECOND on the same customer advisory lock');
         await reverseHolder.query('COMMIT');reverseLocked=false;
         const purchased=await reverseCheckout;
         assert.equal(purchased.statusCode,201,
          'first-in-queue checkout must win: '+purchased.body);
         const reverseReceipt=purchased.json();
         assert.equal(reverseReceipt.accountId,diner.account);
         assert.equal(reverseReceipt.amountCents,700);
         assert.equal(reverseReceipt.paymentMode,'pay_at_end');
         const refused=await reverseClose;
         assert.equal(refused.statusCode,409,
          'late closing must not settle newly charged consumption: '+refused.body);
         assert.equal((await admin.query(`SELECT
          state,outstanding_cents,cash_settled_cents
          FROM sabora.customer_accounts WHERE id=$1`,
          [diner.account])).rows[0].outstanding_cents,'700');
         assert.equal((await admin.query(`SELECT count(*)::int AS n
          FROM sabora.order_rounds WHERE account_id=$1`,
          [diner.account])).rows[0].n,3);
         assert.equal((await admin.query(`SELECT count(*)::int AS n
          FROM sabora.customer_order_attempt_batches WHERE request_key=$1`,
          [reversePayload.requestKey])).rows[0].n,1);
         const reverseReplay=await http.inject({method:'POST',
          url:'/api/v1/customer/orders/confirm',
          headers:dHeaders(diner),payload:reversePayload});
         assert.equal(reverseReplay.statusCode,200,reverseReplay.body);
         assert.equal(reverseReplay.json().status,'replayed');
         // The order won the advisory-lock race, so this paid-but-not-
         // reconciled account must remain OPEN. A simple subsequent closure
         // is also denied while the newly confirmed round is unresolved.
         const unpaidClose=await http.inject({method:'POST',url:closeUrl,
          headers:closingHeaders,payload:{
           correlationId:'b3_f20_inverse_unpaid_unready_close'}});
         assert.equal(unpaidClose.statusCode,409,unpaidClose.body);
         const outstanding=(await admin.query(`SELECT state,
          outstanding_cents,cash_settled_cents FROM sabora.customer_accounts
          WHERE id=$1`,[diner.account])).rows[0];
         assert.deepEqual(outstanding,{state:'open',outstanding_cents:'700',
          cash_settled_cents:'1900'});
         // The new real order must complete its full life cycle, too:
         // sealed SQL dispatch -> signed kitchen ACK -> Chromium PREPARING /
         // READY -> durable H6 pickup task, before the original close-wins
         // contention can legitimately settle the account.
         const reverseRound=(await admin.query(`SELECT id,state,
          grouping_deadline FROM sabora.order_rounds WHERE order_id=$1`,
          [reverseReceipt.orderId])).rows[0];
         assert.equal(reverseRound.state,'grouping');
         // This short deadline adjustment is disposable fixture setup only;
         // the separate 300-second scenario below validates natural timing.
         await admin.query(`UPDATE sabora.order_rounds SET
          grouping_deadline=clock_timestamp()-interval '1 second'
          WHERE id=$1 AND state='grouping'`,[reverseRound.id]);
         const dispatch=await h6Provider.requestDueCapture({
          orderId:reverseReceipt.orderId});
         assert.equal(dispatch.action,'dispatch');
         assert.equal(dispatch.repeated,false);
         const ack=await http.inject({method:'POST',
          url:'/api/v1/operations/dispatches/'+dispatch.dispatch_id+'/ack',
          headers:{authorization:'Bearer '+jwtKitchen,'content-type':'application/json'},
          payload:{correlationId:'b3_f20_inverse_kitchen_ack'}});
         assert.equal(ack.statusCode,200,ack.body);
         const additionalLines=(await admin.query(`SELECT l.id,l.status
          FROM sabora.order_lines l WHERE l.order_id=$1`,
          [reverseReceipt.orderId])).rows;
         assert.equal(additionalLines.length,1);
         // This kitchen page was mounted before the new customer checkout.
         // When its live event stream is reconnecting, use the approved
         // explicit refresh rather than asserting stale UI is authoritative.
         // This verifies fallback usability, NOT automatic SSE delivery.
         const kitchenRefresh=chefPage.waitForResponse(response=>
          new URL(response.url()).pathname==='/api/v1/operations/order-lines'
          &&response.status()===200,{timeout:20000});
         await chefPage.getByRole('button',{name:'Actualizar estado'}).click();
         await kitchenRefresh;
         const extraLine=await ensureVisibleBoardLine(chefPage,additionalLines[0].id);
         const preparing=chefPage.waitForResponse(response=>
          new URL(response.url()).pathname===
           '/api/v1/operations/order-lines/'+additionalLines[0].id+'/transitions',
          {timeout:20000});
         await extraLine.getByRole('button',{name:'Iniciar preparación'}).click();
         assert.equal((await preparing).status(),201);
         const ready=chefPage.waitForResponse(response=>
          new URL(response.url()).pathname===
           '/api/v1/operations/order-lines/'+additionalLines[0].id+'/transitions',
          {timeout:20000});
         await extraLine.getByRole('button',{name:'Marcar lista'}).click();
         assert.equal((await ready).status(),201);
         const finalLine=(await admin.query(`SELECT l.status,t.state
          FROM sabora.order_lines l JOIN sabora.pickup_tasks t
          ON t.order_line_id=l.id WHERE l.id=$1`,
          [additionalLines[0].id])).rows[0];
         assert.deepEqual(finalLine,{status:'ready',state:'ready'});
         const readyButUnpaid=(await admin.query(`SELECT state,
          outstanding_cents,cash_settled_cents FROM sabora.customer_accounts
          WHERE id=$1`,[diner.account])).rows[0];
         assert.deepEqual(readyButUnpaid,{state:'open',outstanding_cents:'700',
          cash_settled_cents:'1900'},
          'kitchen readiness does not settle economic debt or close an account');
        }finally{
         if(reverseLocked)await reverseHolder.query('ROLLBACK').catch(()=>{});
         reverseHolder.release();
         if(reverseCheckout)await Promise.allSettled([reverseCheckout]);
         if(reverseClose)await Promise.allSettled([reverseClose]);
        }
        const legacyTransition=await http.inject({method:'POST',
         url:'/api/v1/operations/order-lines/'+readyBeforeClose[0].id+'/transitions',
         headers:{authorization:'Bearer '+jwtWaiter,'content-type':'application/json'},
         payload:{targetStatus:'picked_up',correlationId:'b3_close_legacy_retired'}});
        assert.equal(legacyTransition.statusCode,409,
         'physical picked_up must remain disabled in H6');
        // F20/R03: deterministic race of TWO signed staff closings against
        // a newly quoted customer order, all on real restricted PG17 sockets.
        // Force the closer to acquire the customer advisory lock while waiting
        // for the account row, then start the genuine competing checkout.
        // No state/clock injection, financial fixture or authorization bypass.
        const raceBasket='b3_close_race_basket_'+suffix;
        const quote=await http.inject({method:'POST',
         url:'/api/v1/customer/quotes',headers:dHeaders(diner),
         payload:{tableId:httpFixture.concurrentTable,qrToken:dQr,
          visitId:payload.visitId,basketId:raceBasket,
          lines:[{itemId,selection:{options:{},extras:[]},quantity:1}]}});
        assert.equal(quote.statusCode,201,
         'fresh quoted purchase must be genuinely authorized: '+quote.body);
        const quoted=quote.json();
        assert.equal(quoted.lines.length,1);
        const competingOrder={tableId:httpFixture.concurrentTable,qrToken:dQr,
         visitId:payload.visitId,basketId:raceBasket,
         requestKey:'b3_close_competing_order_01',paymentMode:'pay_at_end',
         lines:[{quoteId:quoted.lines[0].quoteId,itemId,
          selection:{options:{},extras:[]},quantity:1}]};
        const concurrentCloseBody={correlationId:'b3_f20_close_after_resolved'};
        // F20/R03/R05: at this point ALL THREE real kitchen rounds are
        // acknowledged and READY, but the just-confirmed round still owes
        // 700 cents. Place the actual signed cash receipt FIRST in the PG17
        // account-row lock queue, then two identical close requests. The
        // customer lock is independently held until cash commits and the
        // closer is queued, before allowing a new quoted checkout to race.
        const dueBody={amountCents:700,
         correlationId:'b3_f20_inverse_cash_700_once'};
        const cashUrl='/api/v1/operations/accounts/'+diner.account+'/cash-settlements';
        // Cash and close must authenticate as DISTINCT active waiters:
        // verify_h6_staff_capability_candidate locks its own staff_members
        // row. Reusing the closer identity would serialize on staff auth,
        // masking the intended account-row lock race.
        const concurrentCashHeaders={authorization:'Bearer '+jwtSecondWaiter,
         'content-type':'application/json'};
        // A second disposable transaction holds the customer's advisory
        // lock separately from the account row. The shared signing key is
        // locked during capability verification, so cash and close cannot
        // both reach the account row concurrently. Release the row first,
        // prove cash committed, THEN release the customer advisory lock with
        // the closer already queued ahead of the next customer checkout.
        const customerLock=await admin.connect();
        const accountLock=await admin.connect();
        let accountLockOpen=false,customerLockOpen=false;
        let closureRequests=[],customerRequest=null,cashRequest=null;
        let concurrentClose;
        try{
         await customerLock.query('BEGIN');customerLockOpen=true;
         const customerHolderPid=(await customerLock.query(
          'SELECT pg_backend_pid() AS pid')).rows[0].pid;
         await customerLock.query(`SELECT pg_advisory_xact_lock(
          pg_catalog.hashtextextended($1::text,140630))`,[diner.customer]);
         await accountLock.query('BEGIN');accountLockOpen=true;
         const holderPid=(await accountLock.query(
          'SELECT pg_backend_pid() AS pid')).rows[0].pid;
         await accountLock.query('SELECT id FROM sabora.customer_accounts WHERE id=$1 FOR UPDATE',
          [diner.account]);
         cashRequest=http.inject({method:'POST',url:cashUrl,
          headers:concurrentCashHeaders,payload:dueBody});
         let cashQueued=false;
         for(let tries=0;tries<150;tries++){
          // A concurrent authenticated operation can sit between cash and the
          // held account row in PostgreSQL's lock queue. Follow the complete
          // wait graph so the test observes the real economic fence without
          // requiring the account holder to be the immediate blocker.
          const waiting=await admin.query(`WITH RECURSIVE wait_graph(root_pid,pid,depth) AS (
           SELECT a.pid,blocker,1 FROM pg_stat_activity a
           CROSS JOIN LATERAL unnest(pg_blocking_pids(a.pid)) AS blocker
           WHERE a.wait_event_type='Lock'
            AND a.query LIKE '%settle_h6_account_cash_authorized_candidate%'
           UNION
           SELECT wait_graph.root_pid,blocker,wait_graph.depth+1 FROM wait_graph
           CROSS JOIN LATERAL unnest(pg_blocking_pids(wait_graph.pid)) AS blocker
           WHERE wait_graph.depth<8
          ) SELECT count(*)::int AS n FROM wait_graph WHERE pid=$1::int`,[holderPid]);
          if(waiting.rows[0].n>0){cashQueued=true;break;}
          await new Promise(resolve=>setTimeout(resolve,40));
         }
         assert.equal(cashQueued,true,
          'cash settlement must enter PG17 account-row queue before close');
         closureRequests=[0,1].map(()=>http.inject({
          method:'POST',url:closeUrl,headers:closingHeaders,
          payload:concurrentCloseBody
         }));
         // While cash owns the HMAC signing-key lock, the signed closer
         // must be queued on some REAL PostgreSQL lock. It cannot yet
         // reach the account row because the key is serialized by SQL.
         let closerQueued=false;
         for(let tries=0;tries<150;tries++){
          const waiting=await admin.query(`SELECT count(*)::int AS n
           FROM pg_stat_activity a
           WHERE a.wait_event_type='Lock'
           AND a.query LIKE '%close_h6_account_authorized_candidate%'
           AND cardinality(pg_blocking_pids(a.pid))>0`);
          if(waiting.rows[0].n>0){closerQueued=true;break;}
          await new Promise(resolve=>setTimeout(resolve,40));
         }
         assert.equal(closerQueued,true,
          'signed closure must enter PostgreSQL lock queue while cash is pending');
         // Unlock ONLY the row. The customer advisory lock remains held in
         // the independent disposable connection, so the new checkout cannot
         // interleave ahead of a fully paid but not yet closed account.
         await accountLock.query('COMMIT');accountLockOpen=false;
         const settledCash=await cashRequest;
         assert.equal(settledCash.statusCode,201,settledCash.body);
         assert.equal(settledCash.json().repeated,false);
         assert.equal(settledCash.json().outstandingCents,0);
         assert.equal(settledCash.json().accountState,'open',
          'even a full cash receipt never closes a customer account itself');
         const paidBeforeClose=(await admin.query(`SELECT state,
          outstanding_cents,cash_settled_cents FROM sabora.customer_accounts
          WHERE id=$1`,[diner.account])).rows[0];
         assert.deepEqual(paidBeforeClose,{state:'open',outstanding_cents:'0',
          cash_settled_cents:'2600'},
          'cash must commit before any explicit account close can proceed');
         // The first closer has now passed HMAC verification and queues
         // at the customer advisory lock, which is shared with checkout.
         let closerOnCustomer=false;
         for(let tries=0;tries<150;tries++){
          const waiting=await admin.query(`SELECT count(*)::int AS n
           FROM pg_stat_activity a WHERE a.pid<>$1::int
           AND a.wait_event_type='Lock'
           AND a.wait_event='advisory'
           AND a.query LIKE '%close_h6_account_authorized_candidate%'
           AND $1::int=ANY(pg_blocking_pids(a.pid))`,[customerHolderPid]);
          if(waiting.rows[0].n>0){closerOnCustomer=true;break;}
          await new Promise(resolve=>setTimeout(resolve,40));
         }
         assert.equal(closerOnCustomer,true,
          'signed close must queue BEFORE the new checkout on customer lock');
         customerRequest=http.inject({method:'POST',
          url:'/api/v1/customer/orders/confirm',
          headers:dHeaders(diner),payload:competingOrder});
         let checkoutBlocked=false;
         for(let tries=0;tries<150;tries++){
          const waiting=await admin.query(`SELECT count(*)::int AS n
           FROM pg_stat_activity a WHERE a.wait_event_type='Lock'
           AND a.wait_event='advisory'
           AND a.query LIKE '%confirm_customer_round_h6_transfer_integration_candidate%'
           AND $1::int=ANY(pg_blocking_pids(a.pid))`,[customerHolderPid]);
          if(waiting.rows[0].n>0){checkoutBlocked=true;break;}
          await new Promise(resolve=>setTimeout(resolve,40));
         }
         assert.equal(checkoutBlocked,true,
          'new quoted checkout must wait behind committed cash and pending close');
         await customerLock.query('COMMIT');customerLockOpen=false;
         concurrentClose=await Promise.all(closureRequests);
         assert.deepEqual(concurrentClose.map(r=>r.statusCode),[200,200],
          'simultaneous signed close submissions must be idempotent');
         const denied=await customerRequest;
         assert.equal(denied.statusCode,403,
          'fresh checkout must fail after committed close: '+denied.body);
         assert.deepEqual(denied.json(),{error:'customer_context_forbidden'});
         assert.equal((await admin.query(`SELECT count(*)::int AS n
          FROM sabora.customer_order_attempt_batches WHERE request_key=$1`,
          [competingOrder.requestKey])).rows[0].n,0);
         assert.equal((await admin.query(`SELECT count(*)::int AS n
          FROM sabora.order_rounds WHERE account_id=$1`,[diner.account])).rows[0].n,3,
          'closing under contention may not create a fourth economic round');
         assert.equal((await admin.query(`SELECT outstanding_cents
          FROM sabora.customer_accounts WHERE id=$1`,[diner.account])).rows[0].outstanding_cents,
          '0','closing under contention may not invent new debt');
        }finally{
         if(accountLockOpen)await accountLock.query('ROLLBACK').catch(()=>{});
         if(customerLockOpen)await customerLock.query('ROLLBACK').catch(()=>{});
         accountLock.release();
         customerLock.release();
         if(cashRequest)await Promise.allSettled([cashRequest]);
         if(closureRequests.length)await Promise.allSettled(closureRequests);
         if(customerRequest)await Promise.allSettled([customerRequest]);
        }
        // Retrying the identical signed cash receipt AFTER closure must
        // return its originally committed response. Neither cash replay nor
        // the losing quoted order may resurrect or repay closed debt.
        const cashReplayAfterClose=await http.inject({method:'POST',
         url:cashUrl,headers:concurrentCashHeaders,payload:dueBody});
        assert.equal(cashReplayAfterClose.statusCode,201,cashReplayAfterClose.body);
        assert.equal(cashReplayAfterClose.json().repeated,true);
        assert.equal(cashReplayAfterClose.json().accountState,'open',
         'idempotent replay retains the historical settlement response');
        assert.equal(cashReplayAfterClose.json().outstandingCents,0);
        const finalCash=(await admin.query(`SELECT
         (SELECT count(*)::int FROM sabora.cash_settlements
          WHERE account_id=$1 AND correlation_id=$2) AS receipts,
         (SELECT count(*)::int FROM sabora.event_outbox
          WHERE account_id=$1 AND event_type='sabora.account.cash_settled') AS settled_notices,
         (SELECT cash_settled_cents FROM sabora.customer_accounts
          WHERE id=$1) AS paid_cents`,
         [diner.account,dueBody.correlationId])).rows[0];
        assert.equal(finalCash.receipts,1,
         'real simultaneous cash/close must create exactly one receipt');
        assert.equal(finalCash.settled_notices,2,
         'original cash settlement and new one each have one durable event');
        assert.equal(finalCash.paid_cents,'2600');
        const outcomes=concurrentClose.map(r=>r.json());
        assert.deepEqual(outcomes.map(x=>x.repeated).sort(),[false,true],
         'exactly one concurrent request must commit the account closure');
        assert.ok(outcomes.every(x=>x.accountId===diner.account&&
         x.state==='settled'&&x.outstandingCents===0));
        assert.equal(outcomes[0].closedAt,outcomes[1].closedAt,
         'concurrent replay must return the exact original close timestamp');
        const closedReplay=await http.inject({method:'POST',url:closeUrl,
         headers:closingHeaders,payload:concurrentCloseBody});
        assert.equal(closedReplay.statusCode,200);
        assert.equal(closedReplay.json().repeated,true);
        const secondClose=await http.inject({method:'POST',url:closeUrl,
         headers:closingHeaders,payload:{correlationId:'b3_f20_close_wrong_second'}});
        assert.equal(secondClose.statusCode,409,
         'closed account may not be closed again with another correlation');
        const kitchenClose=await http.inject({method:'POST',url:closeUrl,
         headers:{authorization:'Bearer '+jwtKitchen,'content-type':'application/json'},
         payload:{correlationId:'b3_f20_close_kitchen_denied'}});
        assert.equal(kitchenClose.statusCode,403);
        const closedSql=(await admin.query(`SELECT a.id,a.state,a.closed_at,a.closed_by,
         a.close_correlation_id,a.outstanding_cents,a.cash_settled_cents,b.table_id,
         (SELECT count(*)::int FROM sabora.customer_accounts c
           WHERE c.customer_id=a.customer_id) AS accounts,
         (SELECT count(*)::int FROM sabora.order_rounds r
           WHERE r.account_id=a.id) AS rounds
         FROM sabora.customer_accounts a
         JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
         WHERE a.id=$1`,[diner.account])).rows[0];
        assert.equal(closedSql.state,'settled');
        assert.ok(closedSql.closed_at);
        assert.equal(closedSql.closed_by,httpFixture.waiter);
        assert.equal(closedSql.close_correlation_id,'b3_f20_close_after_resolved');
        assert.equal(closedSql.outstanding_cents,'0');
        assert.equal(closedSql.cash_settled_cents,'2600');
        assert.equal(closedSql.table_id,httpFixture.concurrentTable);
        assert.equal(closedSql.accounts,1);
        assert.equal(closedSql.rounds,3);
        const revokedGrant=(await admin.query(`SELECT status,decided_by,revoked_at,
         consumed_at FROM sabora.customer_table_change_requests WHERE id=$1`,
         [closeGrant.id])).rows[0];
        assert.equal(revokedGrant.status,'approved',
         'retain original decision audit columns while invalidating grant by closure');
        assert.equal(revokedGrant.decided_by,httpFixture.waiter);
        assert.ok(revokedGrant.revoked_at,
         'approved-but-unused permission must be marked unusable on close');
        assert.equal(revokedGrant.consumed_at,null);
        assert.equal((await admin.query(`SELECT count(*)::int AS n
         FROM sabora.h6_action_requests WHERE action='close_account'
          AND result->>'accountId'=$1`,[diner.account])).rows[0].n,1,
         'idempotency and accounting audit must persist exactly one closure');
        const closedEvents=(await admin.query(`SELECT event_type,table_id,account_id
         FROM sabora.event_outbox WHERE account_id=$1
          AND event_type='sabora.account.closed'`,[diner.account])).rows;
        assert.equal(closedEvents.length,1);
        assert.equal(closedEvents[0].table_id,httpFixture.concurrentTable);
        // Closing is ECONOMIC only: no physical delivery claim is asserted.
        // Signed H6 waiter pickup remains available at the current table D
        // after closure, and the line stays READY (never legacy picked_up).
        const activePickup=readyBeforeClose[0];
        const waiterBoardResponse=await http.inject({method:'GET',
         url:'/api/v1/operations/order-lines?limit=100',
         headers:{authorization:'Bearer '+jwtWaiter}});
        assert.equal(waiterBoardResponse.statusCode,200,
         'post-close waiter board HTTP: '+waiterBoardResponse.body);
        const waiterBoardBody=waiterBoardResponse.json();
        assert.equal(waiterBoardBody.role,'waiter');
        // The same complete A->D/customer/cash/kitchen->close->waiter
        // scenario contains a genuinely historical picked_up line created
        // before the H6 pickup-task model. It has NO synthetic pickup
        // notification, and MUST remain visible as history without turning
        // the new 'Voy a recoger' into physical delivery evidence.
        const legacyHistory=(await admin.query(`SELECT l.id,l.status,
         (SELECT count(*)::int FROM sabora.pickup_notifications n
           WHERE n.order_line_id=l.id) AS notifications,
         (SELECT count(*)::int FROM sabora.pickup_tasks t
           WHERE t.order_line_id=l.id) AS tasks
         FROM sabora.order_lines l WHERE l.order_id=$1 AND l.line_number=1`,
         ['b0a00000-0000-4000-8000-000000000340'])).rows[0];
        assert.equal(legacyHistory.status,'picked_up');
        assert.equal(legacyHistory.notifications,0);
        assert.equal(legacyHistory.tasks,0);
        const legacyBoardRow=waiterBoardBody.items.find(row=>
         row.lineId===legacyHistory.id);
        if(legacyBoardRow){
         assert.equal(legacyBoardRow.status,'picked_up');
         assert.equal(legacyBoardRow.notification,null,
          'legacy historical item must not gain invented pickup notice');
         assert.equal(legacyBoardRow.pickup,null,
          'historical physical pickup is not a new H6 assignment');
        }else{
         assert.ok(waiterBoardBody.nextCursor,
          'old pickup must stay reachable in paginated waiter board');
        }
        const {normalizeOrderBoard:normalizeWaiterBoard}=await import(
         '../../apps/management/src/order-operations-model.js');
        try{normalizeWaiterBoard(waiterBoardBody);}
        catch(cause){throw Error('post_close_waiter_board_model_rejected:'+
         String(cause?.message??cause)+':'+JSON.stringify(waiterBoardBody.items
          .map(row=>({lineId:row.lineId,status:row.status,
           notification:row.notification,pickup:row.pickup})).slice(0,30)),{cause});}

        assert.ok(waiterBoardBody.items.some(row=>row.lineId===activePickup.id)||
         waiterBoardBody.nextCursor!==null,
         'post-close READY task must be visible or reachable by waiter cursor');

        chefWaiterContext=await chefBrowser.newContext({
         viewport:{width:1440,height:900},
         reducedMotion:'reduce',serviceWorkers:'block'});
        const waiterPage=await chefWaiterContext.newPage();
        waiterPage.on('pageerror',error=>chefErrors.push(error.message));
        await waiterPage.goto(chefOrigin+'/#comandas');
        await waiterPage.evaluate(async jwt=>{
         const {mountAuthenticatedManagementApp}=await import('/src/main.tsx');
         window.__saboraCiDispose=mountAuthenticatedManagementApp({
          element:document.getElementById('root'),getAccessToken:async()=>jwt});
        },jwtWaiter);
        await waiterPage.getByRole('button',{name:'Sala',exact:true})
         .click();
        const pickupLine=await ensureVisibleBoardLine(waiterPage,activePickup.id);
        await pickupLine.getByRole('button',{name:'Voy a recoger'})
         .waitFor({timeout:20000});
        const pickupPending=waiterPage.waitForResponse(response=>
         new URL(response.url()).pathname==
          '/api/v1/operations/order-lines/'+activePickup.id+'/pickup-claim',
         {timeout:20000});
        await pickupLine.getByRole('button',{name:'Voy a recoger'}).click();
        const pickupResponse=await pickupPending;
        assert.equal(pickupResponse.status(),200,
         'post-close signed pickup from real waiter PWA: '+
          await pickupResponse.text());
        assert.equal((await pickupResponse.json()).outcome,'claimed');
        await pickupLine.getByText('En recogida · responsable MS-839')
         .waitFor({timeout:20000});
        assert.deepEqual(chefErrors,[],'both kitchen and waiter management PWAs are error-free');
        const {mkdir:chefMkdir}=await import('node:fs/promises');
        const {join:chefJoin}=await import('node:path');
        const chefEvidence=chefJoin(process.env.RUNNER_TEMP,'sabora-h6-acceptance');
        await chefMkdir(chefEvidence,{recursive:true});
        await chefPage.screenshot({path:chefJoin(chefEvidence,
         'b3-f20-kitchen-ready-before-financial-close.png'),fullPage:true});
        await waiterPage.screenshot({path:chefJoin(chefEvidence,
         'b3-f20-waiter-pickup-after-financial-close.png'),fullPage:true});
        const pickupAfterClose=(await admin.query(`SELECT l.status,t.state,
         t.version,t.claimed_by FROM sabora.order_lines l
         JOIN sabora.pickup_tasks t ON t.order_line_id=l.id
         WHERE l.id=$1`,[activePickup.id])).rows[0];
        assert.equal(pickupAfterClose.status,'ready',
         'staff pickup claim is NOT physical service or terminal line state');
        assert.equal(pickupAfterClose.state,'claimed');
        assert.equal(pickupAfterClose.claimed_by,httpFixture.waiter);
        assert.equal(Number(pickupAfterClose.version),Number(activePickup.version)+1);
        assert.equal((await admin.query(`SELECT state,outstanding_cents
         FROM sabora.customer_accounts WHERE id=$1`,[diner.account])).rows[0].state,
         'settled','pickup claim cannot reopen closed financial account');
        }finally{
         if(chefWaiterContext)await chefWaiterContext.close();
         if(chefContext)await chefContext.close();
         if(chefBrowser)await chefBrowser.close();
         if(chefVite)await chefVite.close();
        }
        // Historical confirmed orders remain visible and replayable through
        // the original authenticated visit; closure forbids NEW confirmations,
        // not reading or idempotently looking up already-persisted consumption.
        assert.ok(payload,'original PWA checkout body is required');
        const historicalReplay=await http.inject({method:'POST',
         url:'/api/v1/customer/orders/confirm',headers:dHeaders(diner),
         payload});
        assert.equal(historicalReplay.statusCode,200,historicalReplay.body);
        assert.equal(historicalReplay.json().status,'replayed');
        const freshAfterClose=await http.inject({method:'POST',
         url:'/api/v1/customer/orders/confirm',headers:dHeaders(diner),
         payload:{...payload,requestKey:'b3_f20_fresh_after_close_01'}});
        assert.equal(freshAfterClose.statusCode,403,
         'new request key under a pre-closure session must fail closed: '+
          freshAfterClose.body);
        assert.equal((await admin.query(`SELECT count(*)::int AS n
         FROM sabora.order_rounds WHERE account_id=$1`,
         [diner.account])).rows[0].n,3);
        const untouchedStripe=(await admin.query(`SELECT a.state,
         (SELECT count(*)::int FROM sabora.order_rounds r
          WHERE r.account_id=a.id) AS rounds FROM sabora.customer_accounts a
         WHERE a.id=$1`,[payNowDiner.account])).rows[0];
        assert.equal(untouchedStripe.state,'open',
         "closing a cash payer cannot close another diner's Stripe account");
        assert.equal(untouchedStripe.rounds,2);
       }
      }
      // F16/F17/R03/R04: pause after consumed grant but before COMMIT.
      // An external revocation can begin while the confirmation is paused;
      // real PG17 row locks serialize its commit AFTER the economic commit.
      const postConsumeBarrier=8511227501;
      await admin.query(`CREATE FUNCTION sabora.ci_f16_post_consume_barrier()
       RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
       SET search_path=pg_catalog,pg_temp AS $ci$
       DECLARE v_account uuid;
       BEGIN
        SELECT r.account_id INTO v_account FROM sabora.order_rounds r
        WHERE r.id=NEW.round_id;
        IF v_account=TG_ARGV[0]::uuid OR v_account=TG_ARGV[1]::uuid THEN
         IF NOT EXISTS (SELECT 1 FROM sabora.customer_table_change_requests q
          WHERE q.account_id=v_account AND q.status='consumed'
           AND q.consumed_order_id=NEW.order_id) THEN
          RAISE EXCEPTION 'ci_f16_barrier_not_after_grant_consumption';
         END IF;
         PERFORM pg_catalog.pg_advisory_xact_lock(8511227501::bigint);
        END IF;
        RETURN NEW;
       END $ci$`);
      let postConsumeTriggerActive=false;
      try{
       await admin.query(`CREATE TRIGGER ci_f16_post_consume_barrier
        BEFORE INSERT ON sabora.kitchen_dispatches FOR EACH ROW
        EXECUTE FUNCTION sabora.ci_f16_post_consume_barrier(
         'b0a00000-0000-4000-8000-000000000422',
         'b0a00000-0000-4000-8000-000000000432')`);
       postConsumeTriggerActive=true;
       for(const {diner,change} of [
        {diner:postConsumeSessionDiner,change:'session'},
        {diner:postConsumeQrDiner,change:'qr'}
       ]){
        const request=await http.inject({method:'POST',
         url:'/api/v1/customer/table-change/requests',
         headers:dHeaders(diner),payload:{}});
        assert.equal(request.statusCode,201,change+': '+request.body);
        const grantId=(await admin.query(`SELECT id FROM
         sabora.customer_table_change_requests WHERE account_id=$1
         ORDER BY created_at DESC,id DESC LIMIT 1`,
         [diner.account])).rows[0].id;
        const decision=await http.inject({method:'POST',
         url:'/api/v1/operations/table-change/decisions',
         headers:{authorization:'Bearer '+jwtWaiter,'content-type':'application/json'},
         payload:{requestId:grantId,decision:'approved'}});
        assert.equal(decision.statusCode,200,change+': '+decision.body);
        const page=await prepareD(diner,dQr);
        let body=null;
        page.on('request',request=>{
         if(new URL(request.url()).pathname==='/api/v1/customer/orders/confirm')
          body=request.postDataJSON();
        });
        const holder=await admin.connect(),revoker=await admin.connect();
        let held=false,revokePending=null;
        try{
         await holder.query('BEGIN');held=true;
         const holderPid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
         await holder.query('SELECT pg_advisory_xact_lock($1::bigint)',
          [postConsumeBarrier]);
         const responsePending=page.waitForResponse(response=>
          new URL(response.url()).pathname==='/api/v1/customer/orders/confirm',
          {timeout:30000});
         await page.getByRole('button',{name:'Confirmar pedido'}).click();
         // The writer must be waiting INSIDE the trigger after consuming
         // the grant, not merely waiting at the start of the request.
         let writerPid=null;
         for(let i=0;i<145;i++){
          const blocked=(await admin.query(`SELECT a.pid FROM pg_stat_activity a
           WHERE a.wait_event_type='Lock' AND a.wait_event='advisory'
            AND $1::int=ANY(pg_blocking_pids(a.pid))
            AND a.query LIKE '%confirm_customer_round_h6_transfer_integration_candidate%'`,
           [holderPid])).rows;
          if(blocked.length){writerPid=blocked[0].pid;break;}
          await new Promise(resolve=>setTimeout(resolve,40));
         }
         assert.ok(writerPid,change+': post-consume SQL lock must be observed');
         const stillCommitted=(await admin.query(`SELECT q.status,b.table_id,
          a.outstanding_cents FROM sabora.customer_table_change_requests q
          JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
          JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
          [grantId])).rows[0];
         assert.equal(stillCommitted.status,'approved');
         assert.equal(stillCommitted.table_id,httpFixture.sourceTable);
         assert.equal(stillCommitted.outstanding_cents,String(diner.balance));
         const revokerPid=(await revoker.query(
          'SELECT pg_backend_pid() AS pid')).rows[0].pid;
         if(change==='session'){
          revokePending=revoker.query(`UPDATE sabora.customer_sessions
           SET revoked_at=clock_timestamp() WHERE customer_id=$1
           AND revoked_at IS NULL RETURNING customer_id`,[diner.customer]);
         }else{
          const nextQr='E'.repeat(42)+'B';
          revokePending=revoker.query(`UPDATE sabora.dining_tables
           SET qr_version=qr_version+1,qr_token_hash=$1 WHERE id=$2 RETURNING id`,
           [createHash('sha256').update(nextQr).digest(),httpFixture.concurrentTable]);
         }
          let blockedByWriter=false;
         for(let i=0;i<145;i++){
           // A live customer SSE refresh can be queued between the revoker and
           // the confirmation row lock. Assert the complete PostgreSQL wait
           // graph, not only the first backend in that graph: the economic
           // writer must still fence the external revocation transitively.
           const blockers=(await admin.query(`WITH RECURSIVE wait_graph(pid,depth) AS (
            SELECT blocker,1 FROM unnest(pg_blocking_pids($1::int)) AS blocker
            UNION
            SELECT blocker,wait_graph.depth+1 FROM wait_graph
            CROSS JOIN LATERAL unnest(pg_blocking_pids(wait_graph.pid)) AS blocker
            WHERE wait_graph.depth<8
           ) SELECT coalesce(array_agg(DISTINCT pid),'{}'::int[]) AS pids
           FROM wait_graph`,[revokerPid])).rows[0].pids;
          if(blockers.includes(writerPid)){blockedByWriter=true;break;}
          await new Promise(resolve=>setTimeout(resolve,40));
         }
         assert.equal(blockedByWriter,true,change+
          ': external revocation must block on the uncommitted confirmation row');
         await holder.query('COMMIT');held=false;
         const response=await responsePending;
         assert.equal(response.status(),201,change+': '+await response.text());
         const receipt=await response.json();
         assert.equal(receipt.status,'confirmed');
         assert.equal(receipt.accountId,diner.account);
         assert.ok(body);
         const revocation=await revokePending;
         assert.equal(revocation.rowCount,1);
         const final=(await admin.query(`SELECT q.status,q.destination_table_id,
          q.consumed_order_id,b.table_id,a.outstanding_cents,
          (SELECT count(*)::int FROM sabora.order_rounds r WHERE r.account_id=a.id) AS rounds,
          (SELECT count(*)::int FROM sabora.payment_attempts p WHERE p.account_id=a.id) AS payments,
          (SELECT count(*)::int FROM sabora.customer_accounts c
           WHERE c.customer_id=a.customer_id) AS accounts
          FROM sabora.customer_table_change_requests q
          JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
          JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
          [grantId])).rows[0];
         assert.equal(final.status,'consumed');
         assert.equal(final.destination_table_id,httpFixture.concurrentTable);
         assert.equal(final.consumed_order_id,receipt.orderId);
         assert.equal(final.table_id,httpFixture.concurrentTable);
         assert.equal(final.outstanding_cents,String(diner.balance+700));
         assert.equal(final.rounds,2);
         assert.equal(final.payments,0);
         assert.equal(final.accounts,1);
         const prior=(await admin.query(`SELECT o.table_id AS origin,d.table_id AS delivery
          FROM sabora.orders o JOIN sabora.order_rounds r ON r.order_id=o.id
          JOIN sabora.order_round_delivery_destinations d ON d.round_id=r.id
          WHERE o.id=$1`,[diner.order])).rows[0];
         assert.equal(prior.origin,httpFixture.sourceTable);
         assert.equal(prior.delivery,httpFixture.concurrentTable);
         const oldAccess=await http.inject({method:'POST',
          url:'/api/v1/customer/orders/confirm',headers:dHeaders(diner),payload:body});
         assert.equal(oldAccess.statusCode,403,
          change+': old credential may not confirm/replay after revocation');
         if(change==='session'){
          const oldState=await http.inject({method:'GET',
           url:'/api/v1/customer/table-change/state',headers:dHeaders(diner)});
          assert.equal(oldState.statusCode,403);
         }else{
          const currentQr=(await admin.query(`SELECT qr_version FROM sabora.dining_tables
           WHERE id=$1`,[httpFixture.concurrentTable])).rows[0].qr_version;
          assert.ok(currentQr>1);
          const intactSession=await http.inject({method:'GET',
           url:'/api/v1/customer/table-change/state',headers:dHeaders(diner)});
          assert.equal(intactSession.statusCode,200);
         }
         await page.screenshot({path:join(evidence,
          'b3-f16-post-consume-'+change+'-linearized-mobile.png'),fullPage:true});
        }finally{
         if(held)await holder.query('ROLLBACK').catch(()=>{});
         if(revokePending)await revokePending.catch(()=>{});
         revoker.release();holder.release();
        }
       }
      }finally{
       if(postConsumeTriggerActive)await admin.query(`DROP TRIGGER
        ci_f16_post_consume_barrier ON sabora.kitchen_dispatches`);
       await admin.query('DROP FUNCTION IF EXISTS sabora.ci_f16_post_consume_barrier()');
      }
     }finally{for(const context of dContexts)await context.close();}
     assert.deepEqual(customerBrowserErrors,[]);
    }finally{
     if(clientContext)await clientContext.close();
     if(clientBrowser)await clientBrowser.close();
     if(clientVite)await clientVite.close();
    }
    const transfer=(await admin.query(`SELECT b.table_id,b.session_id,b.visit_key,
     a.outstanding_cents,q.status AS grant,q.destination_table_id
     FROM sabora.customer_accounts a
     JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
     JOIN sabora.customer_table_change_requests q ON q.account_id=a.id
     WHERE a.id=$1`,[httpFixture.sourceAccount])).rows[0];
    assert.equal(transfer.table_id,httpFixture.destinationTable);
    const destinationVisit=(await admin.query(`SELECT visit_key FROM sabora.customer_table_visits
     WHERE table_id=$1 AND customer_id=$2 ORDER BY granted_at DESC LIMIT 1`,
     [httpFixture.destinationTable,httpFixture.customer])).rows[0];
    assert.equal(transfer.visit_key,destinationVisit.visit_key);
    assert.equal(transfer.grant,'consumed');
    assert.equal(transfer.destination_table_id,httpFixture.destinationTable);
    assert.equal(transfer.outstanding_cents,'3100',
     'new B order must add 700 cents to the original 2400-cent balance');
    const old=(await admin.query('SELECT table_id FROM sabora.orders WHERE id=$1',
     [priorOrder])).rows[0];
    assert.equal(old.table_id,httpFixture.sourceTable,
     'historical order must retain A as origin');
    const destinations=(await admin.query(`SELECT l.line_number,l.status,d.table_id
     FROM sabora.order_lines l
     JOIN sabora.order_line_delivery_destinations d ON d.order_line_id=l.id
     WHERE l.order_id=$1 ORDER BY l.line_number`,[priorOrder])).rows;
    assert.equal(destinations.length,2);
    assert.equal(destinations[0].status,'picked_up');
    assert.equal(destinations[0].table_id,httpFixture.sourceTable);
    assert.equal(destinations[1].table_id,httpFixture.destinationTable,
     'outstanding delivery follows customer to B');
    const rounds=(await admin.query(`SELECT count(*)::int AS total FROM sabora.order_rounds
     WHERE account_id=$1`,[httpFixture.sourceAccount])).rows[0].total;
    assert.equal(rounds,2,'old A and new B rounds remain on one account');
    // Three distinct users have independently confirmed consumption through
    // real PG17/HTTP/PWA. Neither table-sharing nor A->B transfer merges
    // accounts, reassigns historical orders or leaks another account's SSE.
    const accounts=(await admin.query(`SELECT a.id,a.customer_id,
     a.outstanding_cents,b.table_id FROM sabora.customer_accounts a
     JOIN sabora.customer_account_operational_bindings b ON b.account_id=a.id
     WHERE a.id=ANY($1::uuid[]) ORDER BY a.id`,
     [[httpFixture.sourceAccount,...peers.map(peer=>peer.account)]])).rows;
    assert.equal(accounts.length,3,'exactly three original economic accounts');
    const owner=accounts.find(row=>row.id===httpFixture.sourceAccount);
    assert.equal(owner.outstanding_cents,'3100');
    assert.equal(owner.table_id,httpFixture.destinationTable);
    for(const peer of peers){
     const own=accounts.find(row=>row.id===peer.account);
     assert.ok(own,'co-diner must retain its existing account id');
     assert.equal(own.customer_id,peer.customer);
     assert.equal(own.table_id,peer.seat==='A'?
      httpFixture.sourceTable:httpFixture.destinationTable);
     assert.equal(own.outstanding_cents,String(peer.balance+700),
      'a co-diner balance must gain only their own 700-cent order');
     const historic=(await admin.query(`SELECT o.table_id,r.account_id,
      d.table_id AS delivery_table FROM sabora.orders o
      JOIN sabora.order_rounds r ON r.order_id=o.id
      JOIN sabora.order_round_delivery_destinations d ON d.round_id=r.id
      WHERE o.id=$1`,[peer.order])).rows[0];
     assert.equal(historic.account_id,peer.account);
     assert.equal(historic.table_id,own.table_id);
     assert.equal(historic.delivery_table,own.table_id,
      'moving customer must not redirect a co-diner pending delivery');
     const decisions=await candidate.tableChange.readDecisions({
      customerSessionToken:peer.token,afterCursor:0,limit:100});
     assert.deepEqual(decisions.events,[],
      'SSE outbox replay must not leak another account decision');
    }
    assert.equal((await admin.query(`SELECT count(*)::int AS n
     FROM sabora.customer_accounts WHERE customer_id=ANY($1::uuid[])`,
     [[httpFixture.customer,...peers.map(peer=>peer.customer)]])).rows[0].n,3,
     'no extra account may be created by crossing occupied tables');

    // The second half of the SAME real customer/waiter/PG17 journey:
    // after transfer B, a new request to leave B can be rejected while the
    // account, economic history and outstanding deliveries remain unchanged.
    // Advance ONLY the old consumed request's CI fixture timestamps so this
    // deterministic test exercises a new 90-second response window.
    await admin.query(`UPDATE sabora.customer_table_change_requests
     SET created_at=clock_timestamp()-interval '5 minutes',
         decided_at=clock_timestamp()-interval '4 minutes',
         expires_at=clock_timestamp()-interval '3 minutes'
     WHERE id=$1 AND status='consumed'`,[created.json().id]);
    const {pathToFileURL:rejectPathToFileURL,fileURLToPath:rejectFileURLToPath}
     =await import('node:url');
    const {chromium:rejectChromium}=await import(
     rejectPathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
    const rejectRequire=createRequire(new URL('../../apps/client/package.json',import.meta.url));
    const {createServer:createRejectVite}=await import(
     rejectPathToFileURL(rejectRequire.resolve('vite')).href);
    const rejectManageRequire=createRequire(new URL('../../apps/management/package.json',import.meta.url));
    const {createServer:createRejectManageVite}=await import(
     rejectPathToFileURL(rejectManageRequire.resolve('vite')).href);
    let rejectVite,rejectManageVite,rejectBrowser,rejectClientContext,rejectStaffContext,
      rejectSecondStaffContext,rejectOfflineContext;
    const rejectedClientErrors=[];
    try{
     rejectVite=await createRejectVite({
      root:rejectFileURLToPath(new URL('../../apps/client/',import.meta.url)),
      mode:'test',logLevel:'error',
      server:{host:'127.0.0.1',port:0,strictPort:false,
       proxy:{'/api':{target:'http://127.0.0.1:'+http.server.address().port,
        changeOrigin:false}}}
     });
     rejectManageVite=await createRejectManageVite({
      root:rejectFileURLToPath(new URL('../../apps/management/',import.meta.url)),
      logLevel:'error',
      server:{host:'127.0.0.1',port:0,strictPort:false,
       proxy:{'/api':{target:'http://127.0.0.1:'+http.server.address().port,
        changeOrigin:false}}}
     });
     await rejectVite.listen();await rejectManageVite.listen();
     const caddr=rejectVite.httpServer.address();
     const maddr=rejectManageVite.httpServer.address();
     assert.ok(caddr&&maddr&&typeof caddr==='object'&&typeof maddr==='object');
     rejectBrowser=await rejectChromium.launch({headless:true});
     rejectClientContext=await rejectBrowser.newContext({
      viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'
     });
     rejectStaffContext=await rejectBrowser.newContext({
      viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'
     });
     await rejectClientContext.addCookies([{name:'__Secure-sabora_customer',
      value:positiveToken,domain:'127.0.0.1',path:'/',secure:true,
      httpOnly:true,sameSite:'Lax'}]);
     const rejectingCustomerPage=await rejectClientContext.newPage();
     rejectingCustomerPage.on('pageerror',error=>rejectedClientErrors.push(error.message));
     const stateRequests=[];
     rejectingCustomerPage.on('request',request=>{
      if(new URL(request.url()).pathname==='/api/v1/customer/table-change/state')
       stateRequests.push(request.url());
     });
     const stream=rejectingCustomerPage.waitForResponse(response=>
      new URL(response.url()).pathname==='/api/v1/customer/table-change/events'&&
      response.status()===200,{timeout:20000});
     await rejectingCustomerPage.goto('http://127.0.0.1:'+caddr.port+
      '/qr/v1/SABORA/'+httpFixture.sourceTable+'#'+qrToken);
     await stream;
     await rejectingCustomerPage.getByRole('button',{name:'Solicitar cambio de mesa'})
      .waitFor({timeout:20000});
     await rejectingCustomerPage.getByRole('button',{name:'Solicitar cambio de mesa'}).click();
     await rejectingCustomerPage.getByText('Solicitud enviada al personal').waitFor();
     const second=(await admin.query(`SELECT id,status,source_table_id,
      destination_table_id,account_id,expires_at,created_at
      FROM sabora.customer_table_change_requests WHERE account_id=$1
      ORDER BY created_at DESC,id DESC LIMIT 1`,[httpFixture.sourceAccount])).rows[0];
     assert.equal(second.status,'pending');
     assert.equal(second.source_table_id,httpFixture.destinationTable,
      'second request must originate at current operational B, not historical A');
     assert.equal(second.destination_table_id,null);
     assert.equal(second.account_id,httpFixture.sourceAccount);
     // A second real customer device has a valid earlier cursor, then goes
     // offline BEFORE rejection. The event must be recovered after the
     // request window expires: a current-state snapshot alone cannot do so.
     rejectOfflineContext=await rejectBrowser.newContext({
      viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'
     });
     await rejectOfflineContext.addCookies([{name:'__Secure-sabora_customer',
      value:positiveToken,domain:'127.0.0.1',path:'/',secure:true,
      httpOnly:true,sameSite:'Lax'}]);
     const offlinePage=await rejectOfflineContext.newPage();
     const offlineStream=offlinePage.waitForResponse(response=>
      new URL(response.url()).pathname==='/api/v1/customer/table-change/events'&&
      response.status()===200,{timeout:20000});
     await offlinePage.goto('http://127.0.0.1:'+caddr.port+'/');
     await offlineStream;
     await offlinePage.waitForFunction(()=>
      Object.keys(localStorage).some(key=>key.startsWith('sabora.table-change.cursor.')&&
       Number(localStorage.getItem(key))>0),null,{timeout:20000});
     await offlinePage.close();
     const staffPage=await rejectStaffContext.newPage();
     await staffPage.goto('http://127.0.0.1:'+maddr.port+'/#mesas');
     await staffPage.evaluate(async jwt=>{
       const {mountAuthenticatedManagementApp}=await import('/src/main.tsx');
       window.__saboraCiDispose=mountAuthenticatedManagementApp({
        element:document.getElementById('root'),
        getAccessToken:async()=>jwt,enableTableChangeQueue:true
       });
      },jwtWaiter);
     await staffPage.getByText('Mesa 981302').first().waitFor({timeout:20000});
     const readsBeforeRejection=stateRequests.length;
     await staffPage.getByRole('button',{name:'Rechazar',exact:true}).click();
     const rejectedCopy='Cambio de mesa no autorizado. Tu solicitud de cambio de mesa no ha sido aprobada. Si necesitas más información, consulta al personal del restaurante';
     await rejectingCustomerPage.locator('.table-change-live-notice')
      .getByText(rejectedCopy).waitFor({timeout:20000});
     assert.equal(stateRequests.length,readsBeforeRejection,
      'rejection must arrive automatically from committed PG17 state, without polling');
     await staffPage.getByText('Sin solicitudes pendientes').first().waitFor();
     const refused=(await admin.query(`SELECT q.status,q.decided_at,b.table_id,
      a.outstanding_cents FROM sabora.customer_table_change_requests q
      JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
      JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
      [second.id])).rows[0];
     assert.equal(refused.status,'rejected');
     assert.ok(refused.decided_at);
     assert.equal(refused.table_id,httpFixture.destinationTable);
     assert.equal(refused.outstanding_cents,'3100');
     const blocked=await http.inject({method:'POST',
      url:'/api/v1/customer/table-change/requests',
      headers:requestHeaders,payload:{}});
     assert.equal(blocked.statusCode,409,'rejection must preserve the response window');
     assert.equal(blocked.json().error,'table_change_request_locked');
     const {mkdir:rejectMkdir}=await import('node:fs/promises');
     const {join:rejectJoin}=await import('node:path');
     const rejectEvidence=rejectJoin(process.env.RUNNER_TEMP,'sabora-h6-acceptance');
     await rejectMkdir(rejectEvidence,{recursive:true});
     await rejectingCustomerPage.screenshot({path:rejectJoin(rejectEvidence,
      'b3-customer-pg17-auto-rejected-mobile.png'),fullPage:true});
     // Natural 90-second expiry on the real server clock, with both PWAs
     // still mounted and a second client offline. No timestamp rewrites,
     // fake clocks, direct state changes, polling or shortened intervals.
     // The waiter rejection remains visible until its actual expiry.
     const expiryStart=(await admin.query(`SELECT created_at,expires_at,
      clock_timestamp() AS server_now,status FROM sabora.customer_table_change_requests
      WHERE id=$1`,[second.id])).rows[0];
     assert.equal(expiryStart.status,'rejected');
     assert.ok(expiryStart.expires_at.getTime()-expiryStart.created_at.getTime()>=89900,
      'the server must enforce the normative 90-second response window');
     assert.ok(expiryStart.expires_at.getTime()>expiryStart.server_now.getTime(),
      'rejection should precede natural expiry');
     const remainingMs=expiryStart.expires_at.getTime()-expiryStart.server_now.getTime();
     assert.ok(remainingMs<=90000&&remainingMs>0);
     assert.equal((await rejectingCustomerPage.getByRole('button',
      {name:'Solicitar cambio de mesa'}).count()),0,
      'the live customer cannot request again before the real deadline');
     await new Promise(resolve=>setTimeout(resolve,remainingMs+1600));
     const expiryEnd=(await admin.query(`SELECT created_at,expires_at,
      clock_timestamp() AS server_now,status FROM sabora.customer_table_change_requests
      WHERE id=$1`,[second.id])).rows[0];
     assert.equal(expiryEnd.status,'rejected',
      'expiry must not rewrite the immutable rejection decision');
     assert.ok(expiryEnd.server_now.getTime()>=expiryEnd.expires_at.getTime(),
      'server clock must actually pass the 90-second deadline');
     assert.ok(expiryEnd.server_now.getTime()-expiryEnd.created_at.getTime()>=90000,
      'the window must elapse naturally, not through fixture manipulation');
     const released=await http.inject({method:'GET',
      url:'/api/v1/customer/table-change/state',headers:requestHeaders});
     assert.equal(released.statusCode,200,released.body);
     assert.notEqual(released.json().state,'pending',
      'a naturally expired rejected request must not remain pending');
     const reconnectPage=await rejectOfflineContext.newPage();
     const replayRequests=[];
     reconnectPage.on('request',request=>{
      if(new URL(request.url()).pathname==='/api/v1/customer/table-change/events')
       replayRequests.push(request.url());
     });
     const reconnectStream=reconnectPage.waitForResponse(response=>
      new URL(response.url()).pathname==='/api/v1/customer/table-change/events'&&
      response.status()===200,{timeout:20000});
     await reconnectPage.goto('http://127.0.0.1:'+caddr.port+'/');
     await reconnectStream;
     await reconnectPage.locator('.table-change-live-notice')
      .getByText(rejectedCopy).waitFor({timeout:20000});
     assert.equal(await reconnectPage.locator('.table-change-live-notice')
      .getByText(rejectedCopy).count(),1,
      'replayed decision must be visible once, never duplicate notifications');
     assert.ok(replayRequests.some(path=>new URL(path).searchParams.has('after')),
      'offline device must recover by last persisted H6 cursor');
     const persisted=(await admin.query(`SELECT count(*)::int AS n
      FROM sabora.event_outbox WHERE customer_id=$1 AND account_id=$2
      AND event_type='sabora.table_change.rejected'`,
      [httpFixture.customer,httpFixture.sourceAccount])).rows[0].n;
     assert.equal(persisted,1,
      'rejection must be one immutable event even after the 90s window ends');
     const {join:replayJoin}=await import('node:path');
     await reconnectPage.screenshot({path:replayJoin(process.env.RUNNER_TEMP,
      'sabora-h6-acceptance','b3-customer-pg17-rejected-offline-replay-mobile.png'),
      fullPage:true});
     await reconnectPage.close();
     await rejectingCustomerPage.getByRole('button',{name:'Solicitar cambio de mesa'})
      .waitFor({timeout:20000});
     assert.equal((await admin.query(`SELECT b.table_id FROM
      sabora.customer_account_operational_bindings b WHERE b.account_id=$1`,
      [httpFixture.sourceAccount])).rows[0].table_id,httpFixture.destinationTable,
      'expired rejected request must never move the account');
     await rejectingCustomerPage.getByRole('button',{name:'Solicitar cambio de mesa'}).click();
     await rejectingCustomerPage.getByText('Solicitud enviada al personal').waitFor();
     const third=(await admin.query(`SELECT id,status,source_table_id FROM
      sabora.customer_table_change_requests WHERE account_id=$1
      ORDER BY created_at DESC,id DESC LIMIT 1`,[httpFixture.sourceAccount])).rows[0];
     assert.equal(third.status,'pending');
     assert.equal(third.source_table_id,httpFixture.destinationTable);
     assert.notEqual(third.id,second.id);
     assert.deepEqual(rejectedClientErrors,[]);
     // F08/F09/R03: a real 90-second pending response window, with the
     // waiter APPROVAL and REJECTION both entering PG17 just before expiry
     // but blocked on the account row until AFTER the deadline. The DB
     // clock at actual decision, not HTTP arrival, decides the outcome.
     // This is part of the same two-PWA, Fastify, HMAC, physical-login,
     // SSE, historical-account and subsequent checkout integration.
     const thirdDeadline=(await admin.query(`SELECT created_at,expires_at,
      clock_timestamp() AS now FROM sabora.customer_table_change_requests
      WHERE id=$1`,[third.id])).rows[0];
     const windowMs=thirdDeadline.expires_at.getTime()-thirdDeadline.created_at.getTime();
     assert.ok(windowMs>=89900&&windowMs<=90100,
      'pending requests must enforce the full normative 90-second window');
     const nearBoundaryMs=thirdDeadline.expires_at.getTime()-
      thirdDeadline.now.getTime()-2800;
     assert.ok(nearBoundaryMs>1000,
      'third request must be observable well before its natural deadline');
     await new Promise(resolve=>setTimeout(resolve,nearBoundaryMs));
     const boundaryHolder=await admin.connect();
     let boundaryLockOpen=false,nearApproval,nearRejection;
     try{
      await boundaryHolder.query('BEGIN');boundaryLockOpen=true;
      const holderPid=(await boundaryHolder.query(
       'SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await boundaryHolder.query(
       'SELECT id FROM sabora.customer_accounts WHERE id=$1 FOR UPDATE',
       [httpFixture.sourceAccount]);
      const staffEndpoint='/api/v1/operations/table-change/decisions';
      const staffHeaders={authorization:'Bearer '+jwtWaiter,
       'content-type':'application/json'};
      // Both requests are sent BEFORE expiry. They wait on different SQL
      // connections behind the real account-row lock; neither is allowed to
      // decide with its old HTTP arrival time.
      const beforeExpiry=(await admin.query(
       'SELECT clock_timestamp() AS now')).rows[0].now;
      assert.ok(beforeExpiry<thirdDeadline.expires_at,
       'both decision requests must be issued before the real server deadline');
      nearApproval=http.inject({method:'POST',url:staffEndpoint,
       headers:staffHeaders,payload:{requestId:third.id,decision:'approved'}});
      nearRejection=http.inject({method:'POST',url:staffEndpoint,
       headers:staffHeaders,payload:{requestId:third.id,decision:'rejected'}});
      let blockedPids=[];
      for(let attempt=0;attempt<150;attempt++){
       blockedPids=(await admin.query(`SELECT a.pid FROM pg_stat_activity a
        WHERE a.wait_event_type='Lock' AND a.state='active'
         AND a.query LIKE '%decide_customer_table_change_h6_candidate%'
         AND cardinality(pg_blocking_pids(a.pid))>0`)).rows.map(r=>r.pid);
       if(new Set(blockedPids).size>=2)break;
       await new Promise(resolve=>setTimeout(resolve,30));
      }
      assert.equal(new Set(blockedPids).size,2,
       'two different staff SQL sockets must actually block before deadline');
      const deadlineCheck=(await admin.query(
       'SELECT clock_timestamp() AS now')).rows[0].now;
      const untilActualExpiry=Math.max(0,thirdDeadline.expires_at.getTime()-
       deadlineCheck.getTime()+250);
      await new Promise(resolve=>setTimeout(resolve,untilActualExpiry));
      const realBoundary=(await admin.query(
       'SELECT clock_timestamp() AS now')).rows[0].now;
      assert.ok(realBoundary>=thirdDeadline.expires_at,
       'release staff decisions only after real PostgreSQL expiry');
      await boundaryHolder.query('COMMIT');boundaryLockOpen=false;
     }finally{
      if(boundaryLockOpen)await boundaryHolder.query('ROLLBACK').catch(()=>{});
      boundaryHolder.release();
     }
     const boundaryDecisions=await Promise.all([nearApproval,nearRejection]);
     assert.deepEqual(boundaryDecisions.map(row=>row.statusCode),[409,409],
      'staff approval/rejection begun before expiry must both reject after expiry');
     assert.ok(boundaryDecisions.every(row=>
      row.json().error==='table_change_request_not_pending'));
     // The expired transition MUST persist even though the HTTP result is
     // a conflict. Previously the adapter threw inside its transaction and
     // rolled this SQL state change back, leaving a stale pending record.
     const naturalExpired=(await admin.query(`SELECT status,created_at,
      expires_at,decided_at,decided_by,consumed_at FROM
      sabora.customer_table_change_requests WHERE id=$1`,[third.id])).rows[0];
     assert.equal(naturalExpired.status,'expired',
      'staff deadline expiry must COMMIT before returning HTTP 409');
     assert.equal(naturalExpired.decided_at,null);
     assert.equal(naturalExpired.decided_by,null);
     assert.equal(naturalExpired.consumed_at,null);
     assert.ok(naturalExpired.expires_at.getTime()-
      naturalExpired.created_at.getTime()>=89900);
     const expiredEvents=(await admin.query(`SELECT count(*)::int AS n
      FROM sabora.event_outbox
      WHERE aggregate_id=$1 AND event_type IN
       ('sabora.table_change.approved','sabora.table_change.rejected')`,
      [third.id])).rows[0].n;
     assert.equal(expiredEvents,0,
      'expiry is not a staff approval/rejection and cannot emit either event');
     const unchangedAtDeadline=(await admin.query(`SELECT b.table_id,
      a.outstanding_cents,(SELECT count(*)::int FROM sabora.order_rounds r
       WHERE r.account_id=a.id) AS rounds
      FROM sabora.customer_account_operational_bindings b
      JOIN sabora.customer_accounts a ON a.id=b.account_id
      WHERE a.id=$1`,[httpFixture.sourceAccount])).rows[0];
     assert.equal(unchangedAtDeadline.table_id,httpFixture.destinationTable);
     assert.equal(unchangedAtDeadline.outstanding_cents,'3100');
     assert.equal(unchangedAtDeadline.rounds,2);
     const remaining=(await admin.query(`SELECT count(*)::int AS n FROM
      sabora.customer_table_change_requests WHERE status='pending'
      AND account_id=$1`,[httpFixture.sourceAccount])).rows[0].n;
     assert.equal(remaining,0,
      'expiring the request must clear the live staff queue durably');
     // Stale staff devices must remain unable to approve either later action.
     for(const decision of ['approved','rejected']){
      const late=await http.inject({method:'POST',
       url:'/api/v1/operations/table-change/decisions',
       headers:{authorization:'Bearer '+jwtWaiter,'content-type':'application/json'},
       payload:{requestId:third.id,decision}});
      assert.equal(late.statusCode,409,
       'persisted expired PG17 request must reject late '+decision+': '+late.body);
      assert.deepEqual(late.json(),{error:'table_change_request_not_pending'});
     }
     // Two real physical customer SQL connections compete immediately after
     // expiry. Exactly one new request may be created, never two live grants.
     const race=await Promise.all([0,1].map(()=>http.inject({
      method:'POST',url:'/api/v1/customer/table-change/requests',
      headers:requestHeaders,payload:{}
     })));
     assert.deepEqual(race.map(row=>row.statusCode).sort((a,b)=>a-b),
      [201,409],'concurrent post-expiry customer requests must serialize');
     const fourth=(await admin.query(`SELECT id,status,source_table_id
      FROM sabora.customer_table_change_requests WHERE account_id=$1
      ORDER BY created_at DESC,id DESC LIMIT 1`,[httpFixture.sourceAccount])).rows[0];
     assert.equal(fourth.status,'pending');
     assert.equal(fourth.source_table_id,httpFixture.destinationTable);
     assert.equal((await admin.query(`SELECT count(*)::int AS n
      FROM sabora.customer_table_change_requests WHERE account_id=$1
      AND status='pending'`,[httpFixture.sourceAccount])).rows[0].n,1);
     // F09/F15/R03/R08: TWO real management PWAs with distinct signed staff
     // JWTs see the same live pending request. Both users click Approve.
     // The real PG17 decision sockets must collide on the customer advisory
     // lock; UI responses and decided_by must agree with the winning actor.
     // No direct http.inject approval substitutes for the browser gestures.
     await staffPage.getByRole('button',{name:'Actualizar solicitudes'}).click();
     await staffPage.getByText('Mesa 981302').first().waitFor({timeout:20000});
     rejectSecondStaffContext=await rejectBrowser.newContext({
      viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'
     });
     const secondStaffPage=await rejectSecondStaffContext.newPage();
     await secondStaffPage.goto('http://127.0.0.1:'+maddr.port+'/#mesas');
     await secondStaffPage.evaluate(async jwt=>{
      const {mountAuthenticatedManagementApp}=await import('/src/main.tsx');
      window.__saboraCiDispose=mountAuthenticatedManagementApp({
       element:document.getElementById('root'),
       getAccessToken:async()=>jwt,enableTableChangeQueue:true
      });
     },jwtSecondWaiter);
     await secondStaffPage.getByText('Mesa 981302').first().waitFor({timeout:20000});
     const staffDecisionUrl='/api/v1/operations/table-change/decisions';
     const staffDecisionHeaders={authorization:'Bearer '+jwtWaiter,
      'content-type':'application/json'};
     const responseOn=(page)=>page.waitForResponse(response=>
      new URL(response.url()).pathname===staffDecisionUrl&&
       response.request().method()==='POST',{timeout:25000});
     const lockForStaff=await admin.connect();
     let staffLockOpen=false,firstApproval,secondApproval;
     try{
      await lockForStaff.query('BEGIN');staffLockOpen=true;
      const holderPid=(await lockForStaff.query(
       'SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const lockKey=(await lockForStaff.query(
       'SELECT pg_catalog.hashtextextended($1::text,140630)::bigint AS key',
       [httpFixture.customer])).rows[0].key;
      await lockForStaff.query('SELECT pg_advisory_xact_lock($1::bigint)',[lockKey]);
      const awaitPhysicalWait=async expected=>{
       for(let attempt=0;attempt<140;attempt++){
        const n=(await admin.query(`SELECT count(*)::int AS n FROM pg_stat_activity a
         WHERE a.pid<>$1::int AND a.wait_event_type='Lock'
         AND a.wait_event='advisory' AND $1::int=ANY(pg_blocking_pids(a.pid))`,
         [holderPid])).rows[0].n;
        if(n>=expected)return;
        await new Promise(resolve=>setTimeout(resolve,40));
       }
       throw Error('concurrent_staff_sql_lock_unobserved:'+expected);
      };
      firstApproval=responseOn(staffPage);
      await staffPage.getByRole('button',{name:'Aprobar cambio'}).click();
      await awaitPhysicalWait(1);
      secondApproval=responseOn(secondStaffPage);
      await secondStaffPage.getByRole('button',{name:'Aprobar cambio'}).click();
      await awaitPhysicalWait(2);
      await lockForStaff.query('COMMIT');staffLockOpen=false;
     }finally{
      if(staffLockOpen)await lockForStaff.query('ROLLBACK');
      lockForStaff.release();
     }
     const staffDecisions=await Promise.all([firstApproval,secondApproval]);
     assert.deepEqual(staffDecisions.map(r=>r.status()).sort((x,y)=>x-y),
      [200,409],'two browser staff decisions cannot both approve');
     assert.ok((await Promise.all(staffDecisions.map(r=>r.json())))
      .some(r=>r.error==='table_change_request_not_pending'));
     const winningStaff=staffDecisions[0].status()===200?
      httpFixture.waiter:secondWaiterId;
     const losingStaff=staffDecisions[0].status()===409?
      httpFixture.waiter:secondWaiterId;
     assert.notEqual(winningStaff,losingStaff);
     const winningPage=staffDecisions[0].status()===200?
      staffPage:secondStaffPage;
     const losingPage=staffDecisions[0].status()===409?
      staffPage:secondStaffPage;
     await winningPage.getByText('Sin solicitudes pendientes')
      .first().waitFor({timeout:20000});
     await losingPage.getByText('No se pudo decidir la solicitud. Actualiza la lectura antes de reintentar.')
      .waitFor({timeout:20000});
     await staffPage.screenshot({path:rejectJoin(rejectEvidence,
      'b3-two-jwt-waiters-decision-browser-a.png'),fullPage:true});
     await secondStaffPage.screenshot({path:rejectJoin(rejectEvidence,
      'b3-two-jwt-waiters-decision-browser-b.png'),fullPage:true});
     await secondStaffPage.evaluate(()=>window.__saboraCiDispose());
     const opposed=await http.inject({method:'POST',url:staffDecisionUrl,
      headers:staffDecisionHeaders,
      payload:{requestId:fourth.id,decision:'rejected'}});
     assert.equal(opposed.statusCode,409,
      'a later contradictory rejection cannot overwrite approval');
     const grantBefore=(await admin.query(`SELECT q.status,q.created_at,q.expires_at,
      q.decided_at,q.decided_by,q.consumed_at,b.table_id,a.outstanding_cents,
      clock_timestamp() AS server_now
      FROM sabora.customer_table_change_requests q
      JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
      JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
      [fourth.id])).rows[0];
     assert.equal(grantBefore.status,'approved');
     assert.equal(grantBefore.decided_by,winningStaff,
      'PG17 audit must identify the winning signed staff JWT, not a shared CI identity');
     assert.ok(grantBefore.decided_at<grantBefore.expires_at);
     assert.equal(grantBefore.consumed_at,null);
     assert.equal(grantBefore.table_id,httpFixture.destinationTable);
     assert.equal(grantBefore.outstanding_cents,'3100');
     assert.equal((await admin.query(`SELECT count(*)::int AS n FROM sabora.event_outbox
      WHERE event_type='sabora.table_change.approved' AND aggregate_id=$1`,
      [fourth.id])).rows[0].n,1,'double decision must emit exactly one approval');
     // An approval remains usable after its request-window clock expires;
     // PG17 server time elapses naturally, with NO timestamp fixture edits.
     const untilExpiry=grantBefore.expires_at.getTime()-grantBefore.server_now.getTime();
     assert.ok(untilExpiry>0&&untilExpiry<=90000);
     await new Promise(resolve=>setTimeout(resolve,untilExpiry+1700));
     const grantAfter=(await admin.query(`SELECT q.status,q.expires_at,q.consumed_at,
      q.destination_table_id,b.table_id,a.outstanding_cents,
      clock_timestamp() AS server_now
      FROM sabora.customer_table_change_requests q
      JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
      JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
      [fourth.id])).rows[0];
     assert.ok(grantAfter.server_now>=grantAfter.expires_at);
     assert.equal(grantAfter.status,'approved');
     assert.equal(grantAfter.consumed_at,null);
     assert.equal(grantAfter.destination_table_id,null);
     assert.equal(grantAfter.table_id,httpFixture.destinationTable);
     assert.equal(grantAfter.outstanding_cents,'3100');
     const duplicateGrant=await http.inject({method:'POST',
      url:'/api/v1/customer/table-change/requests',
      headers:requestHeaders,payload:{}});
     assert.equal(duplicateGrant.statusCode,409,
      'an unused approval remains exclusive even after real 90-second expiry');
     // F15 positive completion: use this still-approved grant after >90 s.
     // A second real customer PWA, signed cookie, QR A, quote and checkout
     // execute against the SAME Fastify and PG17 used by the waiter race.
     const grantedPage=await rejectClientContext.newPage();
     try{
      await grantedPage.addInitScript(({id})=>{
       localStorage.setItem('sabora.client.selection.v1',
        JSON.stringify([{itemId:id,name:'Plato de integración',
         priceCents:700,quantity:1}]));
      },{id:itemId});
      await grantedPage.goto('http://127.0.0.1:'+caddr.port+
       '/qr/v1/SABORA/'+httpFixture.sourceTable+'#'+qrToken);
      await grantedPage.getByRole('button',
       {name:'Continuar con la mesa escaneada'}).waitFor({timeout:20000});
      await grantedPage.getByText('Cambio de mesa aprobado').first().waitFor();
      await grantedPage.screenshot({path:rejectJoin(rejectEvidence,
       'b3-f15-approved-after-natural-expiry-mobile.png'),fullPage:true});
      await grantedPage.getByRole('button',
       {name:'Continuar con la mesa escaneada'}).click();
      await grantedPage.getByText('Mesa verificada').waitFor({timeout:20000});
      await grantedPage.getByRole('button',
       {name:'Continuar con el pedido'}).click();
      await grantedPage.getByRole('radio',{name:/Pagar al terminar/}).check();
      let confirmedBody=null;
      grantedPage.on('request',request=>{
       if(new URL(request.url()).pathname==='/api/v1/customer/orders/confirm')
        confirmedBody=request.postDataJSON();
      });
      const finalOrderResponse=grantedPage.waitForResponse(response=>
       new URL(response.url()).pathname==='/api/v1/customer/orders/confirm',
       {timeout:30000});
      await grantedPage.getByRole('button',{name:'Confirmar pedido'}).click();
      const finalOrder=await finalOrderResponse;
      if(finalOrder.status()!==201)throw Error(
       'approved_grant_expired_checkout_failed:'+await finalOrder.text());
      const receipt=await finalOrder.json();
      assert.equal(receipt.status,'confirmed');
      assert.equal(receipt.accountId,httpFixture.sourceAccount);
      await grantedPage.getByText('Pedido confirmado').waitFor({timeout:20000});
      assert.ok(confirmedBody);
      const replay=await grantedPage.evaluate(async input=>{
       const response=await fetch('/api/v1/customer/orders/confirm',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
       return {status:response.status,result:await response.json()};
      },confirmedBody);
      assert.equal(replay.status,200);
      assert.equal(replay.result.status,'replayed');
      assert.equal(replay.result.accountId,httpFixture.sourceAccount);
      const finalState=(await admin.query(`SELECT q.status,q.destination_table_id,
       q.consumed_order_id,b.table_id,a.outstanding_cents,
       (SELECT count(*)::int FROM sabora.order_rounds r WHERE r.account_id=a.id) AS rounds,
       (SELECT count(*)::int FROM sabora.customer_accounts c
        WHERE c.customer_id=a.customer_id) AS accounts
       FROM sabora.customer_table_change_requests q
       JOIN sabora.customer_account_operational_bindings b ON b.account_id=q.account_id
       JOIN sabora.customer_accounts a ON a.id=q.account_id WHERE q.id=$1`,
       [fourth.id])).rows[0];
      assert.equal(finalState.status,'consumed');
      assert.equal(finalState.destination_table_id,httpFixture.sourceTable);
      assert.equal(finalState.consumed_order_id,receipt.orderId);
      assert.equal(finalState.table_id,httpFixture.sourceTable);
      assert.equal(finalState.outstanding_cents,'3800');
      assert.equal(finalState.rounds,3);
      assert.equal(finalState.accounts,1);
      const histories=(await admin.query(`SELECT o.table_id,r.account_id
       FROM sabora.orders o JOIN sabora.order_rounds r ON r.order_id=o.id
       WHERE r.account_id=$1 ORDER BY o.confirmed_at,o.id`,
       [httpFixture.sourceAccount])).rows;
      assert.equal(histories.length,3,'two transfers preserve three rounds');
      assert.ok(histories.some(row=>row.table_id===httpFixture.destinationTable),
       'intermediate B order keeps historical B origin');
      assert.ok(histories.every(row=>row.account_id===httpFixture.sourceAccount));
      await grantedPage.screenshot({path:rejectJoin(rejectEvidence,
       'b3-f15-confirmed-grant-after-natural-expiry-mobile.png'),fullPage:true});
     }finally{await grantedPage.close();}
     // Revoking the customer session while its SSE connection is still open
     // must cut off event access, fail closed in the PWA and reject the next
     // HTTP operation. The HTTP authentication fixture intentionally accepts
     // this cookie; denial must come from the real sealed PG17 boundary.
     await admin.query(`UPDATE sabora.customer_sessions SET
      revoked_at=clock_timestamp() WHERE customer_id=$1
      AND revoked_at IS NULL`,[httpFixture.customer]);
     await rejectingCustomerPage.getByText('No se puede comprobar el cambio de mesa')
      .waitFor({timeout:20000});
     const revokedState=await http.inject({
      method:'GET',url:'/api/v1/customer/table-change/state',headers:requestHeaders
     });
     assert.equal(revokedState.statusCode,403);
     const revokedRequest=await http.inject({
      method:'POST',url:'/api/v1/customer/table-change/requests',
      headers:requestHeaders,payload:{}
     });
     assert.equal(revokedRequest.statusCode,403);
     assert.equal((await admin.query(`SELECT b.table_id,a.outstanding_cents
      FROM sabora.customer_accounts a JOIN
      sabora.customer_account_operational_bindings b ON b.account_id=a.id
      WHERE a.id=$1`,[httpFixture.sourceAccount])).rows[0].table_id,
      httpFixture.sourceTable,
      'new B-to-A confirmation remains committed after revocation');
     assert.deepEqual(rejectedClientErrors,[]);
     await staffPage.evaluate(()=>window.__saboraCiDispose());
    }finally{
     if(rejectClientContext)await rejectClientContext.close();
     if(rejectOfflineContext)await rejectOfflineContext.close();
     if(rejectStaffContext)await rejectStaffContext.close();
     if(rejectSecondStaffContext)await rejectSecondStaffContext.close();
     if(rejectBrowser)await rejectBrowser.close();
     if(rejectVite)await rejectVite.close();
     if(rejectManageVite)await rejectManageVite.close();
    }

   }finally{
    await fixture.query('ROLLBACK').catch(()=>{});
    fixture.release();
    // The PG17 acceptance harness creates and destroys this entire database.
    // Do not manually delete a committed business fixture here: order-round
    // foreign keys and trigger-created dependents make ad hoc teardown unsafe.
    // The harness's disposable database is the isolation/cleanup boundary.
   }
   const invalidPayload=await http.inject({method:'POST',
    url:'/api/v1/customer/table-change/requests',
    headers:{cookie:'__Secure-sabora_customer='+ 's'.repeat(43),
     'content-type':'application/json'},
    payload:{destinationTableId:ids.destinationTable}});
   assert.equal(invalidPayload.statusCode,400);
   for(let index=0;index<connections.length;index++){
    const role=(await connections[index].query('SELECT current_user,session_user')).rows[0];
    assert.equal(role.current_user,specs[index].login);
    assert.equal(role.session_user,specs[index].login);
   }
  // The same signed staff JWT must cease authorizing operations as soon
  // as PostgreSQL records staff revocation, without JWT expiration or re-login.
  const staffBefore=(await admin.query(
   'SELECT role,state FROM sabora.staff_members WHERE user_id=$1',
   ['b0a00000-0000-4000-8000-000000000307'])).rows[0];
  assert.deepEqual(staffBefore,{role:'waiter',state:'active'});
  const accountBefore=(await admin.query(
   'SELECT b.table_id,a.outstanding_cents FROM sabora.customer_account_operational_bindings b JOIN sabora.customer_accounts a ON a.id=b.account_id WHERE a.id=$1',
   ['b0a00000-0000-4000-8000-000000000306'])).rows[0];
  const revokeStaff=await admin.query(
   "UPDATE sabora.staff_members SET state='revoked' WHERE user_id=$1",
   ['b0a00000-0000-4000-8000-000000000307']);
  assert.equal(revokeStaff.rowCount,1);
  for(const input of [
   {method:'GET',url:'/api/v1/operations/table-change/pending',
    headers:ciVerifiedStaffHeaders()},
   {method:'POST',url:'/api/v1/operations/table-change/decisions',
    headers:{...ciVerifiedStaffHeaders(),'content-type':'application/json'},
    payload:{requestId:'b0a00000-0000-4000-8000-000000000001',decision:'approved'}}
  ]){
   const response=await http.inject(input);
   assert.equal(response.statusCode,403,
    'revoked waiter cannot reuse a valid JWT for staff business operations');
  }
  // Removing waiter A must not revoke waiter B or grant kitchen permissions.
  // Both JWTs were signed with the same trusted key and authenticated at
  // runtime; business authorization must follow CURRENT per-user PG17 state.
  const survivingWaiterQueue=await http.inject({method:'GET',
   url:'/api/v1/operations/table-change/pending',
   headers:ciSecondWaiterHeaders()});
  assert.equal(survivingWaiterQueue.statusCode,200,survivingWaiterQueue.body);
  for(const jwt of [jwtKitchen,jwtCustomer]){
   const forbiddenRole=await http.inject({method:'GET',
    url:'/api/v1/operations/table-change/pending',
    headers:{authorization:'Bearer '+jwt}});
   assert.equal(forbiddenRole.statusCode,403,
    'a valid signed JWT without active waiter/admin membership cannot inspect the queue');
  }
  const peerRevoke=await admin.query(
   "UPDATE sabora.staff_members SET state='revoked' WHERE user_id=$1",
   [secondWaiterId]);
  assert.equal(peerRevoke.rowCount,1);
  for(const headers of [ciVerifiedStaffHeaders(),ciSecondWaiterHeaders()]){
   const deniedAfterRevoke=await http.inject({method:'GET',
    url:'/api/v1/operations/table-change/pending',headers});
   assert.equal(deniedAfterRevoke.statusCode,403,
    'both individual JWTs must be denied immediately after their own SQL revocation');
  }
  const accountAfter=(await admin.query(
   'SELECT b.table_id,a.outstanding_cents FROM sabora.customer_account_operational_bindings b JOIN sabora.customer_accounts a ON a.id=b.account_id WHERE a.id=$1',
   ['b0a00000-0000-4000-8000-000000000306'])).rows[0];
  assert.deepEqual(accountAfter,accountBefore,
   'revoked staff may not mutate any existing economic account');

  // F21/R06: a genuinely fresh table follows the entire approved 300-second
  // window on the PostgreSQL server clock. No synthetic dispatch, adjusted
  // grouping_deadline, forced first_confirmed_at, virtual clock or test HTTP
  // route. The same real client PWA confirms first/grouped/late orders.
  if(process.env.SABORA_CI_F21_FULL_WINDOW==='true'){
   const {pathToFileURL,fileURLToPath}=await import('node:url');
   const ciRequire=createRequire(new URL('../../apps/client/package.json',import.meta.url));
   const {createServer}=await import(pathToFileURL(ciRequire.resolve('vite')).href);
   const {chromium}=await import(pathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
   const {mkdir}=await import('node:fs/promises');
   const {join}=await import('node:path');
   if(!http.server.listening)await http.listen({host:'127.0.0.1',port:0});
   const clientVite=await createServer({
    root:fileURLToPath(new URL('../../apps/client/',import.meta.url)),
    mode:'test',logLevel:'error',
    server:{host:'127.0.0.1',port:0,strictPort:false,
     proxy:{'/api':{target:'http://127.0.0.1:'+http.server.address().port,
      changeOrigin:false}}}
   });
   let browser=null,notifier=null;
   const schedulers=[],naturalErrors=[],dispatchedIds=new Set(),dispatchWaiters=new Map();
   const evidence=join(process.env.RUNNER_TEMP,'sabora-h6-acceptance');
   await mkdir(evidence,{recursive:true});
   try{
    await clientVite.listen();
    const origin='http://127.0.0.1:'+clientVite.httpServer.address().port;
    browser=await chromium.launch({headless:true});
    const freshQr='Q'.repeat(42)+'A';
    const confirmFromPwa=async(step,{retain=false}={})=>{
     const context=await browser.newContext({viewport:{width:390,height:844},
      reducedMotion:'reduce',serviceWorkers:'block'});
     let retained=false;
     try{
      await context.addCookies([{name:'__Secure-sabora_customer',
       value:naturalGroupingDiner.token,domain:'127.0.0.1',path:'/',
       secure:true,httpOnly:true,sameSite:'Lax'}]);
      await context.addInitScript(id=>{
       localStorage.setItem('sabora.client.selection.v1',JSON.stringify([{
        itemId:id,name:'Plato de integración',priceCents:700,quantity:1
       }]));
      },'b0a00000-0000-4000-8000-000000000330');
      const page=await context.newPage();
      page.on('pageerror',error=>naturalErrors.push(error.message));
      await page.goto(origin+'/qr/v1/SABORA/'+httpFixture.naturalTable+'#'+freshQr);
      // A new customer has no open origin account and needs no change-of-
      // table approval. The approved QR flow authorizes the table directly.
      // The 'Continuar con la mesa escaneada' action belongs exclusively to
      // an already approved A->B change, not to initial registration/rescan.
      try{await page.getByText('Mesa verificada').waitFor({timeout:20000});}
      catch(error){
       const body=(await page.locator('body').innerText()).slice(-1500);
       throw Error('f21_initial_qr_authorization_failed:'+step+':'+body+
        ':pageErrors='+JSON.stringify(naturalErrors),{cause:error});
      }
      await page.getByRole('button',{name:'Continuar con el pedido'}).click();
      await page.getByRole('radio',{name:/Pagar al terminar/}).check();
      const confirmation=page.waitForResponse(response=>
       new URL(response.url()).pathname==='/api/v1/customer/orders/confirm',
       {timeout:20000});
      await page.getByRole('button',{name:'Confirmar pedido'}).click();
      const response=await confirmation;
      assert.equal(response.status(),201,step+': '+await response.text());
      const receipt=await response.json();
      assert.equal(receipt.status,'confirmed');
      assert.equal(receipt.paymentMode,'pay_at_end');
      assert.equal(receipt.amountCents,700);
      assert.equal(receipt.roundState,'grouping');
      await page.getByText('Pedido confirmado').waitFor({timeout:20000});
      await page.screenshot({path:join(evidence,'f21-five-minutes-'+step+'-mobile.png'),
       fullPage:true});
      if(retain){retained=true;return {receipt,page,context};}
      return receipt;
     }finally{if(!retained)await context.close();}
    };
    const firstUi=await confirmFromPwa('first',{retain:true});
    const first=firstUi.receipt;
    const firstRow=(await admin.query(`SELECT r.grouping_deadline,
     o.grouping,t.first_confirmed_at,t.grouping_window_seconds,
     r.account_id,r.state,k.state AS dispatch_state
     FROM sabora.order_rounds r
     JOIN sabora.orders o ON o.id=r.order_id
     JOIN sabora.dining_tables t ON t.id=o.table_id
     JOIN sabora.kitchen_dispatches k ON k.round_id=r.id
     WHERE r.id=$1`,[first.roundId])).rows[0];
    assert.equal(firstRow.grouping,'first');
    assert.equal(firstRow.grouping_window_seconds,300,
     'production policy is five actual minutes, not a test-shortened window');
    assert.equal(firstRow.grouping_deadline.getTime()-
     firstRow.first_confirmed_at.getTime(),300000);
    assert.equal(firstRow.dispatch_state,'blocked');
    const revisionBodies=[];
    firstUi.page.on('request',request=>{
     if(request.method()==='POST'&&new URL(request.url()).pathname===
        '/api/v1/customer/orders/'+first.orderId+'/revisions')
      revisionBodies.push(request.postDataJSON());
    });
    const revisionReadResponse=firstUi.page.waitForResponse(response=>
     response.request().method()==='GET'&&new URL(response.url()).pathname===
      '/api/v1/customer/orders/'+first.orderId+'/revision',{timeout:20000});
    const catalogRefreshResponse=firstUi.page.waitForResponse(response=>
     response.request().method()==='GET'&&new URL(response.url()).pathname===
      '/api/v1/catalog',{timeout:20000});
    const soldOut=await http.inject({method:'POST',
     url:'/api/v1/operations/catalog/items/b0a00000-0000-4000-8000-000000000330/availability',
     headers:{authorization:'Bearer '+jwtKitchen,'content-type':'application/json'},
     payload:{soldOut:true,correlationId:'f21_catalog_sold_out_first'}});
    assert.equal(soldOut.statusCode,200,soldOut.body);
    assert.equal(soldOut.json().soldOut,true);
    await firstUi.page.getByRole('dialog',{name:'Corregir pedido'}).waitFor({timeout:20000});
    const [revisionRead,catalogRefresh]=await Promise.all([
     revisionReadResponse,catalogRefreshResponse]);
    assert.equal(revisionRead.status(),200,await revisionRead.text());
    assert.equal(catalogRefresh.status(),200,await catalogRefresh.text());
    const revisionReadBody=await revisionRead.json();
    assert.equal(revisionReadBody.state,'invalidated');
    assert.equal(revisionReadBody.lines[0].itemName,'Plato de integración');
    assert.equal(revisionReadBody.lines[0].affected,true);
    await firstUi.page.getByRole('combobox',
     {name:'Alternativa para Plato de integración'}).selectOption(
      'b0a00000-0000-4000-8000-000000000331');
    const firstRevisionResponse=firstUi.page.waitForResponse(response=>
     new URL(response.url()).pathname===
      '/api/v1/customer/orders/'+first.orderId+'/revisions');
    await firstUi.page.getByRole('button',{name:'Reenviar pedido'}).click();
    const acceptanceResponse=await firstRevisionResponse;
    assert.equal(acceptanceResponse.status(),409);
    const acceptance=await acceptanceResponse.json();
    assert.equal(acceptance.error,'revision_acceptance_required');
    assert.equal(acceptance.changes[0].previousTotalCents,700);
    assert.equal(acceptance.changes[0].currentTotalCents,600);
    assert.equal(acceptance.changes[0].differenceCents,-100,
     'a lower price still requires explicit consent');
    await firstUi.page.getByText('Revisión económica').waitFor();
    await firstUi.page.screenshot({path:join(evidence,
     'f21-revision-economic-consent-mobile.png'),fullPage:true});
    assert.equal(revisionBodies.length,1);
    const acceptedBody={...revisionBodies[0],acceptanceToken:acceptance.acceptanceToken};
    const acceptedRevisionRequest=request=>{
     if(request.method()!=='POST'||new URL(request.url()).pathname!==
        '/api/v1/customer/orders/'+first.orderId+'/revisions')return false;
     try{return request.postDataJSON()?.acceptanceToken===acceptance.acceptanceToken;}
     catch{return false;}
    };
    // Start the direct replay only once Chromium has emitted the accepted
    // request. This preserves real overlap at the HTTP/SQL boundary without
    // allowing the injected request to finish before the browser click has
    // even been dispatched. Attach both Playwright waiters immediately so a
    // slow action cannot turn their timeout into an unhandled rejection.
    const acceptedRequest=firstUi.page.waitForRequest(acceptedRevisionRequest,
     {timeout:20000});
    const concurrentReplay=acceptedRequest.then(()=>http.inject({method:'POST',
     url:'/api/v1/customer/orders/'+first.orderId+'/revisions',
     headers:{cookie:'__Secure-sabora_customer='+naturalGroupingDiner.token,
      'content-type':'application/json'},payload:acceptedBody}));
    const uiAccepted=Promise.all([
     firstUi.page.waitForResponse(response=>
      acceptedRevisionRequest(response.request()),{timeout:60000}),
     firstUi.page.getByRole('button',{name:'Reenviar pedido'}).click()
    ]).then(([response])=>response);
    const [uiCorrection,directReplay]=await Promise.all([uiAccepted,concurrentReplay]);
    assert.deepEqual([uiCorrection.status(),directReplay.statusCode].sort(),[200,201],
     'concurrent same-key resubmission must commit once and replay once');
    assert.equal(revisionBodies.length,2,
     'the accepted correction must originate from the real client PWA');
    await firstUi.page.getByRole('dialog',{name:'Corregir pedido'}).waitFor({state:'hidden'});
    const revisionState=(await admin.query(`SELECT r.id AS round_id,r.account_id,
     r.revision_number,r.amount_cents,r.grouping_deadline,r.state AS round_state,
     d.id AS dispatch_id,d.revision_number AS dispatch_revision,d.state AS dispatch_state,
     (SELECT count(*)::int FROM sabora.orders o2 WHERE o2.id=$1) AS same_order,
     (SELECT count(*)::int FROM sabora.order_revisions v WHERE v.order_id=$1) AS revisions,
     (SELECT count(*)::int FROM sabora.order_revision_requests q WHERE q.order_id=$1) AS requests,
     (SELECT outstanding_cents FROM sabora.customer_accounts a WHERE a.id=r.account_id) AS debt
     FROM sabora.order_rounds r JOIN sabora.kitchen_dispatches d ON d.round_id=r.id
     WHERE r.order_id=$1`,[first.orderId])).rows[0];
    assert.equal(revisionState.round_id,first.roundId);
    assert.equal(revisionState.account_id,first.accountId);
    assert.equal(revisionState.revision_number,2);
    assert.equal(revisionState.amount_cents,'600');
    assert.ok(revisionState.grouping_deadline.getTime()<firstRow.grouping_deadline.getTime(),
     'correction makes the existing round immediately due without a second window');
    assert.ok(revisionState.grouping_deadline.getTime()<=Date.now()+1000);
    assert.equal(revisionState.round_state,'dispatch_requested');
    assert.equal(revisionState.dispatch_revision,2);
    assert.equal(revisionState.dispatch_state,'requested');
    assert.equal(revisionState.same_order,1);
    assert.equal(revisionState.revisions,2);
    assert.equal(revisionState.requests,1);
    assert.equal(revisionState.debt,'600');
    const immutable=(await admin.query(`SELECT v.revision_number,v.state,v.amount_cents,
     v.economic_snapshot->'lines'->0->'evidence'->>'itemName' AS item,
     (SELECT count(*)::int FROM sabora.order_lines l WHERE l.order_id=v.order_id
       AND l.revision_number=v.revision_number AND l.is_current_revision) AS current_lines
     FROM sabora.order_revisions v WHERE v.order_id=$1 ORDER BY v.revision_number`,
     [first.orderId])).rows;
    assert.deepEqual(immutable,[
     {revision_number:1,state:'invalidated',amount_cents:'700',
      item:'Plato de integración',current_lines:0},
     {revision_number:2,state:'dispatch_requested',amount_cents:'600',
      item:'Alternativa de temporada',current_lines:1}
    ]);
    const kitchenBoard=await http.inject({method:'GET',
     url:'/api/v1/operations/order-lines?status=confirmed&limit=100',
     headers:{authorization:'Bearer '+jwtKitchen}});
    assert.equal(kitchenBoard.statusCode,200,kitchenBoard.body);
    const currentBoard=kitchenBoard.json().items.filter(item=>item.orderId===first.orderId);
    assert.equal(currentBoard.length,1);
    assert.equal(currentBoard[0].name,'Alternativa de temporada',
     'only the current dispatched revision may reach kitchen');
    const foreignRevision=await http.inject({method:'GET',
     url:'/api/v1/customer/orders/'+first.orderId+'/revision?tableId='+
      httpFixture.sourceTable+'&visitId='+httpFixture.sourceVisit,
     headers:{cookie:'__Secure-sabora_customer='+'s'.repeat(43)}});
    assert.equal(foreignRevision.statusCode,403,
     'another customer and table cannot read the revision');
    const restore=await http.inject({method:'POST',
     url:'/api/v1/operations/catalog/items/b0a00000-0000-4000-8000-000000000330/availability',
     headers:{authorization:'Bearer '+jwtKitchen,'content-type':'application/json'},
     payload:{soldOut:false,correlationId:'f21_catalog_restore_first'}});
    assert.equal(restore.statusCode,200,restore.body);
    await firstUi.context.close();
    const grouped=await confirmFromPwa('grouped');
    const groupedRow=(await admin.query(`SELECT r.grouping_deadline,
     o.grouping,k.state AS dispatch_state,r.account_id FROM sabora.order_rounds r
     JOIN sabora.orders o ON o.id=r.order_id
     JOIN sabora.kitchen_dispatches k ON k.round_id=r.id
     WHERE r.id=$1`,[grouped.roundId])).rows[0];
    assert.equal(groupedRow.grouping,'grouped');
    assert.equal(groupedRow.grouping_deadline.getTime(),
     firstRow.grouping_deadline.getTime(),'grouping cannot extend the first deadline');
    assert.equal(groupedRow.account_id,firstRow.account_id);
    assert.equal(groupedRow.dispatch_state,'blocked');
    const cashBefore=(await admin.query(`SELECT outstanding_cents,state
     FROM sabora.customer_accounts WHERE id=$1`,[first.accountId])).rows[0];
    assert.equal(cashBefore.outstanding_cents,'1300');
    assert.equal(cashBefore.state,'open');
    const eventCount=async()=>Number((await admin.query(`SELECT count(*)::int AS n
     FROM sabora.event_outbox e
     JOIN sabora.kitchen_dispatches d ON d.id=e.aggregate_id
     WHERE e.event_type='sabora.kitchen.dispatch_requested'
     AND d.round_id=ANY($1::uuid[])`,
     [[first.roundId,grouped.roundId]])).rows[0].n);
    // No worker may dispatch a 300-second round early.
    const listenerFailures=[];
    let listenerBackend=null,beforeRestart=null;
    const liveListener=await createPostgresH6OutboxNotifier({
     pool:{connect:async()=>{
      const client=await pools[8].connect();
      listenerBackend=client.processID;
      return client;
     }},
     onLost:error=>{
      listenerFailures.push(error.message);
      // The production candidate also shuts down its scheduler on lost
      // connection. Its reactivation requires explicit operator startup.
      if(beforeRestart)void beforeRestart.close();
     }
    });
    notifier=liveListener;
    const createScheduler=()=>createH6DeferredDispatchScheduler({
     listSchedulable:opts=>h6Provider.listSchedulable(opts),
     dispatchDue:async({orderId})=>{
      const result=await h6Provider.requestDueCapture({orderId});
      assert.equal(result.action,'dispatch',
       'natural-window cash rounds cannot initiate an unobserved Stripe capture');
      dispatchedIds.add(orderId);
      dispatchWaiters.get(orderId)?.();
      return result;
     },
     subscribeCommitted:notifier.subscribe,
     onFailure:error=>naturalErrors.push('dispatch:'+error.message)
    });
    beforeRestart=createScheduler();
    schedulers.push(beforeRestart);
    await beforeRestart.start();
    assert.equal(await eventCount(),1,
     'only the explicitly corrected revision may ship before the natural deadline');
    assert.ok(Number.isSafeInteger(listenerBackend)&&listenerBackend>0);
    // Kill ONLY the dedicated disposable PG17 LISTEN backend: the server must
    // signal loss once and fail closed, not leave a silent "healthy" worker.
    const terminated=await admin.query('SELECT pg_terminate_backend($1) AS killed',
     [listenerBackend]);
    assert.equal(terminated.rows[0].killed,true);
    for(let tries=0;tries<100&&listenerFailures.length===0;tries++)
     await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual(listenerFailures,['h6_outbox_notification_connection_lost']);
    await beforeRestart.close();
    await liveListener.close(); // already lost: no duplicate release
    assert.throws(()=>liveListener.subscribe(()=>{}),/invalid_h6_outbox_subscription/);
    assert.equal(await eventCount(),1);
    // The next service instance creates its own LISTEN connection. Old
    // messages need not survive: durable SQL deadlines are authoritative.
    notifier=await createPostgresH6OutboxNotifier({pool:pools[8]});
    const server=(await admin.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const until=firstRow.grouping_deadline.getTime()-server.getTime();
    assert.ok(until>240000&&until<=300000,
     'a fresh first order must retain most of its real five-minute window');
    await new Promise(resolve=>setTimeout(resolve,until+350));
    assert.equal(await eventCount(),1,
     'without the service, due work is durable but never pretends to be delivered');
    // Two independently scheduled workers race the SAME PG17 row locks.
    // Only the sealed function can transition each durable dispatch once.
    const a=createScheduler(),b=createScheduler();
    schedulers.push(a,b);
    await Promise.all([a.start(),b.start()]);
    const historic=(await admin.query(`SELECT r.order_id,r.account_id,
     r.state,k.id AS dispatch_id,k.state AS dispatch_state
     FROM sabora.order_rounds r
     JOIN sabora.kitchen_dispatches k ON k.round_id=r.id
     WHERE r.id=ANY($1::uuid[]) ORDER BY r.id`,
     [[first.roundId,grouped.roundId]])).rows;
    assert.equal(historic.length,2);
    assert.ok(historic.every(row=>row.state==='dispatch_requested'
     &&row.dispatch_state==='requested'&&row.account_id===first.accountId));
    assert.equal(await eventCount(),2,'two workers may not duplicate dispatch events');
    await Promise.all([a.wake(),b.wake()]);
    assert.equal(await eventCount(),2);
    // A genuinely late checkout gets an already-due deadline and is
    // automatically woken by the COMMITTED outbox, without polling.
    const late=await confirmFromPwa('late');
    const lateRow=(await admin.query(`SELECT o.grouping,r.grouping_deadline,
     r.account_id FROM sabora.order_rounds r JOIN sabora.orders o
     ON o.id=r.order_id WHERE r.id=$1`,[late.roundId])).rows[0];
    assert.equal(lateRow.grouping,'late');
    assert.equal(lateRow.grouping_deadline.getTime(),
     firstRow.grouping_deadline.getTime());
    assert.equal(lateRow.account_id,first.accountId);
    if(!dispatchedIds.has(late.orderId)){
     await Promise.race([
      new Promise(resolve=>dispatchWaiters.set(late.orderId,resolve)),
      new Promise((_,reject)=>setTimeout(()=>
       reject(Error('late_dispatch_committed_wakeup_missing')),10000))
     ]);
    }
    const lateDispatch=(await admin.query(`SELECT k.state,
     r.state AS round_state FROM sabora.kitchen_dispatches k
     JOIN sabora.order_rounds r ON r.id=k.round_id WHERE r.id=$1`,
     [late.roundId])).rows[0];
    assert.equal(lateDispatch.state,'requested');
    assert.equal(lateDispatch.round_state,'dispatch_requested');
    const allIds=[first.orderId,grouped.orderId,late.orderId];
    const dispatches=(await admin.query(`SELECT d.id,d.order_id,d.state,
     o.table_id AS origin,r.account_id FROM sabora.kitchen_dispatches d
     JOIN sabora.order_rounds r ON r.id=d.round_id
     JOIN sabora.orders o ON o.id=r.order_id
     WHERE d.order_id=ANY($1::uuid[])`,[allIds])).rows;
    assert.equal(dispatches.length,3);
    assert.ok(dispatches.every(row=>row.state==='requested'
     &&row.account_id===first.accountId&&row.origin===httpFixture.naturalTable));
    for(const [index,dispatch] of dispatches.entries()){
     const ack=await http.inject({method:'POST',
      url:'/api/v1/operations/dispatches/'+dispatch.id+'/ack',
      headers:{authorization:'Bearer '+jwtKitchen,'content-type':'application/json'},
      payload:{correlationId:'f21_natural_kitchen_ack_'+index}});
     assert.equal(ack.statusCode,200,ack.body);
     assert.equal(ack.json().state,'acknowledged');
    }
    const final=(await admin.query(`SELECT
     (SELECT count(*)::int FROM sabora.order_rounds
      WHERE account_id=$1 AND state='kitchen_acknowledged') AS received,
     (SELECT count(*)::int FROM sabora.event_outbox e
      WHERE e.event_type='sabora.kitchen.dispatch_requested'
      AND e.aggregate_id=ANY($2::uuid[])) AS requested_events,
     (SELECT outstanding_cents FROM sabora.customer_accounts WHERE id=$1) AS debt,
     (SELECT count(*)::int FROM sabora.payment_attempts WHERE account_id=$1) AS attempts`,
     [first.accountId,dispatches.map(row=>row.id)])).rows[0];
    assert.deepEqual(final,{received:3,requested_events:3,debt:'2000',attempts:0},
     'five-minute scheduling must preserve all three orders and account ledger');
    assert.deepEqual(naturalErrors,[]);
   }finally{
    for(const scheduler of schedulers)await scheduler.close();
    if(notifier)await notifier.close();
    if(browser)await browser.close();
    await clientVite.close();
   }
  }
  }finally{await http.close();}

  // M2 cutover acceptance: start the separately opted-in bootstrap over the
  // same clean PG17 instance and physical capability logins. Reuse the broad
  // A→B/Chromium evidence above; do not repeat its natural five-minute wait.
  // This focused pass proves that the selected bootstrap itself uses real
  // cookie auth, catalog SQL and the transfer writer rather than test hooks.
  const m2SourceTable='b0a00000-0000-4000-8000-000000000302';
  await admin.query(`UPDATE sabora.dining_tables SET qr_token_hash=$1,
   qr_version=1,ordering_state='open' WHERE id=$2`,[
   createHash('sha256').update('Q'.repeat(42)+'A').digest(),
   m2SourceTable
  ]);
  await admin.query(`UPDATE sabora.catalog_items SET sold_out=false,withdrawn_at=NULL
   WHERE id='b0a00000-0000-4000-8000-000000000330'`);
  const dormantStripe=Object.freeze({
   authorize:async()=>{throw Error('unexpected_m2_provider_call');},
   capture:async()=>{throw Error('unexpected_m2_provider_call');},
   release:async()=>{throw Error('unexpected_m2_provider_call');},
   refund:async()=>{throw Error('unexpected_m2_provider_call');},
   retrieve:async()=>{throw Error('unexpected_m2_provider_call');}
  });
  const m2Options={
   customer:{catalogReaderPool:pools[13],registrationPool:pools[14],
    sessionPool:pools[15],flowPool:pools[4],allowedOrigin:'https://sabora.example',
    secretKey:'sabora_m2_ephemeral_test_secret_key_32_bytes_minimum',
    expectedCatalogLogin:specs[13].login,expectedRegistrationLogin:specs[14].login,
    expectedSessionLogin:specs[15].login,expectedFlowLogin:specs[4].login},
   tableChange:{customerPool:pools[0],operationsPool:pools[1],
    confirmationPool:pools[2],h6ReadPool:pools[3],pendingPool:pools[5],
    notificationPool:pools[1],expectedCustomerLogin:specs[0].login,
    expectedOperationsLogin:specs[1].login,expectedConfirmationLogin:specs[2].login,
    expectedH6ReadLogin:specs[3].login,expectedPendingLogin:specs[5].login,
    hashSession:hashCustomerSessionToken},
   staff:{pool:pools[9],expectedLogin:specs[9].login,issuer:ciIssuer,
    getTrustedKeys:async()=>[ciJwk]},
   h4:{operationsPool:pools[11],expectedOperationsLogin:specs[11].login,
    issueTransitionCapability:h4KitchenIssuer,issueReadCapability:h4ReadIssuer},
   h6:{providerPool:pools[7],operationsPool:pools[8],closePool:pools[10],
    eventPool:pools[12],notifierPool:pools[8],expectedProviderLogin:specs[7].login,
    expectedOperationsLogin:specs[8].login,expectedCloseLogin:specs[10].login,
    expectedEventLogin:specs[12].login,stripe:dormantStripe,
    issueStaffCapability:staffIssuer,issueCloseCapability:closeIssuer}
  };
  const m2=await createM2RestaurantCandidate(m2Options);
  try{
   const address=await m2.listen({host:'127.0.0.1',port:0});
   assert.match(address,/^http:\/\/127\.0\.0\.1:[0-9]+$/);
   assert.deepEqual((await m2.app.inject('/health')).json(),{
    status:'ok',service:'sabora-m2-candidate',mode:'opt-in'});
   assert.deepEqual((await m2.app.inject('/ready')).json(),{
    status:'ready',service:'sabora-m2-candidate',mode:'opt-in'});
   const peer=peers[0],cookie='__Secure-sabora_customer='+peer.token;
   const fetchImpl=async(path,init={})=>{
    const response=await m2.app.inject({method:init.method??'GET',url:path,
     headers:{...Object.fromEntries(new Headers(init.headers??{})),
      origin:'https://sabora.example',cookie},payload:init.body});
    return new Response(response.body,{status:response.statusCode,headers:{
     'content-type':response.headers['content-type']??'application/json'}});
   };
   const customerPwa=createCustomerFlowTransport({fetchImpl});
   assert.equal((await customerPwa.session()).publicId,peer.publicId);
   const catalogResponse=await m2.app.inject('/api/v1/catalog');
   assert.equal(catalogResponse.statusCode,200,catalogResponse.body);
   const catalog=catalogResponse.json();
   const item=catalog.find(row=>row.id==='b0a00000-0000-4000-8000-000000000330');
   assert.ok(item,'M2 catalog must come from the restricted PG17 reader');
   const quote=await customerPwa.quote({tableId:m2SourceTable,
    qrToken:'Q'.repeat(42)+'A',visitId:peer.visitKey,basketId:'m2_candidate_basket_0001',
    lines:[{itemId:item.id,selection:{options:{},extras:[]},quantity:1}]});
   const confirmationInput={tableId:m2SourceTable,
    qrToken:'Q'.repeat(42)+'A',visitId:peer.visitKey,basketId:'m2_candidate_basket_0001',
    requestKey:'m2_candidate_request_0001',paymentMode:'pay_at_end',
    lines:[{quoteId:quote.lines[0].quoteId,itemId:item.id,
     selection:{options:{},extras:[]},quantity:1}]};
   const confirmed=await customerPwa.confirm(confirmationInput);
   assert.equal(confirmed.status,'confirmed');
   assert.equal(confirmed.accountId,peer.account,
    'M2 normal confirmation must preserve the existing economic account');
   const replayed=await customerPwa.confirm(confirmationInput);
   assert.equal(replayed.status,'replayed');
   assert.equal(replayed.orderId,confirmed.orderId);
   assert.equal(replayed.accountId,peer.account);
   const m2WaiterId='b0a00000-0000-4000-8000-000000000312';
   const jwtM2Waiter=staffJwt(m2WaiterId);
   await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state)
    VALUES($1,'waiter','active')`,[m2WaiterId]);
   const managementPwa=createAuthenticatedOrderOperationsGateway({
    getAccessToken:async()=>jwtM2Waiter,
    fetchImpl:async(path,options)=>{
     const response=await m2.app.inject({method:options.method,url:path,
      headers:Object.fromEntries(options.headers.entries()),payload:options.body});
     return new Response(response.body,{status:response.statusCode,headers:{
      'content-type':response.headers['content-type']??'application/json'}});
    }});
   assert.ok(Array.isArray(await managementPwa.listPendingTableChanges()));
   await admin.query("UPDATE sabora.staff_members SET state='revoked' WHERE user_id=$1",
    [m2WaiterId]);
   assert.equal((await m2.app.inject({method:'GET',
    url:'/api/v1/operations/table-change/pending',
    headers:{authorization:'Bearer '+jwtM2Waiter}})).statusCode,403,
    'M2 must recheck current SQL staff state and reject a just-revoked JWT');
   managementPwa.revoke();
   assert.equal((await m2.app.inject({method:'GET',url:'/api/v1/operations/order-lines',
    headers:{authorization:'Bearer '+jwtKitchen}})).statusCode,200);
   assert.equal((await m2.app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
    headers:{origin:'https://sabora.example','content-type':'application/json',
     cookie:'__Secure-sabora_customer='+'A'.repeat(43)},payload:confirmationInput})).statusCode,401);
  }finally{
   const first=m2.close(),second=m2.close();
   assert.equal(first,second,'candidate close must be idempotent');
   await first;
   assert.equal(m2.app.server.listening,false);
  }

  // M3 management extends the same M2 composition with two independent
  // least-privileged SQL logins. This is one integrated PG17/API acceptance,
  // not an administrative superuser substitute.
  const m3Failures=[];
  const m3=await createM3RestaurantCandidate({...m2Options,
   observeFailure:error=>m3Failures.push(error),management:{
   tablesPool:pools[16],catalogPool:pools[17],expectedTablesLogin:specs[16].login,
   expectedCatalogLogin:specs[17].login,issueTablesCapability:m3TablesIssuer,
   issueCatalogCapability:m3CatalogIssuer,qr:{
    secret:'sabora_m3_disposable_qr_derivation_secret_32_bytes_minimum',
    origin:'https://sabora.example',restaurantCode:'SABORA_CI'}}});
  try{
   assert.deepEqual((await m3.app.inject('/health')).json(),{
    status:'ok',service:'sabora-m3-candidate',mode:'opt-in'});
   assert.deepEqual((await m3.app.inject('/ready')).json(),{
    status:'ready',service:'sabora-m3-candidate',mode:'opt-in'});
   const adminId='b0a00000-0000-4000-8000-000000000313';
   await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state)
    VALUES($1,'admin','active') ON CONFLICT(user_id) DO UPDATE SET role='admin',state='active'`,[adminId]);
   const jwtAdmin=staffJwt(adminId);
   const m3Fetch=async(path,options={})=>{
    const response=await m3.app.inject({method:options.method??'GET',url:path,
     headers:Object.fromEntries(new Headers(options.headers??{})),payload:options.body});
    if(response.statusCode>=400)
     m3Failures.push(Error(`m3_http_${response.statusCode}_${response.body}`));
    return new Response(response.body,{status:response.statusCode,headers:{
     'content-type':response.headers['content-type']??'application/json'}});
   };
   const management=createM3AuthenticatedManagementGateway({getAccessToken:async()=>jwtAdmin,
    fetchImpl:m3Fetch});
   const m3Operations=createAuthenticatedOrderOperationsGateway({getAccessToken:async()=>jwtAdmin,
    fetchImpl:m3Fetch,reconnectDelayMs:100});
   const createRequest='b0a00000-0000-4000-8000-000000000314';
   const created=await management.manageTable({requestId:createRequest,operation:'create',
    payload:{number:913,capacity:4,description:'Terraza M3'}});
   assert.equal(created.readinessState,'EN_PREPARACION');
   assert.equal(created.orderingState,'closed');
   assert.equal(created.qrEnabled,true);assert.match(created.qrPayload,/^https:\/\/sabora\.example\/qr\/v1\/SABORA_CI\//);
   const replay=await management.manageTable({requestId:createRequest,operation:'create',
    payload:{number:913,capacity:4,description:'Terraza M3'}});
   assert.equal(replay.tableId,created.tableId);assert.equal(replay.qrPayload,created.qrPayload);
   assert.equal(replay.replayed,true);
   await assert.rejects(management.manageTable({requestId:createRequest,operation:'create',
    payload:{number:914,capacity:4,description:'Conflicto'}}),/m3_management_conflict/);
   m3Failures.length=0;
   let listed;
   try{listed=await management.listTables({afterNumber:900,limit:20});}
   catch(error){throw m3Failures.at(-1)??error;}
   assert.equal(listed.version,2);
   assert.equal(listed.items.find(row=>row.id===created.tableId)?.number,913);
   assert.ok(listed.items.every(row=>Object.hasOwn(row,'id')&&!Object.hasOwn(row,'tableId')),
    'HTTP paginated tables must match the exact management PWA projection');
   // A fresh table is not customer-operational merely because its QR was
   // delivered. EN_PREPARACION and occupancy remain distinct server axes.
   const m3CustomerId='b0a00000-0000-4000-8000-000000000317';
   const m3CustomerToken='M'.repeat(43);
   await admin.query(`INSERT INTO sabora.customer_profiles(id,public_id,alias)
    VALUES($1,'SB-WXWXWXWXWXWX','Comensal M3')`,[m3CustomerId]);
   await admin.query(`INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
    VALUES($1,$2,clock_timestamp()+interval '1 hour')`,
    [m3CustomerId,hashCustomerSessionToken(m3CustomerToken)]);
   const customerCookie='__Secure-sabora_customer='+m3CustomerToken;
   const qrToken=new URL(created.qrPayload).hash.slice(1);
   const preReady=await m3.app.inject({method:'POST',url:'/api/v1/customer/visits',
    headers:{origin:'https://sabora.example','content-type':'application/json',cookie:customerCookie},
    payload:{tableId:created.tableId,qrToken}});
   assert.equal(preReady.statusCode,403,'EN_PREPARACION must reject customer visits');
   let current=created;
   // The same idempotency key racing on independent physical connections
   // commits one mutation/audit row and replays the durable result.
   const updateRequest=randomUUID();
   const updateInput={requestId:updateRequest,operation:'update',payload:{tableId:current.tableId,
    expectedRevision:current.revision,number:913,capacity:4,description:'Terraza M3 validada'}};
   const concurrentUpdates=await Promise.all([
    management.manageTable(updateInput),management.manageTable(updateInput)]);
   assert.deepEqual(new Set(concurrentUpdates.map(value=>value.replayed)),new Set([false,true]));
   assert.equal(concurrentUpdates[0].revision,concurrentUpdates[1].revision);
   assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM sabora.management_audit_m3
    WHERE request_id=$1`,[updateRequest])).rows[0].n,1);
   current=concurrentUpdates[0];
   // Normative RF: changing readiness is ordinary table-management work,
   // not an admin-only action; QR rotation and editing stay admin-only.
   const readinessWaiterId=randomUUID();
   await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state)
    VALUES($1,'waiter','active')`,[readinessWaiterId]);
   const waiterManagement=createM3AuthenticatedManagementGateway({
    getAccessToken:async()=>staffJwt(readinessWaiterId),fetchImpl:m3Fetch});
   await assert.rejects(waiterManagement.manageTable({requestId:randomUUID(),
    operation:'qr_revoke',payload:{tableId:current.tableId,
     expectedRevision:current.revision}}),/m3_management_forbidden/,
    'waiter cannot revoke a table QR');
   current=await waiterManagement.manageTable({requestId:randomUUID(),operation:'readiness',
    payload:{tableId:current.tableId,expectedRevision:current.revision,state:'LISTA'}});
   assert.equal(current.readinessState,'LISTA',
    'ordinary management staff may activate preparation without admin role');
   m3Failures.length=0;
   current=await management.transitionOccupancy({requestId:randomUUID(),tableId:current.tableId,
    target:'open',pauseUntil:null});
   // This dedicated identity proves that M3 confirmation creates its first
   // account instead of entering the table-change contract of an older diner.
   const visitReady=await m3.app.inject({method:'POST',url:'/api/v1/customer/visits',
    headers:{origin:'https://sabora.example','content-type':'application/json',cookie:customerCookie},
    payload:{tableId:current.tableId,qrToken}});
   assert.equal(visitReady.statusCode,201,visitReady.body);

   let category=await management.manageCatalog({requestId:randomUUID(),
    operation:'category_create',payload:{categoryId:'b0a00000-0000-4000-8000-000000000315',
     name:'DEGUSTACIÓN',sortOrder:150}});
   category=await management.manageCatalog({requestId:randomUUID(),operation:'category_reorder',
    payload:{categoryId:category.categoryId,expectedRevision:category.revision,sortOrder:140}});
   const administrativeCatalog=await management.readManagementCatalog();
   assert.deepEqual(administrativeCatalog.categories.filter(value=>value.mandatory)
    .map(value=>value.name).sort(),['BEBIDA','ENTRANTE','POSTRE','PRIMERO','SEGUNDO']);
   const mandatoryCategory=administrativeCatalog.categories.find(value=>value.name==='ENTRANTE');
   await assert.rejects(management.manageCatalog({requestId:randomUUID(),operation:'category_visibility',
    payload:{categoryId:mandatoryCategory.id,expectedRevision:mandatoryCategory.revision,hidden:true}}),
    /m3_management_conflict/,'mandatory categories cannot be hidden');
   const itemId='b0a00000-0000-4000-8000-000000000316';
   const m3Draft={name:'Bocado M3',description:'Integración dinámica',imageUrl:null,priceCents:1000,
    allergenIds:[7],allergenStatus:'PENDIENTE_DE_VERIFICAR',options:[{id:'salsa',name:'Salsa',
     required:true,maxSelections:1,values:[{id:'suave',name:'Suave',priceCents:0,
      available:true,allergens:['Leche, incluida la lactosa']}]}],extras:[{id:'trufa',name:'Trufa',
     priceCents:200,available:true,allergens:['Leche, incluida la lactosa']}],
    discount:{type:'percent',basisPoints:2000}};
   let itemResult=await management.manageCatalog({requestId:randomUUID(),operation:'item_save',
    payload:{itemId,expectedRevision:0,categoryId:category.categoryId,draft:m3Draft}});
   assert.equal((await m3.app.inject('/api/v1/catalog')).json().some(row=>row.id===itemId),false,
    'saving a draft must not publish it');
   await assert.rejects(management.manageCatalog({requestId:randomUUID(),operation:'item_publish',
    payload:{itemId,expectedRevision:itemResult.draftRevision}}),/m3_management_conflict/,
    'unverified allergen declarations must not publish');
   itemResult=await management.manageCatalog({requestId:randomUUID(),operation:'item_save',
    payload:{itemId,expectedRevision:itemResult.draftRevision,categoryId:category.categoryId,
     draft:{...m3Draft,allergenStatus:'VERIFICADA'}}});
   itemResult=await management.manageCatalog({requestId:randomUUID(),operation:'item_publish',
    payload:{itemId,expectedRevision:itemResult.draftRevision}});
   assert.equal(itemResult.publishedRevision,itemResult.draftRevision);
   const publicCatalog=(await m3.app.inject('/api/v1/catalog')).json();
   const publicItem=publicCatalog.find(row=>row.id===itemId);
   assert.equal(publicItem.category,'DEGUSTACIÓN');assert.equal(publicItem.options[0].id,'salsa');
   assert.equal(publicItem.extras[0].id,'trufa');
   assert.deepEqual(publicItem.allergenDeclaration,{status:'VERIFICADA',taxonomyVersion:1,ids:[7]});
   assert.equal(JSON.stringify(publicItem).includes('verifiedBy'),false);
   await m3Operations.setCatalogSoldOut({itemId,soldOut:true,correlationId:'m3_sold_out_0001'});
   assert.equal((await m3.app.inject('/api/v1/catalog')).json()
    .find(row=>row.id===itemId).available,false,'sold-out item remains visible but unavailable');
   await m3Operations.setCatalogSoldOut({itemId,soldOut:false,correlationId:'m3_sold_out_0002'});
   assert.equal((await m3.app.inject('/api/v1/catalog')).json()
    .find(row=>row.id===itemId).available,true);
   const visit=visitReady.json();
   const customerFetch=async(path,init={})=>{
    const response=await m3.app.inject({method:init.method??'GET',url:path,
     headers:{...Object.fromEntries(new Headers(init.headers??{})),origin:'https://sabora.example',
      cookie:customerCookie},payload:init.body});
    return new Response(response.body,{status:response.statusCode,headers:{
     'content-type':response.headers['content-type']??'application/json'}});
   };
   const m3Customer=createCustomerFlowTransport({fetchImpl:customerFetch});
   const m3Quote=await m3Customer.quote({tableId:current.tableId,qrToken,
    visitId:visit.visitId,basketId:visit.basketId,lines:[{itemId,
     selection:{options:{salsa:['suave']},extras:['trufa']},quantity:1}]});
   assert.equal(m3Quote.lines[0].totalCents,960,'20% discount applies to dish plus extra');
   const m3Confirmation={tableId:current.tableId,qrToken,visitId:visit.visitId,
    basketId:visit.basketId,requestKey:'m3_dynamic_order_0001',paymentMode:'pay_at_end',
    lines:[{quoteId:m3Quote.lines[0].quoteId,itemId,
     selection:{options:{salsa:['suave']},extras:['trufa']},quantity:1}]};
   const m3Confirmed=await m3Customer.confirm(m3Confirmation);
   const m3Replayed=await m3Customer.confirm(m3Confirmation);
   assert.equal(m3Replayed.status,'replayed');assert.equal(m3Replayed.orderId,m3Confirmed.orderId);
   const line=(await admin.query(`SELECT category FROM sabora.order_lines
    WHERE order_id=$1 AND is_current_revision ORDER BY line_number`,[m3Confirmed.orderId])).rows[0];
   assert.equal(line.category,'DEGUSTACIÓN');
   category=await management.manageCatalog({requestId:randomUUID(),operation:'category_visibility',
    payload:{categoryId:category.categoryId,expectedRevision:category.revision,hidden:true}});
   assert.equal((await m3.app.inject('/api/v1/catalog')).json().some(row=>row.id===itemId),false,
    'hiding a custom category hides its published items');
   category=await management.manageCatalog({requestId:randomUUID(),operation:'category_visibility',
    payload:{categoryId:category.categoryId,expectedRevision:category.revision,hidden:false}});
   assert.equal((await m3.app.inject('/api/v1/catalog')).json().some(row=>row.id===itemId),true);
   let blocked=await management.manageTable({requestId:randomUUID(),operation:'readiness',
    payload:{tableId:current.tableId,expectedRevision:current.revision,state:'BLOQUEADA'}});
   await assert.rejects(m3Customer.quote({tableId:current.tableId,qrToken,
    visitId:visit.visitId,basketId:visit.basketId,lines:[{itemId,
     selection:{options:{salsa:['suave']},extras:['trufa']},quantity:1}]}),
    /customer_context_forbidden/,
    'BLOQUEADA must reject a new quote without altering the completed order');
   current=await management.manageTable({requestId:randomUUID(),operation:'readiness',
    payload:{tableId:current.tableId,expectedRevision:blocked.revision,state:'LISTA'}});
   const rotated=await management.manageTable({requestId:randomUUID(),operation:'qr_rotate',
    payload:{tableId:current.tableId,expectedRevision:current.revision}});
   assert.notEqual(rotated.qrPayload,created.qrPayload);
   const oldVisit=await m3.app.inject({method:'POST',url:'/api/v1/customer/visits',
    headers:{origin:'https://sabora.example','content-type':'application/json',cookie:customerCookie},
    payload:{tableId:current.tableId,qrToken}});
   assert.equal(oldVisit.statusCode,403,'rotated QR must reject new customer authorization');
   const revoked=await management.manageTable({requestId:randomUUID(),operation:'qr_revoke',
    payload:{tableId:current.tableId,expectedRevision:rotated.revision}});
   assert.equal(revoked.qrEnabled,false);
   const underRole=async(connection,role,operation)=>{
    await connection.query('BEGIN');
    try{await connection.query('SET LOCAL ROLE '+role);return await operation();}
    finally{await connection.query('ROLLBACK');}
   };
   const capabilityBody=JSON.stringify({tableId:current.tableId,expectedRevision:revoked.revision,
    number:913,capacity:4,description:'No debe mutar'});
   const capabilityRequest=randomUUID();
   const validCapability=m3TablesIssuer({actorId:adminId,staffRole:'admin',action:'table.update',
    requestId:capabilityRequest,body:capabilityBody});
   await assert.rejects(underRole(connections[16],'sabora_m3_tables_runtime',()=>
    connections[16].query(`SELECT sabora.manage_table_m3_candidate($1::jsonb,$2,$3)`,
     [JSON.stringify(validCapability),'update',capabilityBody.replace('No debe mutar','Manipulado')])),
    /invalid_m3_management_capability/,'a signed capability cannot authorize a changed body');
   const expiredIssuer=createM3ManagementCapabilityIssuer({keyId:cashSigningKeyId,
    secret:cashSigningSecret,databaseRole:specs[16].login,ttlMs:1,clock:()=>Date.now()-1000});
   const expiredCapability=expiredIssuer({actorId:adminId,staffRole:'admin',action:'table.update',
    requestId:randomUUID(),body:capabilityBody});
   await assert.rejects(underRole(connections[16],'sabora_m3_tables_runtime',()=>
    connections[16].query(`SELECT sabora.manage_table_m3_candidate($1::jsonb,$2,$3)`,
     [JSON.stringify(expiredCapability),'update',capabilityBody])),
    /invalid_m3_management_capability/,'expired capability must fail closed');
   const waiterCapability=m3TablesIssuer({actorId:readinessWaiterId,staffRole:'waiter',
    action:'table.update',requestId:randomUUID(),body:capabilityBody});
   await assert.rejects(underRole(connections[16],'sabora_m3_tables_runtime',()=>
    connections[16].query(`SELECT sabora.manage_table_m3_candidate($1::jsonb,$2,$3)`,
     [JSON.stringify(waiterCapability),'update',capabilityBody])),
    /invalid_m3_management_capability/,'waiter capability cannot perform an admin mutation');
   const suspendedCapability=m3TablesIssuer({actorId:adminId,staffRole:'admin',action:'table.update',
    requestId:randomUUID(),body:capabilityBody});
   await admin.query("UPDATE sabora.staff_members SET state='suspended' WHERE user_id=$1",[adminId]);
   try{
    await assert.rejects(underRole(connections[16],'sabora_m3_tables_runtime',()=>
     connections[16].query(`SELECT sabora.manage_table_m3_candidate($1::jsonb,$2,$3)`,
      [JSON.stringify(suspendedCapability),'update',capabilityBody])),
     /invalid_m3_management_capability/,'suspension must invalidate an already issued capability');
   }finally{await admin.query("UPDATE sabora.staff_members SET state='active' WHERE user_id=$1",[adminId]);}
   await assert.rejects(underRole(connections[17],'sabora_m3_catalog_runtime',()=>
    connections[17].query(`SELECT sabora.manage_table_m3_candidate($1::jsonb,$2,$3)`,
     [JSON.stringify(validCapability),'update',capabilityBody])),/permission denied/,
    'catalog runtime cannot execute the table-management surface');
   await assert.rejects(connections[16].query('SELECT * FROM sabora.dining_tables'),/permission denied/);
   await assert.rejects(connections[16].query(
    "UPDATE sabora.customer_table_visits SET revoked_at=clock_timestamp() WHERE table_id=$1",
    [current.tableId]),/permission denied/,
    'physical M3 tables runtime may never revoke visits directly');
   await assert.rejects(connections[17].query('SELECT * FROM sabora.catalog_items'),/permission denied/);
   await management.manageCatalog({requestId:randomUUID(),operation:'item_withdraw',
    payload:{itemId,expectedRevision:itemResult.draftRevision}});
   assert.equal((await m3.app.inject('/api/v1/catalog')).json().some(row=>row.id===itemId),false,
    'withdrawn item must disappear from the public catalog without deleting history');

   // CV-006/CV-007: actual Chromium interaction with BOTH PWAs and the same
   // PG17/Fastify candidate. Playwright forwards requests to real loopback
   // Vite/Fastify HTTP servers; it never fulfills an invented API response.
   // The test-only HTTPS host mapping preserves the exact QR origin/token.
   const {fileURLToPath:m3FileURLToPath,pathToFileURL:m3PathToFileURL}=await import('node:url');
   const {mkdir:m3Mkdir}=await import('node:fs/promises');
   const {join:m3Join}=await import('node:path');
   const m3CiRequire=createRequire(new URL('../../apps/client/package.json',import.meta.url));
   const {createServer:createM3ViteServer}=await import(
    m3PathToFileURL(m3CiRequire.resolve('vite')).href);
   const {chromium:m3Chromium}=await import(
    m3PathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
   const m3ClientVite=await createM3ViteServer({
    root:m3FileURLToPath(new URL('../../apps/client/',import.meta.url)),
    mode:'test',logLevel:'error',
    // Test-only installation code must match the candidate's issued QR V1.
    define:{'import.meta.env.VITE_SABORA_RESTAURANT_CODE':JSON.stringify('SABORA_CI')},
    server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}
   });
   const m3ManagementVite=await createM3ViteServer({
    root:m3FileURLToPath(new URL('../../apps/management/',import.meta.url)),
    mode:'test',logLevel:'error',
    server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}
   });
   let m3Browser=null;
   let m3BrowserClosing=false;
   const m3BrowserErrors=[];
   const m3Evidence=m3Join(process.env.RUNNER_TEMP,'sabora-m3-browser-acceptance');
   await m3Mkdir(m3Evidence,{recursive:true});
   try{
    await m3.app.listen({host:'127.0.0.1',port:0});
    await m3ClientVite.listen();
    await m3ManagementVite.listen();
    const m3BackendOrigin='http://127.0.0.1:'+m3.app.server.address().port;
    const m3ClientOrigin='http://127.0.0.1:'+m3ClientVite.httpServer.address().port;
    const m3ManagementOrigin='http://127.0.0.1:'+m3ManagementVite.httpServer.address().port;
    const mapActualHttp=async(context,publicHost,frontendOrigin)=>{
     await context.route('https://'+publicHost+'/**',async route=>{
      const requested=new URL(route.request().url());
      const upstreamOrigin=requested.pathname.startsWith('/api/')
       ?m3BackendOrigin:frontendOrigin;
      // Playwright route.fetch buffers the entire body. An EventSource stream
      // never finishes: forwarding it with route.fetch cannot supply live SSE
      // and rejects during context teardown. Exclude ONLY streaming requests
      // from this transactional M3 browser journey. The consolidated H6
      // suite has separate real SSE delivery/reconnect coverage. Aborting is
      // explicit, not a fabricated successful API response or SSE acceptance.
      const headers={...route.request().headers(),host:new URL(upstreamOrigin).host};
      if(route.request().resourceType()==='eventsource'||
        String(headers.accept??'').includes('text/event-stream')){
       await route.abort('blockedbyclient');
       return;
      }
      const target=upstreamOrigin+requested.pathname+requested.search;
      try{
       const actual=await route.fetch({url:target,headers,timeout:30000});
       await route.fulfill({response:actual});
      }catch(error){
       // In-flight asset reads can be canceled by deliberate context close.
       // They must never mask a real HTTP failure while the test is active.
       if(m3BrowserClosing&&/Request context disposed|Target closed|Target page, context or browser has been closed/
         .test(String(error)))return;
       throw error;
      }
     });
    };
    m3Browser=await m3Chromium.launch({headless:true});
    const m3StaffContext=await m3Browser.newContext({
     viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
    await mapActualHttp(m3StaffContext,'gestion.sabora.example',m3ManagementOrigin);
    const m3StaffPage=await m3StaffContext.newPage();
    m3StaffPage.on('pageerror',error=>m3BrowserErrors.push('management: '+error.message));
    await m3StaffPage.goto('https://gestion.sabora.example/#catalogo');
    await m3StaffPage.evaluate(async jwt=>{
     const {mountAuthenticatedManagementApp}=await import('/src/main.tsx');
     window.__saboraCiDispose=mountAuthenticatedManagementApp({
      element:document.getElementById('root'),getAccessToken:async()=>jwt,
      enableM3Management:true
     });
    },jwtAdmin);
    await m3StaffPage.getByRole('heading',{name:'Editor de carta'})
     .waitFor({timeout:20000});
    await m3StaffPage.getByRole('textbox',{name:'Nombre de nueva categoría'})
     .fill('BRUNCH E2E');
    await m3StaffPage.getByRole('spinbutton',{name:'Orden de nueva categoría'})
     .fill('170');
    const createdCategoryHttp=m3StaffPage.waitForResponse(response=>
     new URL(response.url()).pathname==='/api/v1/admin/catalog/actions'&&
     response.request().method()==='POST'&&
     response.request().postDataJSON()?.operation==='category_create',{timeout:20000});
    await m3StaffPage.getByRole('button',{name:'Añadir',exact:true}).click();
    const createdCategoryResponse=await createdCategoryHttp;
    assert.equal(createdCategoryResponse.status(),200,await createdCategoryResponse.text());
    await m3StaffPage.getByText('BRUNCH E2E').first().waitFor({timeout:20000});

    await m3StaffPage.getByRole('button',{name:'Nuevo plato'}).click();
    const editor=m3StaffPage.locator('.catalog-editor-form');
    await editor.getByLabel('Nombre',{exact:true}).fill('Brunch de cortesía M3');
    await editor.getByLabel('Descripción').fill('Publicado en Chromium desde gestión');
    await editor.getByLabel('Categoría').selectOption({label:'BRUNCH E2E'});
    await editor.getByLabel('Precio EUR').fill('0,00');
    await editor.locator('fieldset').filter({hasText:'Declaración de alérgenos'})
     .locator('select').selectOption('VERIFICADA');
    const draftHttp=m3StaffPage.waitForResponse(response=>
     new URL(response.url()).pathname==='/api/v1/admin/catalog/actions'&&
     response.request().method()==='POST'&&
     response.request().postDataJSON()?.operation==='item_save',{timeout:20000});
    await editor.getByRole('button',{name:'Guardar borrador'}).click();
    const draftResponse=await draftHttp;
    assert.equal(draftResponse.status(),200,await draftResponse.text());
    const browserItemId=(await draftResponse.json()).itemId;
    assert.ok(browserItemId);
    await editor.getByRole('button',{name:'Publicar'}).waitFor({timeout:20000});
    const publishHttp=m3StaffPage.waitForResponse(response=>
     new URL(response.url()).pathname==='/api/v1/admin/catalog/actions'&&
     response.request().method()==='POST'&&
     response.request().postDataJSON()?.operation==='item_publish',{timeout:20000});
    await editor.getByRole('button',{name:'Publicar'}).click();
    const publishResponse=await publishHttp;
    assert.equal(publishResponse.status(),200,await publishResponse.text());
    const browserPublished=(await m3.app.inject('/api/v1/catalog')).json()
     .find(row=>row.id===browserItemId);
    assert.equal(browserPublished?.category,'BRUNCH E2E');
    assert.equal(browserPublished?.priceCents,0);
    await m3StaffPage.screenshot({path:m3Join(m3Evidence,'management-published.png'),fullPage:true});

    await m3StaffPage.goto('https://gestion.sabora.example/#mesas');
    await m3StaffPage.evaluate(async jwt=>{
     const {mountAuthenticatedManagementApp}=await import('/src/main.tsx');
     window.__saboraCiDispose=mountAuthenticatedManagementApp({
      element:document.getElementById('root'),getAccessToken:async()=>jwt,
      enableM3Management:true
     });
    },jwtAdmin);
    await m3StaffPage.getByRole('heading',{name:'Control de mesas'})
     .waitFor({timeout:20000});
    // Do not mutate while the first authorized table projection is loading.
    await m3StaffPage.getByText(/[0-9]+ cargadas/).first().waitFor({timeout:20000});
    await m3StaffPage.getByRole('button',{name:'Crear mesa'}).click();
    const tableForm=m3StaffPage.locator('.management-inline-form');
    await tableForm.getByLabel('Número').fill('915');
    await tableForm.getByLabel('Capacidad').fill('4');
    await tableForm.getByLabel('Descripción').fill('Mesa real de aceptación Chromium');
    const tableCreateHttp=m3StaffPage.waitForResponse(response=>
     new URL(response.url()).pathname==='/api/v1/admin/tables/actions'&&
     response.request().method()==='POST'&&
     response.request().postDataJSON()?.operation==='create',{timeout:20000});
    await tableForm.getByRole('button',{name:'Crear y emitir QR'}).click();
    const tableCreateResponse=await tableCreateHttp;
    assert.equal(tableCreateResponse.status(),201,await tableCreateResponse.text());
    const browserTable=await tableCreateResponse.json();
    assert.match(browserTable.qrPayload,
     /^https:\/\/sabora\.example\/qr\/v1\/SABORA_CI\//);
    const browserTableId=browserTable.tableId;
    const persistedTable=(await admin.query(
     'SELECT id,number,readiness_state,ordering_state FROM sabora.dining_tables WHERE id=$1',
     [browserTableId])).rows[0];
    assert.equal(persistedTable?.number,915,'HTTP create must persist table 915 before PWA selection');
    try{
     await m3StaffPage.getByRole('button',{name:/Mesa 915/}).first()
      .waitFor({timeout:20000});
    }catch(cause){
     await m3StaffPage.screenshot({path:m3Join(m3Evidence,'management-after-create-failure.png'),fullPage:true});
     const diagnostic={
      persistedTable,
      list:(await m3StaffPage.locator('.table-list-item').allTextContents()).slice(0,35),
      note:await m3StaffPage.locator('.honest-operational-note').allTextContents(),
      loaded:await m3StaffPage.getByText(/[0-9]+ cargadas/).allTextContents(),
      refresh:await m3StaffPage.locator('[role="alert"]').allTextContents(),
      errors:m3BrowserErrors
     };
     throw Error('m3_browser_table_created_but_not_selected:'+JSON.stringify(diagnostic),{cause});
    }
    const readinessHttp=m3StaffPage.waitForResponse(response=>
     new URL(response.url()).pathname==='/api/v1/admin/tables/actions'&&
     response.request().method()==='POST'&&
     response.request().postDataJSON()?.operation==='readiness',{timeout:20000});
    await m3StaffPage.locator('[aria-label="Cambiar preparación de la mesa"]')
     .getByRole('button',{name:'LISTA'}).click();
    const readinessResponse=await readinessHttp;
    assert.equal(readinessResponse.status(),200,await readinessResponse.text());
    const prepared=(await admin.query(
     'SELECT readiness_state FROM sabora.dining_tables WHERE id=$1',
     [browserTableId])).rows[0];
    assert.equal(prepared.readiness_state,'LISTA');
    const openHttp=m3StaffPage.waitForResponse(response=>
     new URL(response.url()).pathname==='/api/v1/admin/tables/'+browserTableId+'/occupancy'&&
     response.request().method()==='POST',{timeout:20000});
    await m3StaffPage.locator('[aria-label="Cambiar estado de la mesa"]')
     .getByRole('button',{name:'ABIERTA'}).click();
    const openResponse=await openHttp;
    assert.equal(openResponse.status(),200,await openResponse.text());
    const opened=(await admin.query(
     'SELECT ordering_state FROM sabora.dining_tables WHERE id=$1',
     [browserTableId])).rows[0];
    assert.equal(opened.ordering_state,'open');
    await m3StaffPage.screenshot({path:m3Join(m3Evidence,'management-table-qr.png'),fullPage:true});

    const browserCustomerId=randomUUID();
    const browserCustomerToken='Y'.repeat(43);
    await admin.query(
     "INSERT INTO sabora.customer_profiles(id,public_id,alias) VALUES($1,$2,$3)",
     [browserCustomerId,'SB-QWERTY234567','Cliente E2E M3']);
    await admin.query(
     "INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",
     [browserCustomerId,hashCustomerSessionToken(browserCustomerToken)]);
    const m3CustomerContext=await m3Browser.newContext({
     viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
    await mapActualHttp(m3CustomerContext,'sabora.example',m3ClientOrigin);
    await m3CustomerContext.addCookies([{name:'__Secure-sabora_customer',
     value:browserCustomerToken,domain:'sabora.example',path:'/',
     secure:true,httpOnly:true,sameSite:'Lax'}]);
    const m3CustomerPage=await m3CustomerContext.newPage();
    m3CustomerPage.on('pageerror',error=>m3BrowserErrors.push('customer: '+error.message));
    await m3CustomerPage.goto('https://sabora.example/');
    assert.equal(await m3CustomerPage.evaluate(async()=>{
     const {configuredRestaurantCode}=await import('/src/table-qr.ts');
     return configuredRestaurantCode();
    }),'SABORA_CI');
    const browserCard=m3CustomerPage.getByTestId('product-card')
     .filter({hasText:'Brunch de cortesía M3'});
    await browserCard.waitFor({timeout:20000});
    await browserCard.getByRole('button',{name:/Añadir$/}).click();
    await m3CustomerPage.goto(browserTable.qrPayload);
    await m3CustomerPage.getByText('Mesa verificada')
     .waitFor({timeout:20000});
    await m3CustomerPage.getByRole('button',{name:'Continuar con el pedido'})
     .click();
    const checkout=m3CustomerPage.getByRole('dialog',{name:'Confirmar pedido'});
    await checkout.getByText('Esta ronda es gratuita y no fija modalidad de pago')
     .waitFor({timeout:20000});
    const customerConfirmHttp=m3CustomerPage.waitForResponse(response=>
     new URL(response.url()).pathname==='/api/v1/customer/orders/confirm'&&
     response.request().method()==='POST',{timeout:20000});
    await checkout.getByRole('button',{name:'Confirmar pedido'}).click();
    const customerConfirmResponse=await customerConfirmHttp;
    assert.equal(customerConfirmResponse.status(),201,await customerConfirmResponse.text());
    const browserOrder=await customerConfirmResponse.json();
    assert.equal(browserOrder.status,'confirmed');
    assert.equal(browserOrder.amountCents,0);
    assert.equal(browserOrder.paymentMode,null);
    await m3CustomerPage.getByText('Pedido confirmado')
     .waitFor({timeout:20000});
    await m3CustomerPage.screenshot({path:m3Join(m3Evidence,'customer-free-confirmed.png'),fullPage:true});

    // End-to-end zero-cost account settlement requires the REAL H6 round
    // to reach kitchen ACK and each line to be READY. Confirmation alone
    // must not settle a live account; delivery/pickup is never fabricated.
    const browserPreKitchen=(await admin.query(
     'SELECT a.id,a.state,a.closed_at,a.payment_mode,a.outstanding_cents FROM sabora.customer_accounts a WHERE a.id=$1',
     [browserOrder.accountId])).rows[0];
    assert.deepEqual({
     state:browserPreKitchen?.state,closed_at:browserPreKitchen?.closed_at,
     payment_mode:browserPreKitchen?.payment_mode,outstanding_cents:browserPreKitchen?.outstanding_cents
    },{state:'open',closed_at:null,payment_mode:null,outstanding_cents:'0'},
    'zero-cost customer checkout must preserve an open reusable account');
    const browserRound=(await admin.query(
     'SELECT id,state FROM sabora.order_rounds WHERE order_id=$1',
     [browserOrder.orderId])).rows[0];
    assert.equal(browserRound?.state,'free_grouping',
     'complimentary H6 rounds await dispatch without selecting a payment mode');
    // Disposable fixture time compression ONLY: F21 separately validates the
    // natural 300-second window; this scenario validates the full business
    // closure chain without inserting a second five-minute delay.
    const due=(await admin.query(
     "UPDATE sabora.order_rounds SET grouping_deadline=clock_timestamp()-interval '1 second' WHERE id=$1 AND state='free_grouping' RETURNING id",
     [browserRound.id])).rows;
    assert.equal(due.length,1);
    const browserDispatch=await h6Provider.requestDueCapture({orderId:browserOrder.orderId});
    assert.equal(browserDispatch.action,'dispatch',
     'due round must dispatch via the restricted H6 provider');
    const kitchenAck=await m3.app.inject({method:'POST',
     url:'/api/v1/operations/dispatches/'+browserDispatch.dispatch_id+'/ack',
     headers:{authorization:'Bearer '+jwtKitchen,'content-type':'application/json'},
     payload:{correlationId:'m3_chromium_zero_cost_kitchen_ack'}});
    assert.equal(kitchenAck.statusCode,200,kitchenAck.body);
    const browserLines=(await admin.query(
     'SELECT id,status FROM sabora.order_lines WHERE order_id=$1 AND is_current_revision ORDER BY line_number',
     [browserOrder.orderId])).rows;
    assert.equal(browserLines.length,1);
    for(const [index,line] of browserLines.entries()){
     assert.equal(line.status,'confirmed');
     for(const [targetStatus,action] of [['preparing','prepare'],['ready','ready']]){
      const transition=await m3.app.inject({method:'POST',
       url:'/api/v1/operations/order-lines/'+line.id+'/transitions',
       headers:{authorization:'Bearer '+jwtKitchen,'content-type':'application/json'},
       payload:{targetStatus,correlationId:'m3_chromium_'+action+'_'+index}});
      assert.equal(transition.statusCode,201,transition.body);
      assert.equal(transition.json().currentStatus,targetStatus);
     }
    }
    const readyLines=(await admin.query(
     'SELECT l.status,t.state AS pickup_state FROM sabora.order_lines l JOIN sabora.pickup_tasks t ON t.order_line_id=l.id WHERE l.order_id=$1',
     [browserOrder.orderId])).rows;
    assert.equal(readyLines.length,1);
    assert.deepEqual(readyLines[0],{status:'ready',pickup_state:'ready'},
     'signed kitchen transitions must leave durable pickup without inventing physical delivery');


    // Only the post-commit management GET is fault-injected. The write,
    // H6 settlement and account ledger still execute in real PG17.
    let injectedCloseReadFailures=0;
    let closePostCount=0;
    m3StaffPage.on('request',request=>{
     if(request.method()==='POST'&&new URL(request.url()).pathname===
       '/api/v1/admin/tables/'+browserTableId+'/occupancy'&&
       request.postDataJSON()?.target==='closed')closePostCount++;
    });
    await m3StaffPage.route(new RegExp('/api/v1/admin/tables[?]'),async route=>{
     if(route.request().method()==='GET'&&injectedCloseReadFailures===0){
      injectedCloseReadFailures++;
      await route.fulfill({status:503,contentType:'application/json',
       body:'{"error":"disposable_ci_read_interruption"}'});
     }else await route.fallback();
    });
    const closeFailureStart=m3Failures.length;
    const closeHttp=m3StaffPage.waitForResponse(response=>
     new URL(response.url()).pathname==='/api/v1/admin/tables/'+browserTableId+'/occupancy'&&
     response.request().method()==='POST',{timeout:20000});
    await m3StaffPage.locator('[aria-label="Cambiar estado de la mesa"]')
     .getByRole('button',{name:'CERRADA'}).click();
    const closeResponse=await closeHttp;
    assert.equal(closeResponse.status(),200,JSON.stringify({
      response:await closeResponse.text(),
      sqlFailure:m3Failures.slice(closeFailureStart).map(e=>({
       sqlstate:e.code??null,message:e.message??null
      }))
    }));
    const closed=(await admin.query(
     "SELECT t.ordering_state,a.state,a.closed_at,a.outstanding_cents,a.payment_mode,a.close_origin FROM sabora.dining_tables t JOIN sabora.customer_account_operational_bindings b ON b.table_id=t.id JOIN sabora.customer_accounts a ON a.id=b.account_id WHERE t.id=$1 AND a.customer_id=$2",
     [browserTableId,browserCustomerId])).rows[0];
    assert.equal(closed.ordering_state,'closed');
    assert.equal(closed.state,'settled');
    assert.equal(closed.payment_mode,null);
    assert.equal(closed.close_origin,'system_zero_cost',
     'only resolved zero-cost history allows automatic occupancy close');
    assert.ok(closed.closed_at,'closing a resolved zero-cost table must close the account');
    assert.equal(closed.outstanding_cents,'0');
    await m3StaffPage.getByRole('status').getByText(
     'El servidor confirmó el cambio de ocupación, pero no se pudo verificar la ficha. Actualiza la lectura antes de otra operación.'
    ).waitFor({timeout:20000});
    assert.equal(injectedCloseReadFailures,1,
     'exactly one post-commit read was interrupted');
    assert.equal(closePostCount,1,'no duplicate economic close from Chromium');
    assert.equal(await m3StaffPage.locator('[aria-label="Cambiar estado de la mesa"]')
     .getByRole('button',{name:'ABIERTA'}).isDisabled(),true,
     'stale mutation controls must be locked until a valid read');
    await m3StaffPage.getByRole('button',{name:'Reintentar actualización'}).click();
    await m3StaffPage.getByRole('status').getByText(
     'Lectura verificada. Comprueba el estado actual antes de otra operación.'
    ).waitFor({timeout:20000});
    assert.equal(await m3StaffPage.locator('[aria-label="Cambiar estado de la mesa"]')
     .getByRole('button',{name:'CERRADA'}).isDisabled(),true,
     'the refreshed PWA must show the real closed state');
    assert.equal(closePostCount,1,'read recovery must not repeat table closure');
    assert.deepEqual(m3BrowserErrors,[]);
    m3BrowserClosing=true;
    await m3CustomerContext.close();
    await m3StaffContext.close();
   }finally{
    m3BrowserClosing=true;
    if(m3Browser)await m3Browser.close();
    await Promise.allSettled([m3ClientVite.close(),m3ManagementVite.close()]);
   }

   m3Operations.revoke();
   management.revoke();
  }finally{await m3.close();}
  // Exercise the real transaction boundary on a physically authenticated
  // writer connection: an unlisted SQL statement must be rejected before it
  // reaches PostgreSQL, and ROLLBACK must restore the login identity.
  const withWriter=createIsolatedB3ConfirmationTransaction({
   confirmationPool:scopedPools[2]
  });
  await assert.rejects(
   withWriter(async query=>query('SELECT current_user',[])),
   /role_scoped_sql_not_allowed/,
   'writer must reject all unlisted SQL');
  const restored=(await connections[2].query(
   'SELECT current_user,session_user')).rows[0];
  assert.equal(restored.current_user,specs[2].login,
   'failed writer transaction must restore original login role');
  assert.equal(restored.session_user,specs[2].login);
  // The allowlisted SQL must actually reach the live SECURITY DEFINER
  // function under SET LOCAL ROLE; deliberately invalid business scope
  // must fail inside PostgreSQL, not with a permission/allowlist error.
  let rejectedByDatabase;
  try{
   await withWriter(query=>query(PERSIST_H6_TRANSFER_ORDER_SQL,[
    Buffer.alloc(32,251),ids.destinationTable,'invalid-qr',
    'nonexistent-visit','nonexistent-basket','nonexistent-request',
    Buffer.alloc(32,252),ids.round,ids.order,'[]',false,'pay_at_end'
   ]));
  }catch(error){rejectedByDatabase=error;}
  assert.ok(rejectedByDatabase,'invalid business scope must be rejected');
  assert.ok(typeof rejectedByDatabase.code==='string',
   'allowlisted writer call must reach PostgreSQL and return a SQLSTATE');
  assert.doesNotMatch(rejectedByDatabase.message,
   /permission denied for (function|schema)|must be owner of function/i,
   'writer must have the intended EXECUTE privilege; business authorization may itself return SQLSTATE 42501');
  const afterDbFailure=(await connections[2].query(
   'SELECT current_user,session_user')).rows[0];
  assert.equal(afterDbFailure.current_user,specs[2].login);
  assert.equal(afterDbFailure.session_user,specs[2].login);
  // A green preflight must not be cached across a privilege change.
  // Revoke the only transfer RPC from the disposable writer capability and
  // require the complete five-login factory to fail closed on revalidation.
  const writerSignature=specs[2].signatures[0];
  await admin.query('REVOKE EXECUTE ON FUNCTION '+writerSignature+
   ' FROM '+specs[2].role);
  await assert.rejects(
   createVerifiedTableChangeB3CustomerFlowCandidate({
    customerPool:scopedPools[0],operationsPool:scopedPools[1],
    confirmationPool:scopedPools[2],h6ReadPool:scopedPools[3],flowPool:scopedPools[4],
    expectedCustomerLogin:specs[0].login,expectedOperationsLogin:specs[1].login,
    expectedConfirmationLogin:specs[2].login,expectedH6ReadLogin:specs[3].login,
    expectedFlowLogin:specs[4].login,
    hashSession:hashCustomerSessionToken,
    verifyStaff:async()=>({role:'waiter'}),
    secretKey:'sabora_b3_ephemeral_test_secret_key_32_bytes_minimum'
   }),
   /invalid_b3_confirmation_capabilities/,
   'a revoked writer privilege must prevent candidate construction');
 }finally{
  if(priorB3Flag===undefined)delete process.env.VITE_SABORA_ENABLE_B3_TABLE_CHANGE;
  else process.env.VITE_SABORA_ENABLE_B3_TABLE_CHANGE=priorB3Flag;
  if(customerEventNotifier)await customerEventNotifier.close();
  for(const connection of connections)connection.release();
  for(const pool of pools)await pool.end();
  for(const role of createdRoles.reverse()){
   await admin.query('DROP OWNED BY '+role).catch(()=>{});
   await admin.query('DROP ROLE IF EXISTS '+role);
  }
 }
});


test('PG17 F12 pending-reader function is sealed and kitchen cannot enumerate requests',async()=>{
 const signature='sabora.list_pending_table_changes_h6_candidate(uuid)';
 const metadata=await admin.query(`SELECT p.prosecdef AS sealed,
  p.proowner::regrole::text AS owner,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anonymous,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS browser,
  has_function_privilege('sabora_f12_pending_reader_runtime',p.oid,'EXECUTE') AS reader,
  has_function_privilege('sabora_h6_operations_runtime',p.oid,'EXECUTE') AS decision
  FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,[signature]);
 assert.equal(metadata.rows.length,1);
 assert.deepEqual(metadata.rows[0],{
  sealed:true,owner:'sabora_h6_fn_owner',anonymous:false,
  browser:false,reader:true,decision:false
 });
 const role=await admin.query(`SELECT rolcanlogin,rolinherit,rolbypassrls
  FROM pg_roles WHERE rolname='sabora_f12_pending_reader_runtime'`);
 assert.deepEqual(role.rows,[{rolcanlogin:false,rolinherit:false,rolbypassrls:false}]);
 await transaction(async client=>{
  const waiter='e5000000-0000-4000-8000-000000000001';
  const kitchen='e5000000-0000-4000-8000-000000000002';
  await client.query(`INSERT INTO sabora.staff_members(user_id,role,state)
   VALUES ($1,'waiter','active'),($2,'kitchen','active')`,[waiter,kitchen]);
  await client.query('SET LOCAL ROLE sabora_f12_pending_reader_runtime');
  const rows=await client.query(`SELECT request_id,source_table_number,expires_at
   FROM sabora.list_pending_table_changes_h6_candidate($1::uuid)`,[waiter]);
  assert.deepEqual(rows.rows,[]);
  const denied=await expectSqlError(client,()=>client.query(
   'SELECT * FROM sabora.list_pending_table_changes_h6_candidate($1::uuid)',
   [kitchen]),/table_change_staff_forbidden/);
  assert.equal(denied.code,'42501');
  await expectSqlError(client,()=>client.query(
   'SELECT * FROM sabora.staff_members'),/permission denied/);
  await expectSqlError(client,()=>client.query(
   'SELECT * FROM sabora.customer_accounts'),/permission denied/);
  await expectSqlError(client,()=>client.query(
   'SELECT * FROM sabora.dining_tables'),/permission denied/);
  await expectSqlError(client,()=>client.query(
   'SELECT * FROM sabora.decide_customer_table_change_h6_candidate($1::uuid,$2::uuid,$3::boolean)',
   [waiter,waiter,true]),/permission denied/);
 });
});

test('PG17 F12 pending reader requires dedicated NOINHERIT physical login',async()=>{
 const login='sabora_f12_pending_ci_login';
 const password='sabora_pending_ci_disposable_only';
 const loginUrl=new URL(url);
 loginUrl.username=login;loginUrl.password=password;
 await admin.query(`CREATE ROLE sabora_f12_pending_ci_login LOGIN NOINHERIT
  NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD 'sabora_pending_ci_disposable_only'`);
 await admin.query('GRANT sabora_f12_pending_reader_runtime TO '+login);
 const pool=new Pool({connectionString:loginUrl.toString(),max:2,
  connectionTimeoutMillis:3000,idleTimeoutMillis:1000});
 try{
  await assertPendingReaderCapabilities({pool,expectedLogin:login});
  const identity=(await pool.query('SELECT current_user,session_user')).rows[0];
  assert.deepEqual(identity,{current_user:login,session_user:login});
  await assert.rejects(pool.query('SELECT * FROM sabora.staff_members'),/permission denied/);
  await assert.rejects(pool.query('SET ROLE sabora_h6_fn_owner'),/permission denied/);
  await assert.rejects(pool.query('SET ROLE sabora_h6_operations_runtime'),/permission denied/);
 }finally{
  await pool.end();
  await admin.query('DROP OWNED BY '+login).catch(()=>{});
  await admin.query('DROP ROLE IF EXISTS '+login);
 }
});
