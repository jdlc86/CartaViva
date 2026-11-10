import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogTableQrVerifier} from '../apps/api/src/catalog-table-qr-verifier.mjs';
const tableId='00000000-0000-4000-8000-000000000001';
const sessionId='00000000-0000-4000-8000-000000000002';
const qrToken='a'.repeat(64);
const verify=createCatalogTableQrVerifier().verifyTableQr;
test('QR verification binds secret and table session in one locked SQL read',async()=>{
 const result=await verify(async(sql,args)=>{
  assert.match(sql,/FOR SHARE/);
  assert.match(sql,/qr_token_hash=sha256\(convert_to\(\$3,'UTF8'\)\)/);
  assert.deepEqual(args,[tableId,sessionId,qrToken]);
  assert.doesNotMatch(sql,new RegExp(qrToken));
  return {rows:[{id:tableId,session_id:sessionId,qr_version:3}]};
 },{tableId,expectedSessionId:sessionId,qrToken});
 assert.deepEqual(result,{valid:true,tableId,sessionId,qrVersion:3});
});
test('rotated QR, wrong session or unknown table fails closed',async()=>{
 const result=await verify(async()=>({rows:[]}),{
  tableId,expectedSessionId:sessionId,qrToken});
 assert.deepEqual(result,{valid:false});
});
test('malformed tokens, scopes and contradictory rows fail closed',async()=>{
 const query=()=>{throw Error('should not query');};
 for(const changes of [{qrToken:'short'},{expectedSessionId:'wrong'},
  {tableId:'wrong'},{qrToken:'b'.repeat(513)}]){
  await assert.rejects(verify(query,{tableId,expectedSessionId:sessionId,qrToken,...changes}),
   /invalid_catalog_qr_scope/);
 }
 await assert.rejects(verify(async()=>({rows:[{
  id:tableId,session_id:'00000000-0000-4000-8000-000000000003',qr_version:1
 }]}),{tableId,expectedSessionId:sessionId,qrToken}),/invalid_catalog_qr_response/);
 await assert.rejects(verify(async()=>({rows:[{},{}]}),{
  tableId,expectedSessionId:sessionId,qrToken}),/invalid_catalog_qr_response/);
});
