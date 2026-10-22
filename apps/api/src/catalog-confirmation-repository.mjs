// Candidate composition only: no pool, grants, HTTP routes or production writer.
// The caller must provide a transaction-scoped durable persistence adapter.
import {createCatalogVisitContextRepository} from './catalog-visit-context-repository.mjs';
import {createCatalogConfirmationReadRepository} from './catalog-confirmation-read-repository.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const opaque=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const safeRecord=v=>{
 if(v===null||typeof v!=='object'||Array.isArray(v))return false;
 const prototype=Object.getPrototypeOf(v);
 if(prototype!==Object.prototype&&prototype!==null)return false;
 const keys=Reflect.ownKeys(v);
 if(keys.length>64)return false;
 return keys.every(key=>{
  if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key))
   return false;
  const descriptor=Object.getOwnPropertyDescriptor(v,key);
  return !!descriptor&&descriptor.enumerable&&Object.hasOwn(descriptor,'value');
 });
};
const scope=v=>safeRecord(v)&&
 v.authorized===true&&v.canOrder===true&&uuid.test(v.tableId)&&uuid.test(v.sessionId)&&
 ['visitId','basketId','actorId'].every(k=>opaque(v[k]));
const validPersistArgs=v=>safeRecord(v)&&
 scope(v.context)&&opaque(v.requestKey)&&v.requestKey.length>=8&&
 typeof v.requestFingerprint==='string'&&v.requestFingerprint.length>0&&
 Buffer.byteLength(v.requestFingerprint,'utf8')<=16384&&
 uuid.test(v.quoteId)&&v.evidence!==null&&typeof v.evidence==='object'&&
 !Array.isArray(v.evidence)&&typeof v.acceptanceVerified==='boolean'&&
 typeof v.requiresAcceptance==='boolean'&&
 (!v.requiresAcceptance||v.acceptanceVerified);
export function createCatalogConfirmationRepository({persist}={}){
 if(typeof persist!=='function')throw Error('invalid_catalog_confirmation_writer');
 const visit=createCatalogVisitContextRepository();
 const reads=createCatalogConfirmationReadRepository();
 return Object.freeze({
  lockContext:visit.lockContext,
  lookupIdempotency:reads.lookupIdempotency,
  lockCatalog:reads.lockCatalog,
  loadPreviousQuote:reads.loadPreviousQuote,
  async persist(query,args){
   if(typeof query!=='function'||!validPersistArgs(args))
    throw Error('invalid_catalog_confirmation_writer_scope');
   return persist(query,args);
  }
 });
}
