import test from 'node:test';
import assert from 'node:assert/strict';
import {isolatedBrowserEnvironment,findDisposableIdentity,isDisposableIdentity} from '../scripts/ops/sabora-hosted-auth-exercise-safety.mjs';
const email='sabora-auth-probe-323e4567-e89b-42d3-a456-426614174000@example.com';
const subject='123e4567-e89b-42d3-a456-426614174000';
const other='223e4567-e89b-42d3-a456-426614174000';
test('hosted Auth browser inherits only explicit non-sensitive environment variables',()=>{
 const fake='synthetic-private-test-value';
 assert.deepEqual(isolatedBrowserEnvironment({PATH:'/usr/bin',HOME:'/home/test',LANG:'C.UTF-8',TEMP:fake,
  EXTRA_CREDENTIAL:fake,NODE_OPTIONS:'--inspect',OTHER_CONFIG:'unrelated'},[fake]),
 {PATH:'/usr/bin',HOME:'/home/test',LANG:'C.UTF-8'});
});
test('hosted Auth uncertain invitation reconciliation identifies only exact disposable address',()=>{
 const fixture={id:subject,email},unrelated={id:other,email:'another@example.com'};
 assert.equal(findDisposableIdentity([unrelated,fixture],email),subject);
 assert.equal(findDisposableIdentity([unrelated],email),null);
 assert.throws(()=>findDisposableIdentity([fixture,{id:other,email}],email),/ambiguous/);
 assert.throws(()=>findDisposableIdentity([{id:'bad',email}],email),/ambiguous/);
 assert.throws(()=>findDisposableIdentity([unrelated],unrelated.email),/invalid/);
 assert.equal(isDisposableIdentity(fixture,email,subject),true);
 assert.equal(isDisposableIdentity(fixture,email,other),false);
 assert.equal(isDisposableIdentity(unrelated,email),false);
});
