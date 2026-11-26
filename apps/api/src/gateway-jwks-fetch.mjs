import https from 'node:https';
import tls from 'node:tls';

const HOST=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const INTERNAL=/^[a-z][a-z0-9-]{0,62}$/;
const fail=()=>Error('gateway_jwks_unavailable');

function createAuthGatewayRequest({issuer,connectHost,connectPort,
 requestImpl=https.request,tlsConnect=tls.connect}={}){
 let base;
 try{base=new URL(issuer);}catch{throw fail();}
 if(base.protocol!=='https:'||base.pathname!=='/auth/v1'||base.search||base.hash||
    !HOST.test(base.hostname)||typeof connectHost!=='string'||
    !(HOST.test(connectHost)||INTERNAL.test(connectHost))||
    !Number.isSafeInteger(connectPort)||connectPort<1||connectPort>65535||
    typeof requestImpl!=='function'||typeof tlsConnect!=='function')throw fail();
 class ExactGatewayAgent extends https.Agent{
  createConnection(_options,callback){
   return tlsConnect({host:connectHost,port:connectPort,servername:base.hostname,
    rejectUnauthorized:true,ALPNProtocols:['http/1.1'],minVersion:'TLSv1.2'},callback);
  }
 }
 const agent=new ExactGatewayAgent({keepAlive:false,maxSockets:2,maxFreeSockets:0});
 return function gatewayRequest(path,{method,signal,headers,body}){
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=()=>{if(!settled){settled=true;request?.destroy();reject(fail());}};
   let request;
   try{
    request=requestImpl({protocol:'https:',hostname:base.hostname,port:443,
     path,method,agent,signal,
     headers:{...headers,accept:'application/json',host:base.hostname}},response=>{
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{
       bytes+=chunk.length;if(bytes>65536){response.destroy();finish();return;}chunks.push(chunk);
      });
      response.once('error',()=>finish());
      response.once('end',()=>{
       if(settled)return;settled=true;
       const body=Buffer.concat(chunks).toString('utf8');
       resolve(Object.freeze({ok:response.statusCode===200,status:response.statusCode,
        headers:Object.freeze({get:name=>{
         const value=response.headers?.[String(name).toLowerCase()];
         return Array.isArray(value)?value.join(', '):value??null;
        }}),text:async()=>body}));
      });
    });
    request.once('error',finish);request.end(body);
   }catch{request?.destroy();finish();}
  });
 };
}

export function createGatewayJwksFetch(config){
 const request=createAuthGatewayRequest(config);
 const endpoint=config.issuer+'/.well-known/jwks.json';
 return async function gatewayFetch(url,options={}){
  if(url!==endpoint||options.method!=='GET'||options.redirect!=='error')throw fail();
  return request('/auth/v1/.well-known/jwks.json',{method:'GET',signal:options.signal});
 };
}

export const isStaffAuthPublishableKey=value=>typeof value==='string'&&
 /^sb_publishable_[A-Za-z0-9_-]{20,150}$/.test(value);

export function createGatewayPasskeyProvider({publishableKey,...config}){
 if(!isStaffAuthPublishableKey(publishableKey))throw Error('invalid_staff_auth_key');
 const request=createAuthGatewayRequest(config);
 const call=async(path,method,{token,data}={})=>{
  const body=data===undefined?undefined:JSON.stringify(data);
  const response=await request('/auth/v1'+path,{method,signal:AbortSignal.timeout(5000),body,
   headers:{apikey:publishableKey,...(token?{Authorization:'Bearer '+token}:{}),
    ...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})}});
  if(response.status>=200&&response.status<300){
   return response.status===204?true:JSON.parse(await response.text());
  }
  if([400,401,403,422].includes(response.status))return null;
  throw Error('staff_auth_provider_unavailable');
 };
 return Object.freeze({
  options:()=>call('/passkeys/authentication/options','POST',{data:{}}),
  verify:(challengeId,credential)=>call('/passkeys/authentication/verify','POST',
   {data:{challenge_id:challengeId,credential}}),
  registrationOptions:token=>call('/passkeys/registration/options','POST',{token,data:{}}),
  verifyRegistration:(token,challengeId,credential)=>call('/passkeys/registration/verify','POST',
   {token,data:{challenge_id:challengeId,credential}}),
  user:token=>call('/user','GET',{token}),
  logout:token=>call('/logout?scope=local','POST',{token})
 });
}
