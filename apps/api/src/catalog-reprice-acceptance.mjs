// Candidate explicit reprice acceptance, not an order authorizer.
// Server-issued HMAC binds a displayed economic quote to one basket, actor,
// catalog revision, selected modifiers, quantity and a bounded expiry.
// Call only after reloading the current published snapshot under an order
// transaction; do not trust a browser-supplied quote or use this for idempotency.
import {createHmac, timingSafeEqual} from 'node:crypto';
import {buildCatalogLineEvidence} from './catalog-line-evidence.mjs';

const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const id=v=>typeof v==='string'&&v.length>=1&&v.length<=128&&
 /^[A-Za-z0-9_-]+$/.test(v);
const secret=v=>typeof v==='string'&&Buffer.byteLength(v,'utf8')>=32;
const time=v=>Number.isSafeInteger(v)&&v>=0;
const ttl=v=>Number.isSafeInteger(v)&&v>=1&&v<=600;
const mac=(key,message)=>createHmac('sha256',key).update(message).digest('hex');
const canonical=value=>{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(plain(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 if(value===null||typeof value==='string'||typeof value==='boolean'||Number.isSafeInteger(value))
  return JSON.stringify(value);
 throw Error('invalid_catalog_acceptance');
};
const digest=value=>createHmac('sha256','sabora-quote-v1-public-fingerprint')
 .update(canonical(value)).digest('hex');
const evidenceFor=input=>buildCatalogLineEvidence(input);
const binding=({basketId,actorId,itemId,publishedRevision,selection,quantity,evidence})=>({
 schemaVersion:1,basketId,actorId,itemId:itemId.toLowerCase(),
 publishedRevision,selection,quantity,evidence
});
const requireContext=({basketId,actorId,secretKey,nowMs,ttlSeconds=300})=>{
 if(!id(basketId)||!id(actorId)||!secret(secretKey)||!time(nowMs)||!ttl(ttlSeconds))
  throw Error('invalid_catalog_acceptance');
};
export function issueCatalogRepriceAcceptance({
 basketId,actorId,secretKey,nowMs,ttlSeconds=300,
 itemId,publishedRevision,snapshot,selection,quantity=1
}={}){
 requireContext({basketId,actorId,secretKey,nowMs,ttlSeconds});
 const evidence=evidenceFor({itemId,publishedRevision,snapshot,selection,quantity});
 const expiresAt=nowMs+ttlSeconds*1000;
 if(!Number.isSafeInteger(expiresAt))throw Error('invalid_catalog_acceptance');
 const payload=binding({basketId,actorId,itemId,publishedRevision,selection,quantity,evidence});
 const fingerprint=digest(payload);
 const body=`v1.${expiresAt}.${fingerprint}`;
 const token=`${body}.${mac(secretKey,body)}`;
 return Object.freeze({token,expiresAt,evidence});
}
export function verifyCatalogRepriceAcceptance({
 token,basketId,actorId,secretKey,nowMs,
 itemId,publishedRevision,snapshot,selection,quantity=1
}={}){
 requireContext({basketId,actorId,secretKey,nowMs});
 if(typeof token!=='string'||token.length>256)return false;
 const match=/^v1\.([0-9]{1,16})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(token);
 if(!match)return false;
 const expiresAt=Number(match[1]);
 if(!time(expiresAt)||nowMs>expiresAt||expiresAt-nowMs>600000)return false;
 const body=`v1.${match[1]}.${match[2]}`;
 const expected=Buffer.from(mac(secretKey,body),'hex');
 const received=Buffer.from(match[3],'hex');
 if(!timingSafeEqual(expected,received))return false;
 try{
  const evidence=evidenceFor({itemId,publishedRevision,snapshot,selection,quantity});
  const payload=binding({basketId,actorId,itemId,publishedRevision,selection,quantity,evidence});
  return digest(payload)===match[2];
 }catch{return false;}
}
