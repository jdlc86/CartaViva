import https from 'node:https';
import tls from 'node:tls';
import {normalizeStaffInviteeEmail} from './staff-lifecycle-capability.mjs';

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
  // Trusted enrollment/recovery caller must bind this proof to a current
  // durable invitation and verify issuer, UUID, session and confirmed email
  // afterwards. Never use this result to issue an operational staff cookie.
  async exchangeEmailProof({purpose,tokenHash}={}){
   if(!['invite','recovery'].includes(purpose)||typeof tokenHash!=='string'||
      !/^[A-Za-z0-9_-]{32,512}$/.test(tokenHash))
    throw Error('invalid_staff_auth_email_proof');
   const result=await call('/verify','POST',{data:{type:purpose,token_hash:tokenHash}});
   if(result===null)return null;
   if(typeof result?.access_token!=='string'||result.access_token.length>3700||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(result.access_token))
    throw Error('staff_auth_provider_unavailable');
   // Do not return refresh tokens, provider user metadata or email proofs.
   return Object.freeze({accessToken:result.access_token});
  },
  user:token=>call('/user','GET',{token}),
  logout:token=>call('/logout?scope=local','POST',{token})
 });
}


// Candidate-only, per-subject Auth boundary. Instantiate only from trusted
// durable recovery data; never pass browser-supplied identity or mount this
// provider as an unrestricted administrative HTTP proxy. Key provisioning,
// custody, actual delivery and deployment authorization are external gates.
const RECOVERY_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECOVERY_JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const RECOVERY_SECRET=/^sb_secret_[A-Za-z0-9_-]{20,150}$/;
const recoveryError=()=>Error('staff_recovery_auth_provider_unavailable');

export function createGatewayInvitationProvider({managementOrigin,secretKey,publishableKey,...config}={}){
 const origin=new URL(managementOrigin);
 const unavailable=()=>Error('staff_invitation_auth_provider_unavailable');
 if(origin.protocol!=='https:'||origin.origin!==managementOrigin||!RECOVERY_SECRET.test(secretKey??''))throw unavailable();
 const request=createAuthGatewayRequest(config);
 const provider=createGatewayPasskeyProvider({publishableKey,...config});
 return Object.freeze({
  async createInvitationProof(recipient){
   const email=normalizeStaffInviteeEmail(recipient);
   const body=JSON.stringify({type:'invite',email,redirect_to:origin.origin});
   try{
    const response=await request('/auth/v1/admin/generate_link',{method:'POST',signal:AbortSignal.timeout(5000),body,
     headers:{apikey:secretKey,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}});
    if(response.status!==200)throw unavailable();
    const result=JSON.parse(await response.text());
    if(!RECOVERY_UUID.test(result?.id??'')||result.email!==email||result.is_anonymous!==false||
      result.verification_type!=='invite'||![origin.origin,origin.origin+'/'].includes(result.redirect_to)||
      typeof result.hashed_token!=='string'||! /^[A-Za-z0-9_-]{32,512}$/.test(result.hashed_token))throw unavailable();
    return result.hashed_token;
   }catch{throw unavailable();}
  },
  exchangeInvitation:({authProof})=>provider.exchangeEmailProof({purpose:'invite',tokenHash:authProof}),
  provider
 });
}

export function createGatewayRecoveryProvider({subjectId,email,managementOrigin,secretKey,publishableKey,...config}={}){
 const origin=new URL(managementOrigin);
 if(origin.protocol!=='https:'||origin.origin!==managementOrigin||!RECOVERY_UUID.test(subjectId??'')||
  !RECOVERY_SECRET.test(secretKey??'')||!isStaffAuthPublishableKey(publishableKey))throw recoveryError();
 const subject=subjectId.toLowerCase(),recipient=normalizeStaffInviteeEmail(email);
 const publicProvider=createGatewayPasskeyProvider({publishableKey,...config});
 const request=createAuthGatewayRequest(config),userPath='/admin/users/'+subject;
 const sameUser=user=>user?.id===subject&&user.email===recipient&&user.is_anonymous===false&&
  typeof user.email_confirmed_at==='string'&&Number.isFinite(Date.parse(user.email_confirmed_at))&&
  Date.parse(user.email_confirmed_at)<=Date.now();
 const assertSubject=id=>{if(typeof id!=='string'||id.toLowerCase()!==subject)throw recoveryError();};
 const assertToken=token=>{if(typeof token!=='string'||token.length>3700||!RECOVERY_JWT.test(token))throw recoveryError();};
 async function call(path,method,{admin=false,token,data,expected=200}={}){
  const body=data===undefined?undefined:JSON.stringify(data);
  try{
   const response=await request('/auth/v1'+path,{method,signal:AbortSignal.timeout(5000),body,
    headers:{apikey:admin?secretKey:publishableKey,...(token?{Authorization:'Bearer '+token}:{}),
     ...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})}});
   if(response.status!==expected)throw recoveryError();
   if(expected===204)return true;
   return JSON.parse(await response.text());
  }catch{throw recoveryError();}
 }
 async function user(token){
  assertToken(token);
  const result=await publicProvider.user(token);
  if(!sameUser(result))return null;
  return Object.freeze({id:subject,email:recipient,is_anonymous:false,email_confirmed_at:result.email_confirmed_at});
 }
 async function requireUser(token){if(!await user(token))throw recoveryError();}
 return Object.freeze({
  // Generate, but do not send or exchange, a proof for the existing exact
  // Auth identity. Never fall back to invite/signup/create-user.
  async generateRecoveryProof(){
   if(!sameUser(await call(userPath,'GET',{admin:true})))throw recoveryError();
   const result=await call('/admin/generate_link','POST',{admin:true,data:{type:'recovery',email:recipient,redirect_to:origin.origin}});
   if(!sameUser(result)||result.verification_type!=='recovery'||
    ![origin.origin,origin.origin+'/'].includes(result.redirect_to)||
    typeof result.hashed_token!=='string'||! /^[A-Za-z0-9_-]{32,512}$/.test(result.hashed_token))throw recoveryError();
   return Object.freeze({authProof:result.hashed_token});
  },
  async exchangeRecoveryProof(authProof){
   const result=await publicProvider.exchangeEmailProof({purpose:'recovery',tokenHash:authProof});
   if(!result||!await user(result.accessToken))throw recoveryError();
   return Object.freeze({accessToken:result.accessToken});
  },
  user,
  async registrationOptions(token){await requireUser(token);return publicProvider.registrationOptions(token);},
  async verifyRegistration(token,challenge,credential){
   if(!RECOVERY_UUID.test(challenge??''))throw recoveryError();
   await requireUser(token);return publicProvider.verifyRegistration(token,challenge,credential);
  },
  async listPasskeys(id){
   assertSubject(id);
   const result=await call(userPath+'/passkeys','GET',{admin:true});
   const items=Array.isArray(result)?result:result?.passkeys;
   if(!Array.isArray(items)||items.length>1000||!items.every(x=>RECOVERY_UUID.test(x?.id??'')))throw recoveryError();
   const ids=items.map(x=>x.id.toLowerCase());
   if(new Set(ids).size!==ids.length)throw recoveryError();
   return Object.freeze(ids.sort());
  },
  async revokePasskey(id,passkeyId){
   assertSubject(id);
   if(!RECOVERY_UUID.test(passkeyId??''))throw recoveryError();
   return call(userPath+'/passkeys/'+passkeyId.toLowerCase(),'DELETE',{admin:true,expected:204});
  },
  async logoutAll(token){
   await requireUser(token);
   return call('/logout?scope=global','POST',{token,expected:204});
  }
 });
}
