import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createSaboraEgressGateway} from '../../apps/api/src/sabora-egress-gateway.mjs';
import {createGatewayJwksFetch} from '../../apps/api/src/gateway-jwks-fetch.mjs';
import {createSupabaseJwksProvider} from '../../apps/api/src/jwks.mjs';

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
