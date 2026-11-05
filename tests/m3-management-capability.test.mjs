import test from 'node:test';
import assert from 'node:assert/strict';
import {createM3ManagementCapabilityIssuer} from '../apps/api/src/m3-management-capability.mjs';
import {createM3TablesRepository,createM3CatalogRepository,READ_M3_TABLES_SQL,
 MANAGE_M3_TABLE_SQL,OCCUPANCY_M3_TABLE_SQL,READ_M3_CATALOG_SQL,
 MANAGE_M3_CATALOG_SQL} from '../apps/api/src/m3-management-repository.mjs';

const actorId='10000000-0000-4000-8000-000000000001';
const requestId='20000000-0000-4000-8000-000000000002';
const generatedId='30000000-0000-4000-8000-000000000003';
const verified=role=>({verifiedIdentity:{userId:actorId},verifiedStaff:{userId:actorId,role}});
const issuer=role=>createM3ManagementCapabilityIssuer({keyId:'m3_test_key',
 secret:Buffer.alloc(32,7),databaseRole:role,clock:()=>1_800_000_000_000});
const transaction=(result,calls)=>async handler=>handler(async(sql,params)=>{
 calls.push({sql,params});return {rows:[{result}]};
});

test('M3 capability binds physical login, actor, operation, request and exact body',()=>{
 const issue=issuer('sabora_m3_tables_login');
 const first=issue({actorId,staffRole:'admin',action:'table.create',requestId,
  body:'{"number":1}'});
 const second=issue({actorId,staffRole:'admin',action:'table.create',requestId,
  body:'{"number":2}'});
 assert.equal(first.databaseRole,'sabora_m3_tables_login');
 assert.notEqual(first.bodyHashHex,second.bodyHashHex);
 assert.notEqual(first.signatureHex,second.signatureHex);
 assert.equal(first.expiresAtMs-first.issuedAtMs,15_000);
 assert.throws(()=>issue({actorId,staffRole:'admin',action:'table.create',requestId,
  body:'x',extra:true}),/invalid_m3_management_capability_input/);
});

test('table repository issues bounded capabilities and preserves exact SQL/body',async()=>{
 const calls=[];
 const repository=createM3TablesRepository({withTransaction:transaction({version:2,items:[],nextAfterNumber:null},calls),
  issueCapability:issuer('sabora_m3_tables_login'),newId:()=>generatedId});
 await repository.read(verified('waiter'),{afterNumber:4,limit:20});
 assert.equal(calls[0].sql,READ_M3_TABLES_SQL);
 assert.deepEqual(calls[0].params.slice(1),[4,20]);
 const readCapability=JSON.parse(calls[0].params[0]);
 assert.equal(readCapability.action,'tables.read');
 assert.equal(readCapability.requestId,generatedId);

 calls.length=0;
 const payload={number:7,capacity:4,description:'Sala'};
 await repository.manage(verified('admin'),{requestId,operation:'create',payload});
 assert.equal(calls[0].sql,MANAGE_M3_TABLE_SQL);
 assert.equal(calls[0].params[1],'create');
 assert.equal(calls[0].params[2],JSON.stringify(payload));
 assert.equal(JSON.parse(calls[0].params[0]).action,'table.create');

 calls.length=0;
 const occupancy={requestId,tableId:actorId,target:'open',pauseUntil:null};
 await repository.occupancy(verified('waiter'),occupancy);
 assert.equal(calls[0].sql,OCCUPANCY_M3_TABLE_SQL);
 assert.equal(calls[0].params[1],JSON.stringify({tableId:actorId,target:'open',pauseUntil:null}));
 assert.equal(JSON.parse(calls[0].params[0]).action,'table.occupancy');
});

test('catalog repository rejects waiter and binds every admin mutation',async()=>{
 const calls=[];
 const repository=createM3CatalogRepository({withTransaction:transaction({version:2},calls),
  issueCapability:issuer('sabora_m3_catalog_login'),newId:()=>generatedId});
 assert.throws(()=>repository.read(verified('waiter')),/m3_management_forbidden/);
 await repository.read(verified('admin'));
 assert.equal(calls[0].sql,READ_M3_CATALOG_SQL);
 assert.equal(JSON.parse(calls[0].params[0]).action,'catalog.read');
 calls.length=0;
 const payload={categoryId:actorId,name:'MENÚ',sortOrder:600};
 await repository.manage(verified('root'),{requestId,operation:'category_create',payload});
 assert.equal(calls[0].sql,MANAGE_M3_CATALOG_SQL);
 assert.equal(calls[0].params[2],JSON.stringify(payload));
 assert.equal(JSON.parse(calls[0].params[0]).action,'catalog.category_create');
});

test('identity mismatch and malformed issuer result never reach SQL',async()=>{
 let transactions=0;
 const repository=createM3TablesRepository({withTransaction:async()=>{transactions++;},
  issueCapability:()=>({}),newId:()=>generatedId});
 assert.throws(()=>repository.read({verifiedIdentity:{userId:actorId},
  verifiedStaff:{userId:requestId,role:'admin'}}),/m3_management_forbidden/);
 assert.throws(()=>repository.read(verified('admin')),/invalid_m3_management_capability/);
 assert.equal(transactions,0);
});
