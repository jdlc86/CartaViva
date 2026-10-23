import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createPostgresTransaction} from '../../apps/api/src/postgres-transaction.mjs';
import {createCatalogOrderWriter} from '../../apps/api/src/catalog-order-writer.mjs';
import {buildCatalogLineEvidence} from '../../apps/api/src/catalog-line-evidence.mjs';
import {createCatalogConfirmationReadRepository} from '../../apps/api/src/catalog-confirmation-read-repository.mjs';
import {createCatalogOrderConfirmationPoolCandidate} from '../../apps/api/src/catalog-order-confirmation-candidate.mjs';

// Explicitly opt-in only for the disposable PostgreSQL 17 GitHub CI harness.
// No operational DSN is read from runtime configuration.
const url=process.env.SABORA_CI_PG_URL;
const modulePath=process.env.SABORA_CI_PG_MODULE;
if(!url||!modulePath)throw Error('disposable_pg17_harness_required');
const parsed=new URL(url);
if(process.env.GITHUB_ACTIONS!=='true'||
   !modulePath.startsWith('/tmp/tmp')||
   !modulePath.endsWith('/node_modules/pg')||
   !/^[A-Za-z0-9_-]+$/.test(modulePath.slice(8,-16)))
 throw Error('disposable_pg17_harness_required');
if(parsed.hostname!=='127.0.0.1'||parsed.username!=='postgres'||
   parsed.pathname!=='/postgres')throw Error('unsafe_pg17_harness_target');
const require=createRequire(import.meta.url);
const {Pool}=require(modulePath);
const pool=new Pool({connectionString:url,max:4,connectionTimeoutMillis:3000,
 idleTimeoutMillis:1000,options:'-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=20000'});
const withTransaction=createPostgresTransaction({pool});
test.after(async()=>{await pool.end();});

test('actual node-postgres driver commits SQL and decodes PG17 results',async()=>{
 const result=await withTransaction(async query=>{
  const version=await query('SHOW server_version_num');
  assert.ok(Number(version.rows[0].server_version_num)>=170000);
  const response=await query('SELECT $1::integer AS value, $2::text AS label',
   [17,'sabora']);
  assert.deepEqual(response.rows,[{value:17,label:'sabora'}]);
  return response.rows[0];
 });
 assert.equal(result.value,17);
});

test('actual PG17 transaction rollback is visible across pool connections',async()=>{
 const id='cafe0000-0000-4000-8000-000000000071';
 const before=await pool.query('SELECT count(*)::integer AS n FROM sabora.dining_tables WHERE id=$1',[id]);
 assert.equal(before.rows[0].n,0);
 await assert.rejects(withTransaction(async query=>{
  await query(`INSERT INTO sabora.dining_tables
   (id,number,capacity,qr_token_hash,ordering_state)
   VALUES ($1,930271,4,decode(repeat('71',32),'hex'),'open')`,[id]);
  throw Error('rollback_probe');
 }),/rollback_probe/);
 const after=await pool.query('SELECT count(*)::integer AS n FROM sabora.dining_tables WHERE id=$1',[id]);
 assert.equal(after.rows[0].n,0);
});

test('real PG17 serializes concurrent advisory locks on distinct clients',async()=>{
 const first=pool.connect();
 const second=pool.connect();
 const [a,b]=await Promise.all([first,second]);
 try{
  await a.query('BEGIN');
  await b.query('BEGIN');
  await a.query('SELECT pg_advisory_xact_lock($1)',[930271]);
  let acquired=false;
  const waiter=b.query('SELECT pg_advisory_xact_lock($1)',[930271])
   .then(()=>{acquired=true;});
  assert.equal(acquired,false);
  await a.query('COMMIT');
  await waiter;
  assert.equal(acquired,true);
  await b.query('COMMIT');
 } finally{
  await Promise.allSettled([a.query('ROLLBACK'),b.query('ROLLBACK')]);
  a.release();b.release();
 }
});

