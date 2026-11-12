import test from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import {
  describeOperationalSqlContract,
  validateOperationalEgressBinding,
  materializeOperationalM3Options,
  validateOperationalActivationManifest,
} from '../apps/api/src/operational-activation-manifest.mjs';
import {PILOT_ACTIVATION_REQUIREMENTS} from '../apps/api/src/pilot-activation-gate.mjs';

const features=Object.freeze({ownership:true,communications:true,waiterCalls:true});

function fixtureManifest({stage='lab',mutate}={}){
 const contract=describeOperationalSqlContract(features);
 const slots={};
 for(const [index,item] of contract.slots.entries()){
  slots[item.poolPath]={login:`sabora_runtime_${String(index).padStart(2,'0')}`,
   serverName:'db.project.supabase.co',port:5432,database:'postgres',mode:'direct',
   passwordRef:`database_password_${String(index).padStart(2,'0')}`,caRef:'database_ca'};
  if(stage==='production')Object.assign(slots[item.poolPath],{
   connectHost:'sabora-egress',connectPort:15432});
 }
 const value={schemaVersion:1,stage,restaurantCode:'SABORA_01',
  listener:{host:stage==='production'?'0.0.0.0':'127.0.0.1',port:4100,
   exposure:stage==='production'?'container_private':'loopback'},
  origins:{client:'https://menu.sabora.es',management:'https://gestion.sabora.es'},
  auth:{issuer:'https://project.supabase.co/auth/v1',
   connectHost:stage==='production'?'sabora-egress':'project.supabase.co',
   connectPort:stage==='production'?15443:443},features,
  network:{allowedTlsHosts:['project.supabase.co','db.project.supabase.co'],
   egressGatewayHost:stage==='production'?'sabora-egress':null},
  database:{slots,notifiers:{
   'tableChange.notificationPool':{credentialSlot:'tableChange.operationsPool',dedicatedPool:true},
   'h6.notifierPool':{credentialSlot:'h6.operationsPool',dedicatedPool:true},
  }},
  signing:{keyId:'sabora-key-2026',capabilitySecretRef:'capability_hmac',
   customerSecretRef:'customer_hmac',qrSecretRef:'qr_hmac'},
  activationEvidence:Object.fromEntries(PILOT_ACTIVATION_REQUIREMENTS.map(key=>
   [key,stage==='production']))};
 mutate?.(value,contract);
 return value;
}

class FakePool{
 static instances=[];
 constructor(options){this.options=options;this.closed=0;FakePool.instances.push(this);}
 async connect(){return {release(){}};}
 async end(){this.closed++;}
}

function resolverFor(manifest,{unsafe=false}={}){
 const values=new Map([['database_ca',tls.rootCertificates[0]],
  ['capability_hmac',unsafe?'change-me':'Qx8wP2nR7vL4cM9zT6kY3jH5sF1bD0aU'],
  ['customer_hmac','Vn4pL8wR2mX7qC9sT5bH1jK6dF3zA0uY'],
  ['qr_hmac','Gc7mN2vQ9xL4pR8sK1bT5wH3yD6fJ0aZ']]);
 for(const [index,slot] of Object.values(manifest.database.slots).entries())
  values.set(slot.passwordRef,`Db-${String(index).padStart(2,'0')}-uY7qL9vP2xN4rK8mT5cF1hJ6`);
 return async ref=>values.get(ref);
}

test('operational SQL contract accounts for all optional capabilities and dedicated notifiers',()=>{
 assert.equal(describeOperationalSqlContract({}).capabilityCount,17);
 const contract=describeOperationalSqlContract(features);
 assert.equal(contract.capabilityCount,22);
 assert.equal(contract.notifierCount,2);
 assert.equal(new Set(contract.slots.map(item=>item.poolPath)).size,22);
 assert.ok(contract.slots.every(item=>item.tls==='verify_ca_and_hostname'));
});

test('manifest validation is exact, bounded and exposes no credential values',()=>{
 const result=validateOperationalActivationManifest(fixtureManifest({stage:'production'}));
 assert.deepEqual(result.summary,{schemaVersion:1,stage:'production',capabilityCount:22,
  notifierCount:2,slots:result.summary.slots,tlsHostCount:2});
 assert.equal(result.summary.slots.length,22);
 assert.doesNotMatch(JSON.stringify(result.summary),/password|login|supabase\.co/i);
});

