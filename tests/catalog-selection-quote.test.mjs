import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteCatalogSelection} from '../apps/api/src/catalog-selection-quote.mjs';

const snapshot={
 name:'Pizza',category:'Segundos',priceCents:1000,allergens:['Gluten'],
 options:[{id:'size',name:'Tamaño',required:true,maxSelections:1,values:[
  {id:'normal',name:'Normal',priceCents:0,available:true,allergens:[]},
  {id:'large',name:'Grande',priceCents:250,available:true,allergens:[]},
  {id:'hidden',name:'Oculto',priceCents:100,available:false,allergens:[]}
 ]}],
 extras:[{id:'cheese',name:'Queso',priceCents:200,available:true,allergens:['Leche']},
  {id:'sold',name:'Agotado',priceCents:100,available:false,allergens:[]}],
 discount:{type:'percent',basisPoints:1000}
};
const selection={options:{size:['large']},extras:['cheese']};
test('quotes only persisted modifier prices, discount and allergens',()=>{
 const quoted=quoteCatalogSelection({snapshot,selection,quantity:2});
 assert.equal(quoted.unitSubtotalCents,1450);
 assert.equal(quoted.unitDiscountCents,145);
 assert.equal(quoted.totalCents,2610);
 assert.deepEqual(quoted.allergens,['Gluten','Leche']);
 assert.deepEqual(quoted.selected.map(item=>item.id),['large','cheese']);
 assert.equal(Object.isFrozen(quoted.selected),true);
 assert.equal(Object.isFrozen(quoted.selected[0]),true);
});
test('client cannot supply arbitrary prices or unknown or unavailable modifiers',()=>{
 for(const selected of [
  {options:{size:['large']},extras:['missing']},
  {options:{size:['hidden']},extras:[]},
  {options:{size:['large']},extras:['sold']},
  {options:{size:['large','normal']},extras:[]},
  {options:{size:['large','large']},extras:[]},
  {options:{size:[]},extras:[]},
  {options:{other:['large']},extras:[]},
  {options:{size:['large']},extras:['cheese','cheese']},
  {options:{size:['large']},extras:[],priceCents:1},
  {options:{size:['large']},extras:[1]},
  {options:[],extras:[]},
  {options:{size:'large'},extras:[]}
 ])assert.throws(()=>quoteCatalogSelection({snapshot,selection:selected}),/invalid_catalog_selection/);
});
test('invalid candidate snapshot and overflow fail closed',()=>{
 assert.throws(()=>quoteCatalogSelection({snapshot:{...snapshot,extras:[{...snapshot.extras[0],priceCents:-1}]},selection}),/invalid_catalog_selection/);
 assert.throws(()=>quoteCatalogSelection({snapshot,selection,quantity:0}),/invalid_catalog_price/);
 assert.throws(()=>quoteCatalogSelection({snapshot:{...snapshot,priceCents:Number.MAX_SAFE_INTEGER},selection}),/invalid_catalog_price/);
});
test('discount is computed from selected extras and options, not client amounts',()=>{
 const result=quoteCatalogSelection({snapshot:{...snapshot,discount:{type:'fixed',amountCents:1200}},selection:{options:{size:['normal']},extras:['cheese']}});
 assert.equal(result.unitSubtotalCents,1200);
 assert.equal(result.unitDiscountCents,1200);
 assert.equal(result.totalCents,0);
});
