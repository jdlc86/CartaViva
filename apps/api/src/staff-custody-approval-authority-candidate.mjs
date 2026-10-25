// Candidate only: signed, short-lived, single-use maintenance grants.
// In-memory replay guard is NOT distributed or durable. No operational credentials.
import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
const ID=/^[A-Za-z0-9_-]{8,96}$/;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const HEX=/^[0-9a-f]{64}$/;
const ACTION='purge_terminal_staff_custody';
const canonical=({action,actorId,cutoff,maxRows,maxBatches,issuedAt,expiresAt,nonce})=>
  JSON.stringify([action,actorId,cutoff,maxRows,maxBatches,issuedAt,expiresAt,nonce]);
const digest=(secret,payload)=>createHmac('sha256',secret).update(canonical(payload)).digest('hex');
function validDate(value){
  return typeof value==='string'&&UTC.test(value)&&Number.isFinite(Date.parse(value))&&
    new Date(value).toISOString().slice(0,19)===value.slice(0,19);
}
export function createStaffCustodyApprovalAuthorityCandidate({
  secret,clock=()=>new Date(),allowedActors,consumeNonce,
}={}){
  if(!Buffer.isBuffer(secret)||secret.length<32||typeof clock!=='function'||
    !Array.isArray(allowedActors)||allowedActors.length===0||
    !allowedActors.every(x=>typeof x==='string'&&ID.test(x))||
    typeof consumeNonce!=='function')
    throw Error('invalid_staff_custody_approval_authority');
  const key=Buffer.from(secret);
  let closed=false;
  const actors=new Set(allowedActors);
  function assertOpen(){if(closed)throw Error('staff_custody_approval_authority_closed');}
  function nowMs(){
    const now=clock();
    if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
      throw Error('invalid_staff_custody_approval_clock');
    return now.getTime();
  }
  function checkPayload(p){
    if(!p||p.action!==ACTION||!ID.test(p.actorId??'')||
      !actors.has(p.actorId)||!validDate(p.cutoff)||
      !Number.isSafeInteger(p.maxRows)||p.maxRows<1||p.maxRows>500||
      !Number.isSafeInteger(p.maxBatches)||p.maxBatches<1||p.maxBatches>20||
      !validDate(p.issuedAt)||!validDate(p.expiresAt)||
      typeof p.nonce!=='string'||!ID.test(p.nonce))
      throw Error('invalid_staff_custody_approval');
    const now=nowMs(),issued=Date.parse(p.issuedAt),expiry=Date.parse(p.expiresAt);
    if(issued>now||expiry<=now||expiry<=issued||expiry-issued>300000||
      Date.parse(p.cutoff)>now)
      throw Error('staff_custody_approval_expired');
  }
  return Object.freeze({
    issue({actorId,cutoff,maxRows,maxBatches,ttlSeconds=120}={}){
      assertOpen();
      if(!Number.isSafeInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>300)
        throw Error('invalid_staff_custody_approval_ttl');
      const now=nowMs();
      const payload={action:ACTION,actorId,cutoff,maxRows,maxBatches,
        issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+ttlSeconds*1000).toISOString(),
        nonce:randomUUID()};
      checkPayload(payload);
      return Object.freeze({...payload,signature:digest(key,payload)});
    },
    async verifyAndConsume(grant,{cutoff,maxRows,maxBatches}={}){
      assertOpen();
      if(!grant||!HEX.test(grant.signature??''))
        throw Error('invalid_staff_custody_approval');
      const {signature,...payload}=grant;
      checkPayload(payload);
      if(payload.cutoff!==cutoff||payload.maxRows!==maxRows||
        payload.maxBatches!==maxBatches)
        throw Error('staff_custody_approval_scope_mismatch');
      const actual=Buffer.from(signature,'hex');
      const expected=Buffer.from(digest(key,payload),'hex');
      if(!timingSafeEqual(actual,expected))
        throw Error('staff_custody_approval_signature_invalid');
      // Must be atomic and durable for cross-process use; caller owns implementation.
      if(await consumeNonce(payload.nonce,payload.expiresAt,payload.actorId)!==true)
        throw Error('staff_custody_approval_replayed');
      return Object.freeze({action:ACTION,cutoff,maxRows,maxBatches,approved:true});
    },
    close(){if(closed)return;closed=true;key.fill(0);},
  });
}
