import test from 'node:test';
import assert from 'node:assert/strict';
import {createM3AuthenticatedManagementGateway} from '../src/m3-authenticated-management-gateway.js';
import {catalogDraftFromForm,validateM3ManagementCatalog} from '../src/m3-catalog-management-model.js';

const id='10000000-0000-4000-8000-000000000001';
const itemId='20000000-0000-4000-8000-000000000002';
const payload=()=>({version:2,scope:'administrative',categories:[{id,name:'ENTRANTE',sortOrder:100,
 mandatory:true,hidden:false,revision:1}],items:[{id:itemId,categoryId:id,draft:{name:'Plato'},
 draftRevision:1,publishedRevision:null,publishedSnapshot:null,publishedAt:null,withdrawn:false,soldOut:false}],
 allergenTaxonomyVersion:1,allergens:Array.from({length:14},(_,index)=>({id:index+1,name:`Alérgeno ${index+1}`}))});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

test('M3 management catalog validates exact administrative projection and category scope',()=>{
 const result=validateM3ManagementCatalog(payload());
 assert.equal(result.categories[0].name,'ENTRANTE');
 assert.equal(result.items[0].categoryId,id);
 assert.equal(Object.isFrozen(result),true);
 assert.throws(()=>validateM3ManagementCatalog({...payload(),items:[{...payload().items[0],
  categoryId:'30000000-0000-4000-8000-000000000003'}]}),/invalid_m3_management_catalog/);
 let getterCalls=0;const hostile=payload();
 Object.defineProperty(hostile.categories[0],'name',{enumerable:true,get(){getterCalls++;return 'ENTRANTE'}});
 assert.throws(()=>validateM3ManagementCatalog(hostile),/invalid_m3_management_catalog/);
 assert.equal(getterCalls,0);
});

test('M3 draft keeps integer economics, taxonomy state and no private verification identity',()=>{
 const draft=catalogDraftFromForm({name:'  Bocado  ',description:'Temporada',priceCents:0,
  allergenIds:[1,7],allergenStatus:'VERIFICADA',options:[],extras:[],discount:null});
 assert.deepEqual(draft,{name:'Bocado',description:'Temporada',imageUrl:null,priceCents:0,
  allergenIds:[1,7],allergenStatus:'VERIFICADA',options:[],extras:[],discount:null});
 assert.equal(JSON.stringify(draft).includes('verifiedBy'),false);
 assert.throws(()=>catalogDraftFromForm({name:'Plato',priceCents:-1}),/invalid_m3_catalog_draft/);
});

test('authenticated M3 gateway uses fresh bearer, omits cookies and restricts admin paths',async()=>{
 const calls=[];let tokens=0;
 const gateway=createM3AuthenticatedManagementGateway({getAccessToken:async()=>`token_${++tokens}_abcdefghijklmnop`,
  fetchImpl:async(path,options)=>{calls.push({path,options});return response({version:2,items:[],nextAfterNumber:null});}});
 await gateway.listTables({afterNumber:2,limit:10});
 await gateway.listTables({afterNumber:12,limit:10});
 assert.equal(tokens,2);assert.equal(calls.length,2);
 assert.equal(calls[0].path,'/api/v1/admin/tables?afterNumber=2&limit=10');
 assert.equal(calls[0].options.credentials,'omit');
 assert.equal(calls[0].options.headers.Authorization,'Bearer token_1_abcdefghijklmnop');
 assert.equal(Object.hasOwn(calls[0].options.headers,'Cookie'),false);
 gateway.revoke();
 await assert.rejects(gateway.listTables(),/m3_management_auth_unavailable/);
 assert.equal(calls.length,2);
});

test('M3 gateway sends minimal mutations and normalizes conflict without retry',async()=>{
 const calls=[];
 const gateway=createM3AuthenticatedManagementGateway({getAccessToken:async()=>'token_abcdefghijklmnop',
  fetchImpl:async(path,options)=>{calls.push({path,options});return response({error:'tables_conflict'},409);}});
 await assert.rejects(gateway.manageTable({requestId:id,operation:'readiness',
  payload:{tableId:itemId,expectedRevision:1,state:'LISTA'}}),/m3_management_conflict/);
 assert.equal(calls.length,1);
 assert.deepEqual(JSON.parse(calls[0].options.body),{requestId:id,operation:'readiness',
  payload:{tableId:itemId,expectedRevision:1,state:'LISTA'}});
 assert.equal(calls[0].options.method,'POST');
});
