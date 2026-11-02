import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {F12_FUNCTION_SQL,assertF12SqlIdentity} from '../../apps/api/src/table-change-isolated-sql-preflight-candidate.mjs';
import {assertB3ConfirmationCapabilities} from '../../apps/api/src/table-change-b3-confirmation-preflight-candidate.mjs';
import {assertB3H6LoginSurface,assertB3CustomerFlowExactSetRole,createVerifiedTableChangeB3CustomerFlowCandidate,createIsolatedB3ConfirmationTransaction} from '../../apps/api/src/table-change-isolated-sql-composition-candidate.mjs';
import {assertCustomerFlowSqlCapabilities} from '../../apps/api/src/customer-production-sql-preflight.mjs';
import {PERSIST_H6_TRANSFER_ORDER_SQL} from '../../apps/api/src/customer-production-flow.mjs';
import {mountVerifiedTableChangeB3HttpCandidate} from '../../apps/api/src/table-change-b3-http-composition-candidate.mjs';
import {hashCustomerSessionToken} from '../../apps/api/src/customer-session.mjs';
import {assertPendingReaderCapabilities} from '../../apps/api/src/table-change-pending-reader-preflight-candidate.mjs';
import {createCustomerFlowTransport} from '../../apps/client/src/customer-flow-transport.ts';
import {createAuthenticatedOrderOperationsGateway} from '../../apps/management/src/order-operations-authenticated-gateway.js';

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
   id,number,capacity,qr_token_hash,session_id,ordering_state)
  VALUES($1,981001,4,$3,$4,'open'),($2,981002,4,$3,$5,'open')`,
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
   id,number,capacity,qr_token_hash,session_id,ordering_state)
   VALUES($1,981003,4,$2,$3,'open')`,[thirdTable,qrHash,thirdSession]);
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

  assert.equal((await client.query(`SELECT count(*)::int AS n
   FROM sabora.order_line_delivery_destinations d
   JOIN sabora.order_lines l ON l.id=d.order_line_id
   WHERE l.order_id=$1`,[ids.order])).rows[0].n,1);
  assert.equal((await client.query(`SELECT outstanding_cents FROM sabora.customer_accounts
   WHERE id=$1`,[ids.sourceAccount])).rows[0].outstanding_cents,'1900');
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
 (id,number,capacity,qr_token_hash,session_id,ordering_state)
 VALUES($1,$2,4,$5,$6,'open'),($3,$4,4,$5,$7,'open')`,[
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

test('PG17 B3 confirmation preflight remains fail-closed without a dedicated runtime role',async()=>{
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
 const role=(await admin.query(`SELECT count(*)::int AS count FROM pg_roles
  WHERE rolname='sabora_b3_confirmation_runtime'`)).rows[0];
 assert.equal(role.count,0,'B3 runtime role must not be silently provisioned');
});

test('PG17 B3 dedicated login has no direct transfer EXECUTE and capability is exact',async()=>{
 await transaction(async client=>{
  const role='sabora_b3_confirmation_runtime',login='sabora_b3_confirmation_probe_login';
  const signature='sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
  await client.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT`);
  await client.query(`CREATE ROLE ${login} LOGIN NOINHERIT`);
  await client.query(`GRANT ${role} TO ${login} WITH SET TRUE, INHERIT FALSE`);
  await client.query(`GRANT USAGE ON SCHEMA sabora TO ${role}`);
  await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${role}`);
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
  assert.deepEqual(names,[signature],'B3 role must have exactly one Sabora EXECUTE');
  await client.query('RESET ROLE');
 });
});


test('PG17 B3 live preflight accepts only the isolated transactional login capability',async()=>{
 await transaction(async client=>{
  const role='sabora_b3_confirmation_runtime';
  const login='sabora_b3_confirmation_preflight_probe';
  const signature='sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
  await client.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT`);
  await client.query(`CREATE ROLE ${login} LOGIN NOINHERIT`);
  await client.query(`GRANT ${role} TO ${login} WITH SET TRUE, INHERIT FALSE`);
  await client.query(`GRANT USAGE ON SCHEMA sabora TO ${role}`);
  await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${role}`);
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
  await client.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT`);
  await client.query(`CREATE ROLE ${login} LOGIN NOINHERIT`);
  await client.query(`GRANT ${role} TO ${login} WITH SET TRUE, INHERIT FALSE`);
  await client.query(`GRANT USAGE ON SCHEMA sabora TO ${role}`);
  await client.query(`GRANT EXECUTE ON FUNCTION ${readerRound} TO ${role}`);
  await client.query(`GRANT EXECUTE ON FUNCTION ${readerPolicy} TO ${role}`);
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
   await client.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT`);
   await client.query(`CREATE ROLE ${login} LOGIN NOINHERIT`);
   await client.query(`GRANT ${role} TO ${login} WITH SET TRUE, INHERIT FALSE`);
   await client.query(`GRANT USAGE ON SCHEMA sabora TO ${role}`);
   for(const signature of signatures)
    await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${role}`);
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
    functions:['sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)']},
   {role:'sabora_b3_h6_reader_runtime',login:'sabora_b3_combined_reader',
    functions:['sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)',
     'sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)']},
   {role:'sabora_customer_flow_runtime',login:'sabora_b3_combined_basket',functions:[]}
  ];
  for(const spec of specs){
   if(spec.role!=='sabora_customer_flow_runtime'){
    await client.query(`CREATE ROLE ${spec.role} NOLOGIN NOINHERIT`);
    await client.query(`GRANT USAGE ON SCHEMA sabora TO ${spec.role}`);
    for(const signature of spec.functions)
     await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${spec.role}`);
   }
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
   signatures:['sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)']},
  {role:'sabora_b3_h6_reader_runtime',login:'sabora_b3_physical_reader_'+suffix,
   signatures:['sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)',
    'sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)']},
  {role:'sabora_customer_flow_runtime',login:'sabora_b3_physical_basket_'+suffix,
   signatures:[]},
  {role:'sabora_f12_pending_reader_runtime',login:'sabora_b3_physical_pending_'+suffix,
   signatures:[]}
 ];
 const createdRoles=[],pools=[],connections=[];
 const password='sabora_b3_disposable_'+suffix+'_only';
 try{
  for(const spec of specs){
   if(!['sabora_customer_flow_runtime','sabora_f12_pending_reader_runtime'].includes(spec.role)){
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
   await admin.query('GRANT '+spec.role+' TO '+spec.login+' WITH SET TRUE, INHERIT FALSE');
  }
  for(const spec of specs){
   const loginUrl=new URL(url);
   loginUrl.username=spec.login;
   loginUrl.password=password;
   const pool=new Pool({connectionString:loginUrl.toString(),max:3,connectionTimeoutMillis:3000,
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
  // Unlike the pinned preflight connection, runtime customer requests must
  // check out distinct physical clients to exercise concurrent transactions.
  // One client stays pinned for identity assertions; two remain available.
  scopedPools[0]={connect:()=>pools[0].connect()};
  // F22 concurrent customer confirmations must use distinct authenticated
  // writer and flow connections rather than the pinned preflight handles.
  scopedPools[2]={connect:()=>pools[2].connect()};
  scopedPools[4]={connect:()=>pools[4].connect()};
  // React StrictMode may start overlapping GETs for the queue on mount.
  // A pinned preflight connection cannot serve concurrent SQL transactions:
  // use the dedicated physical pending login's real pool at runtime, preserving
  // the one-function SET ROLE allowlist and the two remaining pool clients.
  scopedPools[5]={connect:()=>pools[5].connect()};
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
  try{
   assert.deepEqual(await mountVerifiedTableChangeB3HttpCandidate(http,{
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
    verifyStaff:async({verifiedIdentity,verifiedStaff})=>({userId:verifiedIdentity.userId,role:verifiedStaff.role}),
    secretKey:'sabora_b3_ephemeral_test_secret_key_32_bytes_minimum',
    cookieAuth:{
     requireSameOrigin:()=>true,
     authenticate:async(request,reply)=>{
      if(request.headers.cookie==='__Secure-sabora_customer='+ 's'.repeat(43)){
       request.customerIdentity={publicId:'SB-BABABABABABP',alias:'PG17',company:null};
       return;
      }
      const peer=[...peers,rival,rollbackDiner,rotatedDiner,revokedDiner].find(row=>
       request.headers.cookie==='__Secure-sabora_customer='+row.token);
      if(peer){
       request.customerIdentity={publicId:peer.publicId,alias:peer.alias,company:null};
       return;
      }
      return reply.code(401).send({error:'unauthorized'});
     },
     logout:async()=>{}
    },
    forRoles:()=>async(request,reply)=>{
     if(request.headers['x-ci-staff']==='authorized-waiter'){
      request.verifiedIdentity={userId:'b0a00000-0000-4000-8000-000000000307'};
      request.verifiedStaff={role:'waiter'};
      return;
     }
     if(request.headers['x-ci-staff']==='waiter'){
      request.verifiedIdentity={userId:ids.customer};
      request.verifiedStaff={role:'waiter'};
      return;
     }
     return reply.code(403).send({error:'forbidden'});
    }
   }),{mounted:true});
   // Test-only public catalog projection; checkout still revalidates the
   // published SQL fixture through the production quote/confirmation RPCs.
   http.get('/api/v1/catalog',async()=>[{
    id:'b0a00000-0000-4000-8000-000000000330',
    name:'Plato de integración',category:'Primeros',
    priceCents:700,available:true,allergens:[]
   }]);
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
   assert.equal(denied.statusCode,403);
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
     (id,number,capacity,qr_token_hash,session_id,ordering_state)
     VALUES($1,981301,4,$5,$6,'open'),($2,981302,4,$5,$7,'open'),
      ($3,981303,4,$5,$8,'open'),($4,981304,4,$5,$9,'open')`,
     [httpFixture.sourceTable,httpFixture.destinationTable,
      httpFixture.blockedTable,httpFixture.concurrentTable,qrHash,
      httpFixture.sourceSession,httpFixture.destinationSession,
      httpFixture.blockedSession,httpFixture.concurrentSession]);
    await fixture.query(`INSERT INTO sabora.customer_table_visits
     (table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
     VALUES($1,$2,$3::uuid,$4,($3::uuid)::text,1,clock_timestamp()+interval '1 hour')`,
     [httpFixture.sourceTable,httpFixture.sourceSession,httpFixture.customer,
      httpFixture.sourceVisit]);
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
    await fixture.query(`INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'waiter','active')`,[httpFixture.waiter]);
    // Historical A order has a completed pickup and a still-pending line.
    // The integrated B checkout must redirect only the pending destination.
    const priorOrder='b0a00000-0000-4000-8000-000000000340';
    const priorRound='b0a00000-0000-4000-8000-000000000341';
    const qrToken='Q'.repeat(42)+'A';
    const itemId='b0a00000-0000-4000-8000-000000000330';
    const snapshot={name:'Plato de integración',category:'Primeros',
     priceCents:700,allergens:[],options:[],extras:[],discount:null};
    await fixture.query('UPDATE sabora.dining_tables SET qr_token_hash=$1 WHERE id=ANY($2::uuid[])',
     [createHash('sha256').update(qrToken).digest(),
      [httpFixture.sourceTable,httpFixture.destinationTable,
       httpFixture.blockedTable,httpFixture.concurrentTable]]);
    await fixture.query(`INSERT INTO sabora.catalog_items
     (id,draft,draft_revision,published_revision,published_snapshot,published_at)
     VALUES($1,$2,1,1,$2,clock_timestamp())`,[itemId,snapshot]);
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
     headers:{'x-ci-staff':'waiter','content-type':'application/json'},
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
     getAccessToken:async()=> 'verified-ci-waiter-bearer-token',
     fetchImpl:async(path,options)=>{
      const response=await http.inject({method:options.method,url:path,
       headers:{...Object.fromEntries(options.headers.entries()),
        'x-ci-staff':'authorized-waiter'},payload:options.body});
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
      headers:{'x-ci-staff':'kitchen'}});
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
       headers:{authorization:'Bearer verified-ci-waiter-bearer-token',
        'x-ci-staff':'authorized-waiter'}
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
      await page.evaluate(async()=>{
       const {mountAuthenticatedManagementApp}=await import('/src/main.tsx');
       const fetchImpl=(input,init={})=>{
        const headers=new Headers(init.headers);
        headers.set('x-ci-staff','authorized-waiter');
        return fetch(input,{...init,headers});
       };
       window.__saboraCiDispose=mountAuthenticatedManagementApp({
        element:document.getElementById('root'),
        getAccessToken:async()=> 'verified-ci-waiter-bearer-token',
        fetchImpl,enableTableChangeQueue:true
       });
      });
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
       row.authorization==='Bearer verified-ci-waiter-bearer-token'));
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
      for(const diner of [rival,rollbackDiner,rotatedDiner,revokedDiner]){
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
        payment_mode_selected_at,outstanding_cents)
       VALUES($1,$2,$3,$4,$5,'pay_at_end',clock_timestamp(),$6)`,
       [diner.account,httpFixture.sourceTable,httpFixture.sourceSession,
        diner.visitKey,diner.customer,diner.balance]);
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
       VALUES($1,$2,$3,$4,'pay_at_end',1,
        clock_timestamp()+interval '5 minutes','grouping')`,
       [diner.round,diner.order,diner.account,diner.balance]);
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
      await raceFixture.query('COMMIT');
     }catch(error){await raceFixture.query('ROLLBACK').catch(()=>{});throw error;}
     finally{raceFixture.release();}
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
      headers:{'x-ci-staff':'authorized-waiter','content-type':'application/json'},
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
      headers:{'x-ci-staff':'authorized-waiter','content-type':'application/json'},
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
     const prepareD=async(diner,token)=>{
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
      await page.getByRole('radio',{name:/Pagar al terminar/}).check();
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
        headers:{'x-ci-staff':'authorized-waiter','content-type':'application/json'},
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
      rejectOfflineContext;
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
     await staffPage.evaluate(async()=>{
      const {mountAuthenticatedManagementApp}=await import('/src/main.tsx');
      const fetchImpl=(input,init={})=>{
       const headers=new Headers(init.headers);
       headers.set('x-ci-staff','authorized-waiter');
       return fetch(input,{...init,headers});
      };
      window.__saboraCiDispose=mountAuthenticatedManagementApp({
       element:document.getElementById('root'),
       getAccessToken:async()=> 'verified-ci-waiter-bearer-token',
       fetchImpl,enableTableChangeQueue:true
      });
     });
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
     // Simulate elapsed server time by rewriting only isolated fixture
     // timestamps. The UPDATE is committed, so the NOTIFY must invalidate
     // both the customer's countdown and the staff's stale decision.
     await admin.query(`UPDATE sabora.customer_table_change_requests SET
      created_at=clock_timestamp()-interval '3 minutes',
      decided_at=clock_timestamp()-interval '2 minutes',
      expires_at=clock_timestamp()-interval '1 minute'
      WHERE id=$1 AND status='rejected'`,[second.id]);
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
     // This PG17 fixture is committed for six physical logins. Retire its
     // last pending request without deleting any historical record so the
     // subsequent independent staff-reader test sees an empty live queue.
     // The simulated server time remains valid under the normative checks.
     await admin.query(`UPDATE sabora.customer_table_change_requests SET
      created_at=clock_timestamp()-interval '3 minutes',
      expires_at=clock_timestamp()-interval '1 minute',
      status='expired'
      WHERE id=$1 AND status='pending'`,[third.id]);
     const remaining=(await admin.query(`SELECT count(*)::int AS n FROM
      sabora.customer_table_change_requests WHERE status='pending'
      AND account_id=$1`,[httpFixture.sourceAccount])).rows[0].n;
     assert.equal(remaining,0,'integrated fixture must leave no actionable request');
     // The same waiter who saw the earlier item cannot act on an expired
     // request, even if a stale browser retained its ID and an explicit role.
     for(const decision of ['approved','rejected']){
      const late=await http.inject({
       method:'POST',url:'/api/v1/operations/table-change/decisions',
       headers:{'x-ci-staff':'authorized-waiter','content-type':'application/json'},
       payload:{requestId:third.id,decision}
      });
      assert.equal(late.statusCode,409,
       'expired PG17 request must reject late '+decision+': '+late.body);
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
     // Retire only the disposable fixture, not the economic account. Keep
     // expiry ordering valid for the normative database constraints.
     await admin.query(`UPDATE sabora.customer_table_change_requests SET
      created_at=clock_timestamp()-interval '3 minutes',
      expires_at=clock_timestamp()-interval '1 minute',
      status='expired' WHERE id=$1 AND status='pending'`,[fourth.id]);
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
      httpFixture.destinationTable);
     assert.deepEqual(rejectedClientErrors,[]);
     await staffPage.evaluate(()=>window.__saboraCiDispose());
    }finally{
     if(rejectClientContext)await rejectClientContext.close();
     if(rejectOfflineContext)await rejectOfflineContext.close();
     if(rejectStaffContext)await rejectStaffContext.close();
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
  }finally{await http.close();}
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
