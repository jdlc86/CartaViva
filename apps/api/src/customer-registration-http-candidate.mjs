import {normalizeCustomerRegistration} from './customer-profile.mjs';

// Explicitly opt-in HTTP adapter. It is not imported by server.mjs.
// A same-origin HTTPS deployment and the cookie/session verification contract
// must be reviewed before enabling this candidate.
export function registerCustomerRegistrationCandidate(app,{register,allowedOrigin}={}){
 if(!app||typeof app.post!=='function'||typeof register!=='function'||
    typeof allowedOrigin!=='string'||!/^https:\/\/[^/]+$/.test(allowedOrigin))
  throw Error('invalid_customer_registration_http_configuration');
 app.post('/api/v1/customer/register',{bodyLimit:2048},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  const origin=request.headers.origin;
  if(origin!==allowedOrigin){
   return reply.code(403).send({error:'origin_not_allowed'});
  }
  const contentType=request.headers['content-type'];
  if(typeof contentType!=='string'||!/^application\/json(?:\s*;|$)/i.test(contentType))
   return reply.code(415).send({error:'unsupported_media_type'});
  const normalized=normalizeCustomerRegistration(request.body);
  if(normalized.error)return reply.code(400).send({error:'invalid_profile'});
  let result;
  try{result=await register(normalized);}
  catch{return reply.code(503).send({error:'registration_unavailable'});}
  if(!result||typeof result.token!=='string'||
     !/^[A-Za-z0-9_-]{43}$/.test(result.token)||
     !(result.expiresAt instanceof Date)||!Number.isFinite(result.expiresAt.getTime())||
     result.expiresAt.getTime()<=Date.now()||
     !result.profile||typeof result.profile.public_id!=='string'||
     !/^SB-[23456789ABCDEFGHJKLMNPQRSTUVWXY]{12}$/.test(result.profile.public_id)||
     typeof result.profile.alias!=='string'||!result.profile.alias.trim()||
     (result.profile.company!=null&&typeof result.profile.company!=='string')){
   return reply.code(503).send({error:'registration_unavailable'});
  }
  const seconds=Math.min(90*86400,Math.floor((result.expiresAt.getTime()-Date.now())/1000));
  if(seconds<60)return reply.code(503).send({error:'registration_unavailable'});
  // Cookie deliberately scoped to the customer path; no bearer in JSON.
  reply.header('Set-Cookie',`__Secure-sabora_customer=${result.token}; Path=/api/v1/customer; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Strict`);
  return reply.code(201).send({
   publicId:result.profile.public_id,
   alias:result.profile.alias,
   company:result.profile.company??null
  });
 });
}
