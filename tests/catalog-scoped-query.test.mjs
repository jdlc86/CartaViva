import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogScopedQuery} from '../apps/api/src/catalog-scoped-query.mjs';
import {createCatalogReaderSql} from '../apps/api/src/catalog-reader-query.mjs';
test('catalog query executes under SET LOCAL ROLE and releases clean client',async()=>{
 const events=[];const pool={connect:async()=>({query:async(sql,params)=>{events.push([sql,params]);return {rows:[]};},release:discard=>events.push(['release',discard])})};
 const query=createCatalogScopedQuery({pool});
 await query(createCatalogReaderSql(),[]);
 assert.deepEqual(events.map(e=>e[0]),['BEGIN','SET LOCAL ROLE sabora_catalog_reader',createCatalogReaderSql(),'COMMIT','release']);
 assert.equal(events.at(-1)[1],false);
});
test('rejects arbitrary SQL before pool checkout',async()=>{
 let calls=0;const query=createCatalogScopedQuery({pool:{connect:async()=>{calls++;throw Error('unexpected');}}});
 await assert.rejects(query('SELECT * FROM sabora.catalog_items',[]),/catalog_sql_not_allowed/);
 assert.equal(calls,0);
});
test('failed query rolls back and discards client',async()=>{
 const events=[];const query=createCatalogScopedQuery({pool:{connect:async()=>({
  query:async sql=>{events.push(sql);if(sql===createCatalogReaderSql())throw Error('database_down');return {rows:[]};},
  release:discard=>events.push(['release',discard])
 })}});
 await assert.rejects(query(createCatalogReaderSql(),[]),/database_down/);
 assert.deepEqual(events.map(x=>Array.isArray(x)?x[0]:x),['BEGIN','SET LOCAL ROLE sabora_catalog_reader',createCatalogReaderSql(),'ROLLBACK','release']);
 assert.deepEqual(events.at(-1),['release',true]);
});

test('rejects unexpected parameters without opening connection',async()=>{
 let checkouts=0;
 const query=createCatalogScopedQuery({pool:{connect:async()=>{checkouts++;throw Error('unexpected');}}});
 await assert.rejects(query(createCatalogReaderSql(),['injected']),/catalog_sql_not_allowed/);
 await assert.rejects(query(createCatalogReaderSql(),null),/catalog_sql_not_allowed/);
 assert.equal(checkouts,0);
});
test('role activation failure rolls back and discards client',async()=>{
 const events=[];
 const query=createCatalogScopedQuery({pool:{connect:async()=>({
  query:async sql=>{events.push(sql);if(sql==='SET LOCAL ROLE sabora_catalog_reader')throw Error('role_denied');return {rows:[]};},
  release:discard=>events.push(['release',discard])
 })}});
 await assert.rejects(query(createCatalogReaderSql(),[]),/role_denied/);
 assert.deepEqual(events.map(x=>Array.isArray(x)?x[0]:x),['BEGIN','SET LOCAL ROLE sabora_catalog_reader','ROLLBACK','release']);
 assert.deepEqual(events.at(-1),['release',true]);
});
test('commit failure discards client rather than returning rows',async()=>{
 const events=[];
 const query=createCatalogScopedQuery({pool:{connect:async()=>({
  query:async sql=>{events.push(sql);if(sql==='COMMIT')throw Error('commit_failed');return {rows:[]};},
  release:discard=>events.push(['release',discard])
 })}});
 await assert.rejects(query(createCatalogReaderSql(),[]),/commit_failed/);
 assert.deepEqual(events.at(-1),['release',true]);
 assert.ok(events.includes('ROLLBACK'));
});
test('pool checkout failure propagates without executing SQL',async()=>{
 const query=createCatalogScopedQuery({pool:{connect:async()=>{throw Error('pool_unavailable');}}});
 await assert.rejects(query(createCatalogReaderSql(),[]),/pool_unavailable/);
});

test('BEGIN failure discards client without attempting a rollback',async()=>{
 const events=[];
 const query=createCatalogScopedQuery({pool:{connect:async()=>({
  query:async sql=>{events.push(sql);if(sql==='BEGIN')throw Error('begin_failed');},
  release:discard=>events.push(['release',discard])
 })}});
 await assert.rejects(query(createCatalogReaderSql(),[]),/begin_failed/);
 assert.deepEqual(events,['BEGIN',['release',true]]);
});
test('rollback failure never replaces the original database error',async()=>{
 const events=[];
 const query=createCatalogScopedQuery({pool:{connect:async()=>({
  query:async sql=>{
   events.push(sql);
   if(sql===createCatalogReaderSql())throw Error('original_query_failure');
   if(sql==='ROLLBACK')throw Error('rollback_failure');
   return {rows:[]};
  },
  release:discard=>events.push(['release',discard])
 })}});
 await assert.rejects(query(createCatalogReaderSql(),[]),/original_query_failure/);
 assert.deepEqual(events.at(-1),['release',true]);
 assert.ok(events.includes('ROLLBACK'));
});
test('invalid pooled client is discarded without executing SQL',async()=>{
 const releases=[];
 const query=createCatalogScopedQuery({pool:{connect:async()=>({release:discard=>releases.push(discard)})}});
 await assert.rejects(query(createCatalogReaderSql(),[]),/invalid_catalog_client/);
 assert.deepEqual(releases,[true]);
});
