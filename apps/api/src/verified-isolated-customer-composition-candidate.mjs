// Opt-in async gate: verify effective PostgreSQL logins BEFORE registering
// any HTTP route. No runtime import, database provisioning or deployment.
import {assertIsolatedCustomerPoolIdentities} from './isolated-pool-identity-preflight.mjs';
import {registerIsolatedCustomerCatalogAndOrders} from './isolated-customer-composition-candidate.mjs';

export async function registerVerifiedIsolatedCustomerRoutes(app,{
 catalogReaderPool,orderWriterPool,expectedCatalogLogin,expectedOrderLogin,
 confirmationSecret,clock,newOrderId
}={}){
 if(!app||typeof app.get!=='function'||typeof app.post!=='function'||
    typeof confirmationSecret!=='string'||Buffer.byteLength(confirmationSecret,'utf8')<32||
    (clock!==undefined&&typeof clock!=='function')||
    (newOrderId!==undefined&&typeof newOrderId!=='function')||
    !catalogReaderPool||typeof catalogReaderPool.connect!=='function'||
    !orderWriterPool||typeof orderWriterPool.connect!=='function'||
    catalogReaderPool===orderWriterPool||
    (typeof catalogReaderPool.options?.connectionString==='string'&&
     typeof orderWriterPool.options?.connectionString==='string'&&
     catalogReaderPool.options.connectionString===orderWriterPool.options.connectionString)||
    (typeof catalogReaderPool.options?.user==='string'&&
     typeof orderWriterPool.options?.user==='string'&&
     catalogReaderPool.options.user===orderWriterPool.options.user))
  throw Error('invalid_verified_customer_composition');
 try{
  await assertIsolatedCustomerPoolIdentities({
   catalogReaderPool,orderWriterPool,expectedCatalogLogin,expectedOrderLogin
  });
 }catch{
  throw Error('invalid_verified_customer_composition');
 }
 registerIsolatedCustomerCatalogAndOrders(app,{
  catalogReaderPool,orderWriterPool,confirmationSecret,
  ...(clock===undefined?{}:{clock}),
  ...(newOrderId===undefined?{}:{newOrderId})
 });
}
