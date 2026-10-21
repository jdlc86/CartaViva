// Transaction-bound candidate adapter. The caller MUST authorize the
// context, use one checked-out transaction, and supply a restricted DB role.
// This module never opens connections, grants privileges or mounts routes.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scope=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 uuid.test(v.tableId)&&uuid.test(v.sessionId)&&
 ['visitId','basketId','actorId'].every(k=>typeof v[k]==='string'&&
 /^[A-Za-z0-9_-]{1,128}$/.test(v[k]))&&v.authorized===true&&v.canOrder===true;
const cents=n=>Number.isSafeInteger(n)&&n>=0;
export function createCatalogQuoteInsertRepository(){
 return Object.freeze({
  async insertDisplayedQuote(query,{context,evidence,expiresAt}={}){
   if(typeof query!=='function'||!scope(context)||
      !evidence||typeof evidence!=='object'||Array.isArray(evidence)||
      !uuid.test(evidence.itemId)||!Number.isSafeInteger(evidence.publishedRevision)||
      evidence.publishedRevision<1||
      ![evidence.subtotalCents,evidence.discountCents,evidence.totalCents].every(cents)||
      evidence.discountCents>evidence.subtotalCents||
      evidence.subtotalCents-evidence.discountCents!==evidence.totalCents||
      typeof expiresAt!=='string'||!Number.isFinite(Date.parse(expiresAt))||
      new Date(expiresAt).toISOString()!==expiresAt)
    throw Error('invalid_catalog_quote_insert');
   const result=await query(
    `INSERT INTO sabora.catalog_displayed_quotes
       (table_id,session_id,visit_id,basket_id,actor_id,item_id,
        published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::timestamptz)
      RETURNING id`,
    [context.tableId,context.sessionId,context.visitId,context.basketId,
     context.actorId,evidence.itemId,evidence.publishedRevision,
     evidence.subtotalCents,evidence.discountCents,evidence.totalCents,
     JSON.stringify(evidence),expiresAt]
   );
   if(!result||!Array.isArray(result.rows)||result.rows.length!==1||
      !result.rows[0]||!uuid.test(result.rows[0].id))
    throw Error('invalid_catalog_quote_insert_result');
   return Object.freeze({quoteId:result.rows[0].id});
  }
 });
}
