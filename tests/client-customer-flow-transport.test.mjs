import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerFlowTransport,CustomerFlowTransportError}
 from '../apps/client/src/customer-flow-transport.ts';

const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

test('customer PWA transport uses server-only same-origin cookies and never bearer tokens',async()=>{
 const calls=[];
 const transport=createCustomerFlowTransport({fetchImpl:async(path,init)=>{
  calls.push({path,init});
  if(path.endsWith('/session'))return json(200,{authenticated:true,publicId:'SB-23456789ABCD',alias:'Ana',company:null});
  if(path.endsWith('/register'))return json(201,{publicId:'SB-23456789ABCD',alias:'Ana',company:null});
  if(path.endsWith('/logout'))return json(200,{revoked:true});
  throw Error('unexpected');
 }});
 assert.equal((await transport.session()).alias,'Ana');
 assert.equal((await transport.register({alias:'Ana',company:null})).publicId,'SB-23456789ABCD');
 assert.equal(await transport.logout(),true);
 for(const call of calls){
  assert.equal(call.init.credentials,'same-origin');
  assert.equal(call.init.redirect,'error');
  assert.equal(call.init.headers.Authorization,undefined);
 }
});

test('customer PWA transport fails closed on malformed and rejected responses',async()=>{
 const transport=createCustomerFlowTransport({fetchImpl:async()=>json(401,{error:'unauthorized'})});
 await assert.rejects(transport.session(),error=>error instanceof CustomerFlowTransportError&&
  error.message==='unauthorized'&&error.status===401);
 const malformed=createCustomerFlowTransport({fetchImpl:async()=>json(200,{authenticated:true,publicId:'bad'})});
 await assert.rejects(malformed.session(),/customer_flow_unavailable/);
});
