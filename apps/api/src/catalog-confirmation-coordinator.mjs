// Candidate order confirmation orchestration, not wired to HTTP or production.
// The adapter is a privileged backend-only repository implementation.
// Every method must execute through ONE transaction with row locks, and
// persist() must atomically consume acceptance and insert immutable evidence.
import {decideCatalogLineConfirmation} from './catalog-confirmation-decision.mjs';

const validKey=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(v);
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const requiredMethods=['lockContext','lookupIdempotency','lockCatalog','persist'];
const payloadKeys=['tableId','visitId','basketId','actorId','itemId','selection','quantity',
 'previous','requestKey','acceptanceToken'];
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
 return async function confirm(input){
  if(!plain(input)||Object.keys(input).some(k=>!payloadKeys.includes(k))||
     payloadKeys.slice(0,-1).some(k=>!own(input,k))||
     !validKey(input.requestKey)||!validId(input.tableId)||!validId(input.visitId)||
     !validId(input.actorId)||!validId(input.basketId))
   throw Error('invalid_confirmation_input');
  const {requestKey,acceptanceToken=null,...request}=input;
  // No prices or economic evidence from browser are accepted. Previous is
  // display-only comparison data, not an authority for persistence.
  const requestFingerprint=stable(request);
  return withTransaction(async query=>{
   // Locks the visit/table and checks authorization BEFORE looking up a replay.
   const context=await repository.lockContext(query,{
    tableId:input.tableId,visitId:input.visitId,actorId:input.actorId,basketId:input.basketId
   });
   if(!plain(context)||context.authorized!==true||context.canOrder!==true)
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
   const nowMs=clock();
   if(!Number.isSafeInteger(nowMs)||nowMs<0)throw Error('invalid_confirmation_clock');
   const decision=decideCatalogLineConfirmation({
    previous:input.previous,itemId:input.itemId,
    publishedRevision:published.publishedRevision,snapshot:published.snapshot,
    selection:input.selection,quantity:input.quantity,
    acceptanceToken,basketId:input.basketId,actorId:input.actorId,secretKey,nowMs
   });
   if(decision.status==='acceptance_required'){
    // Read-only outcome: transaction commits without persisting an order.
    return Object.freeze({status:'acceptance_required',decision});
   }
   const result=await repository.persist(query,{
    context,requestKey,requestFingerprint,evidence:decision.evidence,
    acceptanceVerified:decision.acceptanceVerified,
    requiresAcceptance:decision.requiresAcceptance
   });
   if(!plain(result)||typeof result.orderId!=='string'||!result.orderId)
    throw Error('invalid_order_persistence_result');
   return Object.freeze({status:'confirmed',result});
  });
 };
}
