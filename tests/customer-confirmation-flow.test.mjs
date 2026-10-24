import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerConfirmationFlow} from '../packages/customer-consent/src/customer-confirmation-flow.mjs';
const now=1792600000000;
const orderId='11111111-1111-4111-8111-111111111111';
const token='v1.1792600300000.'+'a'.repeat(64)+'.'+'b'.repeat(64);
const challenge={error:'acceptance_required',repricing:{
 schemaVersion:1,previousTotalCents:1000,currentTotalCents:1200,differenceCents:200,
 previousPublishedRevision:1,currentPublishedRevision:2,acceptanceToken:token,
 expiresAt:now+300000
}};
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.textContent='';this.attributes={};}
 setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(k,fn){this.listeners[k]=fn;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 focus(){this.focused=true;}
 click(){return this.listeners.click?.();}
}
const dom=()=>({document:{createElement:tag=>new Element(tag)},container:new Element('div')});
const request={requestKey:'request-001',basketId:'basket-1'};
test('integrated flow requires manual acceptance before confirming exactly once',async()=>{
 const {document,container}=dom();const events=[];const sent=[];
 const flow=createCustomerConfirmationFlow({document,container,clock:()=>now,
  onOutcome:e=>events.push(e),fetchImpl:async(_url,options)=>{
   const body=JSON.parse(options.body);sent.push(body);
   return {status:sent.length===1?409:201,json:async()=>sent.length===1?
    challenge:{status:'confirmed',orderId}};
  }});
 const first=await flow.confirm(request);
 assert.equal(first.error,'acceptance_required');
 assert.equal(sent.length,1);
 assert.equal(flow.status,'awaiting_explicit_acceptance');
 assert.equal(container.children.length,1);
 await assert.rejects(flow.confirm(request),/busy/);
 await container.children[0].children.at(-2).click();
 assert.equal(sent.length,2);
 assert.equal(sent[1].requestKey,request.requestKey);
 assert.equal(sent[1].acceptanceToken,token);
 assert.equal(container.children.length,0);
 assert.equal(events.at(-1).result.status,'confirmed');
 flow.destroy();
});
test('customer rejection clears panel and does not send confirmation again',async()=>{
 const {document,container}=dom();const events=[];let calls=0;
 const flow=createCustomerConfirmationFlow({document,container,clock:()=>now,
  onOutcome:e=>events.push(e),fetchImpl:async()=>{calls++;
   return {status:409,json:async()=>challenge};
  }});
 await flow.confirm(request);
 await container.children[0].children.at(-1).click();
 assert.equal(calls,1);
 assert.equal(container.children.length,0);
 assert.equal(events.at(-1).type,'declined');
 flow.destroy();
});
test('network ambiguity does not reopen consent or fabricate order success',async()=>{
 const {document,container}=dom();const events=[];
 const flow=createCustomerConfirmationFlow({document,container,clock:()=>now,
  onOutcome:e=>events.push(e),fetchImpl:async()=>{throw Error('offline');}});
 await assert.rejects(flow.confirm(request),/confirmation_network_unknown/);
 assert.equal(events.at(-1).type,'failed');
 assert.equal(container.children.length,0);
 flow.destroy();
});
test('a second repricing challenge requires a second deliberate button click',async()=>{
 const {document,container}=dom();let calls=0;
 const flow=createCustomerConfirmationFlow({document,container,clock:()=>now,
  onOutcome:()=>{},fetchImpl:async()=>{
   calls++;return {status:calls<3?409:201,json:async()=>calls<3?
    challenge:{status:'confirmed',orderId}};
  }});
 await flow.confirm(request);
 await container.children[0].children.at(-2).click();
 assert.equal(calls,2);
 assert.equal(flow.status,'awaiting_explicit_acceptance');
 assert.equal(container.children.length,1);
 await container.children[0].children.at(-2).click();
 assert.equal(calls,3);
 assert.equal(container.children.length,0);
 flow.destroy();
});
