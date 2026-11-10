import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerCustomerRegistrationCandidate} from '../apps/api/src/customer-registration-http-candidate.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const origin='https://sabora.example';
const token='A'.repeat(43);
const profile={public_id:'SB-222222222222',alias:'Ana',company:null};
const valid={profile,token,expiresAt:new Date(Date.now()+3600_000)};
const setup=async register=>{
 const app=Fastify({logger:false});
 registerCustomerRegistrationCandidate(app,{register,allowedOrigin:origin});
 await app.ready();
 return app;
};
const send=(app,{headers={},payload={alias:' Ana ',company:null}}={})=>app.inject({
 method:'POST',url:'/api/v1/customer/register',
 headers:{origin,'content-type':'application/json',...headers},
 payload:JSON.stringify(payload)
});
test('registration adapter sets HttpOnly Secure SameSite cookie only after successful commit result',async()=>{
 let received;
 const app=await setup(async input=>{received=input;return valid;});
 try{
  const response=await send(app);
  assert.equal(response.statusCode,201);
  assert.deepEqual(received,{alias:'Ana',company:null});
  assert.deepEqual(response.json(),{publicId:profile.public_id,alias:'Ana',company:null});
  assert.equal(response.headers['cache-control'],'no-store');
  assert.match(response.headers['set-cookie'],/^__Secure-sabora_customer=/);
  assert.match(response.headers['set-cookie'],/HttpOnly; Secure; SameSite=Strict/);
  assert.match(response.headers['set-cookie'],/Path=\/api\/v1\/customer/);
  assert.equal(response.body.includes(token),false);
 }finally{await app.close();}
});
test('registration blocks cross-origin, invalid body, and unexpected credentials before transaction',async()=>{
 let called=0;
 const app=await setup(async()=>{called++;return valid;});
 try{
  for(const params of [
   {headers:{origin:'https://evil.example'}},
   {headers:{origin:''}},
   {payload:{alias:' ',company:null}},
   {payload:{alias:'Ana',role:'ROOT'}},
   {headers:{'content-type':'text/plain'}}
  ]){
   const res=await send(app,params);
   assert.ok([400,403,415].includes(res.statusCode));
   assert.equal(res.headers['set-cookie'],undefined);
   assert.equal(res.headers['cache-control'],'no-store');
  }
  assert.equal(called,0);
 }finally{await app.close();}
});
test('failed transaction, malformed result and expired session never issue cookie',async()=>{
 for(const register of [
  async()=>{throw Error('sensitive SQL details');},
  async()=>null,
  async()=>({...valid,token:'SB-222222222222'}),
  async()=>({...valid,expiresAt:new Date(Date.now()-1000)}),
  async()=>({...valid,profile:{...profile,public_id:'bad'}})
 ]){
  const app=await setup(register);
  try{
   const res=await send(app);
   assert.equal(res.statusCode,503);
   assert.deepEqual(res.json(),{error:'registration_unavailable'});
   assert.equal(res.headers['set-cookie'],undefined);
   assert.equal(res.body.includes('sensitive SQL'),false);
  }finally{await app.close();}
 }
});
test('candidate refuses incomplete deployment configuration',async()=>{
 const app=Fastify();
 assert.throws(()=>registerCustomerRegistrationCandidate(app,{register:async()=>valid}),/invalid_customer_registration_http_configuration/);
 await app.close();
});
