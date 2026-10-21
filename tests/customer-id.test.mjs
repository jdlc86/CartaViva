import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCustomerPublicId, prepareCustomerRegistration } from '../apps/api/src/customer-id.mjs';

const UUID = '00000000-0000-4000-8000-000000000001';
test('server generates separate internal and visible IDs without company', () => {
 const result = prepareCustomerRegistration({alias:' Ana '},{uuid:()=>UUID,random:()=>Buffer.alloc(24,0)});
 assert.deepEqual(result,{internalId:UUID,publicId:'SB-222222222222',alias:'Ana',company:null});
});
test('visible ID excludes confusing characters and uses a fixed format', () => {
 for(let i=0;i<20;i++) assert.match(generateCustomerPublicId(),/^SB-[2-9A-HJ-NP-Y]{12}$/);
});
test('rejection sampling skips biased bytes', () => {
 const result=generateCustomerPublicId(()=>Buffer.from(Array(12).fill(255).concat(Array(12).fill(0))));
 assert.equal(result,'SB-222222222222');
});
test('invalid inputs cannot issue an ID', () => {
 assert.deepEqual(prepareCustomerRegistration({alias:'Ana',publicId:'SB-FAKE'}),{error:'invalid_profile'});
 assert.deepEqual(prepareCustomerRegistration({alias:' '}),{error:'invalid_profile'});
});
test('broken cryptographic source fails closed', () => {
 assert.throws(()=>generateCustomerPublicId(()=>Buffer.alloc(1)),/invalid_random_bytes/);
 assert.throws(()=>generateCustomerPublicId(()=>Buffer.alloc(24,255)),/customer_id_random_source_failed/);
 assert.throws(()=>prepareCustomerRegistration({alias:'Ana'},{uuid:()=> 'not-uuid'}),/invalid_generated_uuid/);
});
