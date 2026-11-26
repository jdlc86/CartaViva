import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {createGatewayJwksFetch,createGatewayPasskeyProvider} from '../apps/api/src/gateway-jwks-fetch.mjs';

function requestFixture(body,statusCode=200){
 let captured,capturedBody;
 const requestImpl=(options,callback)=>{
  captured=options;
  const request=new EventEmitter();request.end=sent=>{
   capturedBody=sent;
   const response=Readable.from([Buffer.from(body)]);response.statusCode=statusCode;
   response.headers={'content-length':String(Buffer.byteLength(body))};callback(response);
  };request.destroy=()=>{};return request;
 };
 return {requestImpl,get captured(){return captured;},get capturedBody(){return capturedBody;}};
}

test('JWKS transport pins URL and Host while routing the TLS socket through the gateway',async()=>{
 const fixture=requestFixture('{"keys":[]}');
 let tlsOptions;
 const fetchImpl=createGatewayJwksFetch({issuer:'https://project.supabase.co/auth/v1',
  connectHost:'sabora-egress',connectPort:15443,requestImpl:fixture.requestImpl,
  tlsConnect:options=>{tlsOptions=options;return {};}});
 const response=await fetchImpl('https://project.supabase.co/auth/v1/.well-known/jwks.json',
  {method:'GET',redirect:'error'});
 assert.equal(response.ok,true);assert.equal(await response.text(),'{"keys":[]}');
 assert.equal(fixture.captured.hostname,'project.supabase.co');
 assert.equal(fixture.captured.headers.host,'project.supabase.co');
 assert.equal(fixture.captured.agent.options.maxSockets,2);
 fixture.captured.agent.createConnection({},()=>{});
 assert.deepEqual(tlsOptions,{host:'sabora-egress',port:15443,
  servername:'project.supabase.co',rejectUnauthorized:true,
  ALPNProtocols:['http/1.1'],minVersion:'TLSv1.2'});
 await assert.rejects(fetchImpl('https://attacker.invalid/jwks',{method:'GET',redirect:'error'}),
  /gateway_jwks_unavailable/);
});

test('JWKS transport rejects oversized responses and permissive endpoint shapes',async()=>{
 const fixture=requestFixture('x'.repeat(65537));
 const fetchImpl=createGatewayJwksFetch({issuer:'https://project.supabase.co/auth/v1',
  connectHost:'sabora-egress',connectPort:15443,requestImpl:fixture.requestImpl,
  tlsConnect:()=>{}});
 await assert.rejects(fetchImpl('https://project.supabase.co/auth/v1/.well-known/jwks.json',
  {method:'GET',redirect:'error'}),/gateway_jwks_unavailable/);
 assert.throws(()=>createGatewayJwksFetch({issuer:'http://project.supabase.co/auth/v1',
  connectHost:'sabora-egress',connectPort:15443}),/gateway_jwks_unavailable/);
});

test('Auth gateway exchanges email proof only for invitation/recovery, never returns refresh token or trusts metadata',async()=>{
 const fixture=requestFixture(JSON.stringify({access_token:'aaa.bbb.ccc',refresh_token:'private-refresh',user:{id:'untrusted'}}));
 const provider=createGatewayPasskeyProvider({issuer:'https://project.supabase.co/auth/v1',
  connectHost:'sabora-egress',connectPort:15443,requestImpl:fixture.requestImpl,
  tlsConnect:()=>{},publishableKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz012345'});
 const proof='a'.repeat(64);
 for(const purpose of ['invite','recovery']){
  assert.deepEqual(await provider.exchangeEmailProof({purpose,tokenHash:proof}),{accessToken:'aaa.bbb.ccc'});
  assert.equal(fixture.captured.hostname,'project.supabase.co');
  assert.equal(fixture.captured.path,'/auth/v1/verify');
  assert.equal(fixture.captured.method,'POST');
  assert.equal(fixture.captured.headers.Authorization,undefined);
  assert.deepEqual(JSON.parse(fixture.capturedBody),{type:purpose,token_hash:proof});
 }
 await assert.rejects(provider.exchangeEmailProof({purpose:'signup',tokenHash:proof}),/invalid_staff_auth_email_proof/);
 await assert.rejects(provider.exchangeEmailProof({purpose:'recovery',tokenHash:'https://example.invalid'}),/invalid_staff_auth_email_proof/);
 const denied=requestFixture('{"error_code":"otp_expired"}',403);
 const rejected=createGatewayPasskeyProvider({issuer:'https://project.supabase.co/auth/v1',
  connectHost:'sabora-egress',connectPort:15443,requestImpl:denied.requestImpl,tlsConnect:()=>{},
  publishableKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz012345'});
 assert.equal(await rejected.exchangeEmailProof({purpose:'recovery',tokenHash:proof}),null);
 const malformed=requestFixture('{"access_token":"not-a-jwt"}');
 const bad=createGatewayPasskeyProvider({issuer:'https://project.supabase.co/auth/v1',
  connectHost:'sabora-egress',connectPort:15443,requestImpl:malformed.requestImpl,tlsConnect:()=>{},
  publishableKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz012345'});
 await assert.rejects(bad.exchangeEmailProof({purpose:'recovery',tokenHash:proof}),/staff_auth_provider_unavailable/);
});
