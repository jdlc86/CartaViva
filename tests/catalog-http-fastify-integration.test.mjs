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

test('Fastify catalog does not checkout SQL connection when pool is unavailable',async t=>{
 let checkout=0;
 const app=Fastify();t.after(()=>app.close());
 registerCatalogHttpRoute(app,{query:createCatalogScopedQuery({
  pool:{connect:async()=>{checkout++;throw Error('private pool connection detail');}}
 })});
 const r=await app.inject({method:'GET',url:'/api/v1/catalog'});
 assert.equal(checkout,1);
 assert.equal(r.statusCode,503);
 assert.deepEqual(r.json(),{error:'catalog_unavailable'});
 assert.equal(r.body.includes('private pool connection detail'),false);
});
test('Fastify catalog rejects role escalation and releases connection',async t=>{
 const statements=[];
 const app=Fastify();t.after(()=>app.close());
 registerCatalogHttpRoute(app,{query:createCatalogScopedQuery({pool:{
  connect:async()=>({
   query:async sql=>{
    statements.push(sql);
    if(sql==='SET LOCAL ROLE sabora_catalog_reader')throw Error('permission denied');
    return {rows:[]};
   },
   release:discard=>statements.push(discard?'discard':'clean')
  })
 }})});
 const r=await app.inject({method:'GET',url:'/api/v1/catalog'});
 assert.equal(r.statusCode,503);
 assert.deepEqual(r.json(),{error:'catalog_unavailable'});
 assert.deepEqual(statements,['BEGIN','SET LOCAL ROLE sabora_catalog_reader',
  'ROLLBACK','discard']);
});

test('Fastify catalog rejects hostile published snapshots and never returns draft metadata',async t=>{
 const app=Fastify();t.after(()=>app.close());
 const events=[];
 let rows=[];
 registerCatalogHttpRoute(app,{query:createCatalogScopedQuery({pool:{
  connect:async()=>({
   query:async sql=>{
    events.push(sql);
    if(sql===createCatalogReaderSql())return {rows};
    return {rows:[]};
   },
   release:discard=>events.push(discard?'discard':'clean')
  })
 }})});
 const cases=[
  [{id,published_snapshot:{name:'Invalid',category:'Bebidas',
   priceCents:-1,allergens:[]},sold_out:false}],
  [{id,published_snapshot:{name:'Agua',category:'Bebidas',
   priceCents:100,allergens:[],extras:[{secret:'private'}]},sold_out:false}],
  [{id,published_snapshot:null,sold_out:false}],
  [{id,published_snapshot:{name:'Agua',category:'Bebidas',
   priceCents:100,allergens:[]},sold_out:false},
   {id,published_snapshot:{name:'Duplicated',category:'Bebidas',
   priceCents:100,allergens:[]},sold_out:false}]
 ];
 for(const candidate of cases){
  rows=candidate;
  const r=await app.inject({method:'GET',url:'/api/v1/catalog'});
  assert.equal(r.statusCode,503);
  assert.deepEqual(r.json(),{error:'catalog_unavailable'});
  assert.equal(r.body.includes('private'),false);
 }
 assert.equal(events.filter(x=>x==='SET LOCAL ROLE sabora_catalog_reader').length,cases.length);
 assert.equal(events.filter(x=>x==='clean').length,cases.length);
});
