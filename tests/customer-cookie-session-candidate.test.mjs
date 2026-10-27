import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {issueCustomerSession} from '../apps/api/src/customer-session.mjs';
import {SESSION_LOOKUP_SQL} from '../apps/api/src/customer-session-verifier.mjs';
import {SESSION_REVOKE_SQL} from '../apps/api/src/customer-session-query-boundary.mjs';
import {readCustomerCookie,registerCustomerCookieSessionCandidate} from '../apps/api/src/customer-cookie-session-candidate.mjs';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const origin='https://sabora.example';
const customer={customer_id:'00000000-0000-4000-8000-000000000111',public_id:'SB-222222222222',alias:'Ana',company:null};
const session=issueCustomerSession();
const cookie='__Secure-sabora_customer='+session.token;
const make=async()=>{
 let revoked=false,failed=false,queries=0;
 const pool={query:async(sql,params)=>{
  queries++;
  assert.ok([SESSION_LOOKUP_SQL,SESSION_REVOKE_SQL].includes(sql));
  assert.equal(params.length,1);
  assert.ok(Buffer.isBuffer(params[0]));
  assert.equal(params[0].length,32);
  assert.equal(params[0].equals(session.tokenHash),true);
  if(failed)throw Error('private database detail');
  if(sql===SESSION_REVOKE_SQL){revoked=true;return {rows:[{revoked:true}]};}
  return {rows:revoked?[]:[customer]};
 }};
 const app=Fastify({logger:false});
 registerCustomerCookieSessionCandidate(app,{pool,allowedOrigin:origin});
 await app.ready();
 return {app,setFailed:v=>{failed=v;},getQueries:()=>queries};
};
test('cookie parsing rejects ambiguity, injection and noncanonical bearer',()=>{
 assert.equal(readCustomerCookie(cookie),session.token);
 assert.equal(readCustomerCookie('other=1; '+cookie),session.token);
 for(const header of [undefined,'',cookie+'; '+cookie,cookie+'extra',cookie+'%20',cookie+'; __Secure-sabora_customer=wrong','__Secure-sabora_customer=SB-222222222222']){
  assert.equal(readCustomerCookie(header),null);
 }
});
test('HTTP customer session authenticates only private cookie and logout revokes token',async()=>{
 const {app,getQueries}=await make();
 try{
  const get=headers=>app.inject({method:'GET',url:'/api/v1/customer/session',headers});
  const missing=await get({});
  assert.equal(missing.statusCode,401);
  const spoof=await get({authorization:'Bearer '+session.token,cookie});
  assert.equal(spoof.statusCode,401);
  const success=await get({cookie});
  assert.equal(success.statusCode,200);
  assert.deepEqual(success.json(),{authenticated:true,publicId:customer.public_id,
   alias:customer.alias,company:null});
  assert.equal(success.headers['cache-control'],'no-store');
  assert.equal(success.body.includes(session.token),false);
  assert.equal(success.body.includes(customer.customer_id),false);
  const before=getQueries();
  const cross=await app.inject({method:'POST',url:'/api/v1/customer/logout',headers:{cookie,origin:'https://evil.example'}});
  assert.equal(cross.statusCode,403);
  assert.equal(getQueries(),before);
  const logout=await app.inject({method:'POST',url:'/api/v1/customer/logout',headers:{cookie,origin,'sec-fetch-site':'same-origin'}});
  assert.equal(logout.statusCode,200);
  assert.deepEqual(logout.json(),{revoked:true});
  assert.match(logout.headers['set-cookie'],/Max-Age=0; HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await get({cookie})).statusCode,401);
 }finally{await app.close();}
});
test('backend outage is generic and never clears cookie before confirmed revocation',async()=>{
 const {app,setFailed}=await make();
 setFailed(true);
 try{
  const get=await app.inject({url:'/api/v1/customer/session',headers:{cookie}});
  assert.equal(get.statusCode,503);
  assert.deepEqual(get.json(),{error:'authentication_unavailable'});
  assert.equal(get.body.includes('private database'),false);
  const logout=await app.inject({method:'POST',url:'/api/v1/customer/logout',headers:{cookie,origin}});
  assert.equal(logout.statusCode,503);
  assert.equal(logout.headers['set-cookie'],undefined);
  assert.equal(logout.body.includes('private database'),false);
 }finally{await app.close();}
});
