// Offline RS256 verifier for Supabase Auth access tokens. The trusted
// backend supplies a pinned public key and expected issuer/audience.
// Never accept an untrusted JWT header URL or algorithm as a key source.
import {createPublicKey,KeyObject,verify as verifySignature} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function decode(segment){
 if(typeof segment!=='string'||!segment||!/^[A-Za-z0-9_-]+$/.test(segment))
  throw Error('invalid_staff_jwt');
 const bytes=Buffer.from(segment,'base64url');
 if(bytes.length===0||bytes.toString('base64url')!==segment)
  throw Error('invalid_staff_jwt');
 return bytes;
}
export function createPinnedRs256StaffBearerVerifier({
 publicKey,issuer,audience='authenticated',clock=()=>Date.now(),maxTokenAgeSeconds=3600
}={}){
 if(typeof issuer!=='string'||!issuer.startsWith('https://')||
    typeof audience!=='string'||!audience||typeof clock!=='function'||
    !Number.isSafeInteger(maxTokenAgeSeconds)||maxTokenAgeSeconds<60||
    maxTokenAgeSeconds>86400)throw Error('invalid_staff_jwt_configuration');
 let key;
 try{key=publicKey instanceof KeyObject?publicKey:createPublicKey(publicKey);}catch{throw Error('invalid_staff_jwt_configuration');}
 if(key.asymmetricKeyType!=='rsa')throw Error('invalid_staff_jwt_configuration');
 return async function verifyBearer(token){
  const denied=Object.freeze({verified:false});
  if(typeof token!=='string'||token.length<32||token.length>4096)return denied;
  const parts=token.split('.');
  if(parts.length!==3)return denied;
  try{
   const header=JSON.parse(decode(parts[0]).toString('utf8'));
   const payload=JSON.parse(decode(parts[1]).toString('utf8'));
   if(!header||header.alg!=='RS256'||header.typ!=='JWT'||
      !payload||typeof payload!=='object'||!uuid.test(payload.sub)||
      !Number.isSafeInteger(payload.iat)||!Number.isSafeInteger(payload.exp))
    return denied;
   const now=Math.floor(clock()/1000);
   if(payload.iat>now||payload.exp<=now||payload.exp<=payload.iat||
      now-payload.iat>maxTokenAgeSeconds||payload.exp-payload.iat>maxTokenAgeSeconds)
    return denied;
   const issuerValid=payload.iss===issuer;
   const audienceValid=payload.aud===audience||
    (Array.isArray(payload.aud)&&payload.aud.includes(audience));
   if(!issuerValid||!audienceValid)return denied;
   const signature=decode(parts[2]);
   if(!verifySignature('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),
     key,signature))return denied;
   return Object.freeze({verified:true,subject:payload.sub,
    issuerValid:true,audienceValid:true,notExpired:true});
  }catch{return denied;}
 };
}
