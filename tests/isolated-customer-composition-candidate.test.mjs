import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
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
