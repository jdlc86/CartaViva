import {createCustomerSessionVerifier} from './customer-session-verifier.mjs';
import {createCustomerSessionQueryBoundary} from './customer-session-query-boundary.mjs';
import {createCustomerSessionRevoker} from './customer-session-revoker.mjs';

const COOKIE_NAME='__Secure-sabora_customer';
const COOKIE_PATH='/api/v1/customer';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;

export function readCustomerCookie(header){
 if(typeof header!=='string'||header.length>4096)return null;
 const matches=header.split(';').map(part=>part.trim()).filter(part=>part.startsWith(COOKIE_NAME+'='));
 if(matches.length!==1)return null;
 const token=matches[0].slice(COOKIE_NAME.length+1);
 return TOKEN.test(token)?token:null;
}
export function clearCustomerCookie(reply){
 reply.header('Set-Cookie',`${COOKIE_NAME}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
}
export function createCustomerCookieAuth({verifyCustomerSession,allowedOrigin,revokeCustomerSession}={}){
 if(typeof verifyCustomerSession!=='function'||typeof revokeCustomerSession!=='function'||
    typeof allowedOrigin!=='string'||!/^https:\/\/[^/]+$/.test(allowedOrigin))
  throw Error('invalid_customer_cookie_auth_configuration');
 const authenticate=async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  if(request&&Object.hasOwn(request,'customerIdentity'))delete request.customerIdentity;
  // Cookie authentication must not silently accept bearer or public identifiers.
  if(request.headers.authorization!==undefined){
   reply.code(401).send({error:'unauthorized'});return;
  }
  const token=readCustomerCookie(request.headers.cookie);
  if(!token){reply.code(401).send({error:'unauthorized'});return;}
  let identity;
  try{identity=await verifyCustomerSession(token);}
  catch{reply.code(503).send({error:'authentication_unavailable'});return;}
  if(!identity||typeof identity.customerId!=='string'||!UUID.test(identity.customerId)){
   reply.code(401).send({error:'unauthorized'});return;
  }
  request.customerIdentity=Object.freeze({customerId:identity.customerId,
   publicId:identity.publicId,alias:identity.alias,company:identity.company??null});
 };
 const requireSameOrigin=(request,reply)=>{
  reply.header('Cache-Control','no-store');
  if(request.headers.origin!==allowedOrigin||
     request.headers['sec-fetch-site']==='cross-site'){
   reply.code(403).send({error:'origin_not_allowed'});
   return false;
  }
  return true;
 };
 const logout=async(request,reply)=>{
  if(!requireSameOrigin(request,reply))return;
  const token=readCustomerCookie(request.headers.cookie);
  if(!token){clearCustomerCookie(reply);return reply.code(401).send({error:'unauthorized'});}
  let revoked;
  try{revoked=await revokeCustomerSession(token);}
  catch{return reply.code(503).send({error:'session_revocation_unavailable'});}
  clearCustomerCookie(reply);
  return reply.code(200).send({revoked:revoked===true});
 };
 return {authenticate,requireSameOrigin,logout};
}
export function registerCustomerCookieSessionCandidate(app,{pool,allowedOrigin}={}){
 if(!app||typeof app.register!=='function'||typeof pool?.query!=='function')
  throw Error('invalid_customer_cookie_session_composition');
 const query=createCustomerSessionQueryBoundary({pool});
 const cookieAuth=createCustomerCookieAuth({
  verifyCustomerSession:createCustomerSessionVerifier({query}),
  revokeCustomerSession:createCustomerSessionRevoker({query}),
  allowedOrigin
 });
 return app.register(async scope=>{
  scope.addHook('preHandler',async(request,reply)=>{
   if(request.method!=='GET'&&!cookieAuth.requireSameOrigin(request,reply))return;
   // Logout must remain callable with an expired cookie.
   if(request.method==='POST'&&request.url.split('?')[0].endsWith('/logout'))return;
   await cookieAuth.authenticate(request,reply);
  });
  scope.get('/session',async request=>({authenticated:true,
   publicId:request.customerIdentity.publicId,alias:request.customerIdentity.alias,
   company:request.customerIdentity.company}));
  scope.post('/logout',cookieAuth.logout);
 },{prefix:COOKIE_PATH});
}
