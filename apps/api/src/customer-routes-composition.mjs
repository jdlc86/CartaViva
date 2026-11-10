import {createCustomerProtectedHook} from './customer-protected-hook.mjs';

// Candidate composition, deliberately not imported by server.mjs.
// The caller owns session-verification and all route registrations.
export function registerVerifiedCustomerRoutes(app,{verifyCustomerSession,registerRoutes}={}){
 if(!app||typeof app.register!=='function'||typeof app.hasRoute!=='function'||
    typeof verifyCustomerSession!=='function'||typeof registerRoutes!=='function')
  throw Error('invalid_customer_route_composition');
 const auth=createCustomerProtectedHook({verifyCustomerSession});
 // Encapsulation: no route is mounted until an explicit caller registers this
 // plugin. No customer data, bearer, or identity crosses into staff routes.
 return app.register(async customerScope=>{
  customerScope.addHook('preHandler',auth);
  await registerRoutes(customerScope);
 },{prefix:'/api/v1/customer'});
}
