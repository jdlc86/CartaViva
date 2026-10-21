import test from 'node:test';
import assert from 'node:assert/strict';
import {registerCatalogHttpRoute} from '../apps/api/src/catalog-http-route.mjs';
function fakeApp(){
 let handler;return {get:(path,fn)=>{assert.equal(path,'/api/v1/catalog');handler=fn;},
 invoke:async(query)=>{const headers={};const reply={
  header:(k,v)=>{headers[k]=v;return reply;},
  code:c=>{reply.status=c;return reply;},
  send:body=>({status:reply.status,headers,body})
 };return handler({},reply);}};
}
test('route returns only safe public catalog fields',async()=>{
 const app=fakeApp();registerCatalogHttpRoute(app,{query:async()=>({rows:[{
  id:'11111111-1111-4111-8111-111111111111',
  published_snapshot:{name:'Agua',category:'Bebidas',priceCents:100,allergens:[]},
  draft:{secret:'do-not-leak'},sold_out:false
 }]})});
 const response=await app.invoke();
 assert.equal(response.status,200);
 assert.equal(response.headers['Cache-Control'],'no-store');
 assert.equal(response.body[0].name,'Agua');
 assert.equal(JSON.stringify(response).includes('do-not-leak'),false);
});
test('database errors return 503 without leaking details',async()=>{
 const app=fakeApp();registerCatalogHttpRoute(app,{query:async()=>{throw Error('private db details');}});
 const response=await app.invoke();
 assert.deepEqual(response.body,{error:'catalog_unavailable'});
 assert.equal(response.status,503);
 assert.equal(JSON.stringify(response).includes('private db details'),false);
});

test('route refuses missing query configuration and does not register',()=>{
 let registered=false;
 const app={get:()=>{registered=true;}};
 assert.throws(()=>registerCatalogHttpRoute(app),/invalid_catalog_route_configuration/);
 assert.equal(registered,false);
});
test('invalid database response fails closed with 503',async()=>{
 const app=fakeApp();
 registerCatalogHttpRoute(app,{query:async()=>({rows:null})});
 const response=await app.invoke();
 assert.equal(response.status,503);
 assert.deepEqual(response.body,{error:'catalog_unavailable'});
});
test('untrusted published snapshot fails closed without leaking private fields',async()=>{
 const app=fakeApp();
 registerCatalogHttpRoute(app,{query:async()=>({rows:[{
  id:'11111111-1111-4111-8111-111111111111',
  published_snapshot:{name:'Invalid',category:'Bebidas',priceCents:-100,allergens:[]},
  secret:'private-data',sold_out:false
 }]})});
 const response=await app.invoke();
 assert.equal(response.status,503);
 assert.equal(JSON.stringify(response).includes('private-data'),false);
});

test('HTTP boundary uses restricted scoped SQL and never returns draft data',async()=>{
 const {createCatalogScopedQuery}=await import('../apps/api/src/catalog-scoped-query.mjs');
 const {createCatalogReaderSql}=await import('../apps/api/src/catalog-reader-query.mjs');
 const statements=[];
 const pool={connect:async()=>({
  query:async(sql,params)=>{
   statements.push(sql);
   if(sql===createCatalogReaderSql()){
    assert.deepEqual(params,[]);
    return {rows:[{id:'11111111-1111-4111-8111-111111111111',
     published_snapshot:{name:'Agua',category:'Bebidas',priceCents:150,allergens:[]},
     draft:{secret:'never-public'},sold_out:false}]};
   }
   return {rows:[]};
  },
  release:discard=>statements.push(discard?'release-discard':'release-clean')
 })};
 const app=fakeApp();
 registerCatalogHttpRoute(app,{query:createCatalogScopedQuery({pool})});
 const response=await app.invoke();
 assert.equal(response.status,200);
 assert.deepEqual(response.body,[{id:'11111111-1111-4111-8111-111111111111',
  name:'Agua',category:'Bebidas',priceCents:150,available:true,allergens:[]}]);
 assert.deepEqual(statements,['BEGIN','SET LOCAL ROLE sabora_catalog_reader',createCatalogReaderSql(),'COMMIT','release-clean']);
 assert.equal(JSON.stringify(response).includes('never-public'),false);
});
test('HTTP boundary discards scoped connection after reader failure',async()=>{
 const {createCatalogScopedQuery}=await import('../apps/api/src/catalog-scoped-query.mjs');
 const {createCatalogReaderSql}=await import('../apps/api/src/catalog-reader-query.mjs');
 const statements=[];
 const pool={connect:async()=>({
  query:async sql=>{statements.push(sql);if(sql===createCatalogReaderSql())throw Error('sensitive database failure');return {rows:[]};},
  release:discard=>statements.push(discard?'release-discard':'release-clean')
 })};
 const app=fakeApp();
 registerCatalogHttpRoute(app,{query:createCatalogScopedQuery({pool})});
 const response=await app.invoke();
 assert.equal(response.status,503);
 assert.deepEqual(response.body,{error:'catalog_unavailable'});
 assert.equal(JSON.stringify(response).includes('sensitive database failure'),false);
 assert.deepEqual(statements,['BEGIN','SET LOCAL ROLE sabora_catalog_reader',createCatalogReaderSql(),'ROLLBACK','release-discard']);
});
