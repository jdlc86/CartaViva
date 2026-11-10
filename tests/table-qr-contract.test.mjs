import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildTableQrPayload,parseTableQrPayload,TABLE_QR_TOKEN_PATTERN}
 from '../packages/contracts/src/index.js';
import {createTableQrCredential} from '../apps/api/src/table-qr-credential.mjs';

const origin='https://sabora.example';
const restaurantCode='SABORA_01';
const tableId='ca710000-0000-4000-8000-000000000001';
const token=Buffer.alloc(32,0xa5).toString('base64url');

test('QR V1 has one canonical URL and round-trips restaurant, table and 256-bit token',()=>{
 assert.equal(token.length,43);
 assert.match(token,TABLE_QR_TOKEN_PATTERN);
 const payload=buildTableQrPayload({origin,restaurantCode,tableId,token});
 assert.equal(payload,`${origin}/qr/v1/${restaurantCode}/${tableId}#${token}`);
 assert.deepEqual({...parseTableQrPayload(payload,{expectedOrigin:origin,
  expectedRestaurantCode:restaurantCode})},{restaurantCode,tableId,token});
 const transportUrl=new URL(payload);transportUrl.hash='';
 assert.equal(transportUrl.href,`${origin}/qr/v1/${restaurantCode}/${tableId}`);
 assert.equal(transportUrl.search,'');
});

test('QR V1 rejects non-canonical spellings, origins, restaurant codes and token encodings',()=>{
 const valid=buildTableQrPayload({origin,restaurantCode,tableId,token});
 const invalid=[
  valid.replace(origin,'http://sabora.example'),
  valid.replace(origin,'ftp://sabora.example'),
  valid.replace(origin,'https://evil.example'),
  valid.replace('/SABORA_01/','/OTHER/'),
  valid.replace(tableId,tableId.toUpperCase()),
  valid.replace('/qr/v1/','/qr/v2/'),
  valid.replace('#','?token='),
  `${valid}&extra=1`,
  valid.replace(token,`${token}A`),
  valid.slice(0,-1)+'B',
  valid.replace('/ca71','/%63a71')
 ];
 for(const payload of invalid)
  assert.throws(()=>parseTableQrPayload(payload,{expectedOrigin:origin,
   expectedRestaurantCode:restaurantCode}),/invalid_table_qr_payload/);
 assert.throws(()=>buildTableQrPayload({origin:'https://user:pass@sabora.example',
  restaurantCode,tableId,token}),/invalid_table_qr_origin/);
});

test('HTTP is accepted only for exact loopback test origins',()=>{
 const local='http://127.0.0.1:4179';
 const payload=buildTableQrPayload({origin:local,restaurantCode,tableId,token,
  allowInsecureLoopback:true});
 assert.equal(parseTableQrPayload(payload,{expectedOrigin:local,
  expectedRestaurantCode:restaurantCode,allowInsecureLoopback:true}).token,token);
 assert.throws(()=>buildTableQrPayload({origin:'http://192.168.1.10',restaurantCode,
  tableId,token,allowInsecureLoopback:true}),/invalid_table_qr_origin/);
 const issued=createTableQrCredential({origin:local,restaurantCode,tableId,
  allowInsecureLoopback:true,randomBytesImpl:()=>Buffer.alloc(32,0xa5)});
 assert.equal(issued.payload,payload);
 assert.throws(()=>createTableQrCredential({origin:local,restaurantCode,tableId,
  randomBytesImpl:()=>Buffer.alloc(32,0xa5)}),/invalid_table_qr_credential_input/);
 assert.throws(()=>createTableQrCredential({origin:'http://192.168.1.10',restaurantCode,tableId,
  allowInsecureLoopback:true,randomBytesImpl:()=>Buffer.alloc(32,0xa5)}),
 /invalid_table_qr_credential_input/);
});

test('server issuer uses exactly 32 bytes, returns matching hash and fails closed on entropy drift',()=>{
 const entropy=Buffer.from(Array.from({length:32},(_,index)=>index));
 const issued=createTableQrCredential({origin,restaurantCode,tableId,
  randomBytesImpl:size=>{assert.equal(size,32);return entropy;}});
 assert.equal(issued.token,entropy.toString('base64url'));
 assert.equal(issued.tokenHash.toString('hex'),createHash('sha256').update(issued.token).digest('hex'));
 assert.deepEqual({...parseTableQrPayload(issued.payload,{expectedOrigin:origin,
  expectedRestaurantCode:restaurantCode})},{restaurantCode,tableId,token:issued.token});
 assert.throws(()=>createTableQrCredential({origin,restaurantCode,tableId,
  randomBytesImpl:()=>Buffer.alloc(31)}),/table_qr_entropy_unavailable/);
 assert.throws(()=>createTableQrCredential({origin,restaurantCode,tableId,
  randomBytesImpl:()=>({byteLength:32})}),/table_qr_entropy_unavailable/);
});
