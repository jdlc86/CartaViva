import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerCatalogHttpRoute} from '../apps/api/src/catalog-http-route.mjs';
import {createCatalogScopedQuery} from '../apps/api/src/catalog-scoped-query.mjs';
import {createCatalogReaderSql} from '../apps/api/src/catalog-reader-query.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const id='11111111-1111-4111-8111-111111111111';
test('Fastify public catalog uses scoped SQL transaction and strips private columns',async t=>{
 const statements=[];
 const pool={connect:async()=>({
  query:async(sql,params)=>{
   statements.push(sql);
   if(sql===createCatalogReaderSql()){
    assert.deepEqual(params,[]);
    return {rows:[{id,published_snapshot:{
     name:'Agua',category:'Bebidas',priceCents:150,allergens:[]
    },sold_out:false,private_notes:'never expose'}]};
   }
   return {rows:[]};
  },
  release:discard=>statements.push(discard?'discard':'clean')
 })};
 const app=Fastify();t.after(()=>app.close());
 registerCatalogHttpRoute(app,{query:createCatalogScopedQuery({pool})});
 const r=await app.inject({method:'GET',url:'/api/v1/catalog'});
 assert.equal(r.statusCode,200);
 assert.equal(r.headers['cache-control'],'no-store');
 assert.equal(r.headers['x-content-type-options'],'nosniff');
 assert.deepEqual(r.json(),[{id,name:'Agua',category:'Bebidas',
  priceCents:150,available:true,allergens:[]}]);
 assert.equal(r.body.includes('private_notes'),false);
 assert.deepEqual(statements,['BEGIN','SET LOCAL ROLE sabora_catalog_reader',
  createCatalogReaderSql(),'COMMIT','clean']);
});
test('Fastify public catalog fails closed and discards connection on SQL error',async t=>{
 const statements=[];
 const pool={connect:async()=>({
  query:async(sql)=>{
   statements.push(sql);
   if(sql===createCatalogReaderSql())throw Error('private SQL credentials');
   return {rows:[]};
  },
  release:discard=>statements.push(discard?'discard':'clean')
 })};
 const app=Fastify();t.after(()=>app.close());
 registerCatalogHttpRoute(app,{query:createCatalogScopedQuery({pool})});
 const r=await app.inject({method:'GET',url:'/api/v1/catalog'});
 assert.equal(r.statusCode,503);
 assert.deepEqual(r.json(),{error:'catalog_unavailable'});
 assert.equal(r.body.includes('private SQL credentials'),false);
 assert.deepEqual(statements,['BEGIN','SET LOCAL ROLE sabora_catalog_reader',
  createCatalogReaderSql(),'ROLLBACK','discard']);
});
