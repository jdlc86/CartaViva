import test from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import {createECDH,randomBytes} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {
  describeOperationalSqlContract,
  validateOperationalEgressBinding,
  materializeOperationalM3Options,
  validateOperationalActivationManifest,
} from '../apps/api/src/operational-activation-manifest.mjs';
import {PILOT_ACTIVATION_REQUIREMENTS} from '../apps/api/src/pilot-activation-gate.mjs';
import {createFloorPushSender} from '../apps/api/src/floor-web-push.mjs';

const features=Object.freeze({ownership:true,communications:true,waiterCalls:true});

function fixtureManifest({stage='lab',mutate,selectedFeatures=features}={}){
 const contract=describeOperationalSqlContract(selectedFeatures);
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
   connectPort:stage==='production'?15443:443},features:selectedFeatures,
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

test('directory and revocation require passkeys, distinct logins and distinct signing keys',async()=>{
 const manifest=fixtureManifest({
  selectedFeatures:{...features,staffDirectory:true,staffRevocation:true},mutate:value=>{
   value.auth.staffPasskeyPublishableKey='sb_publishable_isolated_manifest_123456';
   Object.assign(value.signing,{staffDirectoryKeyId:'staff_dir_ci_key',
    staffDirectorySecretRef:'staff_directory_hmac',staffRevocationKeyId:'staff_revoke_ci_key',
    staffRevocationSecretRef:'staff_revocation_hmac'});
  }
 });
 const valid=validateOperationalActivationManifest(manifest);
 assert.equal(valid.summary.capabilityCount,25);
 for(const mutate of [
  value=>{delete value.auth.staffPasskeyPublishableKey;},
  value=>{value.signing.staffRevocationKeyId=value.signing.staffDirectoryKeyId;},
  value=>{value.signing.staffRevocationSecretRef=value.signing.staffDirectorySecretRef;},
  value=>{value.database.slots['staff.revocation.pool'].login=value.database.slots['staff.pool'].login;},
  value=>{value.features.staffDirectory=false;},
  value=>{value.features.ownership=false;}
 ]){
  const invalid=structuredClone(manifest);
  mutate(invalid);
  assert.throws(()=>validateOperationalActivationManifest(invalid));
 }
 const baseResolver=resolverFor(manifest);
 const resources=await materializeOperationalM3Options({manifest,Pool:FakePool,
  resolveSecret:async ref=>ref==='staff_directory_hmac'?'d'.repeat(32):
   ref==='staff_revocation_hmac'?'r'.repeat(32):baseResolver(ref)});
 try{
  assert.notEqual(resources.options.staff.directory.pool,resources.options.staff.revocation.pool);
  assert.equal(typeof resources.options.staff.directory.issueCapability,'function');
  assert.equal(typeof resources.options.staff.revocation.issueCapability,'function');
 }finally{await resources.close();}
});

class FakePool{
 static instances=[];
 constructor(options){this.options=options;this.closed=0;FakePool.instances.push(this);}
 async connect(){return {release(){}};}
 async end(){this.closed++;}
}