test('PG17 catalog writer transaction persists first/grouped/late kitchen projections and rolls back fixture',async()=>{
 const id='cafe0000-0000-4000-8000-000000000072';
 const orderIds=['cafe0000-0000-4000-8000-000000000073',
  'cafe0000-0000-4000-8000-000000000074',
  'cafe0000-0000-4000-8000-000000000075'];
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const inserted=await client.query(`INSERT INTO sabora.dining_tables
   (id,number,capacity,qr_token_hash,ordering_state,grouping_window_seconds)
   VALUES ($1,930272,4,decode(repeat('72',32),'hex'),'open',60)
   RETURNING session_id`,[id]);
  const session=inserted.rows[0].session_id;
  for(const [index,orderId] of orderIds.entries()){
   if(index===1)await client.query(`UPDATE sabora.dining_tables
    SET first_confirmed_at=clock_timestamp()-interval '30 seconds' WHERE id=$1`,[id]);
   if(index===2)await client.query(`UPDATE sabora.dining_tables
    SET first_confirmed_at=clock_timestamp()-interval '61 seconds' WHERE id=$1`,[id]);
   const state=await client.query(`SELECT first_confirmed_at,grouping_window_seconds
    FROM sabora.dining_tables WHERE id=$1 AND session_id=$2
    AND ordering_state='open' FOR UPDATE`,[id,session]);
   assert.equal(state.rows.length,1);
   const {first_confirmed_at:previous,grouping_window_seconds:seconds}=state.rows[0];
   const result=await client.query(`WITH instant AS (SELECT clock_timestamp() AS at),
    created AS (
      INSERT INTO sabora.orders
       (id,table_id,session_id,company,employee_number,
        customer_alias,customer_identifier,customer_visit_key,
        economic_snapshot,confirmed_at,grouping,items)
      SELECT $1,$2,$3,NULL,NULL,'Cliente','SB-23456789ABCD','visit-pg-driver',
       '{"schemaVersion":1,"totalCents":1000}'::jsonb,instant.at,
       CASE WHEN $4::timestamptz IS NULL THEN 'first'
        WHEN instant.at<$4::timestamptz+make_interval(secs=>$5::integer)
        THEN 'grouped' ELSE 'late' END,
       '[{"category":"starter","name":"Plato","quantity":1}]'::jsonb
      FROM instant RETURNING id,grouping,confirmed_at
    ), updated AS (
      UPDATE sabora.dining_tables t SET first_confirmed_at=created.confirmed_at
      FROM created WHERE t.id=$2 AND created.grouping='first'
      RETURNING t.id
    )
    SELECT created.id,created.grouping,
      (updated.id IS NOT NULL) AS first_timestamp_written
    FROM created LEFT JOIN updated ON true`,
    [orderId,id,session,previous,seconds]);
   assert.equal(result.rows.length,1);
   assert.equal(result.rows[0].grouping,['first','grouped','late'][index]);
   assert.equal(result.rows[0].first_timestamp_written,index===0);
   const lines=await client.query(`SELECT count(*)::integer AS n
    FROM sabora.order_lines WHERE order_id=$1`,[orderId]);
   assert.equal(lines.rows[0].n,1);
  }
  const firstTimestamp=await client.query(`SELECT first_confirmed_at
   FROM sabora.dining_tables WHERE id=$1`,[id]);
  assert.ok(firstTimestamp.rows[0].first_confirmed_at instanceof Date);
  await client.query('ROLLBACK');
  const surviving=await pool.query(`SELECT count(*)::integer AS n
   FROM sabora.orders WHERE id=ANY($1::uuid[])`,[orderIds]);
  assert.equal(surviving.rows[0].n,0);
  const survivingLines=await pool.query(`SELECT count(*)::integer AS n
   FROM sabora.order_lines WHERE order_id=ANY($1::uuid[])`,[orderIds]);
  assert.equal(survivingLines.rows[0].n,0);
 } finally{
  await client.query('ROLLBACK').catch(()=>{});
  client.release();
 }
});

