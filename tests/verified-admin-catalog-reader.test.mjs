import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedAdminCatalogReader} from '../apps/api/src/verified-admin-catalog-reader.mjs';
const id='cafe0000-0000-4000-8000-000000000001';
const identity={verifiedIdentity:{userId:id},verifiedStaff:{userId:id,role:'admin'}};
test('published admin catalog reader rejects unverified and nonadmin requests before SQL',async()=>{
 let calls=0;
 const reader=createVerifiedAdminCatalogReader({readPublishedCatalog:async()=>{calls++;return [];}});
 for(const request of [{},{verifiedIdentity:identity.verifiedIdentity},
  {...identity,verifiedStaff:{userId:id,role:'waiter'}},
  {...identity,verifiedStaff:{userId:'wrong',role:'admin'}}]){
  await assert.rejects(reader.listPublished(request),/admin_catalog_forbidden/);
 }
 assert.equal(calls,0);
});
test('published admin catalog response is versioned and excludes draft access',async()=>{
 const item={id,name:'Plato',category:'Primeros',priceCents:500,available:true,allergens:[]};
 const reader=createVerifiedAdminCatalogReader({readPublishedCatalog:async()=>[item]});
 assert.deepEqual(await reader.listPublished(identity),{version:1,scope:'published',items:[item]});
 const invalid=createVerifiedAdminCatalogReader({readPublishedCatalog:async()=>[{...item,priceCents:-1}]});
 await assert.rejects(invalid.listPublished(identity),/invalid_admin_catalog_response/);
});
