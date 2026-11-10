import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerVerifiedCustomerApiCandidate} from '../apps/api/src/verified-customer-api-candidate.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const reader='sabora_catalog_login',writer='sabora_order_login';
function pool(login,events,{broken=false}={}){
 return {options:{user:login},connect:async()=>({
  query:async(sql)=>{
   events.push([login,sql]);
   if(broken)throw Error('private_database_credential');
   if(sql==='SELECT current_user AS role_name, session_user AS login_name')
    return {rows:[{role_name:login,login_name:login}]};
   if(sql.includes('FROM pg_roles'))
    return {rows:[{
     effective_role:login,login_role:login,can_login:true,bypass_rls:false,
     superuser:false,create_db:false,create_role:false,replication:false,
     inherit_role:false,can_set_catalog_reader:login===reader,
     direct_catalog_execute:false,
     ...(login===reader?{scoped_catalog_execute:true}:{})
    }]};
   return {rows:[]};
  },
  release:discard=>events.push([login,discard?'discard':'release']),
 })};
}
const options=(events,broken)=>({
 catalogReaderPool:pool(reader,events,{broken:broken===reader}),
 orderWriterPool:pool(writer,events,{broken:broken===writer}),
 expectedCatalogLogin:reader,expectedOrderLogin:writer,
 confirmationSecret:'isolated-confirmation-secret-'.repeat(3),
});
test('complete opt-in customer API registers health, catalog and confirmation only after preflight',async t=>{
 const events=[],app=Fastify();t.after(()=>app.close());
 assert.deepEqual(await registerVerifiedCustomerApiCandidate(app,options(events)),
  {registered:true});
 assert.equal(events.filter(x=>x[1]==='release').length,4);
 const health=await app.inject('/health');
 const ready=await app.inject('/ready');
 assert.deepEqual(health.json(),{status:'ok',service:'sabora-customer-api-candidate'});
 assert.deepEqual(ready.json(),{status:'ready',service:'sabora-customer-api-candidate'});
 assert.equal(ready.headers['cache-control'],'no-store');
 const catalog=await app.inject('/api/v1/catalog');
 assert.equal(catalog.statusCode,200);
 assert.deepEqual(catalog.json(),[]);
 const invalid=await app.inject({method:'POST',
  url:'/api/v1/customer/orders/confirm',payload:{totalCents:10}});
 assert.equal(invalid.statusCode,400);
 assert.deepEqual(invalid.json(),{error:'invalid_confirmation_input'});
});
test('failed reader or writer identity preflight leaves no public or readiness routes',async()=>{
 for(const broken of [reader,writer]){
  const events=[],app=Fastify();
  await assert.rejects(registerVerifiedCustomerApiCandidate(app,options(events,broken)),
   /invalid_verified_customer_composition/);
  for(const url of ['/health','/ready','/api/v1/catalog']){
   assert.equal((await app.inject(url)).statusCode,404);
  }
  assert.equal((await app.inject({method:'POST',
   url:'/api/v1/customer/orders/confirm',payload:{}})).statusCode,404);
  await app.close();
 }
});
test('conflicting existing routes fail before SQL checkout',async t=>{
 const events=[],app=Fastify();t.after(()=>app.close());
 app.get('/ready',async()=>({status:'unsafe'}));
 await assert.rejects(registerVerifiedCustomerApiCandidate(app,options(events)),
  /verified_customer_api_route_conflict/);
 assert.deepEqual(events,[]);
 assert.equal((await app.inject('/api/v1/catalog')).statusCode,404);
});
test('shared SQL identity and invalid secrets fail closed without exposing readiness',async t=>{
 const events=[],app=Fastify();t.after(()=>app.close());
 const config=options(events);
 config.orderWriterPool.options.user=reader;
 await assert.rejects(registerVerifiedCustomerApiCandidate(app,config),
  /invalid_verified_customer_composition/);
 assert.deepEqual(events,[]);
 assert.equal((await app.inject('/ready')).statusCode,404);
});

test('readiness turns 503 when reader or writer fails after successful startup',async t=>{
 const events=[],app=Fastify();t.after(()=>app.close());
 const config=options(events);
 await registerVerifiedCustomerApiCandidate(app,config);
 assert.equal((await app.inject('/ready')).statusCode,200);
 const oldReader=config.catalogReaderPool.connect;
 config.catalogReaderPool.connect=async()=>{throw Error('private_reader_secret');};
 let response=await app.inject('/ready');
 assert.equal(response.statusCode,503);
 assert.deepEqual(response.json(),{status:'unavailable'});
 assert.equal(response.body.includes('private'),false);
 config.catalogReaderPool.connect=oldReader;
 const oldWriter=config.orderWriterPool.connect;
 config.orderWriterPool.connect=async()=>{throw Error('private_writer_secret');};
 response=await app.inject('/ready');
 assert.equal(response.statusCode,503);
 assert.deepEqual(response.json(),{status:'unavailable'});
 config.orderWriterPool.connect=oldWriter;
 assert.equal((await app.inject('/ready')).statusCode,200);
});
test('readiness rejects changed effective SQL identity and discards suspect connection',async t=>{
 const events=[],app=Fastify();t.after(()=>app.close());
 const config=options(events);
 await registerVerifiedCustomerApiCandidate(app,config);
 const old=config.orderWriterPool.connect;
 config.orderWriterPool.connect=async()=>{
  const client=await old();
  const query=client.query;
  client.query=async sql=>sql==='SELECT current_user AS role_name, session_user AS login_name'?
   {rows:[{role_name:'postgres',login_name:'postgres'}]}:query(sql);
  return client;
 };
 const response=await app.inject('/ready');
 assert.equal(response.statusCode,503);
 assert.deepEqual(response.json(),{status:'unavailable'});
 assert.ok(events.some(([login,event])=>login===writer&&event==='discard'));
});