test('PG17 real schema enforces RLS and excludes anonymous order-writing grants',async()=>{
 const relations=['orders','order_lines','catalog_confirmation_attempts'];
 const rows=await pool.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
  has_table_privilege('anon',c.oid,'INSERT') AS anon_insert,
  has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated_insert
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relname=ANY($1::text[])
    AND c.relkind IN ('r','p')`,[relations]);
 assert.equal(rows.rows.length,relations.length);
 for(const row of rows.rows){
  assert.equal(row.relrowsecurity,true,row.relname+' must enable RLS');
  assert.equal(row.relforcerowsecurity,true,row.relname+' must force RLS');
  assert.equal(row.anon_insert,false,row.relname+' must deny anon INSERT');
  assert.equal(row.authenticated_insert,false,row.relname+' must deny authenticated INSERT');
 }
});

test('canonical Node writer persists order, ledger and kitchen in one PG17 transaction',async()=>{
 const tableId='cafe0000-0000-4000-8000-000000000081';
 const itemId='cafe0000-0000-4000-8000-000000000082';
 const orderId='cafe0000-0000-4000-8000-000000000083';
 const snapshot={name:'Plato',category:'Primeros',priceCents:1000,
  allergens:[],options:[],extras:[],discount:null};
 const evidence=buildCatalogLineEvidence({itemId,publishedRevision:1,
  snapshot,selection:{options:{},extras:[]},quantity:1});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const query=(sql,args)=>client.query(sql,args);
  const table=await query(`INSERT INTO sabora.dining_tables
   (id,number,capacity,qr_token_hash,ordering_state)
   VALUES ($1,930281,4,decode(repeat('81',32),'hex'),'open')
   RETURNING session_id`,[tableId]);
  await query(`INSERT INTO sabora.catalog_items(id,draft)
   VALUES ($1,'{}'::jsonb)`,[itemId]);
  const context={authorized:true,canOrder:true,tableId,
   sessionId:table.rows[0].session_id,visitId:'visit_real_writer',
   basketId:'basket_real_writer',actorId:'actor_real_writer',
   customerAlias:'Cliente',customerIdentifier:'SB-23456789ABCD'};
  const quote=await query(`INSERT INTO sabora.catalog_displayed_quotes
   (table_id,session_id,visit_id,basket_id,actor_id,item_id,
    published_revision,subtotal_cents,discount_cents,total_cents,
    evidence,expires_at)
   VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10::jsonb,
    clock_timestamp()+interval '5 minutes')
   RETURNING id`,[tableId,context.sessionId,context.visitId,
   context.basketId,context.actorId,itemId,evidence.subtotalCents,
   evidence.discountCents,evidence.totalCents,JSON.stringify(evidence)]);
  const writer=createCatalogOrderWriter({newOrderId:()=>orderId});
  const args={context,quoteId:quote.rows[0].id,
   requestKey:'real_writer_0001',requestFingerprint:'real_writer_fingerprint_0001',
   evidence,requiresAcceptance:false,acceptanceVerified:false};
  const result=await writer.persist(query,args);
  assert.equal(result.orderId,orderId);
  const saved=await query('SELECT grouping FROM sabora.orders WHERE id=$1',[orderId]);
  assert.equal(saved.rows[0].grouping,'first');
  const kitchen=await query(`SELECT count(*)::integer AS n
   FROM sabora.order_lines WHERE order_id=$1`,[orderId]);
  assert.equal(kitchen.rows[0].n,1);
  const ledger=await query(`SELECT order_id,economic_evidence
   FROM sabora.catalog_confirmation_attempts WHERE order_id=$1`,[orderId]);
  assert.equal(ledger.rows.length,1);
  assert.equal(ledger.rows[0].order_id,orderId);
  assert.deepEqual(ledger.rows[0].economic_evidence,evidence);
  // Real repository replay: the immutable ledger must be queryable with
  // the exact six-column authorized scope and return the original order.
  const reads=createCatalogConfirmationReadRepository();
  const replay=await reads.lookupIdempotency(query,{
   context,requestKey:args.requestKey,
   requestFingerprint:args.requestFingerprint
  });
  assert.deepEqual(replay,{
   requestFingerprint:args.requestFingerprint,
   result:{orderId}
  });
  const absentReplay=await reads.lookupIdempotency(query,{
   context:{...context,basketId:'another_basket'},
   requestKey:args.requestKey,
   requestFingerprint:args.requestFingerprint
  });
  assert.equal(absentReplay,null);
  const otherActorReplay=await reads.lookupIdempotency(query,{
   context:{...context,actorId:'another_actor'},
   requestKey:args.requestKey,
   requestFingerprint:args.requestFingerprint
  });
  assert.equal(otherActorReplay,null);
  const lockedCatalog=await reads.lockCatalog(query,{context,itemId});
  assert.equal(lockedCatalog.available,false,
   'unpublished catalog item must not be orderable by coordinator');
  const loadedQuote=await reads.loadPreviousQuote(query,{context,itemId});
  assert.equal(loadedQuote.quoteId,quote.rows[0].id);
  assert.deepEqual(loadedQuote.evidence,evidence);
  assert.equal(loadedQuote.totalCents,evidence.totalCents);
  assert.equal(await reads.loadPreviousQuote(query,{
   context:{...context,sessionId:'cafe0000-0000-4000-8000-000000000098'},
   itemId
  }),null);
  assert.equal(await reads.loadPreviousQuote(query,{
   context:{...context,visitId:'another_visit'},itemId
  }),null);
  await query('SAVEPOINT expired_quote');
  await query(`UPDATE sabora.catalog_displayed_quotes
   SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
   [quote.rows[0].id]);
  assert.equal(await reads.loadPreviousQuote(query,{context,itemId}),null);
  await query('ROLLBACK TO SAVEPOINT expired_quote');
  assert.equal((await reads.loadPreviousQuote(query,{context,itemId})).quoteId,
   quote.rows[0].id);
  // The canonical writer (not a copied CTE) must respect both sides of
  // the real configurable grouping window and produce kitchen projections.
  for(const [index,expected,elapsed] of [
   [0,'grouped',30],[1,'late',301]
  ]){
   const subsequentId='cafe0000-0000-4000-8000-00000000008'+(5+index);
   await query(`UPDATE sabora.dining_tables
    SET first_confirmed_at=clock_timestamp()-make_interval(secs=>$2)
    WHERE id=$1`,[tableId,elapsed]);
   const subsequentQuote=await query(`INSERT INTO sabora.catalog_displayed_quotes
    (table_id,session_id,visit_id,basket_id,actor_id,item_id,
     published_revision,subtotal_cents,discount_cents,total_cents,
     evidence,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10::jsonb,
     clock_timestamp()+interval '5 minutes') RETURNING id`,
    [tableId,context.sessionId,context.visitId,context.basketId,
     context.actorId,itemId,evidence.subtotalCents,evidence.discountCents,
     evidence.totalCents,JSON.stringify(evidence)]);
   const subsequentWriter=createCatalogOrderWriter({
    newOrderId:()=>subsequentId
   });
   const written=await subsequentWriter.persist(query,{
    ...args,quoteId:subsequentQuote.rows[0].id,
    requestKey:'real_writer_group_'+index
   });
   assert.equal(written.orderId,subsequentId);
   const grouping=await query('SELECT grouping FROM sabora.orders WHERE id=$1',
    [subsequentId]);
   assert.equal(grouping.rows[0].grouping,expected);
   const kitchenRows=await query(`SELECT count(*)::integer AS n
    FROM sabora.order_lines WHERE order_id=$1`,[subsequentId]);
   assert.equal(kitchenRows.rows[0].n,1);
   const confirmation=await query(`SELECT count(*)::integer AS n
    FROM sabora.catalog_confirmation_attempts WHERE order_id=$1`,
    [subsequentId]);
   assert.equal(confirmation.rows[0].n,1);
  }
  // A bad quote must fail inside a savepoint; the outer transaction and
  // its original successful ledger entry remain untouched.
  await query('SAVEPOINT bad_quote');
  const failedId='cafe0000-0000-4000-8000-000000000084';
  const failedWriter=createCatalogOrderWriter({newOrderId:()=>failedId});
  await assert.rejects(failedWriter.persist(query,{
   ...args,requestKey:'real_writer_0002',
   quoteId:'cafe0000-0000-4000-8000-000000000099'
  }));
  await query('ROLLBACK TO SAVEPOINT bad_quote');
  const absent=await query(`SELECT count(*)::integer AS n
   FROM sabora.orders WHERE id=$1`,[failedId]);
  assert.equal(absent.rows[0].n,0);
  const absentKitchen=await query(`SELECT count(*)::integer AS n
   FROM sabora.order_lines WHERE order_id=$1`,[failedId]);
  assert.equal(absentKitchen.rows[0].n,0);
  const retained=await query(`SELECT count(*)::integer AS n
   FROM sabora.catalog_confirmation_attempts WHERE order_id=$1`,[orderId]);
  assert.equal(retained.rows[0].n,1);
 } finally{
  // The ledger is append-only: never DELETE or UPDATE it for test cleanup.
  // Rolling back the enclosing fixture transaction removes all its rows.
  await client.query('ROLLBACK').catch(()=>{});
  client.release();
 }
 const absent=await pool.query(`SELECT count(*)::integer AS n
  FROM sabora.orders WHERE id=$1`,[orderId]);
 assert.equal(absent.rows[0].n,0);
 const absentLedger=await pool.query(`SELECT count(*)::integer AS n
  FROM sabora.catalog_confirmation_attempts WHERE order_id=$1`,[orderId]);
 assert.equal(absentLedger.rows[0].n,0);
});

