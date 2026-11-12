import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import net from 'node:net';
import {lstat,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const HOST=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const invalid=()=>Error('sabora_egress_policy_invalid');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&
 keys.every(key=>Object.hasOwn(value,key));

function privateAddress(address){
 if(isIP(address)===4){
  const parts=address.split('.').map(Number);
  return parts[0]===0||parts[0]===10||parts[0]===127||parts[0]>=224||
   (parts[0]===169&&parts[1]===254)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||
   (parts[0]===192&&parts[1]===168)||(parts[0]===100&&parts[1]>=64&&parts[1]<=127)||
   (parts[0]===192&&parts[1]===0)||(parts[0]===192&&parts[1]===2)||
   (parts[0]===198&&[18,19,51].includes(parts[1]))||
   (parts[0]===203&&parts[1]===0&&parts[2]===113);
 }
 if(isIP(address)===6){
  const value=address.toLowerCase();
  if(value.startsWith('::ffff:'))return privateAddress(value.slice(7));
  return value==='::'||value==='::1'||value.startsWith('fc')||value.startsWith('fd')||
   /^fe[89ab]/.test(value)||value.startsWith('ff')||value.startsWith('2001:db8:');
 }
 return true;
}

export function validateSaboraEgressPolicy(policy){
 if(!exact(policy,['schemaVersion','bindHost','targets'])||policy.schemaVersion!==1||
    policy.bindHost!=='0.0.0.0'||!Array.isArray(policy.targets)||
    policy.targets.length<1||policy.targets.length>32)throw invalid();
 const ids=new Set(),ports=new Set(),destinations=new Set();
 const targets=policy.targets.map(target=>{
  if(!exact(target,['id','listenPort','host','port','protocol'])||
     typeof target.id!=='string'||!/^[a-z][a-z0-9_-]{2,31}$/.test(target.id)||
     !Number.isSafeInteger(target.listenPort)||target.listenPort<1024||target.listenPort>65535||
     !HOST.test(target.host)||isIP(target.host)||
     /(?:^|\.)(?:localhost|local|example|invalid)$/.test(target.host)||
     !Number.isSafeInteger(target.port)||target.port<1||target.port>65535||
     !['tls','postgres_tls'].includes(target.protocol)||
     ids.has(target.id)||ports.has(target.listenPort)||
     destinations.has(`${target.host}:${target.port}`))throw invalid();
  ids.add(target.id);ports.add(target.listenPort);destinations.add(`${target.host}:${target.port}`);
  return Object.freeze({...target});
 });
 return Object.freeze({schemaVersion:1,bindHost:policy.bindHost,targets:Object.freeze(targets)});
}

// Returns undefined while a complete ClientHello is not buffered, null for a
// malformed/non-TLS record, or the exact lower-case SNI hostname.
export function extractTlsServerName(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<5)return undefined;
 if(buffer[0]!==22||buffer[1]!==3)return null;
 const recordLength=buffer.readUInt16BE(3);
 if(recordLength<4||recordLength>65530)return null;
 if(buffer.length<5+recordLength)return undefined;
 let offset=5;
 if(buffer[offset++]!==1)return null;
 const handshakeLength=buffer.readUIntBE(offset,3);offset+=3;
 if(handshakeLength+4>recordLength||offset+34>buffer.length)return null;
 offset+=34;
 if(offset>=buffer.length)return null;
 const sessionLength=buffer[offset++];offset+=sessionLength;
 if(offset+2>buffer.length)return null;
 const cipherLength=buffer.readUInt16BE(offset);offset+=2+cipherLength;
 if(offset>=buffer.length)return null;
 const compressionLength=buffer[offset++];offset+=compressionLength;
 if(offset+2>buffer.length)return null;
 const extensionsLength=buffer.readUInt16BE(offset);offset+=2;
 const end=offset+extensionsLength;
 if(end>buffer.length)return null;
 while(offset+4<=end){
  const type=buffer.readUInt16BE(offset),length=buffer.readUInt16BE(offset+2);offset+=4;
  if(offset+length>end)return null;
  if(type===0){
   if(length<5)return null;
   const listLength=buffer.readUInt16BE(offset);let cursor=offset+2;
   if(listLength+2!==length)return null;
   while(cursor+3<=offset+length){
    const nameType=buffer[cursor++],nameLength=buffer.readUInt16BE(cursor);cursor+=2;
    if(cursor+nameLength>offset+length)return null;
    if(nameType===0){
     const host=buffer.subarray(cursor,cursor+nameLength).toString('ascii').toLowerCase();
     return HOST.test(host)?host:null;
    }
    cursor+=nameLength;
   }
   return null;
  }
  offset+=length;
 }
 return null;
}

async function resolvePublic(host,lookup=dnsLookup){
 const records=await lookup(host,{all:true,verbatim:true});
 if(!Array.isArray(records)||records.length===0||records.some(item=>privateAddress(item.address)))
  throw Error('sabora_egress_destination_denied');
 return records[0];
}

