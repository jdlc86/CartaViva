import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCatalogQuote} from '../apps/api/src/catalog-reprice-gate.mjs';

const snapshot={priceCents:1000,options:[],extras:[],discount:null,allergens:[]};
const previous={publishedRevision:1,subtotalCents:1000,discountCents:0,totalCents:1000};
const args={previous,currentRevision:1,snapshot,selection:{options:{},extras:[]}};
test('same revision and same price does not require new acceptance',()=>{
 const result=compareCatalogQuote(args);
 assert.equal(result.requiresAcceptance,false);
 assert.equal(result.differenceCents,0);
});
test('higher or lower price always requires explicit acceptance',()=>{
 const higher=compareCatalogQuote({...args,currentRevision:2,snapshot:{...snapshot,priceCents:1200}});
 assert.equal(higher.requiresAcceptance,true);
 assert.equal(higher.differenceCents,200);
 const lower=compareCatalogQuote({...args,currentRevision:2,snapshot:{...snapshot,priceCents:800}});
 assert.equal(lower.requiresAcceptance,true);
 assert.equal(lower.differenceCents,-200);
});
test('publication revision change requires acceptance even if price is unchanged',()=>{
 const result=compareCatalogQuote({...args,currentRevision:2});
 assert.equal(result.requiresAcceptance,true);
 assert.equal(result.differenceCents,0);
});
test('changed discount requires acceptance even if gross subtotal stays the same',()=>{
 const result=compareCatalogQuote({...args,snapshot:{...snapshot,discount:{type:'fixed',amountCents:100}}});
 assert.equal(result.requiresAcceptance,true);
 assert.equal(result.current.discountCents,100);
});
test('invalid or inconsistent previous quote fails closed',()=>{
 for(const invalid of [
  {...previous,publishedRevision:0},
  {...previous,totalCents:-1},
  {...previous,totalCents:1001},
  {...previous,discountCents:2000},
  {...previous,subtotalCents:1.5}
 ])assert.throws(()=>compareCatalogQuote({...args,previous:invalid}),/invalid_catalog_quote_comparison/);
});
