import test from 'node:test';
import assert from 'node:assert/strict';
import {createRepricingConsentController} from '../packages/customer-consent/src/repricing-consent.mjs';
import {mountRepricingConsentPanel} from '../packages/customer-consent/src/repricing-consent-panel.mjs';
const now=1792600000000;
const token='v1.1792600300000.'+'a'.repeat(64)+'.'+'b'.repeat(64);
const challenge={error:'acceptance_required',repricing:{
 schemaVersion:1,previousTotalCents:2000,currentTotalCents:1800,differenceCents:-200,
 previousPublishedRevision:1,currentPublishedRevision:2,
 acceptanceToken:token,expiresAt:now+300000
}};
function dom(){
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.attributes={};this.textContent='';}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(name,handler){this.listeners[name]=handler;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  focus(){this.focused=true;}
  click(){return this.listeners.click?.();}
 }
 return {document:{createElement:tag=>new Element(tag)},container:new Element('div')};
}
const buttons=container=>container.children[0]?.children.filter(n=>n.tag==='button')??[];
test('accessible price panel renders monetary comparison but never HMAC token',()=>{
 const {document,container}=dom();
 const controller=createRepricingConsentController({clock:()=>now,submit:async()=>({status:'confirmed'})});
 controller.present(challenge,{requestKey:'request-001'});
 const panel=mountRepricingConsentPanel({document,container,controller,onOutcome:()=>{}});
 const section=container.children[0];
 assert.equal(section.attributes.role,'dialog');
 assert.equal(section.attributes['aria-modal'],'true');
 assert.equal(section.children[0].textContent,'El precio del pedido ha cambiado');
 assert.match(section.children[2].textContent,/20,00/);
 assert.match(section.children[3].textContent,/18,00/);
 assert.equal(JSON.stringify(section).includes(token),false);
 assert.equal(buttons(container).length,2);
 panel.destroy();assert.equal(container.children.length,0);
});
test('decline never submits an order and closes consent panel',async()=>{
 const {document,container}=dom();
 let submits=0;const events=[];
 const controller=createRepricingConsentController({clock:()=>now,submit:async()=>{submits++;}});
 controller.present(challenge,{requestKey:'request-001'});
 mountRepricingConsentPanel({document,container,controller,onOutcome:e=>events.push(e)});
 await buttons(container)[1].click();
 assert.equal(submits,0);
 assert.equal(controller.status,'idle');
 assert.equal(container.children.length,0);
 assert.equal(events[0].type,'declined');
});
test('accept button submits exactly once and notifies caller',async()=>{
 const {document,container}=dom();
 const events=[];const calls=[];
 const controller=createRepricingConsentController({clock:()=>now,submit:async body=>{
  calls.push(body);return {status:'confirmed'};
 }});
 controller.present(challenge,{requestKey:'request-001'});
 mountRepricingConsentPanel({document,container,controller,onOutcome:e=>events.push(e)});
 await buttons(container)[0].click();
 assert.deepEqual(calls,[{requestKey:'request-001',acceptanceToken:token}]);
 assert.equal(events[0].type,'submitted');
 assert.equal(container.children.length,0);
});
test('busy consent disables both buttons until submission resolves',async()=>{
 const {document,container}=dom();
 let resolve;const events=[];
 const controller=createRepricingConsentController({clock:()=>now,submit:()=>new Promise(r=>{resolve=r;})});
 controller.present(challenge,{requestKey:'request-001'});
 mountRepricingConsentPanel({document,container,controller,onOutcome:e=>events.push(e)});
 const [accept,decline]=buttons(container);
 const first=accept.click();
 assert.equal(accept.disabled,true);
 assert.equal(decline.disabled,true);
 await decline.click();
 assert.equal(events.length,0);
 resolve({status:'confirmed'});
 await first;
 assert.equal(events.length,1);
});
