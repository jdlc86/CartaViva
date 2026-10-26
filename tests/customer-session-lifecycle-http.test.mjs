import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {issueCustomerSession} from '../apps/api/src/customer-session.mjs';
import {createCustomerSessionVerifier,SESSION_LOOKUP_SQL} from '../apps/api/src/customer-session-verifier.mjs';
import {registerVerifiedCustomerRoutes} from '../apps/api/src/customer-routes-composition.mjs';

const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const Fastify=requireApi('fastify');
const ids=['00000000-0000-4000-8000-000000000111','00000000-0000-4000-8000-000000000222'];
const profiles=ids.map((id,i)=>({customer_id:id,public_id:i?'SB-333333333333':'SB-222222222222',alias:i?'Bea':'Ana',company:null}));
const base=new Date('2026-10-26T10:00:00Z');
const sessions=profiles.map((profile,i)=>({...issueCustomerSession({random:()=>Buffer.alloc(32,i+11),now:()=>base,lifetimeSeconds:3600}),profile,revoked:false}));
test('full isolated HTTP session lifecycle: two customers, revocation, expiry, forged ID and SQL secrecy',async()=>{
 let now=new Date(base);
 let queries=0;
 const verify=createCustomerSessionVerifier({query:async(sql,params)=>{
  queries++;
  assert.equal(sql,SESSION_LOOKUP_SQL);
  assert.equal(params.length,1);
  assert.ok(Buffer.isBuffer(params[0]));
  assert.equal(params[0].length,32);
  const match=sessions.find(s=>s.tokenHash.equals(params[0]));
  if(!match||match.revoked||match.expiresAt<=now)return {rows:[]};
  return {rows:[match.profile]};
 }});
 const app=Fastify();
 await registerVerifiedCustomerRoutes(app,{verifyCustomerSession:verify,registerRoutes:async scope=>{
  scope.get('/whoami',async request=>({id:request.customerIdentity.customerId}));
 }});
 app.get('/health',async()=>({status:'ok'}));
 await app.ready();
 const request=token=>app.inject({url:'/api/v1/customer/whoami',headers:{authorization:'Bearer '+token}});
 try{
  for(let i=0;i<2;i++){
   const response=await request(sessions[i].token);
   assert.equal(response.statusCode,200);
   assert.deepEqual(response.json(),{id:ids[i]});
   assert.equal(response.body.includes('SB-'),false);
   assert.equal(response.body.includes(sessions[i].token),false);
  }
  const before=queries;
  const forged=await app.inject({url:'/api/v1/customer/whoami',headers:{authorization:'Bearer SB-222222222222'}});
  assert.equal(forged.statusCode,401);
  assert.equal(queries,before);
  sessions[0].revoked=true;
  assert.equal((await request(sessions[0].token)).statusCode,401);
  assert.deepEqual((await request(sessions[1].token)).json(),{id:ids[1]});
  now=new Date('2026-10-26T11:00:01Z');
  assert.equal((await request(sessions[1].token)).statusCode,401);
  assert.equal((await app.inject('/health')).statusCode,200);
 }finally{await app.close();}
});
test('unavailable SQL verifier never authenticates and never exposes backend failure details',async()=>{
 const app=Fastify({logger:false});
 await registerVerifiedCustomerRoutes(app,{verifyCustomerSession:createCustomerSessionVerifier({
  query:async()=>{throw Error('sensitive backend connection detail');}
 }),registerRoutes:async scope=>scope.get('/whoami',async()=>({ok:true}))});
 await app.ready();
 try{
  const res=await app.inject({url:'/api/v1/customer/whoami',headers:{authorization:'Bearer '+sessions[0].token}});
  assert.equal(res.statusCode,500);
  assert.equal(res.body.includes('sensitive backend connection detail'),false);
 }finally{await app.close();}
});
