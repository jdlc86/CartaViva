import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {createGatewayJwksFetch,createGatewayPasskeyProvider,createGatewayRecoveryProvider} from '../apps/api/src/gateway-jwks-fetch.mjs';

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


test('candidate recovery transport binds existing subject, exact purpose and separate key scopes',async()=>{
 const subjectId='af496fc8-9d11-40a5-b2bc-010ed472863e',otherId='bf496fc8-9d11-40a5-b2bc-010ed472863e';
 const passkeyId='cf496fc8-9d11-40a5-b2bc-010ed472863e';
 const email='staff@example.invalid',managementOrigin='https://gestion.example.invalid:8443';
 const publishableKey='sb_publishable_abcdefghijklmnopqrstuvwxyz012345',secretKey='sb_secret_abcdefghijklmnopqrstuvwxyz012345';
 const token='aaa.bbb.ccc',authProof='b'.repeat(64);
 const user={id:subjectId,email,is_anonymous:false,email_confirmed_at:'2020-01-01T00:00:00Z'};
 const calls=[],responses=[];
 const requestImpl=(options,callback)=>{
  const request=new EventEmitter();request.destroy=()=>{};
  request.end=body=>{
   calls.push({options,body:body===undefined?null:JSON.parse(body)});
   const next=responses.shift();
   assert.ok(next,'unexpected provider call');
   const response=Readable.from(next.body===undefined?[]:[Buffer.from(JSON.stringify(next.body))]);
   response.statusCode=next.status??200;response.headers={};callback(response);
  };return request;
 };
 const provider=createGatewayRecoveryProvider({issuer:'https://project.supabase.co/auth/v1',
  connectHost:'sabora-egress',connectPort:15443,requestImpl,tlsConnect:()=>{},
  subjectId,email,managementOrigin,publishableKey,secretKey});
 const target='/auth/v1/admin/users/'+subjectId;
 await assert.rejects(provider.listPasskeys(otherId),/staff_recovery_auth_provider_unavailable/);
 await assert.rejects(provider.revokePasskey(subjectId,'../../users'),/staff_recovery_auth_provider_unavailable/);
 await assert.rejects(provider.revokePasskey(otherId,passkeyId),/staff_recovery_auth_provider_unavailable/);
 assert.equal(calls.length,0);
 responses.push({body:{...user,id:otherId}});
 await assert.rejects(provider.generateRecoveryProof(),/staff_recovery_auth_provider_unavailable/);
 assert.equal(calls.length,1);
 assert.equal(calls.at(-1).options.path,target);
 responses.push({body:user},{body:{...user,verification_type:'recovery',redirect_to:managementOrigin+'/',
  hashed_token:authProof,action_link:'not-returned',email_otp:'not-returned'}});
 assert.deepEqual(await provider.generateRecoveryProof(),{authProof});
 assert.deepEqual(calls.at(-1).body,{type:'recovery',email,redirect_to:managementOrigin});
 assert.equal(calls.at(-1).options.path,'/auth/v1/admin/generate_link');
 assert.equal(calls.at(-1).options.headers.apikey,secretKey);
 assert.equal(calls.at(-1).options.headers.Authorization,undefined);
 responses.push({body:{access_token:token,refresh_token:'not-returned'}},{body:user});
 assert.deepEqual(await provider.exchangeRecoveryProof(authProof),{accessToken:token});
 assert.equal(calls.at(-2).options.path,'/auth/v1/verify');
 assert.deepEqual(calls.at(-2).body,{type:'recovery',token_hash:authProof});
 assert.equal(calls.at(-2).options.headers.apikey,publishableKey);
 assert.equal(calls.at(-1).options.headers.Authorization,'Bearer '+token);
 responses.push({body:[{id:passkeyId,friendly_name:'not-returned'}]});
 assert.deepEqual(await provider.listPasskeys(subjectId),[passkeyId]);
 assert.equal(calls.at(-1).options.path,target+'/passkeys');
 responses.push({status:204});
 assert.equal(await provider.revokePasskey(subjectId,passkeyId),true);
 assert.equal(calls.at(-1).options.path,target+'/passkeys/'+passkeyId);
 assert.equal(calls.at(-1).options.method,'DELETE');
 assert.equal(calls.at(-1).options.headers.apikey,secretKey);
 responses.push({body:user},{status:204});
 assert.equal(await provider.logoutAll(token),true);
 assert.equal(calls.at(-1).options.path,'/auth/v1/logout?scope=global');
 assert.equal(calls.at(-1).options.headers.apikey,publishableKey);
 assert.equal(calls.at(-1).options.headers.Authorization,'Bearer '+token);
 responses.push({status:404});
 await assert.rejects(provider.revokePasskey(subjectId,passkeyId),/staff_recovery_auth_provider_unavailable/);
 assert.equal(responses.length,0);
 assert.ok(calls.every(c=>c.options.hostname==='project.supabase.co'&&c.options.headers.host==='project.supabase.co'));
 assert.ok(calls.every(c=>c.options.path.startsWith('/auth/v1/admin/')?c.options.headers.apikey===secretKey:c.options.headers.apikey===publishableKey));
 assert.equal(Object.hasOwn(provider,'createUser'),false);
});