test('floor Web Push binds both approved hosts to gateway TLS routes and treats redirects as failures',async()=>{
 const vapid=createECDH('prime256v1'),device=createECDH('prime256v1');
 const publicKey=vapid.generateKeys('base64url'),privateKey=Buffer.from(vapid.getPrivateKey().toString('hex').padStart(64,'0'),'hex').toString('base64url');
 const p256dh=device.generateKeys('base64url'),auth=randomBytes(16).toString('base64url');
 const ports={'fcm.googleapis.com':15445,'web.push.apple.com':15446};
 const manifest=fixtureManifest({stage:'production',selectedFeatures:{...features,floorPush:true},mutate:value=>{
  value.auth.staffPasskeyPublishableKey='sb_publishable_isolated_manifest_123456';
  value.floorPush={ports,publicKey,privateKeyRef:'floor_push_vapid',subject:'mailto:security@sabora.es'};
  value.network.allowedTlsHosts.push(...Object.keys(ports));
 }});
 const policy={schemaVersion:1,bindHost:'0.0.0.0',targets:[
  {id:'restaurant_db',listenPort:15432,host:'db.project.supabase.co',port:5432,protocol:'postgres_tls'},
  {id:'restaurant_auth',listenPort:15443,host:'project.supabase.co',port:443,protocol:'tls'},
  {id:'floor_push_chrome',listenPort:15445,host:'fcm.googleapis.com',port:443,protocol:'tls'},
  {id:'floor_push_apple',listenPort:15446,host:'web.push.apple.com',port:443,protocol:'tls'}
 ]};
 assert.equal(validateOperationalEgressBinding(manifest,policy).targetCount,4);
 const resolver=resolverFor(manifest);
 const resources=await materializeOperationalM3Options({manifest,Pool:FakePool,
  resolveSecret:async ref=>ref==='floor_push_vapid'?privateKey:resolver(ref)});
 try{assert.equal(typeof resources.options.floorPush.send,'function');}
 finally{await resources.close();}
 for(const mutate of [
  value=>{value.targets.at(-1).host='other.push.apple.com';},
  value=>{value.targets.at(-1).port=8443;},
  value=>{value.targets.pop();}
 ]){
  const copy=structuredClone(policy);mutate(copy);
  assert.throws(()=>validateOperationalEgressBinding(manifest,copy));
 }
 const calls=[],tunnels=[],codes=[307,410];
 const send=createFloorPushSender({connectHost:'sabora-egress',ports,
  vapid:{publicKey,privateKey,subject:manifest.floorPush.subject},
  tlsConnect:options=>tunnels.push(options),request:(options,cb)=>{
   calls.push(options);options.agent.createConnection({});
   const req=new EventEmitter();
   req.end=body=>{
    assert.ok(Buffer.isBuffer(body)&&!body.includes('occurrence'));
    const response=Readable.from([]);
    response.statusCode=codes.shift();response.headers={location:'https://external.sabora.es/unrelated'};
    cb(response);
   };
   return req;
  }
 });
 const message={kind:'call',tag:'g'.repeat(32),occurrence:'fixture'};
 assert.equal(await send({endpoint:'https://fcm.googleapis.com/fcm/send/fixture',p256dh,auth},message),'failed');
 assert.equal(await send({endpoint:'https://web.push.apple.com/fixture',p256dh,auth},message),'gone');
 assert.deepEqual(calls.map(item=>[item.hostname,item.port,item.method,item.headers.TTL]),[
  ['fcm.googleapis.com',443,'POST',0],['web.push.apple.com',443,'POST',0]
 ]);
 assert.deepEqual(tunnels.map(item=>[item.host,item.port,item.servername,item.rejectUnauthorized]),[
  ['sabora-egress',15445,'fcm.googleapis.com',true],['sabora-egress',15446,'web.push.apple.com',true]
 ]);
});

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
 assert.equal(describeOperationalSqlContract({}).capabilityCount,18);
 const contract=describeOperationalSqlContract(features);
 assert.equal(contract.capabilityCount,23);
 assert.equal(contract.notifierCount,2);
 assert.equal(new Set(contract.slots.map(item=>item.poolPath)).size,23);
 assert.ok(contract.slots.every(item=>item.tls==='verify_ca_and_hostname'));
});

