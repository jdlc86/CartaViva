import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEconomicModifiers} from '../apps/api/src/catalog-economic-modifiers.mjs';

const extra={id:'queso',name:'Queso',priceCents:150,available:true,allergens:['Leche']};
const option={id:'tamano',name:'Tamaño',required:true,maxSelections:1,values:[
 {id:'normal',name:'Normal',priceCents:0,available:true,allergens:[]},
 {id:'grande',name:'Grande',priceCents:200,available:true,allergens:[]}
]};
test('candidate validator accepts explicit well-formed options extras and discounts',()=>{
 assert.equal(validateEconomicModifiers({options:[option],extras:[extra],discount:{type:'percent',basisPoints:1500}}),true);
 assert.equal(validateEconomicModifiers({extras:[extra],discount:{type:'fixed',amountCents:100}}),true);
 assert.equal(validateEconomicModifiers({options:[],extras:[],discount:null}),true);
});
test('candidate validator fails closed on malformed, duplicate or unbounded modifiers',()=>{
 for(const input of [
  null,[],{options:null},{extras:[{...extra,priceCents:1.2}]},
  {extras:[extra,extra]},{options:[option,option]},
  {options:[{...option,values:[option.values[0],option.values[0]]}]},
  {options:[{...option,maxSelections:3}]},
  {extras:[{...extra,available:'yes'}]},
  {extras:[{...extra,unexpected:true}]},
  {discount:{type:'percent',basisPoints:10001}},
  {discount:{type:'fixed',amountCents:-1}},
  {discount:{type:'coupon',amountCents:100}},
  {discount:{type:'percent',basisPoints:1000,code:'X'}},
  {extras:[{...extra,allergens:[null]}]}
 ])assert.equal(validateEconomicModifiers(input),false,JSON.stringify(input));
});
