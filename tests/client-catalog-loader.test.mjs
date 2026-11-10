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
  return {ok:true,headers:{get:()=> 'application/json'},json:async()=>[valid]};
 });
 assert.equal(result.status,'ready');
 assert.deepEqual(result.items,[valid]);
});
test('catalog loader returns controlled errors for HTTP, malformed data and network failures',async()=>{
 for(const fetcher of [
  async()=>({ok:false,status:503}),
  async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>[{...valid,priceCents:-1}]}),
  async()=>{throw Error('internal details');}
 ]){
  const state=await loadPublishedCatalog(fetcher);
  assert.equal(state.status,'error');
  assert.equal(JSON.stringify(state).includes('internal details'),false);
 }
});

test('catalog loader propagates cancellation signal without credentials',async()=>{
 const controller=new AbortController();
 const result=await loadPublishedCatalog(async(_url,options)=>{
  assert.equal(options.signal,controller.signal);
  assert.equal(options.credentials,'omit');
  controller.abort();
  throw Error('AbortError');
 },controller.signal);
 assert.equal(result.status,'error');
 assert.equal(JSON.stringify(result).includes('AbortError'),false);
});
test('catalog loader handles invalid JSON and oversized catalog without exposing payload',async()=>{
 for(const payload of [Array(501).fill(valid),{secret:'internal-data'}]){
  const state=await loadPublishedCatalog(async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>payload}));
  assert.deepEqual(state,{status:'error',message:'Inténtalo de nuevo más tarde.'});
  assert.equal(JSON.stringify(state).includes('internal-data'),false);
 }
});
test('catalog loader accepts an empty published menu',async()=>{
 const state=await loadPublishedCatalog(async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>[]}));
 assert.deepEqual(state,{status:'ready',items:[]});
});

test('client consumes API HTTP response and rejects private database fields',async()=>{
 const {registerCatalogHttpRoute}=await import('../apps/api/src/catalog-http-route.mjs');
 const {createCatalogScopedQuery}=await import('../apps/api/src/catalog-scoped-query.mjs');
 const {createCatalogReaderSql}=await import('../apps/api/src/catalog-reader-query.mjs');
 const events=[];
 let handler;
 const app={get:(path,fn)=>{assert.equal(path,'/api/v1/catalog');handler=fn;}};
 const pool={connect:async()=>({
  query:async sql=>{
   events.push(sql);
   if(sql===createCatalogReaderSql())return {rows:[{
    id:valid.id,published_snapshot:{name:'Agua',category:'Bebidas',priceCents:150,allergens:[]},
    sold_out:true,draft:{privateNote:'hidden-secret'}
   }]};
   return {rows:[]};
  },
  release:discard=>events.push(discard?'discard':'release')
 })};
 registerCatalogHttpRoute(app,{query:createCatalogScopedQuery({pool})});
 const state=await loadPublishedCatalog(async(url,options)=>{
  assert.equal(url,'/api/v1/catalog');
  assert.equal(options.credentials,'omit');
  const reply={header:()=>reply,code:status=>{reply.status=status;return reply;},
   send:body=>({ok:reply.status===200,headers:{get:()=> 'application/json'},json:async()=>body})};
  return handler({},reply);
 });
 assert.deepEqual(state,{status:'ready',items:[{...valid,available:false}]});
 assert.equal(JSON.stringify(state).includes('hidden-secret'),false);
 assert.deepEqual(events,['BEGIN','SET LOCAL ROLE sabora_catalog_reader',createCatalogReaderSql(),'COMMIT','release']);
});
test('client fails closed when API returns a database error',async()=>{
 const {registerCatalogHttpRoute}=await import('../apps/api/src/catalog-http-route.mjs');
 let handler;
 registerCatalogHttpRoute({get:(_path,fn)=>{handler=fn;}},{query:async()=>{throw Error('private_database_secret');}});
 const state=await loadPublishedCatalog(async()=>{
  const reply={header:()=>reply,code:status=>{reply.status=status;return reply;},
   send:body=>({ok:reply.status===200,headers:{get:()=> 'application/json'},json:async()=>body})};
  return handler({},reply);
 });
 assert.deepEqual(state,{status:'error',message:'Inténtalo de nuevo más tarde.'});
 assert.equal(JSON.stringify(state).includes('private_database_secret'),false);
});

test('catalog loader rejects HTML and absent content type even with HTTP 200',async()=>{
 for(const contentType of [null,'text/html','application/problem+json']){
  const state=await loadPublishedCatalog(async()=>({
   ok:true,headers:{get:()=>contentType},json:async()=>[valid]
  }));
  assert.deepEqual(state,{status:'error',message:'Inténtalo de nuevo más tarde.'});
 }
});
