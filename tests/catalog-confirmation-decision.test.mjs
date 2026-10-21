import test from 'node:test';
import assert from 'node:assert/strict';
import {decideCatalogLineConfirmation} from '../apps/api/src/catalog-confirmation-decision.mjs';
import {issueCatalogRepriceAcceptance} from '../apps/api/src/catalog-reprice-acceptance.mjs';

const itemId='123e4567-e89b-12d3-a456-426614174000';
const secretKey='secret-for-sabora-server-side-acceptance-testing-only';
const snapshot={name:'Menú',category:'Primeros',priceCents:1000,allergens:[],
 options:[],extras:[],discount:null};
const context={itemId,publishedRevision:1,snapshot,selection:{extras:[]},quantity:1,
 basketId:'basket-1',actorId:'visitor-1',secretKey,nowMs:1792600000000};
const previous={publishedRevision:1,subtotalCents:1000,discountCents:0,totalCents:1000};
const decide=(changes={})=>decideCatalogLineConfirmation({...context,previous,...changes});
const issue=changes=>issueCatalogRepriceAcceptance({...context,...changes}).token;
test('unchanged quote needs no new acceptance',()=>{
 const result=decide();
 assert.equal(result.status,'ready_for_transaction');
 assert.equal(result.requiresAcceptance,false);
 assert.equal(result.acceptanceVerified,false);
 assert.equal(result.evidence.totalCents,1000);
});
test('increased and decreased price both require explicit acceptance',()=>{
 for(const priceCents of [900,1100]){
  const changed={snapshot:{...snapshot,priceCents},publishedRevision:2};
  const pending=decide(changed);
  assert.equal(pending.status,'acceptance_required');
  assert.equal(pending.differenceCents,priceCents-1000);
  const acceptanceToken=issue(changed);
  const accepted=decide({...changed,acceptanceToken});
  assert.equal(accepted.status,'ready_for_transaction');
  assert.equal(accepted.acceptanceVerified,true);
  assert.equal(accepted.evidence.totalCents,priceCents);
 }
});
test('new revision with unchanged price still requires acceptance',()=>{
 const changed={publishedRevision:2};
 assert.equal(decide(changed).status,'acceptance_required');
 assert.equal(decide({...changed,acceptanceToken:issue(changed)}).acceptanceVerified,true);
});
test('discount change is detected and old acceptance cannot authorize new revision',()=>{
 const discounted={...snapshot,discount:{type:'percent',basisPoints:1000}};
 const changed={snapshot:discounted,publishedRevision:2};
 const token=issue(changed);
 assert.equal(decide({...changed,acceptanceToken:token}).status,'ready_for_transaction');
 assert.equal(decide({...changed,publishedRevision:3,acceptanceToken:token}).status,'acceptance_required');
 assert.equal(decide({...changed,actorId:'visitor-2',acceptanceToken:token}).status,'acceptance_required');
 assert.equal(decide({...changed,nowMs:context.nowMs+300001,acceptanceToken:token}).status,'acceptance_required');
});
test('rejects forged previous totals and invalid current selections',()=>{
 for(const p of [
  {...previous,totalCents:999},{...previous,discountCents:-1},
  {...previous,publishedRevision:0},{...previous,subtotalCents:1.5},
  null
 ])assert.throws(()=>decide({previous:p}),/invalid_catalog_confirmation/);
 assert.throws(()=>decide({selection:{extras:['not-on-menu']}}));
});
test('returns immutable evidence and does not mutate previous quote',()=>{
 const p=structuredClone(previous);
 const result=decide();
 assert.deepEqual(p,previous);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.evidence),true);
});
