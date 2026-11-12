import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createSaboraEgressGateway} from '../../apps/api/src/sabora-egress-gateway.mjs';
import {createGatewayJwksFetch} from '../../apps/api/src/gateway-jwks-fetch.mjs';
import {createSupabaseJwksProvider} from '../../apps/api/src/jwks.mjs';
import {startOperationalServerFromFiles} from '../../apps/api/src/operational-server.mjs';
import {startOperationalM3Runtime} from '../../apps/api/src/operational-runtime.mjs';
import {createM3RestaurantCandidate} from '../../apps/api/src/m3-restaurant-candidate.mjs';
import {describeOperationalSqlContract} from '../../apps/api/src/operational-activation-manifest.mjs';
import {PILOT_ACTIVATION_REQUIREMENTS} from '../../apps/api/src/pilot-activation-gate.mjs';

// Every upstream socket below is redirected to the runner's loopback by an
// explicit injected test connector. Fake public DNS is NEVER used for network
// access, and the production gateway default code is unchanged.
const source=process.env.SABORA_CI_PG_URL,pgPath=process.env.SABORA_CI_PG_MODULE;
let pgUrl;
try{pgUrl=new URL(source);}catch{throw Error('operational_tls_disposable_pg17_only');}
if(process.env.GITHUB_ACTIONS!=='true'||!process.env.GITHUB_RUN_ID||
 !process.env.RUNNER_TEMP||!isDisposablePgModulePath(pgPath)||
 pgUrl.protocol!=='postgresql:'||pgUrl.hostname!=='127.0.0.1'||
 pgUrl.username!=='postgres'||pgUrl.password!=='sabora_ci_ephemeral_only'||
 pgUrl.pathname!=='/postgres'||!/^\d+$/.test(pgUrl.port)||
 pgUrl.search||pgUrl.hash||
 !process.env.SABORA_CI_TLS_CERT?.startsWith(process.env.RUNNER_TEMP+'/')||
 !process.env.SABORA_CI_TLS_KEY?.startsWith(process.env.RUNNER_TEMP+'/')||
 process.env.NODE_EXTRA_CA_CERTS!==process.env.SABORA_CI_TLS_CERT)
 throw Error('operational_tls_disposable_pg17_only');

