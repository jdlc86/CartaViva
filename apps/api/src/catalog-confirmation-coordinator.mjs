// Candidate order confirmation orchestration, not wired to HTTP or production.
// The adapter is a privileged backend-only repository implementation.
// Every method must execute through ONE transaction with row locks, and
// persist() must atomically consume acceptance and insert immutable evidence.
import {decideCatalogLineConfirmation} from './catalog-confirmation-decision.mjs';
import {assertDisplayedQuoteMatchesConfirmation} from './catalog-displayed-quote-binding.mjs';

const validKey=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(v);
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const requiredMethods=['lockContext','lookupIdempotency','lockCatalog','loadPreviousQuote','persist'];
const payloadKeys=['tableId','visitId','basketId','actorId','itemId','selection','quantity',
 'requestKey','acceptanceToken'];
// Snapshot untrusted JSON data once, without invoking getters or accepting
// prototypes, symbols, cycles, sparse arrays or dangerous property names.
const snapshotInput=(value,seen=new Set(),depth=0)=>{
 if(value===null||typeof value==='string'||typeof value==='boolean'||
    (typeof value==='number'&&Number.isSafeInteger(value)))return value;
 if(depth>16||typeof value!=='object'||seen.has(value)||
    (!Array.isArray(value)&&!plain(value)))throw Error('invalid_confirmation_input');
 seen.add(value);
 const keys=Reflect.ownKeys(value);
 if(keys.length>512)throw Error('invalid_confirmation_input');
 const output=Array.isArray(value)?[]:Object.create(null);
 if(Array.isArray(value)&&keys.filter(k=>k!=='length').length!==value.length)
  throw Error('invalid_confirmation_input');
 for(const key of keys){
  if(key==='length'&&Array.isArray(value))continue;
  if(typeof key!=='string'||['__proto__','prototype','constructor'].includes(key))
   throw Error('invalid_confirmation_input');
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor||!descriptor.enumerable||!own(descriptor,'value'))
   throw Error('invalid_confirmation_input');
  if(Array.isArray(value)&&(!/^(0|[1-9][0-9]*)$/.test(key)||
     Number(key)>=value.length))throw Error('invalid_confirmation_input');
  output[key]=snapshotInput(descriptor.value,seen,depth+1);
 }
 seen.delete(value);
 return output;
};
const stable=v=>{
 if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
 if(plain(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
 if(v===null||typeof v==='string'||typeof v==='boolean'||Number.isSafeInteger(v))
  return JSON.stringify(v);
 throw Error('invalid_confirmation_input');
};
export function createCatalogConfirmationCoordinator({withTransaction,repository,secretKey,clock}={}){
 if(typeof withTransaction!=='function'||!plain(repository)||
    requiredMethods.some(name=>typeof repository[name]!=='function')||
    typeof clock!=='function'||typeof secretKey!=='string'||Buffer.byteLength(secretKey)<32)
  throw Error('invalid_confirmation_coordinator');
 return async function confirm(rawInput){
  const input=snapshotInput(rawInput);
  if(!plain(input)||Object.keys(input).some(k=>!payloadKeys.includes(k))||
     payloadKeys.slice(0,-1).some(k=>!own(input,k))||
     !validKey(input.requestKey)||!validId(input.tableId)||!validId(input.visitId)||
     !validId(input.actorId)||!validId(input.basketId))
   throw Error('invalid_confirmation_input');
  const {requestKey,acceptanceToken=null,...request}=input;
  // A bounded canonical fingerprint prevents oversized client payloads from
  // consuming unbounded CPU/memory before the transaction is opened.
  // No previous quote, price, revision or economic evidence is accepted from
  // the browser. The prior displayed quote must come from trusted storage.
  const requestFingerprint=stable(request);
  if(Buffer.byteLength(requestFingerprint,'utf8')>16384||
     (acceptanceToken!==null&&(typeof acceptanceToken!=='string'||
      acceptanceToken.length>4096)))
   throw Error('invalid_confirmation_input');
  return withTransaction(async query=>{
   // Locks the visit/table and checks authorization BEFORE looking up a replay.
   const context=await repository.lockContext(query,{
    tableId:input.tableId,visitId:input.visitId,actorId:input.actorId,basketId:input.basketId
   });
   if(!plain(context)||context.authorized!==true||context.canOrder!==true||
      context.tableId!==input.tableId||context.visitId!==input.visitId||
      context.actorId!==input.actorId||context.basketId!==input.basketId||
      typeof context.sessionId!=='string'||!context.sessionId)
    throw Error('order_context_forbidden');
   const replay=await repository.lookupIdempotency(query,{
    context,requestKey,requestFingerprint
   });
   if(replay!==null){
    if(!plain(replay)||replay.requestFingerprint!==requestFingerprint||
       !own(replay,'result'))throw Error('order_idempotency_conflict');
    return Object.freeze({status:'replayed',result:replay.result});
   }
   // Catalog lock and availability must remain held through persist/commit.
   const published=await repository.lockCatalog(query,{context,itemId:input.itemId});
   if(!plain(published)||!Number.isSafeInteger(published.publishedRevision)||
      published.publishedRevision<1||!plain(published.snapshot)||
      published.available!==true)
    throw Error('order_catalog_unavailable');
   const previous=await repository.loadPreviousQuote(query,{
    context,itemId:input.itemId,basketId:input.basketId,actorId:input.actorId
   });
   if(!plain(previous))throw Error('order_previous_quote_unavailable');
   // A durable writer must bind its confirmation to the exact locked quote.
   if(typeof previous.quoteId!=='string'||!previous.quoteId)
    throw Error('order_previous_quote_unavailable');
   const nowMs=clock();
   if(!Number.isSafeInteger(nowMs)||nowMs<0)throw Error('invalid_confirmation_clock');
   const decision=decideCatalogLineConfirmation({
    previous,itemId:input.itemId,
    publishedRevision:published.publishedRevision,snapshot:published.snapshot,
    selection:input.selection,quantity:input.quantity,
    acceptanceToken,basketId:input.basketId,actorId:input.actorId,secretKey,nowMs
   });
   // Consent to a repricing cannot silently authorize a different basket.
   assertDisplayedQuoteMatchesConfirmation({previous,currentEvidence:decision.evidence});
   if(decision.status==='acceptance_required'){
    // Read-only outcome: transaction commits without persisting an order.
    return Object.freeze({status:'acceptance_required',decision});
   }
   const result=await repository.persist(query,{
    context,requestKey,requestFingerprint,quoteId:previous.quoteId,
    evidence:decision.evidence,
    acceptanceVerified:decision.acceptanceVerified,
    requiresAcceptance:decision.requiresAcceptance
   });
   if(!plain(result)||typeof result.orderId!=='string'||!result.orderId)
    throw Error('invalid_order_persistence_result');
   return Object.freeze({status:'confirmed',result});
  });
 };
}
