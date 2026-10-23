// Isolated integration composition. This is deliberately not imported by
// server.mjs and cannot create a database connection or change live grants.
import {createCatalogScopedQuery} from './catalog-scoped-query.mjs';
import {registerCatalogHttpRoute} from './catalog-http-route.mjs';
import {registerCustomerOrderConfirmationFromPoolCandidate} from './customer-order-confirmation-pool-composition-candidate.mjs';

// Reader and writer pools must be independently provisioned and never share
// a PostgreSQL login. The caller owns their lifecycle and credentials.
export function registerIsolatedCustomerCatalogAndOrders(app,{
 catalogReaderPool,orderWriterPool,confirmationSecret,clock,newOrderId
}={}){
 if(!app||typeof app.get!=='function'||typeof app.post!=='function'||
    !catalogReaderPool||typeof catalogReaderPool.connect!=='function'||
    !orderWriterPool||typeof orderWriterPool.connect!=='function'||
    catalogReaderPool===orderWriterPool||
    (typeof catalogReaderPool.options?.user==='string'&&
     typeof orderWriterPool.options?.user==='string'&&
     catalogReaderPool.options.user===orderWriterPool.options.user)||
    typeof confirmationSecret!=='string'||
    Buffer.byteLength(confirmationSecret,'utf8')<32||
    (clock!==undefined&&typeof clock!=='function')||
    (newOrderId!==undefined&&typeof newOrderId!=='function'))
  throw Error('invalid_isolated_customer_composition');
 // Register only after checking both injected boundaries. No runtime
 // fallback to admin pools, shared Supabase clients or environment secrets.
 registerCatalogHttpRoute(app,{query:createCatalogScopedQuery({pool:catalogReaderPool})});
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  pool:orderWriterPool,secretKey:confirmationSecret,
  ...(clock===undefined?{}:{clock}),
  ...(newOrderId===undefined?{}:{newOrderId})
 });
}
