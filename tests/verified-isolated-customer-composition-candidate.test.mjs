import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerVerifiedIsolatedCustomerRoutes} from '../apps/api/src/verified-isolated-customer-composition-candidate.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const reader='sabora_catalog_login',writer='sabora_order_login';
const secret='test-confirmation-secret-'.repeat(3);
function pool(login,events,{broken=false}={}){
 return {options:{user:login},connect:async()=>({
  query:async sql=>{
   events.push(sql);
   if(broken)throw Error('private_connection_secret');
   if(sql==='SELECT current_user AS role_name, session_user AS login_name')
    return {rows:[{role_name:login,login_name:login}]};
   return {rows:[]};
  },
  release:discard=>events.push(discard?'discard':'release')
 })};
}
test('verified composition preflights both effective logins before exposing routes',async()=>{
 const events=[],app=Fastify();
 const r=pool(reader,events),w=pool(writer,events);
 await registerVerifiedIsolatedCustomerRoutes(app,{
  catalogReaderPool:r,orderWriterPool:w,
  expectedCatalogLogin:reader,expectedOrderLogin:writer,
  confirmationSecret:secret
 });
 assert.deepEqual(events,[
  'SELECT current_user AS role_name, session_user AS login_name','release',
  'SELECT current_user AS role_name, session_user AS login_name','release'
 ]);
 const invalid=await app.inject({method:'POST',
  url:'/api/v1/customer/orders/confirm',payload:{totalCents:1}});
 assert.equal(invalid.statusCode,400);
 assert.deepEqual(invalid.json(),{error:'invalid_confirmation_input'});
 assert.equal((await app.inject('/api/v1/catalog')).statusCode,200);
 await app.close();
});
test('failed preflight leaves both HTTP routes unregistered and hides SQL errors',async()=>{
 for(const broken of [reader,writer]){
  const events=[],app=Fastify();
  const r=pool(reader,events,{broken:broken===reader});
  const w=pool(writer,events,{broken:broken===writer});
  await assert.rejects(()=>registerVerifiedIsolatedCustomerRoutes(app,{
   catalogReaderPool:r,orderWriterPool:w,
   expectedCatalogLogin:reader,expectedOrderLogin:writer,
   confirmationSecret:secret
  }),error=>error.message==='invalid_verified_customer_composition');
  assert.equal((await app.inject('/api/v1/catalog')).statusCode,404);
  assert.equal((await app.inject({method:'POST',
   url:'/api/v1/customer/orders/confirm',payload:{}})).statusCode,404);
  assert.equal(events.filter(x=>x==='release').length,broken===reader?1:2);
  await app.close();
 }
});
test('invalid secret and adapters do not query or register',async()=>{
 const events=[],app=Fastify();
 await assert.rejects(()=>registerVerifiedIsolatedCustomerRoutes(app,{
  catalogReaderPool:pool(reader,events),orderWriterPool:pool(writer,events),
  expectedCatalogLogin:reader,expectedOrderLogin:writer,
  confirmationSecret:'short'
 }),/invalid_verified_customer_composition/);
 assert.deepEqual(events,[]);
 assert.equal((await app.inject('/api/v1/catalog')).statusCode,404);
 await app.close();
});
