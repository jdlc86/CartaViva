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
