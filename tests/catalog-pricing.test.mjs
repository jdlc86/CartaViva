import test from 'node:test';
import assert from 'node:assert/strict';
import {priceCatalogLine} from '../apps/api/src/catalog-pricing.mjs';

test('discount uses base plus extras and multiplies by quantity',()=>{
 assert.deepEqual(priceCatalogLine({basePriceCents:1000,extras:[200,50],quantity:2,discount:{type:'percent',basisPoints:1000}}),{
  unitSubtotalCents:1250,unitDiscountCents:125,subtotalCents:2500,discountCents:250,totalCents:2250,quantity:2
 });
});
test('fixed discount cannot make negative totals',()=>{
 const result=priceCatalogLine({basePriceCents:100,extras:[20],discount:{type:'fixed',amountCents:500}});
 assert.equal(result.totalCents,0);
 assert.equal(result.discountCents,120);
});
test('percentage rounding is deterministic in integer cents',()=>{
 assert.equal(priceCatalogLine({basePriceCents:5,discount:{type:'percent',basisPoints:1000}}).unitDiscountCents,1);
 assert.equal(priceCatalogLine({basePriceCents:4,discount:{type:'percent',basisPoints:1000}}).unitDiscountCents,0);
});
test('invalid prices and economic rules fail closed',()=>{
 for(const args of [
  {basePriceCents:-1},{basePriceCents:1.5},{basePriceCents:1,extras:[-1]},
  {basePriceCents:1,quantity:0},{basePriceCents:1,discount:{type:'percent',basisPoints:10001}},
  {basePriceCents:1,discount:{type:'fixed',amountCents:-1}},
  {basePriceCents:1,discount:{type:'coupon',amountCents:1}},
  {basePriceCents:Number.MAX_SAFE_INTEGER,extras:[1]}
 ])assert.throws(()=>priceCatalogLine(args),/invalid_catalog_/);
});

test('zero-price items and full percentage discounts never produce negative cents',()=>{
 assert.deepEqual(priceCatalogLine({basePriceCents:0,quantity:3,discount:{type:'percent',basisPoints:10000}}),{
  unitSubtotalCents:0,unitDiscountCents:0,subtotalCents:0,discountCents:0,totalCents:0,quantity:3
 });
 assert.equal(priceCatalogLine({basePriceCents:1,extras:[2],quantity:20,discount:{type:'percent',basisPoints:10000}}).totalCents,0);
});
test('discount applies per unit before quantity, with deterministic rounding',()=>{
 const result=priceCatalogLine({basePriceCents:5,quantity:3,discount:{type:'percent',basisPoints:1000}});
 assert.deepEqual(result,{unitSubtotalCents:5,unitDiscountCents:1,subtotalCents:15,discountCents:3,totalCents:12,quantity:3});
});
test('overflow and invalid extras are rejected even with a full discount',()=>{
 for(const args of [
  {basePriceCents:Number.MAX_SAFE_INTEGER,quantity:2,discount:{type:'percent',basisPoints:10000}},
  {basePriceCents:Number.MAX_SAFE_INTEGER,discount:{type:'percent',basisPoints:10000}},
  {basePriceCents:1,extras:[Number.MAX_SAFE_INTEGER],discount:{type:'fixed',amountCents:2}},
  {basePriceCents:1,extras:[NaN]},
  {basePriceCents:1,extras:[Infinity]},
  {basePriceCents:1,discount:{type:'percent',basisPoints:0.5}},
  {basePriceCents:1,discount:{type:'fixed',amountCents:1.5}}
 ])assert.throws(()=>priceCatalogLine(args),/invalid_catalog_/);
});

test('intermediate extras accumulation fails closed at safe integer boundary',()=>{
 assert.throws(()=>priceCatalogLine({basePriceCents:0,extras:[Number.MAX_SAFE_INTEGER,1]}),/invalid_catalog_price/);
 assert.throws(()=>priceCatalogLine({basePriceCents:1,extras:[Number.MAX_SAFE_INTEGER]}),/invalid_catalog_price/);
 assert.equal(priceCatalogLine({basePriceCents:0,extras:[Number.MAX_SAFE_INTEGER],discount:{type:'fixed',amountCents:Number.MAX_SAFE_INTEGER}}).totalCents,0);
});

test('quantity multiplication accepts exact safe-integer boundary and rejects next cent',()=>{
 const max=Number.MAX_SAFE_INTEGER;
 const safe=Math.floor(max/3);
 const result=priceCatalogLine({basePriceCents:safe,quantity:3});
 assert.equal(result.subtotalCents,safe*3);
 assert.equal(result.totalCents,safe*3);
 assert.throws(()=>priceCatalogLine({basePriceCents:safe+1,quantity:3}),/invalid_catalog_price/);
 assert.throws(()=>priceCatalogLine({basePriceCents:safe+1,quantity:3,discount:{type:'fixed',amountCents:safe+1}}),/invalid_catalog_price/);
});

test('malformed price line inputs fail with stable validation error',()=>{
 for(const input of [null,undefined,0,false,'100',[],[100]]){
  assert.throws(()=>priceCatalogLine(input),/^Error: invalid_catalog_price$/);
 }
});
