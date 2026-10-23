import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
import {registerIsolatedCustomerCatalogAndOrders} from '../apps/api/src/isolated-customer-composition-candidate.mjs';
import {createCatalogReaderSql} from '../apps/api/src/catalog-reader-query.mjs';

const secret='test-secret-'.repeat(4);
const itemId='00000000-0000-4000-8000-000000000001';
const pool=events=>({connect:async()=>({
 query:async(sql,params)=>{
  events.push(sql);
  if(sql===createCatalogReaderSql())return {rows:[{
   id:itemId,published_snapshot:{name:'Agua',category:'Bebidas',
    priceCents:150,allergens:[]},sold_out:false
  }]};
  return {rows:[]};
 },
 release:discard=>events.push(discard?'discard':'release')
})});
test('isolated composition rejects shared or missing reader and writer pools',async()=>{
 const app=Fastify();
 const shared=pool([]);
 for(const options of [
  {catalogReaderPool:shared,orderWriterPool:shared,confirmationSecret:secret},
  {catalogReaderPool:shared,confirmationSecret:secret},
  {orderWriterPool:shared,confirmationSecret:secret},
  {catalogReaderPool:shared,orderWriterPool:pool([]),confirmationSecret:'short'}
 ]){
  assert.throws(()=>registerIsolatedCustomerCatalogAndOrders(app,options),
   /invalid_isolated_customer_composition/);
 }
 await app.close();
});
test('isolated composition exposes catalog with reader role and refuses unauthenticated order',async()=>{
 const reads=[],writes=[];
 const app=Fastify();
 registerIsolatedCustomerCatalogAndOrders(app,{
  catalogReaderPool:pool(reads),orderWriterPool:pool(writes),
  confirmationSecret:secret
 });
 const catalog=await app.inject({method:'GET',url:'/api/v1/catalog'});
 assert.equal(catalog.statusCode,200);
 assert.equal(catalog.headers['cache-control'],'no-store');
 assert.equal(catalog.headers['x-content-type-options'],'nosniff');
 assert.deepEqual(catalog.json(),[{
  id:itemId,name:'Agua',category:'Bebidas',priceCents:150,
  available:true,allergens:[]
 }]);
 assert.deepEqual(reads,['BEGIN','SET LOCAL ROLE sabora_catalog_reader',
  createCatalogReaderSql(),'COMMIT','release']);
 const invalid=await app.inject({method:'POST',
  url:'/api/v1/customer/orders/confirm',payload:{totalCents:1}});
 assert.equal(invalid.statusCode,400);
 assert.deepEqual(invalid.json(),{error:'invalid_confirmation_input'});
 assert.deepEqual(writes,[]);
 await app.close();
});

test('isolated composition maps reader SQL failure to public 503 without private details',async()=>{
 const app=Fastify();
 const events=[];
 registerIsolatedCustomerCatalogAndOrders(app,{
  catalogReaderPool:{connect:async()=>({
   query:async(sql)=>{
    events.push(sql);
    if(sql===createCatalogReaderSql())throw Error('private_catalog_database_secret');
    return {rows:[]};
   },
   release:discard=>events.push(discard?'discard':'release')
  })},
  orderWriterPool:pool([]),confirmationSecret:secret
 });
 const response=await app.inject({method:'GET',url:'/api/v1/catalog'});
 assert.equal(response.statusCode,503);
 assert.deepEqual(response.json(),{error:'catalog_unavailable'});
 assert.equal(response.body.includes('private_catalog_database_secret'),false);
 assert.deepEqual(events,['BEGIN','SET LOCAL ROLE sabora_catalog_reader',
  createCatalogReaderSql(),'ROLLBACK','discard']);
 await app.close();
});
test('isolated composition never uses writer pool for public catalog',async()=>{
 const reads=[],writes=[];
 const app=Fastify();
 registerIsolatedCustomerCatalogAndOrders(app,{
  catalogReaderPool:pool(reads),orderWriterPool:pool(writes),
  confirmationSecret:secret
 });
 for(let index=0;index<3;index++){
  const response=await app.inject({method:'GET',url:'/api/v1/catalog'});
  assert.equal(response.statusCode,200);
 }
 assert.equal(reads.filter(event=>event==='SET LOCAL ROLE sabora_catalog_reader').length,3);
 assert.deepEqual(writes,[]);
 await app.close();
});

test('isolated composition rejects unauthenticated structurally valid order without writing',async()=>{
 const reads=[],writes=[];
 const app=Fastify();
 registerIsolatedCustomerCatalogAndOrders(app,{
  catalogReaderPool:pool(reads),orderWriterPool:pool(writes),
  confirmationSecret:secret
 });
 const response=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
  payload:{
   tableId:itemId,visitId:'visit-001',basketId:'basket-001',
   actorId:'actor-001',itemId,selection:{},quantity:1,
   requestKey:'request-001',qrToken:'q'.repeat(32),
   customerSessionToken:'s'.repeat(32)
  }
 });
 assert.equal(response.statusCode,403);
 assert.deepEqual(response.json(),{error:'order_context_forbidden'});
 assert.equal(response.headers['cache-control'],'no-store');
 assert.equal(response.body.includes('qrToken'),false);
 assert.equal(writes.includes('COMMIT'),false);
 assert.equal(writes.includes('BEGIN'),true);
 assert.equal(writes.includes('ROLLBACK'),true);
 assert.deepEqual(reads,[]);
 await app.close();
});
