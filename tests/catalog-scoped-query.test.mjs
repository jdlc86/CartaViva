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
