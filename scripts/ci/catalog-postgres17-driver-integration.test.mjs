import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createPostgresTransaction} from '../../apps/api/src/postgres-transaction.mjs';

// Explicitly opt-in only for the disposable PostgreSQL 17 GitHub CI harness.
// No operational DSN is read from runtime configuration.
const url=process.env.SABORA_CI_PG_URL;
const modulePath=process.env.SABORA_CI_PG_MODULE;
if(!url||!modulePath)throw Error('disposable_pg17_harness_required');
const parsed=new URL(url);
if(parsed.hostname!=='127.0.0.1'||parsed.username!=='postgres'||
   parsed.pathname!=='/postgres')throw Error('unsafe_pg17_harness_target');
const require=createRequire(import.meta.url);
const {Pool}=require(modulePath);
const pool=new Pool({connectionString:url,max:4,connectionTimeoutMillis:3000,
 idleTimeoutMillis:1000});
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
