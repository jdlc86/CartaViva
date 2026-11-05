import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';

const url=process.env.SABORA_CI_PG_URL,modulePath=process.env.SABORA_CI_PG_MODULE;
if(!url||!modulePath||process.env.GITHUB_ACTIONS!=='true'||
 !isDisposablePgModulePath(modulePath))throw Error('disposable_pg17_harness_required');
const parsed=new URL(url);
if(parsed.hostname!=='127.0.0.1'||parsed.username!=='postgres'||
 parsed.pathname!=='/postgres'||parsed.password!=='sabora_ci_ephemeral_only'||
 parsed.search||parsed.hash||!parsed.port)throw Error('unsafe_pg17_harness_target');
const require=createRequire(import.meta.url),{Pool}=require(modulePath);
const admin=new Pool({connectionString:url,max:6,connectionTimeoutMillis:3000,
 idleTimeoutMillis:1000,options:'-c statement_timeout=15000 -c lock_timeout=5000'});
test.after(async()=>admin.end());

const uuid=value=>`f6000000-0000-4000-8000-${String(value).padStart(12,'0')}`;
const waiter=uuid(1);
const qrHash=Buffer.alloc(32,246);
let initialized=false;

async function initialize(){
 if(initialized)return;
 await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state)
  VALUES($1,'waiter','active') ON CONFLICT(user_id) DO NOTHING`,[waiter]);
 initialized=true;
}

async function seedZeroAccount(index,{roundState='kitchen_acknowledged',
 lineStatus='ready',pickup=true,incidentState=null}={}){
 await initialize();
 const customer=uuid(index*20+1),table=uuid(index*20+2),session=uuid(index*20+3);
 const account=uuid(index*20+4),order=uuid(index*20+5),round=uuid(index*20+6);
 const visit=`zero_cost_visit_${String(index).padStart(4,'0')}`;
 const publicId=`SB-BBBBBBBBBBB${String(index%8+2)}`;
 await admin.query(`INSERT INTO sabora.customer_profiles(id,public_id,alias)
  VALUES($1,$2,$3)`,[customer,publicId,`Cuenta gratuita ${index}`]);
 await admin.query(`INSERT INTO sabora.dining_tables(
  id,number,capacity,qr_token_hash,session_id,ordering_state,readiness_state)
  VALUES($1,$2,4,$3,$4,'open','LISTA')`,[table,990000+index,qrHash,session]);
 await admin.query(`INSERT INTO sabora.customer_table_visits(
  table_id,session_id,customer_id,visit_key,actor_id,
  authorized_qr_version,expires_at)
  VALUES($1,$2,$3,$4,$5,1,clock_timestamp()+interval '1 hour')`,
  [table,session,customer,visit,customer]);
 await admin.query(`INSERT INTO sabora.customer_accounts(
  id,table_id,session_id,visit_key,customer_id)
  VALUES($1,$2,$3,$4,$5)`,[account,table,session,visit,customer]);
 await admin.query(`INSERT INTO sabora.customer_account_operational_bindings(
  account_id,table_id,session_id,visit_key) VALUES($1,$2,$3,$4)`,
  [account,table,session,visit]);
 await admin.query(`INSERT INTO sabora.orders(
  id,table_id,session_id,company,employee_number,confirmed_at,grouping,items)
  VALUES($1,$2,$3,'Cortesía CI','Z01',clock_timestamp(),'first',$4::jsonb)`,
  [order,table,session,JSON.stringify([
   {category:'main',name:`Cortesía ${index}`,quantity:1}
  ])]);
 await admin.query(`INSERT INTO sabora.order_rounds(
  id,order_id,account_id,amount_cents,payment_policy_version,
  grouping_deadline,state)
  VALUES($1,$2,$3,0,1,clock_timestamp()+interval '5 minutes',$4)`,
  [round,order,account,roundState]);
 await admin.query(`INSERT INTO sabora.kitchen_dispatches(
  round_id,order_id,revision_number,dispatch_key,state,requested_at,acknowledged_at)
  VALUES($1,$2,1,$3,$4,
   CASE WHEN $4='acknowledged' THEN clock_timestamp() END,
   CASE WHEN $4='acknowledged' THEN clock_timestamp() END)`,
  [round,order,`h6_dispatch_${order.replaceAll('-','_')}`,
   roundState==='kitchen_acknowledged'?'acknowledged':'blocked']);
 const line=(await admin.query(`UPDATE sabora.order_lines SET status=$2
  WHERE order_id=$1 RETURNING id`,[order,lineStatus])).rows[0].id;
 if(pickup){
  const notification=(await admin.query(`INSERT INTO sabora.pickup_notifications(
   order_id,order_line_id) VALUES($1,$2) RETURNING id`,[order,line])).rows[0].id;
  await admin.query(`INSERT INTO sabora.pickup_tasks(
   order_id,order_line_id,notification_id,state) VALUES($1,$2,$3,'ready')`,
   [order,line,notification]);
 }
 if(incidentState){
  const terminal=['adjusted','rejected_customer_request','resolved'].includes(incidentState);
  await admin.query(`INSERT INTO sabora.incident_cases(
   round_id,origin,actor_user_id,correlation_id,reason,affected_cents,
   state,requires_arbitration,resolved_by,resolution_reason,resolved_at)
   VALUES($1,'waiter_customer',$2,$3,'Validación coste cero',0,$4,$5,
    CASE WHEN $6 THEN $2::uuid END,CASE WHEN $6 THEN 'Resuelta' END,
    CASE WHEN $6 THEN clock_timestamp() END)`,
   [round,waiter,`zero_incident_${index}`,incidentState,
    incidentState==='awaiting_admin',terminal]);
 }
 return {customer,table,session,account,order,round,line,visit};
}

async function closeTable(table){
 return admin.query(`SELECT * FROM sabora.transition_table_ordering_candidate(
  $1::uuid,$2::uuid,'closed',NULL)`,[waiter,table]);
}

test('PG17 zero-cost closure surface is sealed and preserves RLS',async()=>{
 await initialize();
 const helper='sabora.try_auto_close_zero_cost_account_h6_candidate(uuid)';
 const trigger='sabora.auto_close_zero_cost_accounts_on_occupancy_h6_candidate()';
 const metadata=(await admin.query(`SELECT p.oid::regprocedure::text AS signature,
  p.prosecdef AS sealed,p.proowner::regrole::text AS owner,
  p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[] AS pinned,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS browser_execute,
  has_function_privilege('sabora_h6_customer_runtime',p.oid,'EXECUTE') AS customer_execute,
  has_function_privilege('sabora_h6_operations_runtime',p.oid,'EXECUTE') AS operations_execute,
  has_function_privilege('sabora_h6_account_close_runtime',p.oid,'EXECUTE') AS close_execute
  FROM pg_proc p WHERE p.oid=ANY(ARRAY[to_regprocedure($1),to_regprocedure($2)])
  ORDER BY signature`,[helper,trigger])).rows;
 assert.equal(metadata.length,2);
 for(const row of metadata)assert.deepEqual({...row,signature:undefined},{
  signature:undefined,sealed:true,owner:'sabora_h6_fn_owner',pinned:true,
  anon_execute:false,browser_execute:false,customer_execute:false,
  operations_execute:false,close_execute:false
 });
 const generated=(await admin.query(`SELECT is_generated,generation_expression
  FROM information_schema.columns WHERE table_schema='sabora'
   AND table_name='customer_accounts' AND column_name='close_origin'`)).rows[0];
 assert.equal(generated.is_generated,'ALWAYS');
 assert.match(generated.generation_expression,/system_zero_cost/);
 const client=await admin.connect();
 try{
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE sabora_h6_customer_runtime');
  await client.query('SAVEPOINT denied_helper');
  await assert.rejects(client.query(`SELECT sabora.try_auto_close_zero_cost_account_h6_candidate(
   $1::uuid)`,[uuid(999)]),/permission denied/);
  await client.query('ROLLBACK TO SAVEPOINT denied_helper');
  await client.query('SAVEPOINT denied_table');
  await assert.rejects(client.query('SELECT * FROM sabora.customer_accounts'),
   /permission denied/);
  await client.query('ROLLBACK TO SAVEPOINT denied_table');
 }finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
});

test('PG17 closes only a resolved zero-cost account at occupancy end, once',async()=>{
 const fixture=await seedZeroAccount(10);
 const pendingGrant=(await admin.query(`INSERT INTO sabora.customer_table_change_requests(
  account_id,customer_id,visit_key,source_table_id,requesting_session_hash,expires_at)
  VALUES($1,$2,$3,$4,$5,clock_timestamp()+interval '90 seconds') RETURNING id`,
  [fixture.account,fixture.customer,fixture.visit,fixture.table,Buffer.alloc(32,10)])).rows[0].id;
 assert.equal((await admin.query(`SELECT
  sabora.try_auto_close_zero_cost_account_h6_candidate($1::uuid) AS closed`,
  [fixture.account])).rows[0].closed,false,
  'active visit must keep the complimentary account reusable');
 assert.equal((await admin.query('SELECT state FROM sabora.customer_accounts WHERE id=$1',
  [fixture.account])).rows[0].state,'open');
 const transition=await closeTable(fixture.table);
 assert.equal(transition.rows.length,1);
 const account=(await admin.query(`SELECT state,closed_at,closed_by,
  close_correlation_id,close_origin,outstanding_cents,payment_mode
  FROM sabora.customer_accounts WHERE id=$1`,[fixture.account])).rows[0];
 assert.equal(account.state,'settled');
 assert.ok(account.closed_at);
 assert.equal(account.closed_by,null);
 assert.equal(account.close_origin,'system_zero_cost');
 assert.equal(account.close_correlation_id,
  `zero_cost_${fixture.account.replaceAll('-','')}`);
 assert.equal(account.outstanding_cents,'0');
 assert.equal(account.payment_mode,null);
 const durable=(await admin.query(`SELECT
  (SELECT count(*)::int FROM sabora.event_outbox WHERE account_id=$1
    AND event_type='sabora.account.closed') AS events,
  (SELECT payload FROM sabora.event_outbox WHERE account_id=$1
    AND event_type='sabora.account.closed') AS payload,
  (SELECT revoked_at IS NOT NULL FROM sabora.customer_table_visits
    WHERE table_id=$2 AND session_id=$3 AND visit_key=$4) AS visit_revoked,
  (SELECT state FROM sabora.order_rounds WHERE id=$5) AS round_state,
  (SELECT status FROM sabora.order_lines WHERE id=$6) AS line_state,
  (SELECT state FROM sabora.pickup_tasks WHERE order_line_id=$6) AS pickup_state`,
  [fixture.account,fixture.table,fixture.session,fixture.visit,
   fixture.round,fixture.line])).rows[0];
 assert.equal(durable.events,1);
 assert.deepEqual(durable.payload,{accountId:fixture.account,state:'settled',
  outstandingCents:0,closeOrigin:'system_zero_cost',
  resolution:'business_resolved',deliveryConfirmed:false});
 assert.equal(durable.visit_revoked,true);
 assert.equal(durable.round_state,'kitchen_acknowledged');
 assert.equal(durable.line_state,'ready');
 assert.equal(durable.pickup_state,'ready');
 const revoked=(await admin.query(`SELECT status,revoked_at FROM
  sabora.customer_table_change_requests WHERE id=$1`,[pendingGrant])).rows[0];
 assert.equal(revoked.status,'revoked');
 assert.ok(revoked.revoked_at);
 assert.equal((await admin.query(`SELECT
  sabora.try_auto_close_zero_cost_account_h6_candidate($1::uuid) AS closed`,
  [fixture.account])).rows[0].closed,false);
 assert.equal((await admin.query(`SELECT count(*)::int AS n FROM sabora.event_outbox
  WHERE account_id=$1 AND event_type='sabora.account.closed'`,
  [fixture.account])).rows[0].n,1,'replay cannot duplicate closure event');
});

test('PG17 zero-cost guards cover unresolved and cancelled incident paths',async()=>{
 const unresolved=await seedZeroAccount(11,{roundState:'cancelled',
  lineStatus:'confirmed',pickup:false,incidentState:'awaiting_admin'});
 await closeTable(unresolved.table);
 assert.equal((await admin.query(`SELECT state,closed_at FROM sabora.customer_accounts
  WHERE id=$1`,[unresolved.account])).rows[0].state,'open');
 assert.equal((await admin.query(`SELECT count(*)::int AS n FROM sabora.event_outbox
  WHERE account_id=$1 AND event_type='sabora.account.closed'`,
  [unresolved.account])).rows[0].n,0);

 const cancelled=await seedZeroAccount(12,{roundState:'cancelled',
  lineStatus:'confirmed',pickup:false,incidentState:'resolved'});
 await closeTable(cancelled.table);
 const closed=(await admin.query(`SELECT state,close_origin FROM sabora.customer_accounts
  WHERE id=$1`,[cancelled.account])).rows[0];
 assert.deepEqual(closed,{state:'settled',close_origin:'system_zero_cost'});
 assert.equal((await admin.query(`SELECT status FROM sabora.order_lines WHERE id=$1`,
  [cancelled.line])).rows[0].status,'confirmed',
  'cancelled business resolution must not invent ready or delivered state');

 const missingPickup=await seedZeroAccount(13,{pickup:false});
 await closeTable(missingPickup.table);
 assert.equal((await admin.query(`SELECT state FROM sabora.customer_accounts WHERE id=$1`,
  [missingPickup.account])).rows[0].state,'open');
});

test('PG17 customer advisory fence lets a later positive order win without deadlock',async()=>{
 const fixture=await seedZeroAccount(14);
 const holder=await admin.connect(),closer=await admin.connect();
 let holderOpen=false,closePromise;
 try{
  await holder.query('BEGIN');holderOpen=true;
  const holderPid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  await holder.query(`SELECT pg_advisory_xact_lock(
   pg_catalog.hashtextextended($1::text,140630))`,[fixture.customer]);
  closePromise=closer.query(`/* zero_cost_positive_wins_close */
   SELECT * FROM sabora.transition_table_ordering_candidate(
    $1::uuid,$2::uuid,'closed',NULL)`,[waiter,fixture.table]);
  let queued=false;
  for(let tries=0;tries<150;tries++){
   const row=(await admin.query(`SELECT count(*)::int AS n FROM pg_stat_activity a
    WHERE a.pid<>$1::int AND a.wait_event_type='Lock' AND a.wait_event='advisory'
      AND a.query LIKE '%zero_cost_positive_wins_close%'
      AND $1::int=ANY(pg_blocking_pids(a.pid))`,[holderPid])).rows[0];
   if(row.n>0){queued=true;break;}
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(queued,true,
   'table close must wait on the same customer advisory fence as confirmation');
  const positiveOrder=uuid(14*20+7),positiveRound=uuid(14*20+8);
  await holder.query(`INSERT INTO sabora.orders(
   id,table_id,session_id,company,employee_number,confirmed_at,grouping,items)
   VALUES($1,$2,$3,'Pedido posterior','P01',clock_timestamp(),'grouped',$4::jsonb)`,
   [positiveOrder,fixture.table,fixture.session,JSON.stringify([
    {category:'main',name:'Pedido positivo',quantity:1}
   ])]);
  await holder.query(`INSERT INTO sabora.order_rounds(
   id,order_id,account_id,amount_cents,payment_mode,payment_policy_version,
   grouping_deadline,state) VALUES($1,$2,$3,300,'pay_at_end',1,
    clock_timestamp()+interval '5 minutes','grouping')`,
   [positiveRound,positiveOrder,fixture.account]);
  await holder.query(`INSERT INTO sabora.kitchen_dispatches(
   round_id,order_id,revision_number,dispatch_key,state)
   VALUES($1,$2,1,$3,'blocked')`,
   [positiveRound,positiveOrder,
    `h6_dispatch_${positiveOrder.replaceAll('-','_')}`]);
  await holder.query(`UPDATE sabora.customer_accounts SET
   payment_mode='pay_at_end',payment_mode_selected_at=clock_timestamp(),
   outstanding_cents=300,updated_at=clock_timestamp() WHERE id=$1`,
   [fixture.account]);
  await holder.query('COMMIT');holderOpen=false;
  const transition=await closePromise;
  assert.equal(transition.rows[0].ordering_state,'closed');
  const account=(await admin.query(`SELECT state,outstanding_cents,payment_mode,
   closed_at,close_origin FROM sabora.customer_accounts WHERE id=$1`,
   [fixture.account])).rows[0];
  assert.deepEqual(account,{state:'open',outstanding_cents:'300',
   payment_mode:'pay_at_end',closed_at:null,close_origin:null});
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM sabora.order_rounds
   WHERE account_id=$1`,[fixture.account])).rows[0].n,2);
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM sabora.event_outbox
   WHERE account_id=$1 AND event_type='sabora.account.closed'`,
   [fixture.account])).rows[0].n,0);
 }finally{
  if(holderOpen)await holder.query('ROLLBACK').catch(()=>{});
  if(closePromise)await Promise.allSettled([closePromise]);
  holder.release();closer.release();
 }
});
