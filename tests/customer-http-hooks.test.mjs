import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerHttpHooks } from '../apps/api/src/customer-http-hooks.mjs';
import { COOKIE_NAME } from '../apps/api/src/customer-http-security.mjs';

const token='A'.repeat(43);
const request=(method='GET',origin)=>({method,headers:{cookie:`${COOKIE_NAME}=${token}`,origin}});
function reply(){
 return {status:200,headers:{},body:undefined,code(n){this.status=n;return this;},header(k,v){this.headers[k]=v;return this;},send(b){this.body=b;return this;}};
}
test('authenticated customer identity is attached without bearer secret',async()=>{
 const hooks=createCustomerHttpHooks({verifySession:async()=>({customerId:'00000000-0000-4000-8000-000000000001'}),revokeSession:async()=>true,expectedOrigin:'https://sabora.example'});
 const req=request();const res=reply();
 await hooks.authenticate(req,res);
 assert.deepEqual(req.verifiedCustomer,{customerId:'00000000-0000-4000-8000-000000000001'});
 assert.equal(req.customerToken,undefined);
 assert.equal(res.status,200);
});
test('missing or rejected session returns 401; database failure returns 503',async()=>{
 for(const verifier of [async()=>null,async()=>{throw Error('DB down');}]){
  const hooks=createCustomerHttpHooks({verifySession:verifier,revokeSession:async()=>true,expectedOrigin:'https://sabora.example'});
  const res=reply();await hooks.authenticate(request(),res);
  assert.equal(res.status,verifier.toString().includes('throw')?503:401);
 }
 const hooks=createCustomerHttpHooks({verifySession:async()=>true,revokeSession:async()=>true,expectedOrigin:'https://sabora.example'});
 const res=reply();await hooks.authenticate({method:'GET',headers:{}},res);assert.equal(res.status,401);
});
test('unsafe cross-origin mutation is blocked; valid origin is allowed',()=>{
 const hooks=createCustomerHttpHooks({verifySession:async()=>null,revokeSession:async()=>true,expectedOrigin:'https://sabora.example'});
 const bad=reply();hooks.guardMutation(request('POST','https://evil.example'),bad);
 assert.equal(bad.status,403);
 const good=reply();hooks.guardMutation(request('POST','https://sabora.example'),good);
 assert.equal(good.status,200);
});
test('logout revokes session and clears cookie only after successful database operation',async()=>{
 let seen;
 const hooks=createCustomerHttpHooks({verifySession:async()=>null,revokeSession:async t=>{seen=t;return true;},expectedOrigin:'https://sabora.example'});
 const res=reply();await hooks.logout(request('POST','https://sabora.example'),res);
 assert.equal(seen,token);assert.equal(res.status,204);
 assert.match(res.headers['Set-Cookie'],/Max-Age=0/);
 const failed=createCustomerHttpHooks({verifySession:async()=>null,revokeSession:async()=>{throw Error('db down');},expectedOrigin:'https://sabora.example'});
 const bad=reply();await failed.logout(request('POST','https://sabora.example'),bad);
 assert.equal(bad.status,503);assert.equal(bad.headers['Set-Cookie'],undefined);
 const cross=reply();await hooks.logout(request('POST','https://evil.example'),cross);
 assert.equal(cross.status,403);assert.equal(cross.headers['Set-Cookie'],undefined);
 const get=reply();await hooks.logout(request('GET','https://sabora.example'),get);
 assert.equal(get.status,403);
});

test('logout rejects cross-site Fetch Metadata even with forged matching Origin',async()=>{
 let revoked=false;
 const hooks=createCustomerHttpHooks({verifySession:async()=>null,revokeSession:async()=>{revoked=true;},expectedOrigin:'https://sabora.example'});
 const req=request('POST','https://sabora.example');req.headers['sec-fetch-site']='cross-site';
 const res=reply();await hooks.logout(req,res);
 assert.equal(res.status,403);assert.equal(revoked,false);
});

test('customer hook rejects malformed identity returned by backend',async()=>{
 for(const customerId of ['not-a-uuid','',null]){
  const hooks=createCustomerHttpHooks({verifySession:async()=>({customerId}),revokeSession:async()=>true,expectedOrigin:'https://sabora.example'});
  const req=request(),res=reply();
  await hooks.authenticate(req,res);
  assert.equal(res.status,401);
  assert.equal(req.verifiedCustomer,undefined);
 }
});
test('customer hooks reject invalid configured origin',()=>{
 for(const expectedOrigin of ['https://sabora.example?x=1','https://sabora.example/path','https://sabora.example#fragment']){
  assert.throws(()=>createCustomerHttpHooks({verifySession:async()=>null,revokeSession:async()=>false,expectedOrigin}),/invalid_customer_http_hooks_configuration/);
 }
});