test('real PG17 coordinator refuses unrecognized QR/visit and never persists',async()=>{
 const tableId='cafe0000-0000-4000-8000-000000000091';
 const itemId='cafe0000-0000-4000-8000-000000000092';
 const confirm=createCatalogOrderConfirmationPoolCandidate({
  pool,secretKey:'ci-only-catalog-coordinator-secret-key-32',
  newOrderId:()=> 'cafe0000-0000-4000-8000-000000000093'
 });
 const input={tableId,visitId:'visit_real_denied',basketId:'basket_real_denied',
  actorId:'actor_real_denied',itemId,selection:{options:{},extras:[]},
  quantity:1,requestKey:'request_real_denied_01',
  qrToken:'q'.repeat(64),customerSessionToken:'s'.repeat(64)};
 const table=await pool.query('SELECT count(*)::integer AS n FROM sabora.dining_tables WHERE id=$1',[tableId]);
 assert.equal(table.rows[0].n,0);
 await assert.rejects(confirm(input),/order_context_forbidden/);
 // A replay key cannot bypass visit authorization, even with a real pool.
 await assert.rejects(confirm(input),/order_context_forbidden/);
 const orders=await pool.query('SELECT count(*)::integer AS n FROM sabora.orders WHERE id=$1',
  ['cafe0000-0000-4000-8000-000000000093']);
 assert.equal(orders.rows[0].n,0);
 const attempts=await pool.query(`SELECT count(*)::integer AS n
  FROM sabora.catalog_confirmation_attempts WHERE table_id=$1`,[tableId]);
 assert.equal(attempts.rows[0].n,0);
});

