import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';

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
 const lock=source.indexOf('FOR UPDATE');
 const persist=source.indexOf('persist_customer_order_candidate');
 const account=source.indexOf('INSERT INTO sabora.customer_account_operational_bindings');
 const round=source.indexOf('INSERT INTO sabora.order_rounds');
 const delivery=source.indexOf('INSERT INTO sabora.order_round_delivery_destinations');
 assert.ok(lock>=0&&lock<persist&&persist<account&&account<round&&round<delivery);
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
 const requestLock=source.search(/q\.account_id\s*=\s*v_account_id\s+FOR UPDATE/i);
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
 assert.match(source,/l[.]status\s*/);
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
