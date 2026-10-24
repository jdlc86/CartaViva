import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCustomerOrderConfirmation} from '../packages/customer-consent/src/customer-confirmation-mount.mjs';
const orderId='11111111-1111-4111-8111-111111111111';
const now=1792600000000;
const token='v1.1792600300000.'+'a'.repeat(64)+'.'+'b'.repeat(64);
const challenge={error:'acceptance_required',repricing:{
 schemaVersion:1,previousTotalCents:1000,currentTotalCents:1200,differenceCents:200,
 previousPublishedRevision:1,currentPublishedRevision:2,
 acceptanceToken:token,expiresAt:now+300000
}};
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.attributes={};this.textContent='';}
 setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(k,fn){this.listeners[k]=fn;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 focus(){}
 remove(){this.removed=true;}
 click(){return this.listeners.click?.();}
}
const dom=()=>({document:{createElement:tag=>new Element(tag)},root:new Element('main')});
test('PWA mount confirms once and announces success',async()=>{
 const {document,root}=dom();const events=[];const requests=[];
 const mount=mountCustomerOrderConfirmation({document,root,
  readRequest:()=>({requestKey:'request-001'}),onState:e=>events.push(e),
  fetchImpl:async(_url,options)=>{
   requests.push(JSON.parse(options.body));
   return {status:201,json:async()=>({status:'confirmed',orderId})};
  }});
 await root.children[0].click();
 assert.equal(requests.length,1);
 assert.equal(root.children[1].textContent,'Pedido confirmado.');
 assert.equal(events.at(-1).type,'submitted');
 mount.destroy();
 assert.equal(root.children.every(n=>n.removed),true);
});
test('PWA mount shows repricing and permits decline without resending',async()=>{
 const {document,root}=dom();let requests=0;
 const mount=mountCustomerOrderConfirmation({document,root,clock:()=>now,
  readRequest:()=>({requestKey:'request-001'}),onState:()=>{},
  fetchImpl:async()=>{requests++;return {status:409,json:async()=>challenge};}});
 await root.children[0].click();
 assert.equal(root.children[2].children.length,1);
 assert.equal(root.children[0].disabled,true);
 await root.children[2].children[0].children.at(-1).click();
 assert.equal(requests,1);
 assert.equal(root.children[0].disabled,false);
 assert.equal(root.children[1].textContent,'No se ha aceptado el nuevo precio.');
 mount.destroy();
});
test('destroy prevents late response from touching detached UI',async()=>{
 const {document,root}=dom();const events=[];let resolve;
 const mount=mountCustomerOrderConfirmation({document,root,clock:()=>now,
  readRequest:()=>({requestKey:'request-001'}),onState:e=>events.push(e),
  fetchImpl:()=>new Promise(r=>{resolve=r;})});
 const pending=root.children[0].click();
 await Promise.resolve();await Promise.resolve();
 mount.destroy();
 resolve({status:409,json:async()=>challenge});
 await pending;
 assert.equal(events.length,0);
 assert.equal(root.children.every(n=>n.removed),true);
});
