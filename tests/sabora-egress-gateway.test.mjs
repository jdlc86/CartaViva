import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import {createSaboraEgressGateway,extractTlsServerName,validateSaboraEgressPolicy}
 from '../apps/api/src/sabora-egress-gateway.mjs';

const policy=()=>({schemaVersion:1,bindHost:'0.0.0.0',targets:[
 {id:'database_main',listenPort:15432,host:'db.project.supabase.co',port:5432,protocol:'postgres_tls'},
 {id:'auth_jwks',listenPort:15443,host:'project.supabase.co',port:443,protocol:'tls'},
]});

test('egress policy is an exact allowlist without literal/private/shared destinations',()=>{
 assert.equal(validateSaboraEgressPolicy(policy()).targets.length,2);
 const mutations=[
  value=>{value.targets[1].listenPort=15432;},
  value=>{value.targets[0].host='127.0.0.1';},
  value=>{value.targets[0].host='db.example';},
  value=>{value.targets[0].extra=true;},
  value=>{value.bindHost='127.0.0.1';},
 ];
 for(const mutate of mutations){const value=policy();mutate(value);
  assert.throws(()=>validateSaboraEgressPolicy(value),/sabora_egress_policy_invalid/);}
});

async function freePort(){
 const server=net.createServer();
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',error=>error?reject(error):resolve()));
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}

test('gateway forwards only a ClientHello whose SNI matches the allowlisted TLS destination',async t=>{
 const listenPort=await freePort();
 let resolveUpstream,rejectUpstream;
 const upstreamHello=new Promise((resolve,reject)=>{resolveUpstream=resolve;rejectUpstream=reject;});
 const upstream=net.createServer(socket=>{
  let buffered=Buffer.alloc(0);socket.on('data',chunk=>{
   buffered=Buffer.concat([buffered,chunk]);const name=extractTlsServerName(buffered);
   if(name!==undefined){resolveUpstream(name);socket.destroy();}
  });
 });
 await new Promise((resolve,reject)=>upstream.listen(0,'127.0.0.1',error=>error?reject(error):resolve()));
 t.after(()=>upstream.close());
 const upstreamPort=upstream.address().port;
 const gateway=await createSaboraEgressGateway({policy:{schemaVersion:1,bindHost:'0.0.0.0',targets:[
  {id:'auth_jwks',listenPort,host:'project.supabase.co',port:443,protocol:'tls'},
 ]},lookup:async()=>[{address:'8.8.8.8',family:4}],
 connectImpl:()=>net.createConnection({host:'127.0.0.1',port:upstreamPort})});
 t.after(()=>gateway.close());
 const client=tls.connect({host:'127.0.0.1',port:listenPort,
  servername:'project.supabase.co',rejectUnauthorized:false});
 client.on('error',()=>{});t.after(()=>client.destroy());
 const timeout=setTimeout(()=>rejectUpstream(Error('gateway_forward_timeout')),2000);
 assert.equal(await upstreamHello,'project.supabase.co');clearTimeout(timeout);client.destroy();
});

test('gateway drops a different SNI before DNS resolution or outbound connection',async t=>{
 const listenPort=await freePort();let lookups=0,connections=0;
 const gateway=await createSaboraEgressGateway({policy:{schemaVersion:1,bindHost:'0.0.0.0',targets:[
  {id:'auth_jwks',listenPort,host:'project.supabase.co',port:443,protocol:'tls'},
 ]},lookup:async()=>{lookups++;return [{address:'8.8.8.8',family:4}];},
 connectImpl:()=>{connections++;throw Error('must_not_connect');}});
 t.after(()=>gateway.close());
 const client=tls.connect({host:'127.0.0.1',port:listenPort,
  servername:'attacker.invalid',rejectUnauthorized:false});
 await new Promise(resolve=>{client.once('error',resolve);client.once('close',resolve);});
 assert.equal(lookups,0);assert.equal(connections,0);
});

test('PostgreSQL gateway preserves SSLRequest then verifies the tunneled ClientHello SNI',async t=>{
 const listenPort=await freePort();
 let resolveUpstream,rejectUpstream;
 const upstreamHello=new Promise((resolve,reject)=>{resolveUpstream=resolve;rejectUpstream=reject;});
 const upstream=net.createServer(socket=>{
  let stage='ssl',buffered=Buffer.alloc(0);
  socket.on('data',chunk=>{
   buffered=Buffer.concat([buffered,chunk]);
   if(stage==='ssl'&&buffered.length>=8){
    assert.deepEqual(buffered.subarray(0,8),Buffer.from([0,0,0,8,4,210,22,47]));
    buffered=buffered.subarray(8);stage='hello';socket.write(Buffer.from('S'));
   }
   if(stage==='hello'&&buffered.length){
    const name=extractTlsServerName(buffered);
    if(name!==undefined){resolveUpstream(name);socket.destroy();}
   }
  });
 });
 await new Promise((resolve,reject)=>upstream.listen(0,'127.0.0.1',error=>error?reject(error):resolve()));
 t.after(()=>upstream.close());const upstreamPort=upstream.address().port;
 const gateway=await createSaboraEgressGateway({policy:{schemaVersion:1,bindHost:'0.0.0.0',targets:[
  {id:'database_main',listenPort,host:'db.project.supabase.co',port:5432,protocol:'postgres_tls'},
 ]},lookup:async()=>[{address:'8.8.8.8',family:4}],
 connectImpl:()=>net.createConnection({host:'127.0.0.1',port:upstreamPort})});
 t.after(()=>gateway.close());
 const raw=net.createConnection({host:'127.0.0.1',port:listenPort});t.after(()=>raw.destroy());
 await new Promise((resolve,reject)=>raw.once('connect',resolve).once('error',reject));
 raw.write(Buffer.from([0,0,0,8,4,210,22,47]));
 const response=await new Promise((resolve,reject)=>raw.once('data',resolve).once('error',reject));
 assert.equal(response[0],83);
 const client=tls.connect({socket:raw,servername:'db.project.supabase.co',rejectUnauthorized:false});
 client.on('error',()=>{});t.after(()=>client.destroy());
 const timeout=setTimeout(()=>rejectUpstream(Error('postgres_gateway_timeout')),2000);
 assert.equal(await upstreamHello,'db.project.supabase.co');clearTimeout(timeout);client.destroy();
});

test('TLS ClientHello parser extracts the exact SNI and rejects truncation or non-TLS',async t=>{
 let resolveHello,rejectHello;
 const hello=new Promise((resolve,reject)=>{resolveHello=resolve;rejectHello=reject;});
 const server=net.createServer(socket=>{
  let buffered=Buffer.alloc(0);
  socket.on('data',chunk=>{
   buffered=Buffer.concat([buffered,chunk]);
   const result=extractTlsServerName(buffered);
   if(result!==undefined){resolveHello({result,buffered});socket.destroy();}
  });
  socket.on('error',()=>{});
 });
 t.after(()=>server.close());
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',error=>error?reject(error):resolve()));
 const port=server.address().port;
 const client=tls.connect({host:'127.0.0.1',port,servername:'db.project.supabase.co',rejectUnauthorized:false});
 client.on('error',()=>{});t.after(()=>client.destroy());
 const timeout=setTimeout(()=>rejectHello(Error('client_hello_timeout')),2000);
 const captured=await hello;clearTimeout(timeout);
 assert.equal(captured.result,'db.project.supabase.co');
 assert.equal(extractTlsServerName(captured.buffered.subarray(0,4)),undefined);
 assert.equal(extractTlsServerName(Buffer.from('GET / HTTP/1.1\r\n')),null);
});
