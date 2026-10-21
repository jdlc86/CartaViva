import test from 'node:test';
import assert from 'node:assert/strict';
import {issueCatalogRepriceAcceptance,verifyCatalogRepriceAcceptance} from '../apps/api/src/catalog-reprice-acceptance.mjs';

const snapshot={name:'Plato',category:'Segundos',priceCents:1000,allergens:['Gluten'],
 options:[{id:'size',name:'Tamaño',required:true,maxSelections:1,
  values:[{id:'large',name:'Grande',priceCents:200,available:true,allergens:[]}]}],
 extras:[{id:'cheese',name:'Queso',priceCents:150,available:true,allergens:['Leche']}],
 discount:{type:'percent',basisPoints:1000}};
const base={basketId:'basket-1',actorId:'visitor-1',
 secretKey:'server-only-key-should-have-at-least-32-bytes',
 nowMs:1792600000000,itemId:'123e4567-e89b-12d3-a456-426614174000',
 publishedRevision:7,snapshot,selection:{options:{size:['large']},extras:['cheese']},quantity:2};
const issue=changes=>issueCatalogRepriceAcceptance({...base,...changes});
const verify=(token,changes={})=>verifyCatalogRepriceAcceptance({...base,...changes,token});
test('server-signed acceptance binds quote, revision, basket, actor and expiry',()=>{
 const {token,expiresAt,evidence}=issue();
 assert.equal(evidence.totalCents,2430);
 assert.equal(verify(token),true);
 assert.equal(verify(token,{nowMs:expiresAt}),true);
 assert.equal(verify(token,{nowMs:expiresAt+1}),false);
 assert.equal(verify(token,{basketId:'basket-2'}),false);
 assert.equal(verify(token,{actorId:'visitor-2'}),false);
 assert.equal(verify(token,{publishedRevision:8}),false);
 assert.equal(verify(token,{quantity:1}),false);
 assert.equal(verify(token,{secretKey:'different-server-only-key-at-least-32-bytes'}),false);
});
test('acceptance is invalid after price increase, decrease, discount or availability change',()=>{
 const {token}=issue();
 for(const changed of [
  {...snapshot,priceCents:1100},{...snapshot,priceCents:900},
  {...snapshot,discount:{type:'percent',basisPoints:2000}},
  {...snapshot,extras:[{...snapshot.extras[0],available:false}]},
  {...snapshot,options:[{...snapshot.options[0],values:[{
   ...snapshot.options[0].values[0],priceCents:300
  }]}]}
 ])assert.equal(verify(token,{snapshot:changed}),false);
});
test('rejects selected modifiers, token manipulation and cross-selection replay',()=>{
 const {token}=issue();
 assert.equal(verify(token,{selection:{options:{size:['large']},extras:[]}}),false);
 assert.equal(verify(token,{selection:{options:{size:['large']},extras:['missing']}}),false);
 assert.equal(verify(token.replace(/.$/,'0')),false);
 assert.equal(verify('garbage'),false);
 assert.equal(verify(null),false);
 assert.equal(verify(token,{nowMs:base.nowMs-601000}),false);
});
test('rejects weak secrets, excessive TTL and malformed issuance context',()=>{
 for(const changes of [
  {secretKey:'weak'},{ttlSeconds:601},{ttlSeconds:0},
  {actorId:''},{basketId:'bad basket'},{nowMs:-1},{publishedRevision:0},
  {snapshot:{...snapshot,priceCents:-1}}
 ])assert.throws(()=>issue(changes));
});
test('reissuing at a later time changes token and binds a new expiry',()=>{
 const first=issue();
 const second=issue({nowMs:base.nowMs+1000});
 assert.notEqual(first.token,second.token);
 assert.equal(verify(second.token,{nowMs:base.nowMs+1000}),true);
 assert.equal(verify(first.token,{nowMs:base.nowMs+1000}),true);
});
