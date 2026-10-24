import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthorizedCustomerConfirmation}
 from '../packages/customer-consent/src/customer-authorized-confirmation.mjs';
const orderId='11111111-1111-4111-8111-111111111111';
const context={authorized:true,canOrder:true,tableId:'table_1',visitId:'visit_1',
 actorId:'actor_1',qrToken:'q'.repeat(32),customerSessionToken:'s'.repeat(32)};
const basket={confirmable:true,basketId:'basket_1',revision:1,
 itemId:'dish_1',selection:{extras:[]},quantity:1};
const dom=()=>({document:{createElement:()=>({setAttribute(){},append(){},replaceChildren(){},focus(){}})},
 container:{append(){},replaceChildren(){}}});
test('authorized composition sends once, blocks duplicate, then resets for new basket',async()=>{
 const {document,container}=dom();let keys=0;const sent=[];
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>context,readBasket:()=>basket,
  createRequestKey:()=> 'request_'+(++keys),
  onOutcome:()=>{},fetchImpl:async(_url,options)=>{
   sent.push(JSON.parse(options.body));
   return {status:201,json:async()=>({status:'confirmed',orderId})};
  }});
 const result=await app.confirm();
 assert.equal(result.status,'confirmed');
 assert.equal(app.status,'completed');
 assert.equal(sent.length,1);
 await assert.rejects(app.confirm(),/confirmation_flow_busy/);
 app.resetForNewBasket();
 assert.equal(app.status,'idle');
 await app.confirm();
 assert.equal(sent.length,2);
 assert.notEqual(sent[0].requestKey,sent[1].requestKey);
 app.destroy();
});
test('ambiguous network failure retries with same idempotency key',async()=>{
 const {document,container}=dom();let keys=0;const sent=[];
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>context,readBasket:()=>basket,
  createRequestKey:()=> 'request_'+(++keys),onOutcome:()=>{},
  fetchImpl:async(_url,options)=>{
   sent.push(JSON.parse(options.body));
   if(sent.length===1)throw Error('offline');
   return {status:200,json:async()=>({status:'replayed',orderId})};
  }});
 await assert.rejects(app.confirm(),/confirmation_network_unknown/);
 const result=await app.confirm();
 assert.equal(result.status,'replayed');
 assert.equal(sent[0].requestKey,sent[1].requestKey);
 assert.equal(keys,1);
 app.destroy();
});
test('no authorization or unready basket prevents sending any HTTP request',async()=>{
 const {document,container}=dom();let sends=0;
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>({...context,canOrder:false}),readBasket:()=>basket,
  createRequestKey:()=> 'request_123',onOutcome:()=>{},
  fetchImpl:async()=>{sends++;throw Error('unexpected');}});
 await assert.rejects(app.confirm(),/customer_session_not_authorized/);
 assert.equal(sends,0);
 app.destroy();
});
