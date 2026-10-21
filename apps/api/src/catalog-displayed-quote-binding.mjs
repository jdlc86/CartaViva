// The displayed quote is server-owned. A confirmation must match the exact
// selections and quantity originally displayed, even after a re-publication.
// Economic amounts are compared to the persisted ledger, not browser values.
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const cents=v=>Number.isSafeInteger(v)&&v>=0;
const ids=selected=>{
 if(!Array.isArray(selected)||selected.length>50)return null;
 const result=[];
 for(const entry of selected){
  if(!plain(entry)||typeof entry.id!=='string'||!entry.id||
     !/^[A-Za-z0-9_-]{1,128}$/.test(entry.id))return null;
  result.push(entry.id);
 }
 if(new Set(result).size!==result.length)return null;
 return result.sort();
};
export function assertDisplayedQuoteMatchesConfirmation({previous,currentEvidence}={}){
 if(!plain(previous)||!plain(previous.evidence)||!plain(currentEvidence))
  throw Error('order_displayed_quote_invalid');
 const displayed=previous.evidence;
 const a=ids(displayed.selected),b=ids(currentEvidence.selected);
 if(displayed.schemaVersion!==1||!a||!b||
    displayed.itemId!==currentEvidence.itemId||
    displayed.quantity!==currentEvidence.quantity||
    !Number.isSafeInteger(displayed.quantity)||displayed.quantity<1||
    displayed.publishedRevision!==previous.publishedRevision||
    !cents(displayed.subtotalCents)||!cents(displayed.discountCents)||
    !cents(displayed.totalCents)||
    displayed.subtotalCents!==previous.subtotalCents||
    displayed.discountCents!==previous.discountCents||
    displayed.totalCents!==previous.totalCents||
    displayed.discountCents>displayed.subtotalCents||
    displayed.totalCents!==displayed.subtotalCents-displayed.discountCents)
  throw Error('order_displayed_quote_invalid');
 if(a.length!==b.length||a.some((id,index)=>id!==b[index]))
  throw Error('order_selection_changed');
 return true;
}
