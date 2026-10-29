import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {registerVerifiedCustomerProductionApp} from './customer-production-app.mjs';
import {CUSTOMER_PRODUCTION_PREFLIGHT_SQL,CUSTOMER_PRODUCTION_FUNCTION_PREFLIGHT_SQL,
 CUSTOMER_PRODUCTION_EXACT_FUNCTIONS_SQL} from './customer-production-sql-preflight.mjs';

const login={registration:'sabora_customer_registration_login',
 session:'sabora_customer_session_login',flow:'sabora_customer_flow_login'};
function pool(kind,{broken=false}={}){
 const events=[];
 return {events,connect:async()=>({
  query:async(sql)=>{
   events.push(sql);
   if(broken)throw Error('private_secret_not_for_clients');
   if(sql===CUSTOMER_PRODUCTION_PREFLIGHT_SQL)return {rows:[{
    effective_role:login[kind],login_role:login[kind],can_login:true,inherit_role:false,
    superuser:false,bypass_rls:false,create_db:false,create_role:false,
    replication:false,database_create:false,schema_create:false,
    direct_relation_access:false,direct_sequence_access:false,
    registration_set:kind==='registration',session_set:kind==='session',flow_set:kind==='flow'
   }]};
   if(sql===CUSTOMER_PRODUCTION_FUNCTION_PREFLIGHT_SQL)
    return {rows:[{login_execute:false,capability_execute:true}]};
   if(sql===CUSTOMER_PRODUCTION_EXACT_FUNCTIONS_SQL)return {rows:[{exact:true}]};
   throw Error('unexpected_sql');
  },
  release:()=>{}
 })};
}
function options(){
 return {registrationPool:pool('registration'),sessionPool:pool('session'),
  flowPool:pool('flow'),allowedOrigin:'https://sabora.example',
  secretKey:'test-only-secret-not-production-'.repeat(2),
  expectedRegistrationLogin:login.registration,
  expectedSessionLogin:login.session,expectedFlowLogin:login.flow};
}
test('H3 opt-in app mounts registration, visits, quotes and orders after exact SQL preflight',async t=>{
 const app=Fastify({logger:false});t.after(()=>app.close());
 const opts=options();
 assert.deepEqual(await registerVerifiedCustomerProductionApp(app,opts),
  {registered:true,mode:'opt-in-customer-production-candidate'});
 await app.ready();
 for(const [method,url] of [['POST','/api/v1/customer/register'],
  ['GET','/api/v1/customer/session'],['POST','/api/v1/customer/visits'],
  ['POST','/api/v1/customer/quotes'],['POST','/api/v1/customer/orders/confirm']])
  assert.equal(app.hasRoute({method,url}),true,url);
 assert.equal((await app.inject('/ready')).statusCode,200);
 const anonymous=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
  headers:{origin:'https://sabora.example','content-type':'application/json'},
  payload:{tableId:'not-authorized'}});
 assert.equal(anonymous.statusCode,401);
 const crossSite=await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',
  headers:{origin:'https://other.example','content-type':'application/json'},payload:{}});
 assert.equal(crossSite.statusCode,403);
 assert.equal((await app.inject({method:'POST',url:'/api/v1/customer/register',
  headers:{origin:'https://other.example','content-type':'application/json'},payload:{}})).statusCode,403);
});
test('failed SQL preflight leaves no customer, health or readiness routes',async t=>{
 const app=Fastify({logger:false});t.after(()=>app.close());
 const opts=options();opts.flowPool=pool('flow',{broken:true});
 await assert.rejects(registerVerifiedCustomerProductionApp(app,opts),
  /invalid_customer_production_sql_capabilities/);
 assert.equal((await app.inject('/ready')).statusCode,404);
 assert.equal((await app.inject('/api/v1/customer/session')).statusCode,404);
 assert.equal((await app.inject({method:'POST',url:'/api/v1/customer/orders/confirm',payload:{}})).statusCode,404);
});
test('readiness fails closed after identity drift and does not disclose database errors',async t=>{
 const app=Fastify({logger:false});t.after(()=>app.close());
 const opts=options();await registerVerifiedCustomerProductionApp(app,opts);
 opts.flowPool.connect=async()=>{throw Error('private_secret_not_for_clients');};
 const result=await app.inject('/ready');
 assert.equal(result.statusCode,503);
 assert.deepEqual(result.json(),{status:'unavailable'});
 assert.equal(result.body.includes('private_secret'),false);
});
test('route conflicts and invalid origin reject before SQL connection',async t=>{
 const app=Fastify({logger:false});t.after(()=>app.close());
 app.get('/ready',async()=>({status:'unsafe'}));
 const opts=options();
 await assert.rejects(registerVerifiedCustomerProductionApp(app,opts),
  /customer_production_app_route_conflict/);
 assert.equal(opts.registrationPool.events.length,0);
 const other=Fastify({logger:false});t.after(()=>other.close());
 await assert.rejects(registerVerifiedCustomerProductionApp(other,
  {...options(),allowedOrigin:'http://insecure.example'}),/invalid_customer_production_app/);
});
