// Laboratory candidate for the two public recovery-factor steps only.
// Do not mount operationally until a verified Auth registration/revocation
// adapter and reconciliation flow exist. No provider token or ROOT session.
import {generateRootRecoveryToken} from './staff-root-recovery-candidate.mjs';

export const ROOT_RECOVERY_PATH='/api/v1/staff/root-recovery';
export const ROOT_RECOVERY_GRANT_COOKIE='__Host-sabora-root-recovery-grant';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenValid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v)&&Buffer.from(v,'base64url').toString('base64url')===v;
const exact=(body,keys)=>body!==null&&typeof body==='object'&&!Array.isArray(body)&&
 Object.keys(body).length===keys.length&&keys.every(k=>Object.hasOwn(body,k));
const cookie=(value,age)=>ROOT_RECOVERY_GRANT_COOKIE+'='+value+'; Path=/; Max-Age='+age+'; Secure; HttpOnly; SameSite=Strict';

export function registerRootRecoveryFactorHttpCandidate(app,{origin,kernel,mail,getRootUserId}={}){
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.origin!==origin||typeof kernel?.command!=='function'||
  typeof kernel?.hash!=='function'||typeof mail?.queueChallenge!=='function'||typeof getRootUserId!=='function')
  throw Error('invalid_root_recovery_factor_http_config');
 const invalid=reply=>reply.code(400).send({error:'invalid_request'});
 const denied=reply=>reply.code(403).send({error:'root_recovery_denied'});
 const unavailable=reply=>reply.code(503).send({error:'root_recovery_unavailable'});
 const guard=async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  reply.header('Referrer-Policy','no-referrer');
  reply.header('X-Content-Type-Options','nosniff');
  if(request.headers.host!==base.host||request.headers.origin!==origin||
    request.headers.authorization!==undefined||request.url.includes('?'))return denied(reply);
 };
 async function root(){
  const actor=await getRootUserId();
  if(actor===null)return null;
  if(!UUID.test(actor??''))throw Error('invalid_root_recovery_actor');
  return actor;
 }
 app.post(ROOT_RECOVERY_PATH+'/begin',{preHandler:guard,bodyLimit:1024},async(request,reply)=>{
  if(!exact(request.body,['link'])||!tokenValid(request.body.link))return invalid(reply);
  try{
   const actor=await root();
   if(actor)await mail.queueChallenge(actor,request.body.link);
   // Uniform response for a syntactically valid link, including stale,
   // blocked and already-queued links. Never disclose account state.
   return reply.code(202).send({outcome:'request_received'});
  }catch(error){return error?.code==='42501'?reply.code(202).send({outcome:'request_received'}):unavailable(reply);}
 });
 app.post(ROOT_RECOVERY_PATH+'/authorize',{preHandler:guard,bodyLimit:2048},async(request,reply)=>{
  const body=request.body;
  if(!exact(body,['challenge','code'])||!tokenValid(body.challenge)||
   typeof body.code!=='string'||body.code.length>512)return invalid(reply);
  try{
   const actor=await root();
   if(!actor)return denied(reply);
   const grant=generateRootRecoveryToken();
   const result=await kernel.command('attempt',actor,{a:kernel.hash('challenge',body.challenge),
    b:kernel.hash('code',body.code),c:kernel.hash('grant',grant)});
   if(result.outcome!=='authorized')return denied(reply);
   // The SQL grant expires independently and is single-use. This cookie is
   // not an Auth credential, and no operational session accepts it.
   return reply.header('Set-Cookie',cookie(grant,300)).send({outcome:'registration_authorized'});
  }catch(error){return error?.code==='42501'?denied(reply):unavailable(reply);}
 });
 // No public claim, register, complete or cancellation of durable state.
 // A GET to any of these endpoints is not a recovery action.
}
