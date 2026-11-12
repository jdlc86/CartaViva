import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {createGatewayJwksFetch} from '../apps/api/src/gateway-jwks-fetch.mjs';

function requestFixture(body,statusCode=200){
 let captured;
 const requestImpl=(options,callback)=>{
  captured=options;
  const request=new EventEmitter();request.end=()=>{
   const response=Readable.from([Buffer.from(body)]);response.statusCode=statusCode;
   response.headers={'content-length':String(Buffer.byteLength(body))};callback(response);
  };request.destroy=()=>{};return request;
 };
 return {requestImpl,get captured(){return captured;}};
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