function firstPacket(socket,maxBytes=65536){
 return new Promise((resolve,reject)=>{
  let buffered=Buffer.alloc(0);
  const cleanup=()=>{socket.off('data',data);socket.off('error',error);socket.off('close',closed);};
  const error=()=>{cleanup();reject(Error('sabora_egress_handshake_denied'));};
  const closed=()=>error();
  const data=chunk=>{
   buffered=Buffer.concat([buffered,chunk]);
   if(buffered.length>maxBytes){error();return;}
   const serverName=extractTlsServerName(buffered);
   if(serverName!==undefined){cleanup();resolve({serverName,buffered});}
  };
  socket.on('data',data);socket.once('error',error);socket.once('close',closed);
 });
}

function exactBytes(socket,count){
 return new Promise((resolve,reject)=>{
  let value=Buffer.alloc(0);
  const cleanup=()=>{socket.off('data',data);socket.off('error',error);socket.off('close',closed);};
  const error=()=>{cleanup();reject(Error('sabora_egress_handshake_denied'));};
  const closed=()=>error();
  const data=chunk=>{
   value=Buffer.concat([value,chunk]);
   if(value.length>=count){cleanup();socket.pause();
    const extra=value.subarray(count);if(extra.length)socket.unshift(extra);
    resolve(value.subarray(0,count));}
  };
  socket.on('data',data);socket.once('error',error);socket.once('close',closed);
 });
}

async function connectTarget(target,lookup,connectImpl){
 const record=await resolvePublic(target.host,lookup);
 return new Promise((resolve,reject)=>{
  const socket=connectImpl({host:record.address,port:target.port,family:record.family});
  socket.setTimeout(10_000,()=>socket.destroy(Error('sabora_egress_timeout')));
  socket.once('connect',()=>{socket.setTimeout(0);resolve(socket);});
  socket.once('error',reject);
 });
}

async function proxyConnection(client,target,lookup,connectImpl){
 client.setTimeout(10_000,()=>client.destroy());
 let hello;
 if(target.protocol==='postgres_tls'){
  const request=await exactBytes(client,8);
  if(!request.equals(Buffer.from([0,0,0,8,4,210,22,47])))throw Error('sabora_egress_handshake_denied');
  client.write(Buffer.from('S'));client.resume();
  hello=await firstPacket(client);
  if(hello.serverName!==target.host)throw Error('sabora_egress_destination_denied');
  const upstream=await connectTarget(target,lookup,connectImpl);
  upstream.write(request);
  const answer=await exactBytes(upstream,1);
  if(answer[0]!==83){upstream.destroy();throw Error('sabora_egress_tls_required');}
  upstream.write(hello.buffered);upstream.resume();client.setTimeout(0);client.pipe(upstream).pipe(client);
  return;
 }
 hello=await firstPacket(client);
 if(hello.serverName!==target.host)throw Error('sabora_egress_destination_denied');
 const upstream=await connectTarget(target,lookup,connectImpl);
 upstream.write(hello.buffered);client.setTimeout(0);client.pipe(upstream).pipe(client);
}

export async function createSaboraEgressGateway({policy,lookup=dnsLookup,
 connectImpl=options=>net.createConnection(options)}={}){
 const accepted=validateSaboraEgressPolicy(policy);
 if(typeof lookup!=='function'||typeof connectImpl!=='function')throw invalid();
 const servers=[];let closePromise=null;
 try{
  for(const target of accepted.targets){
   const server=net.createServer(socket=>{
    proxyConnection(socket,target,lookup,connectImpl).catch(()=>socket.destroy());
   });
   server.maxConnections=64;
   await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(target.listenPort,accepted.bindHost,resolve);
   });
   servers.push(server);
  }
  return Object.freeze({policy:accepted,close(){
   if(!closePromise)closePromise=Promise.all(servers.map(server=>new Promise((resolve,reject)=>
    server.close(error=>error?reject(error):resolve()))));
   return closePromise;
  }});
 }catch(error){
  await Promise.allSettled(servers.map(server=>new Promise(resolve=>server.close(resolve))));
  throw error;
 }
}

async function startFromEnvironment(env=process.env){
 const path=env.SABORA_EGRESS_POLICY_FILE;
 if(env.NODE_ENV!=='production'||typeof path!=='string'||!path.startsWith('/'))throw invalid();
 const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>65536)throw invalid();
 let policy;try{policy=JSON.parse(await readFile(path,'utf8'));}catch{throw invalid();}
 return createSaboraEgressGateway({policy});
}

const main=process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url;
if(main){
 try{
  const gateway=await startFromEnvironment();
  const stop=()=>gateway.close().then(()=>{process.exitCode=0;},()=>{process.exitCode=1;});
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
 }catch{
  process.stderr.write('sabora_egress_startup_failed\n');process.exitCode=1;
 }
}
