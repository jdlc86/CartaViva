// Pure pre-commit decision gate. No database, HTTP or side effects.
// A caller must first lock the published catalog row and authorize the actor,
// table, visit and basket in the SAME database transaction as persistence.
import {buildCatalogLineEvidence} from './catalog-line-evidence.mjs';
import {verifyCatalogRepriceAcceptance} from './catalog-reprice-acceptance.mjs';

const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const safePrevious=v=>{
 if(!plain(v))return false;
 const keys=Reflect.ownKeys(v);
 return keys.length<=32&&keys.every(k=>{
  if(typeof k!=='string'||['__proto__','constructor','prototype'].includes(k))
   return false;
  const descriptor=Object.getOwnPropertyDescriptor(v,k);
  return !!descriptor&&descriptor.enumerable&&Object.hasOwn(descriptor,'value');
 });
};
const money=v=>Number.isSafeInteger(v)&&v>=0;
const revision=v=>Number.isSafeInteger(v)&&v>0;
const previousValid=p=>safePrevious(p)&&revision(p.publishedRevision)&&
 money(p.subtotalCents)&&money(p.discountCents)&&money(p.totalCents)&&
 p.discountCents<=p.subtotalCents&&p.subtotalCents-p.discountCents===p.totalCents;

export function decideCatalogLineConfirmation({
 previous,itemId,publishedRevision,snapshot,selection,quantity=1,
 acceptanceToken=null,basketId,actorId,secretKey,nowMs
}={}){
 if(!previousValid(previous))throw Error('invalid_catalog_confirmation');
 const evidence=buildCatalogLineEvidence({itemId,publishedRevision,snapshot,selection,quantity});
 const changed=previous.publishedRevision!==publishedRevision||
  previous.subtotalCents!==evidence.subtotalCents||
  previous.discountCents!==evidence.discountCents||
  previous.totalCents!==evidence.totalCents;
 const differenceCents=evidence.totalCents-previous.totalCents;
 if(!Number.isSafeInteger(differenceCents))throw Error('invalid_catalog_confirmation');
 const accepted=changed&&typeof acceptanceToken==='string'&&
  verifyCatalogRepriceAcceptance({
   token:acceptanceToken,basketId,actorId,secretKey,nowMs,
   itemId,publishedRevision,snapshot,selection,quantity
  });
 const status=changed&&!accepted?'acceptance_required':'ready_for_transaction';
 return Object.freeze({
  status,
  requiresAcceptance:changed,
  acceptanceVerified:Boolean(accepted),
  previousTotalCents:previous.totalCents,
  currentTotalCents:evidence.totalCents,
  differenceCents,
  previousPublishedRevision:previous.publishedRevision,
  currentPublishedRevision:publishedRevision,
  evidence
 });
}
