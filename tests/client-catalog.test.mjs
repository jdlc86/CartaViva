import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Run the real TypeScript presentation boundary without adding a test runner.
const source=readFileSync(new URL('../apps/client/src/catalog.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
new Function('module','exports',javascript)(module,module.exports);
const {parsePublishedCatalog,filterCatalog,formatPrice,categories}=module.exports;
const valid={id:'00000000-0000-4000-8000-000000000001',name:'Agua',category:'Bebidas',priceCents:150,available:true,allergens:[]};
test('catalog accepts valid published presentation and filters categories',()=>{
 const items=parsePublishedCatalog([valid,{...valid,id:'00000000-0000-4000-8000-000000000002',category:'Postres',available:false}]);
 assert.equal(items.length,2);
 assert.equal(filterCatalog(items,'Todos').length,2);
 assert.equal(filterCatalog(items,'Bebidas').length,1);
 assert.equal(filterCatalog(items,'Primeros').length,0);
 assert.deepEqual(categories,['Todos','Bebidas','Primeros','Segundos','Postres']);
 assert.match(formatPrice(150),/1,50/);
});
test('catalog rejects malformed envelopes and oversized collections',()=>{
 for(const value of [null,{},'invalid',Array(501).fill(valid),[null]])assert.throws(()=>parsePublishedCatalog(value),/invalid_catalog/);
});
test('catalog rejects malformed products and duplicate UUIDs',()=>{
 const invalid=[
  {id:'not-uuid'}, {id:'00000000-0000-4000-8000-00000000001z'},
  {name:''},{name:'A'.repeat(161)},{name:'Ana\nB'},
  {category:'Otros'}, {priceCents:-1},{priceCents:1.5},{priceCents:Infinity},
  {available:'yes'}, {allergens:['']},{allergens:['gluten\n']},
  {allergens:Array(33).fill('gluten')}
 ];
 for(const change of invalid)assert.throws(()=>parsePublishedCatalog([{...valid,...change}]),/invalid_catalog/);
 assert.throws(()=>parsePublishedCatalog([valid,{...valid,id:valid.id.toUpperCase()}]),/invalid_catalog/);
});
test('published catalog input is not mutated',()=>{
 const source=Object.freeze({...valid,allergens:Object.freeze(['gluten'])});
 const items=parsePublishedCatalog(Object.freeze([source]));
 assert.deepEqual(items[0].allergens,['gluten']);
 assert.notEqual(items[0].allergens,source.allergens);
});