test('real PG17 coordinator rejects QR mismatch even for an existing open table',async()=>{
 const tableId='cafe0000-0000-4000-8000-000000000094';
 const itemId='cafe0000-0000-4000-8000-000000000095';
 const orderId='cafe0000-0000-4000-8000-000000000096';
 const correctQr='real_correct_qr_token_'.repeat(3);
 const confirm=createCatalogOrderConfirmationPoolCandidate({
  pool,secretKey:'ci-only-catalog-coordinator-secret-key-32',
  newOrderId:()=>orderId
 });
 const input={tableId,visitId:'visit_real_qr_denied',basketId:'basket_real_qr_denied',
  actorId:'actor_real_qr_denied',itemId,selection:{options:{},extras:[]},
  quantity:1,requestKey:'request_real_qr_denied_01',
  qrToken:'wrong_qr_token_'.repeat(4),customerSessionToken:'s'.repeat(64)};
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query(`INSERT INTO sabora.dining_tables
   (id,number,capacity,qr_token_hash,ordering_state)
   VALUES ($1,930294,4,sha256(convert_to($2,'UTF8')),'open')`,
   [tableId,correctQr]);
  // The candidate uses a different connection and cannot see uncommitted
  // fixtures. Assert authorization through the real repository on this client
  // while the table exists, then roll the fixture back without DELETE.
  const {createCatalogVisitContextRepository}=await import(
   '../../apps/api/src/catalog-visit-context-repository.mjs');
  const repo=createCatalogVisitContextRepository();
  const context=await repo.lockContext((sql,args)=>client.query(sql,args),input);
  assert.equal(context.authorized,false);
  assert.equal(context.canOrder,false);
 }finally{
  await client.query('ROLLBACK').catch(()=>{});
  client.release();
 }
 await assert.rejects(confirm(input),/order_context_forbidden/);
 const orders=await pool.query('SELECT count(*)::integer AS n FROM sabora.orders WHERE id=$1',[orderId]);
 assert.equal(orders.rows[0].n,0);
 const attempts=await pool.query(`SELECT count(*)::integer AS n
  FROM sabora.catalog_confirmation_attempts WHERE table_id=$1`,[tableId]);
 assert.equal(attempts.rows[0].n,0);
});
