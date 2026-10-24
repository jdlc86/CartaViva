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

test('concurrent confirmations are fenced before reading another basket',async()=>{
 const {document,container}=dom();
 let release,reads=0,sends=0;
 const gate=new Promise(resolve=>{release=resolve;});
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>context,readBasket:async()=>{reads++;await gate;return basket;},
  createRequestKey:()=> 'request_12345678',onOutcome:()=>{},
  fetchImpl:async()=>{sends++;return {status:201,json:async()=>({status:'confirmed',orderId})};}});
 const first=app.confirm();
 await assert.rejects(app.confirm(),/confirmation_flow_busy/);
 assert.throws(()=>app.resetForNewBasket(),/confirmation_flow_busy/);
 release();
 await first;
 assert.equal(reads,2); // initial snapshot and pre-submit revalidation
 assert.equal(sends,1);
 app.destroy();
});
test('destroy during asynchronous context read prevents HTTP submission',async()=>{
 const {document,container}=dom();
 let release,sends=0;
 const gate=new Promise(resolve=>{release=resolve;});
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:async()=>{await gate;return context;},readBasket:()=>basket,
  createRequestKey:()=> 'request_12345678',onOutcome:()=>{},
  fetchImpl:async()=>{sends++;throw Error('unexpected');}});
 const pending=app.confirm();
 app.destroy();
 release();
 await assert.rejects(pending,/confirmation_flow_disposed/);
 assert.equal(sends,0);
 assert.equal(app.status,'disposed');
});
test('HTTP authorization denial retains idempotency identity for explicit retry',async()=>{
 const {document,container}=dom();
 const sent=[];let generated=0;
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>context,readBasket:()=>basket,
  createRequestKey:()=> 'request_'+(++generated),onOutcome:()=>{},
  fetchImpl:async(_url,options)=>{
   sent.push(JSON.parse(options.body));
   return sent.length===1?
    {status:403,json:async()=>({error:'order_context_forbidden'})}:
    {status:200,json:async()=>({status:'replayed',orderId})};
  }});
 const denied=await app.confirm();
 assert.equal(denied.error,'order_context_forbidden');
 assert.equal(app.status,'idle');
 const replay=await app.confirm();
 assert.equal(replay.status,'replayed');
 assert.equal(generated,1);
 assert.equal(sent[0].requestKey,sent[1].requestKey);
 app.destroy();
});

test('late HTTP success after destroy cannot resurrect the authorized flow',async()=>{
 const {document,container}=dom();
 let release,started;const events=[];
 const entered=new Promise(resolve=>{started=resolve;});
 const gate=new Promise(resolve=>{release=resolve;});
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>context,readBasket:()=>basket,
  createRequestKey:()=> 'request_12345678',onOutcome:event=>events.push(event),
  fetchImpl:async()=>{started();await gate;return {
   status:201,json:async()=>({status:'confirmed',orderId})};}});
 const pending=app.confirm();
 await entered;
 app.destroy();
 release();
 await pending;
 assert.equal(app.status,'disposed');
 assert.deepEqual(events,[]);
});

test('basket revision changed after authorized snapshot prevents HTTP submission',async()=>{
 const {document,container}=dom();let reads=0,sends=0;
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>context,
  readBasket:()=>{reads++;return {...basket,revision:reads===1?1:2};},
  createRequestKey:()=> 'request_12345678',onOutcome:()=>{},
  fetchImpl:async()=>{sends++;throw Error('unexpected');}});
 await assert.rejects(app.confirm(),/customer_basket_changed_before_confirmation/);
 assert.equal(reads,2);
 assert.equal(sends,0);
 app.destroy();
});
test('basket becomes unconfirmable after snapshot and blocks HTTP',async()=>{
 const {document,container}=dom();let reads=0,sends=0;
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>context,
  readBasket:()=>({...basket,confirmable:++reads===1}),
  createRequestKey:()=> 'request_12345678',onOutcome:()=>{},
  fetchImpl:async()=>{sends++;throw Error('unexpected');}});
 await assert.rejects(app.confirm(),/customer_basket_changed_before_confirmation/);
 assert.equal(sends,0);
 app.destroy();
});

test('pre-submit basket readiness getter is rejected without execution',async()=>{
 const {document,container}=dom();let reads=0,sends=0;
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>context,
  readBasket:()=>{
   if(++reads===1)return basket;
   const altered={...basket};
   Object.defineProperty(altered,'confirmable',{enumerable:true,
    get(){throw Error('getter_executed');}});
   return altered;
  },
  createRequestKey:()=> 'request_12345678',onOutcome:()=>{},
  fetchImpl:async()=>{sends++;throw Error('unexpected');}});
 await assert.rejects(app.confirm(),/customer_basket_changed_before_confirmation/);
 assert.equal(sends,0);
 app.destroy();
});

test('visit authorization revoked between snapshot and send blocks HTTP',async()=>{
 const {document,container}=dom();let contexts=0,sends=0;
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>({...context,canOrder:++contexts===1}),
  readBasket:()=>basket,createRequestKey:()=> 'request_12345678',
  onOutcome:()=>{},fetchImpl:async()=>{sends++;throw Error('unexpected');}});
 await assert.rejects(app.confirm(),/customer_basket_changed_before_confirmation/);
 assert.equal(contexts,2);
 assert.equal(sends,0);
 app.destroy();
});
test('session token rotation before send blocks HTTP',async()=>{
 const {document,container}=dom();let contexts=0,sends=0;
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>({...context,customerSessionToken:++contexts===1?
   context.customerSessionToken:'r'.repeat(32)}),
  readBasket:()=>basket,createRequestKey:()=> 'request_12345678',
  onOutcome:()=>{},fetchImpl:async()=>{sends++;throw Error('unexpected');}});
 await assert.rejects(app.confirm(),/customer_basket_changed_before_confirmation/);
 assert.equal(sends,0);
 app.destroy();
});

test('item or quantity mutation with unchanged revision cannot be submitted',async()=>{
 for(const mutation of [{itemId:'dish_2'},{quantity:2},
  {selection:{extras:['new']}}]){
  const {document,container}=dom();let reads=0,sends=0;
  const app=createAuthorizedCustomerConfirmation({document,container,
   readContext:()=>context,
   readBasket:()=>++reads===1?basket:{...basket,...mutation},
   createRequestKey:()=> 'request_12345678',onOutcome:()=>{},
   fetchImpl:async()=>{sends++;throw Error('unexpected');}});
  await assert.rejects(app.confirm(),/customer_basket_changed_before_confirmation/);
  assert.equal(sends,0);
  app.destroy();
 }
});
test('semantically equal selection with reordered keys passes revalidation',async()=>{
 const {document,container}=dom();let reads=0,sends=0;
 const first={...basket,selection:{a:1,b:2}};
 const app=createAuthorizedCustomerConfirmation({document,container,
  readContext:()=>context,
  readBasket:()=>++reads===1?first:{...first,selection:{b:2,a:1}},
  createRequestKey:()=> 'request_12345678',onOutcome:()=>{},
  fetchImpl:async()=>{sends++;return {status:201,
   json:async()=>({status:'confirmed',orderId})};}});
 assert.equal((await app.confirm()).status,'confirmed');
 assert.equal(sends,1);
 app.destroy();
});
