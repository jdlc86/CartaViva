import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {registerVerifiedCustomerRoutes} from '../apps/api/src/customer-routes-composition.mjs';

const token='A'.repeat(43);
const id='00000000-0000-4000-8000-000000000111';
test('customer scope rejects anonymous and public IDs, exposes only verified identity',async()=>{
 const app=Fastify();
 const seen=[];
 await registerVerifiedCustomerRoutes(app,{
  verifyCustomerSession:async bearer=>bearer===token?{customerId:id,alias:'Private'}:null,
  registerRoutes:async scope=>{
   scope.get('/me',async req=>{
    seen.push(req.customerIdentity);
    return {customerId:req.customerIdentity.customerId};
   });
  }
 });
 await app.ready();
 for(const authorization of [undefined,'Bearer SB-222222222222','Bearer '+'B'.repeat(43)]){
  const res=await app.inject({method:'GET',url:'/api/v1/customer/me',headers:authorization?{authorization}:{}});
  assert.equal(res.statusCode,401);
  assert.deepEqual(res.json(),{error:'unauthorized'});
 }
 const ok=await app.inject({method:'GET',url:'/api/v1/customer/me',headers:{authorization:'Bearer '+token}});
 assert.equal(ok.statusCode,200);
 assert.deepEqual(ok.json(),{customerId:id});
 assert.deepEqual(seen,[{customerId:id}]);
 await app.close();
});
test('customer authentication is encapsulated and never guards unrelated routes',async()=>{
 const app=Fastify();
 app.get('/health',async()=>({status:'ok'}));
 await registerVerifiedCustomerRoutes(app,{
  verifyCustomerSession:async()=>null,
  registerRoutes:async scope=>scope.get('/me',async()=>({ok:true}))
 });
 await app.ready();
 assert.equal((await app.inject('/health')).statusCode,200);
 assert.equal((await app.inject('/api/v1/customer/me')).statusCode,401);
 await app.close();
});
test('invalid composition fails before mounting any customer routes',async()=>{
 const app=Fastify();
 assert.throws(()=>registerVerifiedCustomerRoutes(app,{registerRoutes:()=>{}}),/invalid_customer_route_composition/);
 assert.equal(app.hasRoute({method:'GET',url:'/api/v1/customer/me'}),false);
 await app.close();
});
