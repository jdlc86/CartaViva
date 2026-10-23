import test from 'node:test';
import assert from 'node:assert/strict';
import {assertIsolatedCustomerPoolIdentities} from '../apps/api/src/isolated-pool-identity-preflight.mjs';

const reader='sabora_catalog_login';
const writer='sabora_order_login';
function pool(role,login=role,{error=false,rows}={}){
 const queries=[],releases=[];
 return {
  queries,releases,
  connect:async()=>({
   query:async sql=>{
    queries.push(sql);
    if(error)throw Error('private_password_and_host');
    return {rows:rows??[{role_name:role,login_name:login}]};
   },
   release:()=>releases.push(true)
  })
 };
}
const args=(r,w)=>({catalogReaderPool:r,orderWriterPool:w,
 expectedCatalogLogin:reader,expectedOrderLogin:writer});
test('preflight checks effective PostgreSQL current_user and session_user on separate pools',async()=>{
 const r=pool(reader),w=pool(writer);
 assert.deepEqual(await assertIsolatedCustomerPoolIdentities(args(r,w)),{validated:true});
 assert.deepEqual(r.queries,['SELECT current_user AS role_name, session_user AS login_name']);
 assert.deepEqual(w.queries,['SELECT current_user AS role_name, session_user AS login_name']);
 assert.equal(r.releases.length,1);
 assert.equal(w.releases.length,1);
});
test('preflight fails closed on impersonation, same role and role switching',async()=>{
 for(const [r,w] of [
  [pool(writer),pool(writer)],
  [pool(reader,'shared_login'),pool(writer)],
  [pool(reader),pool(writer,reader)],
  [pool(reader),pool(reader)],
  [pool(reader,reader,{rows:[]}),pool(writer)],
  [pool(reader,reader,{rows:[{role_name:reader,login_name:reader},{role_name:reader,login_name:reader}]}),pool(writer)]
 ]){
  await assert.rejects(()=>assertIsolatedCustomerPoolIdentities(args(r,w)),
   /invalid_pool_identity_preflight/);
  assert.equal(r.releases.length,1);
 }
});
test('preflight never reveals database error or accepts unknown roles',async()=>{
 const r=pool(reader,reader,{error:true}),w=pool(writer);
 await assert.rejects(()=>assertIsolatedCustomerPoolIdentities(args(r,w)),
  error=>error.message==='invalid_pool_identity_preflight');
 assert.equal(r.releases.length,1);
 assert.equal(w.queries.length,0);
 for(const invalid of [
  args(pool('postgres'),pool(writer)),
  {...args(pool(reader),pool(writer)),expectedCatalogLogin:'postgres;DROP TABLE'},
  {...args(pool(reader),pool(writer)),expectedOrderLogin:reader}
 ]){
  await assert.rejects(()=>assertIsolatedCustomerPoolIdentities(invalid),
   /invalid_pool_identity_preflight/);
 }
});
