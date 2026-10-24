import test from 'node:test';
import assert from 'node:assert/strict';
import {assertIsolatedCustomerSqlCapabilities} from '../apps/api/src/isolated-customer-sql-capabilities-preflight.mjs';

const readerLogin='sabora_catalog_login';
const writerLogin='sabora_order_login';
const row=(login,more={})=>({
 effective_role:login,login_role:login,can_login:true,
 bypass_rls:false,superuser:false,
 create_db:false,create_role:false,replication:false,inherit_role:false,can_set_catalog_reader:login===readerLogin,
 ...(login===readerLogin?{direct_catalog_execute:false,scoped_catalog_execute:true}:{direct_catalog_execute:false}),
 ...more
});
const pool=(result,events=[])=>({connect:async()=>({
 query:async sql=>{events.push(sql);return {rows:[result]};},
 release:discard=>events.push(discard?'discard':'release')
})});
const options=(reader=row(readerLogin),writer=row(writerLogin),events=[])=>({
 catalogReaderPool:pool(reader,events),orderWriterPool:pool(writer,events),
 expectedCatalogLogin:readerLogin,expectedOrderLogin:writerLogin
});
test('offline capability gate validates independent least-privilege logins',async()=>{
 const events=[];
 assert.deepEqual(await assertIsolatedCustomerSqlCapabilities(options(undefined,undefined,events)),
  {validated:true});
 assert.equal(events.filter(e=>e==='release').length,2);
 assert.equal(events.filter(e=>typeof e==='string'&&e.includes('pg_roles')).length,2);
});
test('capability gate rejects dangerous catalog and writer privileges',async()=>{
 const cases=[
  [row(readerLogin,{superuser:true}),row(writerLogin)],
  [row(readerLogin,{bypass_rls:true}),row(writerLogin)],
  [row(readerLogin,{direct_catalog_execute:true}),row(writerLogin)],
  [row(readerLogin,{scoped_catalog_execute:false}),row(writerLogin)],
  [row(readerLogin,{can_set_catalog_reader:false}),row(writerLogin)],
  [row(readerLogin),row(writerLogin,{can_set_catalog_reader:true})],
  [row(readerLogin),row(writerLogin,{bypass_rls:true})],
  [row(readerLogin),row(writerLogin,{superuser:true})],
  [row(readerLogin,{create_db:true}),row(writerLogin)],
  [row(readerLogin,{create_role:true}),row(writerLogin)],
  [row(readerLogin,{replication:true}),row(writerLogin)],
  [row(readerLogin,{inherit_role:true}),row(writerLogin)],
  [row(readerLogin),row(writerLogin,{direct_catalog_execute:true})],
  [row(readerLogin),row(writerLogin,{inherit_role:true})],
  [row(readerLogin,{login_role:'wrong_login'}),row(writerLogin)]
 ];
 for(const [reader,writer] of cases)
  await assert.rejects(assertIsolatedCustomerSqlCapabilities(options(reader,writer)),
   /invalid_customer_sql_capabilities/);
});
test('capability gate fails before any connection on missing or shared pools',async()=>{
 const shared=pool(row(readerLogin));
 await assert.rejects(assertIsolatedCustomerSqlCapabilities({
  catalogReaderPool:shared,orderWriterPool:shared,
  expectedCatalogLogin:readerLogin,expectedOrderLogin:writerLogin
 }),/invalid_customer_sql_capabilities/);
 await assert.rejects(assertIsolatedCustomerSqlCapabilities({
  ...options(),expectedOrderLogin:readerLogin
 }),/invalid_customer_sql_capabilities/);
});
test('capability gate never opens writer pool after reader denial',async()=>{
 const events=[];
 const input=options(row(readerLogin,{direct_catalog_execute:true}),row(writerLogin),events);
 await assert.rejects(assertIsolatedCustomerSqlCapabilities(input),
  /invalid_customer_sql_capabilities/);
 assert.equal(events.filter(e=>e==='release').length,1);
 assert.equal(events.filter(e=>typeof e==='string'&&e.includes('pg_roles')).length,1);
});
test('SQL failures do not expose private errors and discard broken connections',async()=>{
 const events=[];
 const input=options();
 input.catalogReaderPool={connect:async()=>({
  query:async()=>{throw Error('private_password_in_driver_error');},
  release:discard=>events.push(discard)
 })};
 await assert.rejects(assertIsolatedCustomerSqlCapabilities(input),
  error=>error.message==='invalid_customer_sql_capabilities');
 assert.deepEqual(events,[true]);
});