test('manifest rejects shared identities, privileged principals, host drift and bypassing the egress gateway',()=>{
 const cases=[
  value=>{const slots=Object.values(value.database.slots);slots[1].login=slots[0].login;},
  value=>{Object.values(value.database.slots)[0].login='postgres';},
  value=>{value.network.allowedTlsHosts=['project.supabase.co'];},
  value=>{Object.values(value.database.slots)[0].serverName='127.0.0.1';},
  value=>{Object.values(value.database.slots)[0].mode='session_pooler';},
  value=>{Object.values(value.database.slots)[0].connectHost='db.project.supabase.co';},
  value=>{Object.values(value.database.slots)[0].connectPort=5432;},
  value=>{value.activationEvidence.deploymentAuthorized='true';},
 ];
 for(const mutate of cases)
  assert.throws(()=>validateOperationalActivationManifest(fixtureManifest({stage:'production',mutate})),
   /operational_activation_manifest_invalid/);
});

test('production bootstrap allows only exact SQL/JWKS tunnel bindings shared by all slots',()=>{
 const manifest=fixtureManifest({stage:'production'});
 const policy={schemaVersion:1,bindHost:'0.0.0.0',targets:[
  {id:'database_main',listenPort:15432,host:'db.project.supabase.co',
   port:5432,protocol:'postgres_tls'},
  {id:'auth_jwks',listenPort:15443,host:'project.supabase.co',
   port:443,protocol:'tls'},
 ]};
 assert.deepEqual(validateOperationalEgressBinding(manifest,policy),{
  targetCount:2,capabilityCount:22,notifierCount:2,
 });
 const fails=[
  [value=>{value.database.slots['customer.flowPool'].connectPort=15433;},null],
  [value=>{value.database.slots['h6.eventPool'].serverName='db2.project.supabase.co';
   value.network.allowedTlsHosts.push('db2.project.supabase.co');},null],
  [null,value=>{value.targets[0].host='other.supabase.co';}],
  [null,value=>{value.targets[0].protocol='tls';}],
  [null,value=>{value.targets[1].listenPort=15444;}],
  [null,value=>{value.targets.push({id:'unused_target',listenPort:15445,
   host:'extra.supabase.co',port:443,protocol:'tls'});}],
 ];
 for(const [changeManifest,changePolicy] of fails){
  const candidate=structuredClone(manifest);
  const egress=structuredClone(policy);
  changeManifest?.(candidate);changePolicy?.(egress);
  assert.throws(()=>validateOperationalEgressBinding(candidate,egress),
   /operational_activation_manifest_invalid/);
 }
});

test('materialization constructs one strict bounded pool per slot plus two distinct notifiers',async()=>{
 FakePool.instances=[];
 const manifest=fixtureManifest();
 const resources=await materializeOperationalM3Options({manifest,Pool:FakePool,
  resolveSecret:resolverFor(manifest),fetchImpl:async()=>{throw Error('not_fetched_during_materialize');}});
 assert.equal(FakePool.instances.length,24);
 assert.equal(resources.summary.capabilityCount,22);
 for(const pool of FakePool.instances){
  assert.equal(pool.options.ssl.rejectUnauthorized,true);
  assert.equal(pool.options.ssl.servername,'db.project.supabase.co');
  assert.match(pool.options.ssl.ca,/BEGIN CERTIFICATE/);
  assert.ok(pool.options.max>=1&&pool.options.max<=5);
  assert.ok(pool.options.connectionTimeoutMillis<=5000);
 }
 assert.notEqual(resources.options.tableChange.operationsPool,
  resources.options.tableChange.notificationPool);
 assert.notEqual(resources.options.h6.operationsPool,resources.options.h6.notifierPool);
 await resources.close();await resources.close();
 assert.ok(FakePool.instances.every(pool=>pool.closed===1));
});

test('production placeholder secrets and invalid CA fail closed and release opened pools',async()=>{
 for(const [unsafe,alter] of [[true,()=>{}],[false,manifest=>{
  for(const slot of Object.values(manifest.database.slots))slot.caRef='invalid_ca';
 }]]){
  FakePool.instances=[];
  const manifest=fixtureManifest({stage:'production',mutate:alter});
  const resolve=resolverFor(manifest,{unsafe});
  await assert.rejects(materializeOperationalM3Options({manifest,Pool:FakePool,
   resolveSecret:async ref=>ref==='invalid_ca'?'not-a-certificate':resolve(ref)}),
   /operational_activation_secret_unavailable/);
  assert.ok(FakePool.instances.every(pool=>pool.closed===1));
 }
});