const {Pool}=createRequire(import.meta.url)(pgPath);
const pgPort=Number(pgUrl.port);
const stop=server=>new Promise(resolve=>server.close(()=>resolve()));
async function reservePort(){
 const server=net.createServer();
 await new Promise((resolve,reject)=>server.once('error',reject)
  .listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 await stop(server);
 return port;
}
const pgLogin='sabora_ci_tls_runtime_'+process.pid;
const pass='ci_'+randomBytes(27).toString('base64url');
const actorCertificate='db.project.supabase.co';
const issuer='https://project.supabase.co/auth/v1';

test('disposable PG17 real restricted LOGIN + strict TLS/SNI tunnel + verified JWKS and denials',
 {timeout:75_000},async()=>{
 const [certificate,key]=await Promise.all([
  readFile(process.env.SABORA_CI_TLS_CERT,'utf8'),
  readFile(process.env.SABORA_CI_TLS_KEY,'utf8')]);
 const admin=new Pool({connectionString:source,max:2,connectionTimeoutMillis:3000});
 let pgPool,gw,authServer,createdRole=false,sqlGatewayPort,authGatewayPort;
 try{
  // This server has a disposable certificate with exact DNS SANs; its
  // RSA signing key is generated only in memory for this test.
  const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk=Object.freeze({...publicKey.export({format:'jwk'}),
   alg:'RS256',use:'sig',kid:'sabora-ci-local-trusted-key'});
  authServer=https.createServer({cert:certificate,key},(req,res)=>{
   if(req.method!=='GET'||req.url!=='/auth/v1/.well-known/jwks.json'){
    res.writeHead(404);res.end();return;
   }
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
   res.end(JSON.stringify({keys:[jwk]}));
  });
  await new Promise((resolve,reject)=>authServer.once('error',reject)
   .listen(0,'127.0.0.1',resolve));
  const authPort=authServer.address().port;
  sqlGatewayPort=await reservePort();
  authGatewayPort=await reservePort();
  assert.notEqual(sqlGatewayPort,authGatewayPort);
  gw=await createSaboraEgressGateway({
   policy:{schemaVersion:1,bindHost:'0.0.0.0',targets:[
    {id:'database_restricted',listenPort:sqlGatewayPort,host:actorCertificate,
     port:5432,protocol:'postgres_tls'},
    {id:'jwks_https',listenPort:authGatewayPort,host:'project.supabase.co',
     port:443,protocol:'tls'}]},
   lookup:async()=>[{address:'8.8.8.8',family:4}],
   connectImpl:options=>{
    if(options.port===5432)return net.createConnection({host:'127.0.0.1',port:pgPort});
    if(options.port===443)return net.createConnection({host:'127.0.0.1',port:authPort});
    throw Error('operational_ci_unexpected_outbound_port');
   }
  });
  // The fixture's admin is superuser ONLY to create a temporary LOGIN with
  // one exact SET ROLE capability. Runtime never receives its credentials.
  await admin.query(`CREATE ROLE ${pgLogin} LOGIN NOINHERIT NOSUPERUSER
   NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD '${pass}'`);
  createdRole=true;
  await admin.query(`GRANT sabora_catalog_reader TO ${pgLogin}
   WITH SET TRUE, INHERIT FALSE`);
  pgPool=new Pool({host:'127.0.0.1',port:sqlGatewayPort,database:'postgres',
   user:pgLogin,password:pass,ssl:{ca:certificate,servername:actorCertificate,
    rejectUnauthorized:true},max:2,connectionTimeoutMillis:5000});
  const client=await pgPool.connect();
  try{
   assert.equal(client.connection.stream.authorized,true,
    'PostgreSQL must be authenticated over verified TLS, not merely encrypted');
   const roles=await client.query(`SELECT current_user::text AS login,
    rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit
    FROM pg_roles WHERE rolname=current_user`);
   assert.deepEqual(roles.rows,[{login:pgLogin,rolsuper:false,
    rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolinherit:false}]);
   await assert.rejects(client.query('SELECT * FROM sabora.orders LIMIT 1'),
    error=>error?.code==='42501');
   await client.query('SET ROLE sabora_catalog_reader');
   assert.equal((await client.query('SELECT current_user')).rows[0].current_user,
    'sabora_catalog_reader');
   await client.query('RESET ROLE');
   assert.equal((await client.query('SELECT current_user')).rows[0].current_user,
    pgLogin);
  }finally{client.release();}
  // The HTTPS client verifies hostname, CA and the actual JWKS body; gateway
  // validates the SNI byte sequence before it contacts the local TLS server.
  const trustedFetch=createGatewayJwksFetch({
   issuer,connectHost:'sabora-egress',connectPort:authGatewayPort,
   tlsConnect:(opts,callback)=>tls.connect({...opts,host:'127.0.0.1'},callback)
  });
  const getKeys=createSupabaseJwksProvider({issuer,fetchImpl:trustedFetch});
  const keys=await getKeys();
  assert.equal(keys.length,1);
  assert.equal(keys[0].kid,'sabora-ci-local-trusted-key');
  // Full file-based operational bootstrap, this time backed by 17 DISTINCT
  // real restricted PostgreSQL LOGINs, encrypted PgWire through this gateway
  // and an actual trusted JWKS HTTPS response. PWA browser journeys remain
  // separately covered by the existing H6 PG17/Chromium acceptance.
  const fixtureDir=await mkdtemp(join(process.env.RUNNER_TEMP,'sabora-operational-api-'));
  const createdLogins=[];
  let apiRuntime=null,keyInserted=false;
  const capabilityKey=randomBytes(24).toString('base64url'); // exact 32 byte HMAC
  const customerKey=randomBytes(32).toString('base64url');
  const qrKey=randomBytes(32).toString('base64url');
  const keyId='sabora_ci_tls_2026';
  try{
   const secretsDir=join(fixtureDir,'secrets');
   await mkdir(secretsDir);
   await writeFile(join(secretsDir,'trusted_ca'),certificate,{mode:0o600});
   for(const [ref,value] of [
    ['capability_hmac',capabilityKey],
    ['customer_hmac',customerKey],['qr_hmac',qrKey]
   ])await writeFile(join(secretsDir,ref),value,{mode:0o600});
   const slots={};
   const contract=describeOperationalSqlContract();
   assert.equal(contract.capabilityCount,17);
   for(const [index,item] of contract.slots.entries()){
    const login='sabora_ci_operational_'+process.pid+'_'+String(index).padStart(2,'0');
    const password=randomBytes(27).toString('base64url');
    await admin.query('CREATE ROLE '+login+
     " LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB"+
     " NOREPLICATION PASSWORD '"+password+"'");
    createdLogins.push(login);
    await admin.query('GRANT '+item.capabilityRole+' TO '+login+
     ' WITH SET TRUE, INHERIT FALSE');
    const passwordRef='sql_password_'+String(index).padStart(2,'0');
    await writeFile(join(secretsDir,passwordRef),password,{mode:0o600});
    slots[item.poolPath]={login,serverName:actorCertificate,port:5432,
     database:'postgres',mode:'direct',passwordRef,caRef:'trusted_ca',
     connectHost:'sabora-egress',connectPort:sqlGatewayPort};
   }
   await admin.query(`INSERT INTO sabora.order_operation_signing_keys(
    key_id,hmac_key,not_before,expires_at) VALUES(
    $1,$2,clock_timestamp()-interval '1 minute',
    clock_timestamp()+interval '1 hour')`,
    [keyId,Buffer.from(capabilityKey,'utf8')]);
   keyInserted=true;
   const manifest={
    schemaVersion:1,stage:'production',restaurantCode:'SABORA_CI',
    listener:{host:'0.0.0.0',port:4100,exposure:'container_private'},
    origins:{client:'https://menu.sabora.es',management:'https://gestion.sabora.es'},
    auth:{issuer,connectHost:'sabora-egress',connectPort:authGatewayPort},
    features:{ownership:false,communications:false,waiterCalls:false},
    network:{allowedTlsHosts:[actorCertificate,'project.supabase.co'],
     egressGatewayHost:'sabora-egress'},
    database:{slots,notifiers:{
     'tableChange.notificationPool':{credentialSlot:'tableChange.operationsPool',
      dedicatedPool:true},
     'h6.notifierPool':{credentialSlot:'h6.operationsPool',
      dedicatedPool:true},
    }},
    signing:{keyId,capabilitySecretRef:'capability_hmac',
     customerSecretRef:'customer_hmac',qrSecretRef:'qr_hmac'},
    // The following are ONLY fixture self-reports in an isolated runner.
    // They do not provide operational authorization or external validation.
    activationEvidence:Object.fromEntries(PILOT_ACTIVATION_REQUIREMENTS.map(k=>[k,true])),
   };
   const manifestFile=join(fixtureDir,'activation.json');
   const policyFile=join(fixtureDir,'egress-policy.json');
   await writeFile(manifestFile,JSON.stringify(manifest),{mode:0o600});
   await writeFile(policyFile,JSON.stringify(gw.policy),{mode:0o600});
   class OnlyCiLoopbackPool extends Pool{
    constructor(options){
     assert.equal(options.host,'sabora-egress');
     assert.equal(options.ssl?.rejectUnauthorized,true);
     assert.equal(options.ssl?.servername,actorCertificate);
     // This substitution simulates Docker DNS only on an ephemeral runner;
     // actual TLS, gateway, PostgreSQL role and SQL remain real.
     super({...options,host:'127.0.0.1'});
    }
   }
   let labDiagnostic='before_real_sql_start';
   const category=error=>{
    const message=String(error?.message??'');
    if(/^[a-z][a-z0-9_]{4,90}$/.test(message))return message;
    if(error?.code==='42501')return 'restricted_sql_permission_denied';
    if(error?.code==='28P01')return 'restricted_sql_password_mismatch';
    if(error?.code==='28000')return 'restricted_sql_role_invalid';
    return 'non_categorized_dependency_failure';
   };
   try{
    apiRuntime=await startOperationalServerFromFiles({
     env:{NODE_ENV:'production',SABORA_OPERATIONAL_MANIFEST_FILE:manifestFile,
      SABORA_OPERATIONAL_SECRETS_DIR:secretsDir,
      SABORA_OPERATIONAL_EGRESS_POLICY_FILE:policyFile},
     Pool:OnlyCiLoopbackPool,fetchImpl:trustedFetch,
     startRuntime:({options,resources,observability})=>
      startOperationalM3Runtime({options,resources,observability,
       listener:{host:'127.0.0.1',port:0},
       createCandidate:async candidateOptions=>{
        labDiagnostic='sql_candidate_preflight_started';
        try{
         const candidate=await createM3RestaurantCandidate(candidateOptions);
         labDiagnostic='sql_candidate_preflight_success';
         return candidate;
        }catch(error){labDiagnostic=category(error);throw error;}
       }})
    });
   }catch(error){
    // No raw driver errors, account identifiers, URLs or SQL may be logged.
    assert.fail('ci_operational_bootstrap_stage:'+labDiagnostic);
   }
   assert.equal(apiRuntime.summary.capabilityCount,17);
   assert.equal(apiRuntime.mode,'operational-h3-h6-m3-candidate');
   const request=path=>fetch(apiRuntime.origin+path,{signal:AbortSignal.timeout(10_000)});
   const [health,ready,catalog,unauthorized]=await Promise.all([
    request('/health'),request('/ready'),request('/api/v1/catalog'),
    request('/api/v1/operations/table-change/pending'),
   ]);
   assert.equal(health.status,200);assert.equal(ready.status,200);
   assert.equal(catalog.status,200);
   assert.ok([401,403].includes(unauthorized.status));
   // Removing a critical role while the API is listening must make the
   // real PostgreSQL preflight return 503, not fabricate readiness.
   const catalogLogin=slots['customer.catalogReaderPool'].login;
   await admin.query('REVOKE sabora_catalog_reader FROM '+catalogLogin);
   const unready=await request('/ready');
   assert.equal(unready.status,503);
   await admin.query('GRANT sabora_catalog_reader TO '+catalogLogin+
    ' WITH SET TRUE, INHERIT FALSE');
   const recovered=await request('/ready');
   assert.equal(recovered.status,200);
  }finally{
   await apiRuntime?.close().catch(()=>{});
   if(keyInserted)
    await admin.query('DELETE FROM sabora.order_operation_signing_keys WHERE key_id=$1',
     [keyId]).catch(()=>{});
   for(const login of createdLogins.reverse()){
    await admin.query('DROP OWNED BY '+login).catch(()=>{});
    await admin.query('DROP ROLE IF EXISTS '+login).catch(()=>{});
   }
   await rm(fixtureDir,{recursive:true,force:true});
  }
  // A wrong server hostname is rejected by the gateway or certificate.
  const bad=new Pool({host:'127.0.0.1',port:sqlGatewayPort,database:'postgres',
   user:pgLogin,password:pass,
   ssl:{ca:certificate,servername:'wrong.supabase.co',rejectUnauthorized:true},
   max:1,connectionTimeoutMillis:3000});
  try{await assert.rejects(bad.query('SELECT 1'));}finally{await bad.end();}
  // The accepted PostgreSQL connection remains healthy after a denied SNI.
  assert.equal((await pgPool.query('SELECT 1 AS ok')).rows[0].ok,1);
 }finally{
  await pgPool?.end().catch(()=>{});
  if(createdRole){
   await admin.query('REVOKE sabora_catalog_reader FROM '+pgLogin).catch(()=>{});
   await admin.query('DROP OWNED BY '+pgLogin).catch(()=>{});
   await admin.query('DROP ROLE IF EXISTS '+pgLogin).catch(()=>{});
  }
  await admin.end().catch(()=>{});
  await gw?.close().catch(()=>{});
  if(authServer){authServer.closeAllConnections();await stop(authServer).catch(()=>{});}
 }
});
