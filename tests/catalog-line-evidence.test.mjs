import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalogLineEvidence} from '../apps/api/src/catalog-line-evidence.mjs';

const itemId='123e4567-e89b-12d3-a456-426614174000';
const snapshot={
 name:'Plato',category:'Segundos',priceCents:1000,allergens:['Gluten'],
 options:[{id:'size',name:'Tamaño',required:true,maxSelections:1,values:[
  {id:'large',name:'Grande',priceCents:200,available:true,allergens:[]}
 ]}],
 extras:[{id:'cheese',name:'Queso',priceCents:150,available:true,allergens:['Leche']}],
 discount:{type:'percent',basisPoints:1000}
};
const args={itemId,publishedRevision:7,snapshot,
 selection:{options:{size:['large']},extras:['cheese']},quantity:2};
test('builds immutable versioned economic evidence with selected values and discount',()=>{
 const result=buildCatalogLineEvidence(args);
 assert.equal(result.schemaVersion,1);
 assert.equal(result.publishedRevision,7);
 assert.equal(result.unitSubtotalCents,1350);
 assert.equal(result.unitDiscountCents,135);
 assert.equal(result.totalCents,2430);
 assert.deepEqual(result.selected.map(x=>x.id),['large','cheese']);
 assert.deepEqual(result.allergens,['Gluten','Leche']);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.selected[0].allergens),true);
 assert.equal(Object.isFrozen(result.discount),true);
});
test('evidence is independent from subsequent snapshot and selection mutation',()=>{
 const local=structuredClone(args);
 const result=buildCatalogLineEvidence(local);
 local.snapshot.name='Otro';
 local.snapshot.extras[0].priceCents=9999;
 local.snapshot.discount.basisPoints=10000;
 local.selection.extras.length=0;
 assert.equal(result.itemName,'Plato');
 assert.equal(result.selected[1].priceCents,150);
 assert.equal(result.discount.basisPoints,1000);
 assert.equal(result.totalCents,2430);
});
test('rejects untrusted identifiers, revision and invalid published economics',()=>{
 for(const change of [
  {itemId:'invalid'}, {publishedRevision:0},{publishedRevision:1.5},
  {snapshot:{...snapshot,name:' '}},{snapshot:{...snapshot,category:'Otro'}},
  {snapshot:{...snapshot,allergens:[null]}},
  {selection:{options:{size:['missing']},extras:[]}},
  {selection:{options:{size:['large']},extras:['missing']}},
  {quantity:21}
 ])assert.throws(()=>buildCatalogLineEvidence({...args,...change}));
});
test('preserves fixed discount and zero totals without negative values',()=>{
 const result=buildCatalogLineEvidence({...args,quantity:1,
  snapshot:{...snapshot,discount:{type:'fixed',amountCents:2000}}});
 assert.equal(result.subtotalCents,1350);
 assert.equal(result.discountCents,1350);
 assert.equal(result.totalCents,0);
});
