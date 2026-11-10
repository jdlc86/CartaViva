// Pure candidate basket reprice gate. No database access or order confirmation.
// The caller must load the current published revision from trusted persistence.
import {quoteCatalogSelection} from './catalog-selection-quote.mjs';

const revision=value=>Number.isSafeInteger(value)&&value>0;
const cents=value=>Number.isSafeInteger(value)&&value>=0;
export function compareCatalogQuote({previous,currentRevision,snapshot,selection,quantity=1}={}){
 if(!previous||typeof previous!=='object'||Array.isArray(previous)||
    !revision(previous.publishedRevision)||!revision(currentRevision)||
    !cents(previous.totalCents)||!cents(previous.subtotalCents)||
    !cents(previous.discountCents)||previous.discountCents>previous.subtotalCents||
    previous.subtotalCents-previous.discountCents!==previous.totalCents)
  throw Error('invalid_catalog_quote_comparison');
 const current=quoteCatalogSelection({snapshot,selection,quantity});
 const changed=currentRevision!==previous.publishedRevision||
  current.totalCents!==previous.totalCents||
  current.subtotalCents!==previous.subtotalCents||
  current.discountCents!==previous.discountCents;
 const deltaCents=current.totalCents-previous.totalCents;
 if(!Number.isSafeInteger(deltaCents))throw Error('invalid_catalog_quote_comparison');
 return Object.freeze({
  previousPublishedRevision:previous.publishedRevision,
  currentPublishedRevision:currentRevision,
  previousTotalCents:previous.totalCents,
  currentTotalCents:current.totalCents,
  differenceCents:deltaCents,
  requiresAcceptance:changed,
  current
 });
}
