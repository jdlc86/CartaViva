import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomerProfile, normalizeCustomerRegistration } from '../apps/api/src/customer-profile.mjs';

test('registration accepts alias and optional company without corporate data', () => {
 assert.deepEqual(normalizeCustomerRegistration({alias:'  Dayron  '}),{alias:'Dayron',company:null});
 assert.deepEqual(normalizeCustomerRegistration({alias:' Ana ',company:'  Comedor A  '}),{alias:'Ana',company:'Comedor A'});
 assert.deepEqual(normalizeCustomerRegistration({alias:'Ana',company:'  '}),{alias:'Ana',company:null});
});
test('registration rejects identity and privilege injection', () => {
 for(const field of ['id','customerId','employee_number','employeeNumber','role','passkey','sessionToken','userId']) {
  assert.deepEqual(normalizeCustomerRegistration({alias:'Ana',[field]:'spoofed'}),{error:'invalid_profile'});
 }
});
test('invalid or oversized profiles fail closed', () => {
 for(const value of [null,undefined,[],{}, {alias:''},{alias:'   '},{alias:123},{alias:'x'.repeat(81)},{alias:'a\nb'},{alias:'Ana',company:42},{alias:'Ana',company:'x'.repeat(161)}]) {
  assert.deepEqual(normalizeCustomerRegistration(value),{error:'invalid_profile'});
 }
});
test('editing profile normalizes unicode and does not issue an identity', () => {
 const result=normalizeCustomerProfile({alias:' e\u0301 ',company:null});
 assert.deepEqual(result,{alias:'é',company:null});
 assert.equal(Object.hasOwn(result,'id'),false);
});
