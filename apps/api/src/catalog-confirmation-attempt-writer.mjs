// Candidate private transaction-bound ledger writer. No HTTP, DB pool,
// grants or operational order creation. The caller must supply a verified
// orderId produced by a separate trusted writer in the SAME transaction.
import {priceCatalogLine} from './catalog-pricing.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const opaque=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(v);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const money=v=>Number.isSafeInteger(v)&&v>=0;
const forbidden=['__proto__','constructor','prototype'];
const safeJson=(v,depth=0)=>{
 if(depth>16)return false;
 if(v===null||typeof v==='string'||typeof v==='boolean')return true;
 if(typeof v==='number')return Number.isSafeInteger(v);
 if(Array.isArray(v))return v.length<=512&&v.every(x=>safeJson(x,depth+1));
 if(!plain(v))return false;
 const keys=Object.keys(v);
 return keys.length<=512&&keys.every(k=>!forbidden.includes(k)&&safeJson(v[k],depth+1));
};
const validEvidence=e=>{
 if(!plain(e)||!safeJson(e)||e.schemaVersion!==1||!uuid.test(e.itemId)||
  !Number.isSafeInteger(e.publishedRevision)||e.publishedRevision<=0||
  typeof e.itemName!=='string'||!e.itemName.trim()||
  [...e.itemName].length>160||!['Bebidas','Primeros','Segundos','Postres'].includes(e.category)||
  !Number.isSafeInteger(e.quantity)||e.quantity<1||e.quantity>20||
  !Array.isArray(e.selected)||e.selected.length>50||
  !e.selected.every(s=>plain(s)&&typeof s.id==='string'&&s.id.length>0&&
   typeof s.name==='string'&&s.name.trim().length>0&&money(s.priceCents)&&
   Array.isArray(s.allergens)&&s.allergens.every(a=>typeof a==='string'))||
  !Array.isArray(e.allergens)||e.allergens.length>32||
  !e.allergens.every(a=>typeof a==='string'&&a.trim().length>0)||
  !(e.discount===null||plain(e.discount))||
  ![e.basePriceCents,e.unitSubtotalCents,e.unitDiscountCents,
    e.subtotalCents,e.discountCents,e.totalCents].every(money)||
  e.unitDiscountCents>e.unitSubtotalCents||
  e.discountCents>e.subtotalCents||
  e.totalCents!==e.subtotalCents-e.discountCents)return false;
 let calculated;
 try{
  calculated=priceCatalogLine({
   basePriceCents:e.basePriceCents,
   extras:e.selected.map(s=>s.priceCents),
   discount:e.discount,
   quantity:e.quantity
  });
 }catch{return false;}
 if(['unitSubtotalCents','unitDiscountCents','subtotalCents',
     'discountCents','totalCents'].some(k=>calculated[k]!==e[k]))return false;
 const unitTotal=e.unitSubtotalCents-e.unitDiscountCents;
 return BigInt(e.unitSubtotalCents)*BigInt(e.quantity)===BigInt(e.subtotalCents)&&
  BigInt(e.unitDiscountCents)*BigInt(e.quantity)===BigInt(e.discountCents)&&
  BigInt(unitTotal)*BigInt(e.quantity)===BigInt(e.totalCents);
};
const valid=(a)=>plain(a)&&plain(a.context)&&a.context.authorized===true&&
 a.context.canOrder===true&&uuid.test(a.context.tableId)&&
 uuid.test(a.context.sessionId)&&
 ['visitId','basketId','actorId'].every(k=>opaque(a.context[k]))&&
 key(a.requestKey)&&typeof a.requestFingerprint==='string'&&
 Buffer.byteLength(a.requestFingerprint,'utf8')>0&&
 Buffer.byteLength(a.requestFingerprint,'utf8')<=16384&&
 uuid.test(a.quoteId)&&uuid.test(a.orderId)&&validEvidence(a.evidence)&&
 typeof a.requiresAcceptance==='boolean'&&typeof a.acceptanceVerified==='boolean'&&
 (!a.requiresAcceptance||a.acceptanceVerified)&&
 (!a.acceptanceVerified||a.requiresAcceptance);
export function createCatalogConfirmationAttemptWriter(){
 return Object.freeze({
  async insertConfirmation(query,args){
   if(typeof query!=='function'||!valid(args))
    throw Error('invalid_catalog_confirmation_attempt');
   const {context,evidence}=args;
   const result=await query(
    `INSERT INTO sabora.catalog_confirmation_attempts
       (table_id,session_id,visit_id,basket_id,actor_id,item_id,
        request_key,request_fingerprint,quote_id,economic_evidence,
        order_id,accepted_reprice,accepted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,
       CASE WHEN $12 THEN clock_timestamp() ELSE NULL END)
      RETURNING order_id`,
    [context.tableId,context.sessionId,context.visitId,context.basketId,
     context.actorId,evidence.itemId,args.requestKey,args.requestFingerprint,
     args.quoteId,JSON.stringify(evidence),args.orderId,args.acceptanceVerified]
   );
   if(!result||!Array.isArray(result.rows)||result.rows.length!==1||
      !result.rows[0]||result.rows[0].order_id!==args.orderId)
    throw Error('invalid_catalog_confirmation_attempt_result');
   return Object.freeze({orderId:args.orderId});
  }
 });
}
