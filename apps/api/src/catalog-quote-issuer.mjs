// Candidate quote issuance boundary. The caller owns one transaction and
// must supply a repository that authenticates/locks the visit and inserts the
// evidence into the private ledger. No HTTP, pool, or runtime grants here.
import {buildCatalogLineEvidence} from './catalog-line-evidence.mjs';

const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const methods=['lockContext','lockCatalog','insertDisplayedQuote'];
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
// Freeze a detached representation of untrusted request data before inspecting
// fields or opening a database transaction. Accessors must never execute.
const snapshotInput=(value,seen=new Set(),depth=0)=>{
 if(value===null||typeof value==='string'||typeof value==='boolean'||
    (typeof value==='number'&&Number.isSafeInteger(value)))return value;
 if(depth>16||typeof value!=='object'||seen.has(value)||
    (!Array.isArray(value)&&!plain(value)))throw Error('invalid_catalog_quote_input');
 seen.add(value);
 const keys=Reflect.ownKeys(value);
 if(keys.length>512)throw Error('invalid_catalog_quote_input');
 const output=Array.isArray(value)?[]:Object.create(null);
 if(Array.isArray(value)&&keys.filter(k=>k!=='length').length!==value.length)
  throw Error('invalid_catalog_quote_input');
 for(const key of keys){
  if(key==='length'&&Array.isArray(value))continue;
  if(typeof key!=='string'||['__proto__','prototype','constructor'].includes(key))
   throw Error('invalid_catalog_quote_input');
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor||!descriptor.enumerable||!own(descriptor,'value'))
   throw Error('invalid_catalog_quote_input');
  if(Array.isArray(value)&&(!/^(0|[1-9][0-9]*)$/.test(key)||
     Number(key)>=value.length))throw Error('invalid_catalog_quote_input');
  output[key]=snapshotInput(descriptor.value,seen,depth+1);
 }
 seen.delete(value);
 return output;
};
export function createCatalogQuoteIssuer({withTransaction,repository,clock,ttlSeconds=300}={}){
 if(typeof withTransaction!=='function'||!plain(repository)||
    methods.some(k=>typeof repository[k]!=='function')||
    typeof clock!=='function'||!Number.isSafeInteger(ttlSeconds)||
    ttlSeconds<1||ttlSeconds>1800)
  throw Error('invalid_catalog_quote_issuer');
 return async function issue(rawInput){
  const input=snapshotInput(rawInput);
  if(Buffer.byteLength(JSON.stringify(input),'utf8')>16384)
   throw Error('invalid_catalog_quote_input');
  if(!plain(input)||Object.keys(input).some(k=>!
    ['tableId','visitId','basketId','actorId','itemId','selection','quantity','qrToken','customerSessionToken'].includes(k))||
    !id(input.tableId)||!id(input.visitId)||!id(input.basketId)||
    !id(input.actorId)||!uuid(input.itemId)||!plain(input.selection)||
    typeof input.qrToken!=='string'||input.qrToken.length<32||input.qrToken.length>512||
    typeof input.customerSessionToken!=='string'||
    input.customerSessionToken.length<32||input.customerSessionToken.length>512||
    !Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>20)
   throw Error('invalid_catalog_quote_input');
  return withTransaction(async query=>{
   const context=await repository.lockContext(query,{
    tableId:input.tableId,visitId:input.visitId,actorId:input.actorId,
    basketId:input.basketId,qrToken:input.qrToken,
    customerSessionToken:input.customerSessionToken
   });
   if(!plain(context)||context.authorized!==true||context.canOrder!==true||
      !uuid(context.tableId)||!uuid(context.sessionId)||
      context.tableId.toLowerCase()!==input.tableId.toLowerCase()||
      context.visitId!==input.visitId||context.basketId!==input.basketId||
      context.actorId!==input.actorId)
    throw Error('catalog_quote_context_forbidden');
   const published=await repository.lockCatalog(query,{context,itemId:input.itemId});
   if(!plain(published)||published.available!==true||
      !Number.isSafeInteger(published.publishedRevision)||
      published.publishedRevision<1||!plain(published.snapshot))
    throw Error('catalog_quote_unavailable');
   const evidence=buildCatalogLineEvidence({
    itemId:input.itemId,publishedRevision:published.publishedRevision,
    snapshot:published.snapshot,selection:input.selection,quantity:input.quantity
   });
   const nowMs=clock();
   if(!Number.isSafeInteger(nowMs)||nowMs<0||
      !Number.isSafeInteger(nowMs+ttlSeconds*1000))
    throw Error('invalid_catalog_quote_clock');
   const expiresAt=new Date(nowMs+ttlSeconds*1000).toISOString();
   const result=await repository.insertDisplayedQuote(query,{context,evidence,expiresAt});
   if(!plain(result)||!uuid(result.quoteId))
    throw Error('invalid_catalog_quote_persistence');
   return Object.freeze({quoteId:result.quoteId,expiresAt,evidence});
  });
 };
}
