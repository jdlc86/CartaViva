import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readApiRuntimeConfig,API_SECRET_ENV_NAMES} from '../apps/api/src/api-runtime-config.mjs';
import {readStaffPoolConfig} from '../apps/api/src/staff-pool-config.mjs';
import {readCatalogPoolConfig} from '../apps/api/src/catalog-pool-config.mjs';
import {readCustomerSessionPoolConfig} from '../apps/api/src/customer-session-pool-config.mjs';
import {createApiApp} from '../apps/api/src/server.mjs';
import {inspectProductionConfig} from '../scripts/ci/production-config-secrets-gate.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const runtime=Object.freeze({NODE_ENV:'production',SABORA_API_HOST:'0.0.0.0',
 SABORA_API_PORT:'4100',SABORA_API_MODE:'health-only'});
const ca='-----BEGIN CERTIFICATE-----\nMIIBQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=\n-----END CERTIFICATE-----';
const strongPassword='N7vQ4xZ2mK8pR5tW3yB6cD9fG1hJ0sL';

test('production API accepts only explicit health-only configuration',()=>{
 const config=readApiRuntimeConfig(runtime);
 assert.deepEqual(config,{environment:'production',host:'0.0.0.0',port:4100,mode:'health-only'});
 assert.ok(Object.isFrozen(config));
 for(const change of [
  {SABORA_API_HOST:undefined},{SABORA_API_PORT:undefined},{SABORA_API_MODE:undefined},
  {SABORA_API_HOST:'db.internal'},{SABORA_API_PORT:'0'},{SABORA_API_PORT:'not-a-port'},
  {SABORA_API_MODE:'candidate'},{NODE_ENV:'staging'},{HOST:'0.0.0.0'},
  {SABORA_STAFF_DB_PASSWORD:strongPassword},{VITE_PRIVATE_KEY:'should-never-enter-a-browser'},
  {SABORA_HMAC_KEY:strongPassword},{SUPABASE_SERVICE_ROLE_KEY:strongPassword},
  {STRIPE_SECRET_KEY:strongPassword},{DATABASE_URL:'postgresql://not-used'}
 ])assert.throws(()=>readApiRuntimeConfig({...runtime,...change}),/^Error: invalid_api_runtime_config$/);
});

test('development defaults are loopback-only and never unlock a candidate mode',()=>{
 assert.deepEqual(readApiRuntimeConfig({}),{environment:'development',host:'127.0.0.1',port:4100,mode:'health-only'});
 assert.throws(()=>readApiRuntimeConfig({SABORA_API_MODE:'h6'}),/invalid_api_runtime_config/);
});

test('health-only process rejects every known dormant database secret',()=>{
 assert.deepEqual([...API_SECRET_ENV_NAMES].sort(),[
  'SABORA_CATALOG_DB_CA_PEM','SABORA_CATALOG_DB_PASSWORD',
  'SABORA_CUSTOMER_SESSION_DB_CA_PEM','SABORA_CUSTOMER_SESSION_DB_PASSWORD',
  'SABORA_STAFF_DB_CA_PEM','SABORA_STAFF_DB_PASSWORD'
 ]);
 for(const name of API_SECRET_ENV_NAMES)
  assert.throws(()=>readApiRuntimeConfig({...runtime,[name]:strongPassword}),/invalid_api_runtime_config/);
});

const poolEnv=(prefix,user)=>({NODE_ENV:'production',[`${prefix}_HOST`]:'db.sabora.internal',
 [`${prefix}_PORT`]:'5432',[`${prefix}_NAME`]:'postgres',[`${prefix}_USER`]:user,
 [`${prefix}_PASSWORD`]:strongPassword,[`${prefix}_CA_PEM`]:ca});

test('production PostgreSQL readers require distinct exact logins, verified TLS and non-example secrets',()=>{
 const cases=[
  [readStaffPoolConfig,'SABORA_STAFF_DB','sabora_staff_reader_login'],
  [readCatalogPoolConfig,'SABORA_CATALOG_DB','sabora_catalog_login'],
  [readCustomerSessionPoolConfig,'SABORA_CUSTOMER_SESSION_DB','sabora_customer_session_login']
 ];
 for(const [read,prefix,user] of cases){
  const env=poolEnv(prefix,user);const config=read(env);
  assert.equal(config.user,user);assert.equal(config.ssl.rejectUnauthorized,true);
  assert.ok(Object.isFrozen(config));assert.ok(Object.isFrozen(config.ssl));
  for(const unsafe of ['local-test','change-me-now','__INJECT_AT_RUNTIME__','__INJECT_SECRET_AT_RUNTIME__'])
   assert.throws(()=>read({...env,[`${prefix}_PASSWORD`]:unsafe}),/invalid_.*_pool_config/);
  assert.throws(()=>read({...env,[`${prefix}_HOST`]:'db.example.test'}),/invalid_.*_pool_config/);
  assert.throws(()=>read({...env,[`${prefix}_HOST`]:'__INJECT_HOST_AT_RUNTIME__'}),/invalid_.*_pool_config/);
  assert.throws(()=>read({...env,[`${prefix}_NAME`]:'__INJECT_DATABASE_AT_RUNTIME__'}),/invalid_.*_pool_config/);
  assert.throws(()=>read({...env,[`${prefix}_CA_PEM`]:'-----BEGIN CERTIFICATE-----\nPLACEHOLDER\n-----END CERTIFICATE-----'}),/invalid_.*_pool_config/);
  assert.throws(()=>read({...env,[`${prefix}_CA_PEM`]:'-----BEGIN CERTIFICATE-----\n__INJECT_PEM_AT_RUNTIME__\n-----END CERTIFICATE-----'}),/invalid_.*_pool_config/);
 }
});

