import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogConfirmationAttemptWriter} from '../apps/api/src/catalog-confirmation-attempt-writer.mjs';

const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const itemId='00000000-0000-4000-8000-000000000003';
const quoteId='00000000-0000-4000-8000-000000000004';
const orderId='00000000-0000-4000-8000-000000000005';
const context={tableId,sessionId,visitId:'visit-1',basketId:'basket-1',actorId:'actor-1',
 authorized:true,canOrder:true};
const evidence={schemaVersion:1,itemId,publishedRevision:1,itemName:'Plato CI',
 category:'Primeros',quantity:1,basePriceCents:1000,selected:[],allergens:[],
 discount:{type:'fixed',amountCents:100},unitSubtotalCents:1000,unitDiscountCents:100,
 subtotalCents:1000,discountCents:100,totalCents:900};
const args={context,evidence,quoteId,orderId,requestKey:'request-001',
 requestFingerprint:'fingerprint',requiresAcceptance:false,acceptanceVerified:false};
const writer=createCatalogConfirmationAttemptWriter();
test('confirmation ledger binds all scope, evidence and order without browser pricing',async()=>{
 const calls=[];
 const result=await writer.insertConfirmation(async(sql,params)=>{
  calls.push({sql,params});return {rows:[{order_id:orderId}]};
 },args);
 assert.deepEqual(result,{orderId});
 assert.equal(calls.length,1);
 assert.match(calls[0].sql,/INSERT INTO sabora.catalog_confirmation_attempts/);
 assert.match(calls[0].sql,/CASE WHEN \$12 THEN clock_timestamp\(\)/);
 assert.deepEqual(calls[0].params.slice(0,9),[
  tableId,sessionId,'visit-1','basket-1','actor-1',itemId,'request-001',
  'fingerprint',quoteId]);
 assert.deepEqual(JSON.parse(calls[0].params[9]),evidence);
 assert.deepEqual(calls[0].params.slice(10),[orderId,false]);
});
test('verified reprice records server timestamp, never client timestamp',async()=>{
 const calls=[];
 await writer.insertConfirmation(async(sql,params)=>{
  calls.push({sql,params});return {rows:[{order_id:orderId}]};
 },{...args,requiresAcceptance:true,acceptanceVerified:true});
 assert.equal(calls[0].params[11],true);
 assert.equal(calls[0].sql.includes('accepted_at'),true);
});
test('invalid or spoofed persistence inputs never issue SQL',async()=>{
 let calls=0;
 const query=async()=>{calls++;return {rows:[{order_id:orderId}]};};
 for(const patch of [
  {context:{...context,authorized:false}},{context:{...context,canOrder:false}},
  {context:{...context,sessionId:'invalid'}},{requestKey:'short'},
  {requestFingerprint:'x'.repeat(16385)},{quoteId:'invalid'},{orderId:'invalid'},
  {evidence:{...evidence,itemId:'invalid'}},
  {evidence:{...evidence,totalCents:901}},
  {evidence:{...evidence,discountCents:-1}},
  {evidence:{...evidence,publishedRevision:0}},
  {evidence:{...evidence,schemaVersion:2}},
  {evidence:{...evidence,quantity:0}},
  {evidence:{...evidence,discount:null}},
  {evidence:{...evidence,basePriceCents:900}},
  {evidence:{...evidence,selected:[{id:'x',name:'Extra',priceCents:100,allergens:[]}]}},
  {evidence:{...evidence,quantity:2}},
  {evidence:{...evidence,unitSubtotalCents:999}},
  {evidence:{...evidence,unitDiscountCents:99}},
  {evidence:{...evidence,category:'invalid'}},
  {evidence:{...evidence,selected:[{id:'x',name:'Extra',priceCents:-1,allergens:[]}]}},
  {evidence:{...evidence,allergens:[null]}},
  {evidence:{...evidence,selected:[undefined]}},
  {evidence:{...evidence,discount:()=>42}},
  {requiresAcceptance:true},{acceptanceVerified:true},
  {acceptanceVerified:'true'},{evidence:null}
 ]){
  await assert.rejects(writer.insertConfirmation(query,{...args,...patch}),
   /invalid_catalog_confirmation_attempt/);
 }
 assert.equal(calls,0);
});
test('mismatched or malformed returning order id fails closed',async()=>{
 for(const response of [{rows:[]},{rows:[{order_id:quoteId}]},{rows:[{},{}]},null]){
  await assert.rejects(writer.insertConfirmation(async()=>response,args),
   /invalid_catalog_confirmation_attempt_result/);
 }
});

test('quantity-scaled evidence is checked exactly with integer arithmetic',async()=>{
 const calls=[];
 const quantityTwo={...evidence,quantity:2,subtotalCents:2000,
  discountCents:200,totalCents:1800};
 await writer.insertConfirmation(async(sql,params)=>{
  calls.push(params);return {rows:[{order_id:orderId}]};
 },{...args,evidence:quantityTwo});
 assert.equal(calls.length,1);
 assert.equal(JSON.parse(calls[0][9]).totalCents,1800);
 await assert.rejects(writer.insertConfirmation(async()=>{throw Error('sql_called');},
  {...args,evidence:{...quantityTwo,totalCents:1799}}),
 /invalid_catalog_confirmation_attempt/);
});

test('price algorithm recalculates valid extras and percentage discount',async()=>{
 const evidenceWithExtra={...evidence,basePriceCents:900,
  selected:[{id:'extra',name:'Extra',priceCents:100,allergens:[]}],
  discount:{type:'percent',basisPoints:1000},
  unitSubtotalCents:1000,unitDiscountCents:100};
 let count=0;
 await writer.insertConfirmation(async()=>{count++;return {rows:[{order_id:orderId}]};},
  {...args,evidence:evidenceWithExtra});
 assert.equal(count,1);
 await assert.rejects(writer.insertConfirmation(async()=>{count++;},
  {...args,evidence:{...evidenceWithExtra,discount:{type:'percent',basisPoints:900}}}),
  /invalid_catalog_confirmation_attempt/);
 assert.equal(count,1);
});

test('ledger rejects sparse evidence arrays accessors cycles and hidden properties before SQL',async()=>{
 let calls=0;
 const query=async()=>{calls++;return {rows:[{order_id:orderId}]};};
 const sparse=new Array(1);
 const cyclic={};cyclic.self=cyclic;
 const accessor={...evidence};
 Object.defineProperty(accessor,'extraField',{enumerable:true,get(){throw Error('getter_called');}});
 const hidden={...evidence};
 Object.defineProperty(hidden,'hidden',{value:'not_serialized',enumerable:false});
 const symbol={...evidence,[Symbol('hidden')]:'not_serialized'};
 for(const bad of [
  {...evidence,allergens:sparse},
  {...evidence,selected:sparse},
  {...evidence,extraField:cyclic},
  accessor,hidden,symbol
 ]){
  await assert.rejects(writer.insertConfirmation(query,{...args,evidence:bad}),
   /invalid_catalog_confirmation_attempt/);
 }
 assert.equal(calls,0);
});
