import test from 'node:test';
import assert from 'node:assert/strict';
import {
 describeM2RuntimeSqlSlots,validateM2RuntimeSqlIdentities
} from '../apps/api/src/m2-runtime-identity-inventory.mjs';

const privateCredential='PRIVATE_SHOULD_NOT_PRINT_M2_INVENTORY';
const bare=(login)=>({connect:async()=>{},options:{user:login,
 connectionString:'postgresql://'+login+':'+privateCredential+'@localhost/postgres'}});
const make=(management=true,extended=false)=>{
 const spec=describeM2RuntimeSqlSlots({management,
  ownership:extended,communications:extended,waiterCalls:extended});
 const options={customer:{},tableChange:{notificationPool:bare('notify_tables')},
  staff:{},h4:{},h6:{notifierPool:bare('notify_events')}};
 if(management)options.management={};
 if(extended){
  options.management.ownership={};
  options.management.communications={};
  options.waiterCalls={};
 }
 spec.forEach(({poolPath,loginPath},i)=>{
  const poolKeys=poolPath.split('.');
  const loginKeys=loginPath.split('.');
  const login='sabora_capability_'+i;
  let p=options;
  for(const key of poolKeys.slice(0,-1)){p[key]??={};p=p[key];}
  p[poolKeys.at(-1)]=bare(login);
  p=options;
  for(const key of loginKeys.slice(0,-1)){p[key]??={};p=p[key];}
  p[loginKeys.at(-1)]=login;
 });
 return {options,spec};
};

test('SQL runtime inventory is exhaustive for 15 base, 17 M3, 22 optional capability slots',()=>{
 for(const [management,extended,expected] of [[false,false,15],[true,false,17],[true,true,22]]){
  const {options,spec}=make(management,extended);
  const result=validateM2RuntimeSqlIdentities(options);
  assert.equal(result.capabilityCount,expected);
  assert.equal(result.notifierCount,2);
  assert.equal(spec.length,expected);
  assert.equal(new Set(result.slots).size,expected);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.slots));
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_SHOULD_NOT_PRINT|postgresql:|password|sabora_capability_/);
 }
});

test('runtime refuses reused SQL logins, shared connection identities and absent notifier',()=>{
 const {options,spec}=make(true,true);
 const second=spec[1];
 const first=spec[0];
 const get=(path)=>path.split('.').reduce((v,k)=>v?.[k],options);
 const parent=(path)=>path.split('.').slice(0,-1).reduce((v,k)=>v[k],options);
 const last=path=>path.split('.').at(-1);
 const original=get(second.loginPath);
 parent(second.loginPath)[last(second.loginPath)]=get(first.loginPath);
 assert.throws(()=>validateM2RuntimeSqlIdentities(options),/m2_restaurant_candidate_isolation_required/);
 parent(second.loginPath)[last(second.loginPath)]=original;
 const pool=get(second.poolPath);
 parent(second.poolPath)[last(second.poolPath)]=get(first.poolPath);
 assert.throws(()=>validateM2RuntimeSqlIdentities(options),/m2_restaurant_candidate_isolation_required/);
 parent(second.poolPath)[last(second.poolPath)]=pool;
 options.h6.notifierPool=null;
 assert.throws(()=>validateM2RuntimeSqlIdentities(options),/m2_restaurant_candidate_isolation_required/);
});

test('an object masquerading as a LOGIN string is rejected before SQL',()=>{
 const {options}=make();
 options.customer.expectedCatalogLogin={toString:()=> 'sabora_capability_0'};
 assert.throws(()=>validateM2RuntimeSqlIdentities(options),/m2_restaurant_candidate_isolation_required/);
});

test('inventory rejects inconsistent flags and never leaks injected secrets in errors',()=>{
 assert.throws(()=>describeM2RuntimeSqlSlots({management:false,ownership:true}),/m2_restaurant_candidate_isolation_required/);
 const {options}=make();
 options.customer.flowPool.options.connectionString='postgresql://'+privateCredential+'@localhost';
 options.customer.flowPool.options.user='sabora_capability_0';
 let error;
 try{validateM2RuntimeSqlIdentities(options);}catch(e){error=e;}
 assert.match(String(error),/m2_restaurant_candidate_isolation_required/);
 assert.doesNotMatch(String(error),new RegExp(privateCredential));
});
