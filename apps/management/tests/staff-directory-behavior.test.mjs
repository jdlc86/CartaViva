import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStaffDirectoryGateway,StaffDirectoryGatewayError} from '../src/staff-directory-gateway.js';

const id='72000000-0000-4000-8000-000000000002';
const response=(body,{status=200}={})=>new Response(JSON.stringify(body),{status,
 headers:{'content-type':'application/json'}});
const member={enrollmentId:id,givenName:'Julia',familyName:'García López',
 email:'julia@example.invalid',operationalDisplayId:'JG-027',role:'waiter',state:'active',
 createdAt:'2026-10-28T10:00:00.000Z',updatedAt:'2026-10-28T10:00:00.000Z'};

test('management directory gateway validates pages, detail and minimal self profile',async()=>{
 const calls=[],gateway=createStaffDirectoryGateway({send:async path=>{calls.push(path);
  if(path==='/api/v1/staff/me')return response({version:1,profile:{givenName:'Julia',
   familyName:'García López',email:'julia@example.invalid',role:'waiter',operationalDisplayId:'JG-027'}});
  if(path.includes(`/directory/${id}`))return response({version:1,member});
  return response({version:1,items:[member],nextCursor:null});}});
 assert.equal((await gateway.list({search:'Julia'})).items[0].operationalDisplayId,'JG-027');
 assert.equal((await gateway.detail(id)).member.email,'julia@example.invalid');
 const own=await gateway.self();assert.deepEqual(Object.keys(own.profile),
  ['givenName','familyName','email','role','operationalDisplayId']);
 assert.equal(calls.length,3);
});

test('management directory rejects unknown or personal fields in public DTOs',async()=>{
 const gateway=createStaffDirectoryGateway({send:async()=>response({version:1,items:[{...member,
  authUserId:'secret'}],nextCursor:null})});
 await assert.rejects(gateway.list(),error=>error instanceof StaffDirectoryGatewayError&&
  error.code==='invalid_response');
});

test('Team view contains connected loading, empty, error and pagination states',()=>{
 const source=readFileSync(new URL('../src/views/TeamView.tsx',import.meta.url),'utf8');
 for(const evidence of ['Verificando tu ficha','Sin personal conectado','Directorio no disponible',
  'Sin coincidencias','Anterior','Siguiente','solo lectura'])assert.match(source,new RegExp(evidence));
 assert.doesNotMatch(source,/fixture|modo demo/i);
});
