import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import tls from 'node:tls';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFileSecretResolver,startOperationalServerFromFiles}
 from '../apps/api/src/operational-server.mjs';
import {describeOperationalSqlContract} from '../apps/api/src/operational-activation-manifest.mjs';
import {validateM2RuntimeSqlIdentities} from '../apps/api/src/m2-runtime-identity-inventory.mjs';
import {PILOT_ACTIVATION_REQUIREMENTS} from '../apps/api/src/pilot-activation-gate.mjs';

test('file secret resolver accepts only one bounded regular file below its absolute root',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sabora-secret-resolver-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'database_password'),'opaque-value-with-more-than-16-bytes\n');
 await mkdir(join(root,'nested'));await writeFile(join(root,'nested','hidden'),'denied');
 const resolveSecret=createFileSecretResolver(root);
 assert.equal(await resolveSecret('database_password'),'opaque-value-with-more-than-16-bytes');
 for(const ref of ['../database_password','nested/hidden','DATABASE_PASSWORD','x'])
  await assert.rejects(resolveSecret(ref),/sabora_operational_startup_failed/);
});

test('operational server refuses non-production and relative configuration before opening a pool',async()=>{
 let pools=0;
 class Pool{constructor(){pools++;}}
 await assert.rejects(startOperationalServerFromFiles({env:{NODE_ENV:'development'},Pool,
  observability:{}}),/sabora_operational_startup_failed/);
 await assert.rejects(startOperationalServerFromFiles({env:{NODE_ENV:'production',
  SABORA_OPERATIONAL_MANIFEST_FILE:'relative.json',SABORA_OPERATIONAL_SECRETS_DIR:'relative'},
  Pool,observability:{}}),/sabora_operational_startup_failed/);
 assert.equal(pools,0);
});

test('production files, exact egress policy, secrets and 17 SQL slots reach one closed-by-default runtime',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sabora-operational-files-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const secretsDir=join(root,'secrets');await mkdir(secretsDir);
 const manifestPath=join(root,'activation.json'),policyPath=join(root,'egress-policy.json');
 const contract=describeOperationalSqlContract();
 assert.equal(contract.capabilityCount,17);
 const slots={};
 for(const [index,item] of contract.slots.entries()){
  slots[item.poolPath]={login:'sabora_runtime_'+String(index).padStart(2,'0'),
   serverName:'db.project.supabase.co',port:5432,database:'postgres',mode:'direct',
   passwordRef:'sql_password_'+String(index).padStart(2,'0'),caRef:'trusted_ca',
   connectHost:'sabora-egress',connectPort:15432};
  await writeFile(join(secretsDir,slots[item.poolPath].passwordRef),
   'Db-'+String(index).padStart(2,'0')+'-uY7qL9vP2xN4rK8mT5cF1hJ6');
 }
 await writeFile(join(secretsDir,'trusted_ca'),tls.rootCertificates[0]);
 for(const [name,value] of [
  ['capability_hmac','Qx8wP2nR7vL4cM9zT6kY3jH5sF1bD0aU'],
  ['customer_hmac','Vn4pL8wR2mX7qC9sT5bH1jK6dF3zA0uY'],
  ['qr_hmac','Gc7mN2vQ9xL4pR8sK1bT5wH3yD6fJ0aZ'],
 ])await writeFile(join(secretsDir,name),value);
 const manifest={schemaVersion:1,stage:'production',restaurantCode:'SABORA_01',
  listener:{host:'0.0.0.0',port:4100,exposure:'container_private'},
  origins:{client:'https://menu.sabora.es',management:'https://gestion.sabora.es'},
  auth:{issuer:'https://project.supabase.co/auth/v1',
   connectHost:'sabora-egress',connectPort:15443},
  features:{ownership:false,communications:false,waiterCalls:false},
  network:{allowedTlsHosts:['db.project.supabase.co','project.supabase.co'],
   egressGatewayHost:'sabora-egress'},
  database:{slots,notifiers:{
   'tableChange.notificationPool':{credentialSlot:'tableChange.operationsPool',dedicatedPool:true},
   'h6.notifierPool':{credentialSlot:'h6.operationsPool',dedicatedPool:true},
  }},
  signing:{keyId:'sabora-key-2026',capabilitySecretRef:'capability_hmac',
   customerSecretRef:'customer_hmac',qrSecretRef:'qr_hmac'},
  activationEvidence:Object.fromEntries(PILOT_ACTIVATION_REQUIREMENTS.map(key=>[key,true]),
  )};
 const policy={schemaVersion:1,bindHost:'0.0.0.0',targets:[
  {id:'sql',listenPort:15432,host:'db.project.supabase.co',port:5432,protocol:'postgres_tls'},
  {id:'jwks',listenPort:15443,host:'project.supabase.co',port:443,protocol:'tls'},
 ]};
 await writeFile(manifestPath,JSON.stringify(manifest));
 await writeFile(policyPath,JSON.stringify(policy));
 const env={NODE_ENV:'production',SABORA_OPERATIONAL_MANIFEST_FILE:manifestPath,
  SABORA_OPERATIONAL_SECRETS_DIR:secretsDir,
  SABORA_OPERATIONAL_EGRESS_POLICY_FILE:policyPath};
 class SpyPool{
  static instances=[];
  constructor(options){this.options=options;this.closed=0;SpyPool.instances.push(this);}
  async connect(){return {release(){}};}
  async end(){this.closed++;}
 }
 let started=0;
 const runtime=await startOperationalServerFromFiles({env,Pool:SpyPool,
  startRuntime:async({options,listener,resources})=>{
   started++;
   const checked=validateM2RuntimeSqlIdentities(options);
   assert.equal(checked.capabilityCount,17);
   assert.equal(checked.notifierCount,2);
   assert.equal(listener.port,4100);
   return {mode:'lab-assembly',close:resources.close};
  }});
 assert.equal(started,1);
 assert.equal(runtime.summary.capabilityCount,17);
 assert.equal(SpyPool.instances.length,19);
 assert.ok(SpyPool.instances.every(pool=>pool.options.ssl.rejectUnauthorized===true));
 await runtime.close();
 assert.ok(SpyPool.instances.every(pool=>pool.closed===1));
 // A valid manifest with an altered sidecar destination must never load even
 // one of the SQL secrets or construct a pool, let alone register HTTP.
 policy.targets[0].host='other.supabase.co';
 await writeFile(policyPath,JSON.stringify(policy));
 SpyPool.instances.length=0;started=0;
 await assert.rejects(startOperationalServerFromFiles({env,Pool:SpyPool,
  startRuntime:async()=>{started++;}}),/sabora_operational_startup_failed/);
 assert.equal(SpyPool.instances.length,0);
 assert.equal(started,0);
});
