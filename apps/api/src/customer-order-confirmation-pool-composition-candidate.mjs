// Explicit opt-in composition for isolated Fastify integration tests.
// This module does not create a pool, read environment variables or register
// a route in the production server.
import {createCatalogOrderConfirmationPoolCandidate} from './catalog-order-confirmation-candidate.mjs';
import {registerCustomerOrderConfirmationRoute} from './customer-order-confirmation-http-candidate.mjs';

export function registerCustomerOrderConfirmationFromPoolCandidate(app,{
 pool,secretKey,clock,newOrderId
}={}){
 if(!app||typeof app.post!=='function'||!pool||
    typeof pool.connect!=='function'||typeof secretKey!=='string'||
    Buffer.byteLength(secretKey,'utf8')<32)
  throw Error('invalid_customer_order_pool_composition');
 const confirm=createCatalogOrderConfirmationPoolCandidate({
  pool,secretKey,...(clock===undefined?{}:{clock}),
  ...(newOrderId===undefined?{}:{newOrderId})
 });
 registerCustomerOrderConfirmationRoute(app,{confirm});
}
