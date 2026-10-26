import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('../apps/client/node_modules/typescript');

// Run the real TypeScript presentation boundary without adding a test runner.
const source=readFileSync(new URL('../apps/client/src/catalog.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
new Function('module','exports',javascript)(module,module.exports);
const {parsePublishedCatalog,filterCatalog,formatPrice,categoriesFor,searchPublishedCatalog}=module.exports;
const valid={id:'00000000-0000-4000-8000-000000000001',name:'Agua',category:'Bebidas',priceCents:150,available:true,allergens:[]};
test('catalog accepts valid published presentation and filters categories',()=>{
 const items=parsePublishedCatalog([valid,{...valid,id:'00000000-0000-4000-8000-000000000002',category:'Postres',available:false}]);
 assert.equal(items.length,2);
 assert.equal(filterCatalog(items,'Todos').length,2);
 assert.equal(filterCatalog(items,'Bebidas').length,1);
 assert.equal(filterCatalog(items,'Primeros').length,0);
 assert.deepEqual(categoriesFor(items),['Todos','Bebidas','Postres']);
 assert.match(formatPrice(150),/1,50/);
});
test('catalog rejects malformed envelopes and oversized collections',()=>{
 for(const value of [null,{},'invalid',Array(501).fill(valid),[null]])assert.throws(()=>parsePublishedCatalog(value),/invalid_catalog/);
});
test('catalog rejects malformed products and duplicate UUIDs',()=>{
 const invalid=[
  {id:'not-uuid'}, {id:'00000000-0000-4000-8000-00000000001z'},
  {name:''},{name:'A'.repeat(161)},{name:'Ana\nB'},
  {category:''},{category:'Todos'},{category:'Carta\nprivada'}, {priceCents:-1},{priceCents:1.5},{priceCents:Infinity},
  {available:'yes'}, {allergens:['']},{allergens:['gluten\n']},
  {allergens:Array(33).fill('gluten')}
 ];
 for(const change of invalid)assert.throws(()=>parsePublishedCatalog([{...valid,...change}]),/invalid_catalog/);
 assert.throws(()=>parsePublishedCatalog([valid,{...valid,id:valid.id.toUpperCase()}]),/invalid_catalog/);
});
test('catalog categories are derived from published rows and keep sold-out categories',()=>{
 const items=parsePublishedCatalog([
  valid,
  {...valid,id:'00000000-0000-4000-8000-000000000002',category:'Especiales',available:false},
  {...valid,id:'00000000-0000-4000-8000-000000000003',category:'Bebidas'}
 ]);
 assert.deepEqual(categoriesFor(items),['Todos','Bebidas','Especiales']);
});
test('catalog rejects unknown public DTO fields instead of retaining private data',()=>{
 assert.throws(()=>parsePublishedCatalog([{...valid,privateNote:'secret'}]),/invalid_catalog/);
});
test('catalog rejects a whitespace-padded virtual category name',()=>{
 assert.throws(()=>parsePublishedCatalog([{...valid,category:' Todos '}]),/invalid_catalog/);
});
test('published catalog input is not mutated',()=>{
 const source=Object.freeze({...valid,allergens:Object.freeze(['gluten'])});
 const items=parsePublishedCatalog(Object.freeze([source]));
 assert.deepEqual(items[0].allergens,['gluten']);
 assert.notEqual(items[0].allergens,source.allergens);
});

test('searchable menu combines category, accents, allergens and availability',()=>{
 const rows=parsePublishedCatalog([
  {...valid,name:'Café con leche',available:true,allergens:['Lácteos']},
  {...valid,id:'00000000-0000-4000-8000-000000000002',
   name:'Tarta de limón',category:'Postres',available:false,allergens:['Gluten']}
 ]);
 assert.equal(searchPublishedCatalog(rows,'Todos','cafe').length,1);
 assert.equal(searchPublishedCatalog(rows,'Todos','LACTEOS').length,1);
 assert.equal(searchPublishedCatalog(rows,'Postres','limon').length,1);
 assert.equal(searchPublishedCatalog(rows,'Postres','limon',true).length,0);
 assert.equal(searchPublishedCatalog(rows,'Bebidas','limon').length,0);
 assert.deepEqual(searchPublishedCatalog(rows,'Todos','',true),[rows[0]]);
});
