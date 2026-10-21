import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('../apps/client/node_modules/typescript');
function compile(path,imports={}){
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 new Function('module','exports','require',code)(module,module.exports,name=>imports[name]??require(name));
 return module.exports;
}
const catalog=compile('../apps/client/src/catalog.ts');
const {loadPublishedCatalog}=compile('../apps/client/src/catalog-loader.ts',{'./catalog':catalog});
const valid={id:'11111111-1111-4111-8111-111111111111',name:'Agua',category:'Bebidas',priceCents:150,available:true,allergens:[]};
test('catalog loader uses same-origin URL, no credentials or cache',async()=>{
 const result=await loadPublishedCatalog(async(url,options)=>{
  assert.equal(url,'/api/v1/catalog');
  assert.equal(options.method,'GET');
  assert.equal(options.credentials,'omit');
  assert.equal(options.cache,'no-store');
  assert.equal(options.redirect,'error');
  return {ok:true,json:async()=>[valid]};
 });
 assert.equal(result.status,'ready');
 assert.deepEqual(result.items,[valid]);
});
test('catalog loader returns controlled errors for HTTP, malformed data and network failures',async()=>{
 for(const fetcher of [
  async()=>({ok:false,status:503}),
  async()=>({ok:true,json:async()=>[{...valid,priceCents:-1}]}),
  async()=>{throw Error('internal details');}
 ]){
  const state=await loadPublishedCatalog(fetcher);
  assert.equal(state.status,'error');
  assert.equal(JSON.stringify(state).includes('internal details'),false);
 }
});
