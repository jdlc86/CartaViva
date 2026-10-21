import test from 'node:test';
import assert from 'node:assert/strict';
import { COOKIE_NAME, customerSessionCookie, clearCustomerSessionCookie, readCustomerSessionCookie, isAllowedCustomerRequestOrigin } from '../apps/api/src/customer-http-security.mjs';
const token='A'.repeat(43);
test('customer session cookie is host-only, HttpOnly, Secure and strict',()=>{
 const cookie=customerSessionCookie(token);
 assert.match(cookie,new RegExp('^__Host-sabora_customer='));
 for(const flag of ['Path=/','HttpOnly','Secure','SameSite=Strict','Max-Age=2592000'])assert.ok(cookie.includes(flag));
 assert.ok(!cookie.includes('Domain='));
 assert.equal(readCustomerSessionCookie(`other=1; ${COOKIE_NAME}=${token}`),token);
 assert.match(clearCustomerSessionCookie(),/Max-Age=0/);
});
test('rejects insecure cookie, duplicate names, malformed token and oversized header',()=>{
 assert.throws(()=>customerSessionCookie(token,{secure:false}),/invalid_customer_cookie/);
 assert.throws(()=>customerSessionCookie('invalid'),/invalid_customer_cookie/);
 assert.equal(readCustomerSessionCookie(`${COOKIE_NAME}=${token}; ${COOKIE_NAME}=${token}`),null);
 assert.equal(readCustomerSessionCookie(`${COOKIE_NAME}=invalid`),null);
 assert.equal(readCustomerSessionCookie('x'.repeat(8193)),null);
});
test('unsafe requests require exact HTTPS origin, safe methods do not',()=>{
 const expectedOrigin='https://sabora.example';
 for(const method of ['POST','PUT','PATCH','DELETE']){
  assert.equal(isAllowedCustomerRequestOrigin({method,origin:expectedOrigin,expectedOrigin}),true);
  for(const origin of [undefined,'null','https://attacker.example','https://sabora.example.evil']){
   assert.equal(isAllowedCustomerRequestOrigin({method,origin,expectedOrigin}),false);
  }
 }
 assert.equal(isAllowedCustomerRequestOrigin({method:'GET',expectedOrigin}),true);
 assert.throws(()=>isAllowedCustomerRequestOrigin({method:'POST',origin:expectedOrigin,expectedOrigin:'http://localhost'}),/invalid_customer_origin_configuration/);
});
