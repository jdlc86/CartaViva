// Candidate HTTP boundary; deliberately not mounted by operational composition.
// Auth exchange is a trusted injected dependency, not a second login path.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

const PATH='/api/v1/staff/enrollment';
const COOKIE='__Host-sabora-enrollment';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{32,512}$/;
const CORRELATION=/^[A-Za-z0-9_-]{8,128}$/;
const BASE64=/^[A-Za-z0-9_-]+$/;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_AGE=300;
const exact=(value,fields)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).length===fields.length&&fields.every(k=>Object.hasOwn(value,k));
const cookie=(value,age)=>COOKIE+'='+value+'; Path=/; Max-Age='+age+'; Secure; HttpOnly; SameSite=Strict';
function readCookie(request){
 const matches=(request.headers.cookie??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
 return matches.length===1?matches[0].slice(COOKIE.length+1):null;
}

export function registerStaffEnrollmentHttpCandidate(app,{origin,secret,enrollment,exchangeInvitation,now=Date.now}={}){
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.origin!==origin||!(secret instanceof Uint8Array)||secret.byteLength!==32||
    typeof now!=='function'||typeof exchangeInvitation!=='function'||
    !['accept','registrationOptions','register'].every(name=>typeof enrollment?.[name]==='function'))
  throw Error('invalid_staff_enrollment_http_config');
 const key=Buffer.from(secret),aad=Buffer.from('sabora.enrollment.http.v1\n'+origin);
 function seal(session){
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
  cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(session),'utf8'),cipher.final()]);
  const value=Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString('base64url');
  if(value.length>3600)throw Error('staff_enrollment_session_too_large');
  return value;
 }
 function open(request){
  try{
   const raw=readCookie(request);
   if(!raw||raw.length>3600||!BASE64.test(raw))return null;
   const data=Buffer.from(raw,'base64url');
   if(data.length<29||data.toString('base64url')!==raw)return null;
   const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
   decipher.setAAD(aad);decipher.setAuthTag(data.subarray(12,28));
   const result=JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));
   if(!exact(result,['enrollmentId','accessToken','expiresAt'])||!UUID.test(result.enrollmentId)||
      typeof result.accessToken!=='string'||!JWT.test(result.accessToken)||
      !Number.isSafeInteger(result.expiresAt)||result.expiresAt<=now())return null;
   return result;
  }catch{return null;}
 }
 const denied=reply=>reply.code(403).send({error:'staff_enrollment_forbidden'});
 const invalid=reply=>reply.code(400).send({error:'invalid_staff_enrollment_request'});
 const failed=(reply,error)=>error?.code==='42501'?denied(reply):
  reply.code(503).send({error:'staff_enrollment_unavailable'});
 const guard=async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  reply.header('Referrer-Policy','no-referrer');
  reply.header('X-Content-Type-Options','nosniff');
  if(request.headers.host!==base.host||request.headers.origin!==origin||
     request.headers.authorization!==undefined||request.url.includes('?'))return denied(reply);
 };
 app.post(PATH+'/accept',{preHandler:guard,bodyLimit:4096},async(request,reply)=>{
  const body=request.body;
  if(!exact(body,['enrollmentId','inviteToken','authProof','correlationId'])||
     !UUID.test(body.enrollmentId??'')||typeof body.inviteToken!=='string'||!TOKEN.test(body.inviteToken)||
     typeof body.authProof!=='string'||!TOKEN.test(body.authProof)||
     typeof body.correlationId!=='string'||!CORRELATION.test(body.correlationId))return invalid(reply);
  try{
   const exchanged=await exchangeInvitation({enrollmentId:body.enrollmentId,authProof:body.authProof});
   if(typeof exchanged?.accessToken!=='string'||exchanged.accessToken.length>3700||
      !JWT.test(exchanged.accessToken))return denied(reply);
   const session={enrollmentId:body.enrollmentId.toLowerCase(),accessToken:exchanged.accessToken,
    expiresAt:now()+MAX_AGE*1000};
   // Build the bounded cookie before changing SQL state. Never echo the
   // provider session, invitation token or proof in a JSON response.
   const sealed=seal(session);
   const result=await enrollment.accept({accessToken:session.accessToken,enrollmentId:session.enrollmentId,
    inviteToken:body.inviteToken,correlationId:body.correlationId});
   if(result?.enrollmentId!==session.enrollmentId||result.state!=='accepted')return denied(reply);
   reply.header('Set-Cookie',cookie(sealed,MAX_AGE));
   return {enrollmentId:result.enrollmentId,state:'accepted'};
  }catch(error){return failed(reply,error);}
 });
 app.post(PATH+'/options',{preHandler:guard,bodyLimit:1024},async(request,reply)=>{
  if(!exact(request.body,[]))return invalid(reply);
  const session=open(request);
  if(!session)return denied(reply);
  try{
   const result=await enrollment.registrationOptions({accessToken:session.accessToken,enrollmentId:session.enrollmentId});
   return {options:result.options,ticket:result.ticket};
  }catch(error){return failed(reply,error);}
 });
 app.post(PATH+'/register',{preHandler:guard,bodyLimit:49152},async(request,reply)=>{
  const body=request.body;
  if(!exact(body,['ticket','credential','correlationId'])||typeof body.ticket!=='string'||body.ticket.length>3000||
     typeof body.correlationId!=='string'||!CORRELATION.test(body.correlationId)||
     !body.credential||typeof body.credential!=='object'||Array.isArray(body.credential))return invalid(reply);
  const session=open(request);
  if(!session)return denied(reply);
  try{
   const result=await enrollment.register({accessToken:session.accessToken,enrollmentId:session.enrollmentId,
    ticket:body.ticket,credential:body.credential,correlationId:body.correlationId});
   if(result?.enrollmentId!==session.enrollmentId||result.state!=='registered')return denied(reply);
   reply.header('Set-Cookie',cookie('',0));
   return {enrollmentId:result.enrollmentId,state:'registered'};
  }catch(error){return failed(reply,error);}
 });
 app.post(PATH+'/cancel',{preHandler:guard,bodyLimit:1024},async(request,reply)=>{
  if(!exact(request.body,[]))return invalid(reply);
  // Cancels this browser's local enrollment session only. It does not
  // revoke the durable invitation or claim a provider logout succeeded.
  return reply.header('Set-Cookie',cookie('',0)).code(204).send();
 });
}
