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
