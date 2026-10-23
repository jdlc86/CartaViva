import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerCustomerOrderConfirmationFromPoolCandidate} from '../apps/api/src/customer-order-confirmation-pool-composition-candidate.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const endpoint='/api/v1/customer/orders/confirm';
const secretKey='only-for-isolated-integration-tests-long-secret-key';
const input={tableId:'table-1',visitId:'visit-1',basketId:'basket-1',
 actorId:'actor-1',itemId:'123e4567-e89b-12d3-a456-426614174000',
 selection:{extras:[]},quantity:1,requestKey:'request-001',
 qrToken:'q'.repeat(48),customerSessionToken:'s'.repeat(48)};
test('Fastify pool composition rejects forged price without checkout',async t=>{
 let checkouts=0;
 const app=Fastify();t.after(()=>app.close());
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  pool:{connect:async()=>{checkouts++;throw Error('unexpected checkout');}},
  secretKey
 });
 const r=await app.inject({method:'POST',url:endpoint,
  payload:{...input,totalCents:1}});
 assert.equal(r.statusCode,400);
 assert.deepEqual(r.json(),{error:'invalid_confirmation_input'});
 assert.equal(checkouts,0);
});
test('Fastify pool composition rolls back and returns 403 on forbidden visit',async t=>{
 const events=[];
 const app=Fastify();t.after(()=>app.close());
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  secretKey,pool:{connect:async()=>({
   query:async(sql)=>{
    events.push(sql);
    if(sql==='BEGIN'||sql==='ROLLBACK')return {rows:[]};
    return {rows:[]};
   },
   release:error=>events.push(error?'discard':'clean')
  })}
 });
 const r=await app.inject({method:'POST',url:endpoint,payload:input});
 assert.equal(r.statusCode,403);
 assert.deepEqual(r.json(),{error:'order_context_forbidden'});
 assert.equal(events[0],'BEGIN');
 assert.ok(events.includes('ROLLBACK'));
 assert.equal(events.includes('COMMIT'),false);
 assert.equal(events.at(-1),'clean');
});
test('Fastify pool composition hides database error and rolls back',async t=>{
 const events=[];
 const app=Fastify();t.after(()=>app.close());
 registerCustomerOrderConfirmationFromPoolCandidate(app,{
  secretKey,pool:{connect:async()=>({
   query:async sql=>{
    events.push(sql);
    if(sql!=='BEGIN'&&sql!=='ROLLBACK')
     throw Error('postgres://internal:private@database');
    return {rows:[]};
   },
   release:error=>events.push(error?'discard':'clean')
  })}
 });
 const r=await app.inject({method:'POST',url:endpoint,payload:input});
 assert.equal(r.statusCode,503);
 assert.deepEqual(r.json(),{error:'order_confirmation_unavailable'});
 assert.equal(r.body.includes('private'),false);
 assert.ok(events.includes('ROLLBACK'));
 assert.equal(events.includes('COMMIT'),false);
});
test('pool composition fails closed before registering route with missing dependencies',()=>{
 const app=Fastify();
 assert.throws(()=>registerCustomerOrderConfirmationFromPoolCandidate(app,{
  pool:{connect:async()=>({})},secretKey:'short'
 }),/invalid_customer_order_pool_composition/);
 return app.close();
});