test('API app remains health-only and readiness identifies the locked mode',async t=>{
 const app=createApiApp();t.after(()=>app.close());
 assert.deepEqual((await app.inject({method:'GET',url:'/health'})).json(),{status:'ok',service:'sabora-api'});
 assert.deepEqual((await app.inject({method:'GET',url:'/ready'})).json(),{status:'ready',service:'sabora-api',mode:'health-only'});
 assert.equal((await app.inject({method:'GET',url:'/api/v1/operations/orders'})).statusCode,404);
});

test('startup fails before listening and never echoes an injected secret',()=>{
 const secret='DO_NOT_ECHO_5f91f6a1d40e4cc2';
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../apps/api/src/server.mjs',import.meta.url))],{
  env:{NODE_ENV:'production',SABORA_STAFF_DB_PASSWORD:secret},encoding:'utf8',timeout:5000
 });
 assert.equal(result.status,1);
 assert.equal(result.stdout,'');
 assert.equal(result.stderr,'sabora_api_startup_failed\n');
 assert.doesNotMatch(result.stderr,new RegExp(secret));
});

test('repository production gate proves isolation and frontend secret absence',()=>{
 assert.deepEqual(inspectProductionConfig(root),[]);
 const client=readFileSync(new URL('../apps/client/src/table-qr.ts',import.meta.url),'utf8');
 assert.match(client,/invalid_client_public_config/);
 assert.doesNotMatch(client,/VITE_SABORA_RESTAURANT_CODE\?\?'\'/);
 const example=readFileSync(new URL('../.env.example',import.meta.url),'utf8');
 assert.match(example,/__INJECT_SECRET_AT_RUNTIME__/);
 assert.doesNotMatch(example,/(?:sk|rk)_live_|whsec_[A-Za-z0-9_]{16,}|postgres(?:ql)?:\/\/[^\s]+@/i);
});

test('production gate detects global cleanup and frontend secret regressions',t=>{
 const fixture=mkdtempSync(join(tmpdir(),'sabora-p1-gate-'));t.after(()=>rmSync(fixture,{recursive:true,force:true}));
 for(const directory of ['deploy','.github/workflows','scripts','apps/api/src','apps/client/src','apps/management/src'])
  mkdirSync(join(fixture,directory),{recursive:true});
 writeFileSync(join(fixture,'deploy/compose.sabora.yml'),readFileSync(join(root,'deploy/compose.sabora.yml')));
 writeFileSync(join(fixture,'deploy/Dockerfile.api'),readFileSync(join(root,'deploy/Dockerfile.api')));
 writeFileSync(join(fixture,'.github/workflows/ci.yml'),'permissions:\n  contents: read\n');
 writeFileSync(join(fixture,'.env.example'),'SABORA_API_MODE=health-only\nSABORA_DB_PASSWORD=__INJECT_SECRET_AT_RUNTIME__\n');
 writeFileSync(join(fixture,'apps/api/src/server.mjs'),'export const mode="health-only";\n');
 writeFileSync(join(fixture,'scripts/cleanup.sh'),'echo safe\n');
 writeFileSync(join(fixture,'apps/client/src/config.js'),'export const publicCode="SABORA";\n');
 assert.deepEqual(inspectProductionConfig(fixture),[]);

 writeFileSync(join(fixture,'scripts/cleanup.sh'),'docker system prune -af\n');
 assert.ok(inspectProductionConfig(fixture).some(code=>code.startsWith('global_control:')));
 writeFileSync(join(fixture,'scripts/cleanup.sh'),'echo safe\n');
 writeFileSync(join(fixture,'apps/client/src/config.js'),'const SABORA_DB_PASSWORD="leak";\n');
 assert.ok(inspectProductionConfig(fixture).some(code=>code.startsWith('frontend_secret:')));
});
