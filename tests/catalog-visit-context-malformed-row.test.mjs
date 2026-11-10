import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogVisitContextRepository} from '../apps/api/src/catalog-visit-context-repository.mjs';

const tableId='11111111-1111-4111-8111-111111111111';
const args={tableId,visitId:'visit_key_123',actorId:'actor_key_123',
 basketId:'basket_key_123',qrToken:'q'.repeat(48),customerSessionToken:'s'.repeat(48)};

test('visit authorization distinguishes empty query results from corrupt present rows',async()=>{
 const repository=createCatalogVisitContextRepository();
 const queries=[];
 const query=async(sql,values)=>{
  queries.push({sql,values});
  return {rows:[]};
 };
 assert.deepEqual(await repository.lockContext(query,args),{authorized:false,canOrder:false});
 assert.equal(queries.length,1);
 for(const rows of [[null],[undefined],[false],[0],[''],[[]],[{}],[null,null]]){
  await assert.rejects(repository.lockContext(async()=>({rows}),args),
   /invalid_catalog_visit_response/);
 }
});

test('malformed visit response fails closed even if the result object exists',async()=>{
 const repository=createCatalogVisitContextRepository();
 for(const response of [null,{}, {rows:null},{rows:{}},{rows:[undefined]},
  {rows:[{table_id:tableId}]}]){
  await assert.rejects(repository.lockContext(async()=>response,args),
   /invalid_catalog_visit_response/);
 }
});