test('manifest validation is exact, bounded and exposes no credential values',()=>{
 const result=validateOperationalActivationManifest(fixtureManifest({stage:'production'}));
 assert.deepEqual(result.summary,{schemaVersion:1,stage:'production',capabilityCount:23,
  notifierCount:2,slots:result.summary.slots,tlsHostCount:2});
 assert.equal(result.summary.slots.length,23);
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
  targetCount:2,capabilityCount:23,notifierCount:2,
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
 assert.equal(FakePool.instances.length,25);
 assert.equal(resources.summary.capabilityCount,23);
 for(const pool of FakePool.instances){
  assert.match(pool.options.user,/^sabora_runtime_\d{2}$/);
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

test('Supabase IPv4 session pooler qualifies wire logins for 23 SQL slots and 2 notifiers',async()=>{
 const project='byhvmumqivmunkmomhup';
 const host='aws-fixture.pooler.supabase.com';
 const manifest=fixtureManifest({stage:'production',mutate:value=>{
  value.auth.issuer=`https://${project}.supabase.co/auth/v1`;
  value.network.allowedTlsHosts=[`${project}.supabase.co`,host];
  for(const slot of Object.values(value.database.slots)){
   slot.mode='session_pooler';slot.serverName=host;
  }
 }});
 const policy={schemaVersion:1,bindHost:'0.0.0.0',targets:[
  {id:'database_main',listenPort:15432,host,port:5432,protocol:'postgres_tls'},
  {id:'auth_jwks',listenPort:15443,host:`${project}.supabase.co`,
   port:443,protocol:'tls'},
 ]};
 assert.equal(validateOperationalEgressBinding(manifest,policy).capabilityCount,23);
 FakePool.instances=[];
 const resources=await materializeOperationalM3Options({manifest,Pool:FakePool,
  resolveSecret:resolverFor(manifest),fetchImpl:async()=>{throw Error('no_external_fetch');}});
 assert.equal(FakePool.instances.length,25);
 const validWireUsers=new Set(Object.values(manifest.database.slots).map(slot=>
  `${slot.login}.${project}`));
 for(const pool of FakePool.instances){
  assert.ok(validWireUsers.has(pool.options.user),'missing tenant suffix or unknown DB role');
  assert.equal(pool.options.host,'sabora-egress');
  assert.equal(pool.options.port,15432);
  assert.equal(pool.options.ssl.servername,host);
  assert.equal(pool.options.ssl.rejectUnauthorized,true);
 }
 const logicalLogin=manifest.database.slots['h4.operationsPool'].login;
 assert.equal(resources.options.h4.operationsPool.options.user,`${logicalLogin}.${project}`);
 await resources.close();
 assert.ok(FakePool.instances.every(pool=>pool.closed===1));
});

test('session pooler rejects cross-project issuer before creating a SQL pool',async()=>{
 const manifest=fixtureManifest({stage:'production',mutate:value=>{
  value.auth.issuer='https://otherproject.supabase.co/auth/v1';
  value.network.allowedTlsHosts=['otherproject.supabase.co','aws-fixture.pooler.supabase.com'];
  for(const slot of Object.values(value.database.slots)){
   slot.mode='session_pooler';slot.serverName='aws-fixture.pooler.supabase.com';
  }
 }});
 FakePool.instances=[];
 await assert.rejects(materializeOperationalM3Options({manifest,Pool:FakePool,
  resolveSecret:resolverFor(manifest)}),/operational_activation_manifest_invalid/);
 assert.equal(FakePool.instances.length,0);
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


test('S51 approved 8443 PWA origins are accepted without permitting other port or issuer drift',()=>{
 const origins={client:'https://sabora.allaiso.com:8443',management:'https://gestion-sabora.allaiso.com:8443'};
 const value=fixtureManifest({stage:'production',mutate:v=>{v.origins=origins;}});
 assert.deepEqual(validateOperationalActivationManifest(value).manifest.origins,origins);
 for(const mutate of [
  v=>{v.origins.client='https://sabora.allaiso.com:8444';},
  v=>{v.origins.client='https://unapproved.sabora.es:8443';},
  v=>{v.origins.management='https://gestion-sabora.allaiso.com';},
  v=>{v.origins={client:'https://sabora.allaiso.com',management:'https://gestion-sabora.allaiso.com'};},
  v=>{v.origins={client:origins.management,management:origins.client};},
  v=>{v.auth.issuer='https://project.supabase.co:8443/auth/v1';},
  v=>{v.origins.client+='/?x=1';}
 ]){
  const bad=structuredClone(value);mutate(bad);
  assert.throws(()=>validateOperationalActivationManifest(bad),/operational_activation_manifest_invalid/);
 }
});
