import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPublishedCatalog} from '../apps/api/src/catalog-publication.mjs';
const id='11111111-1111-4111-8111-111111111111';
const snapshot={name:'Tortilla',category:'Primeros',priceCents:800,allergens:['Huevo']};
test('published snapshot is authoritative; private draft is never projected',()=>{
 const result=projectPublishedCatalog([{id,draft:{name:'Borrador secreto'},published_snapshot:snapshot,withdrawn_at:null,sold_out:false}]);
 assert.deepEqual(result,[{id,name:'Tortilla',category:'Primeros',priceCents:800,available:true,allergens:['Huevo']}]);
 assert.equal(JSON.stringify(result).includes('Borrador secreto'),false);
});
test('withdrawn and unpublished rows are hidden; sold out remains visible',()=>{
 assert.deepEqual(projectPublishedCatalog([{id,published_snapshot:null,withdrawn_at:null,sold_out:false}]),[]);
 assert.deepEqual(projectPublishedCatalog([{id,published_snapshot:snapshot,withdrawn_at:'2026-10-21T00:00:00Z',sold_out:false}]),[]);
 assert.equal(projectPublishedCatalog([{id,published_snapshot:snapshot,withdrawn_at:null,sold_out:true}])[0].available,false);
});
test('duplicate IDs and malformed public rows fail closed',()=>{
 const row={id,published_snapshot:snapshot,withdrawn_at:null,sold_out:false};
 assert.throws(()=>projectPublishedCatalog([row,row]),/invalid_catalog_row/);
 assert.throws(()=>projectPublishedCatalog([{...row,published_snapshot:{...snapshot,priceCents:-1}}]),/invalid_catalog_row/);
 assert.throws(()=>projectPublishedCatalog([row].concat(Array(500).fill({...row,id:'22222222-2222-4222-8222-222222222222'}))),/invalid_catalog_rows/);
});

test('public catalog fails closed instead of dropping unrepresented economic rules',()=>{
 const row={id,published_snapshot:snapshot,withdrawn_at:null,sold_out:false};
 for(const extra of [
  {options:[{name:'Tamaño',values:['Grande']}]},
  {extras:[{name:'Queso',priceCents:100}]},
  {discount:{type:'percent',basisPoints:1000}},
  {options:null},
  {extras:null},
  {discount:0}
 ]){
  assert.throws(()=>projectPublishedCatalog([{...row,published_snapshot:{...snapshot,...extra}}]),/invalid_catalog_row/);
 }
 assert.deepEqual(projectPublishedCatalog([{...row,published_snapshot:{...snapshot,options:[],extras:[],discount:null}}])[0].priceCents,800);
});
