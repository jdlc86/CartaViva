// Candidate transaction-bound PostgreSQL reads. No pool, connection, HTTP
// handler or privileges are created here. All calls use the caller's one
// checked-out transaction client; the future writer must provide authorization.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scope=v=>v&&typeof v==='object'&&!Array.isArray(v)&&
 v.authorized===true&&v.canOrder===true&&
 uuid.test(v.tableId)&&uuid.test(v.sessionId)&&
 ['visitId','basketId','actorId'].every(k=>typeof v[k]==='string'&&
 /^[A-Za-z0-9_-]{1,128}$/.test(v[k]));
const validItem=v=>typeof v==='string'&&uuid.test(v);
// PostgreSQL numeric fields arrive as decimal strings or safe JS integers.
// Number(null), Number('') and exponent notation must never become trusted money.
const safeDbInteger=v=>(typeof v==='number'&&Number.isSafeInteger(v))||
 (typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v)&&
  Number.isSafeInteger(Number(v)));
const row=(response)=>{
 if(!response||!Array.isArray(response.rows)||response.rows.length>1)
  throw Error('invalid_catalog_repository_response');
 return response.rows[0]??null;
};
export function createCatalogConfirmationReadRepository(){
 return Object.freeze({
  async lookupIdempotency(query,{context,requestKey,requestFingerprint}={}){
   if(typeof query!=='function'||!scope(context)||
      typeof requestKey!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(requestKey)||
      typeof requestFingerprint!=='string'||!requestFingerprint||
      Buffer.byteLength(requestFingerprint,'utf8')>16384)
    throw Error('invalid_catalog_repository_scope');
   // Serialize concurrent attempts with the same authorized scope and key
   // before reading the ledger. A unique constraint remains the final guard.
   // Hash collisions only add contention, never merge distinct scopes.
   const lockResponse=await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[
    JSON.stringify([context.tableId,context.sessionId,context.visitId,
     context.basketId,context.actorId,requestKey])
   ]);
   // Query errors are propagated. Drivers may return a void-valued row;
   // a valid response must still contain an array of result rows.
   if(!lockResponse||!Array.isArray(lockResponse.rows))
    throw Error('invalid_catalog_repository_response');
   const record=row(await query(
    `SELECT request_fingerprint,order_id
       FROM sabora.catalog_confirmation_attempts
      WHERE table_id=$1 AND session_id=$2 AND visit_id=$3
        AND basket_id=$4 AND actor_id=$5 AND request_key=$6
      FOR UPDATE`,
    [context.tableId,context.sessionId,context.visitId,
     context.basketId,context.actorId,requestKey]
   ));
   if(!record)return null;
   if(typeof record.request_fingerprint!=='string'||!record.request_fingerprint||
      Buffer.byteLength(record.request_fingerprint,'utf8')>16384||!validItem(record.order_id))
    throw Error('invalid_catalog_repository_response');
   return {requestFingerprint:record.request_fingerprint,
    result:{orderId:record.order_id}};
  },
  async lockCatalog(query,{context,itemId}={}){
   if(typeof query!=='function'||!scope(context)||!validItem(itemId))
    throw Error('invalid_catalog_repository_scope');
   const record=row(await query(
    `SELECT published_revision,published_snapshot,withdrawn_at,sold_out
       FROM sabora.catalog_items WHERE id=$1 FOR SHARE`,[itemId]));
   if(!record)return null;
   const revision=Number(record.published_revision);
   if(!safeDbInteger(record.published_revision)||revision<1||
      !record.published_snapshot||typeof record.published_snapshot!=='object'||
      Array.isArray(record.published_snapshot))
    return {available:false,publishedRevision:0,snapshot:null};
   return {publishedRevision:revision,snapshot:record.published_snapshot,
    available:record.withdrawn_at===null&&record.sold_out===false};
  },
  async loadPreviousQuote(query,{context,itemId}={}){
   if(typeof query!=='function'||!scope(context)||!validItem(itemId))
    throw Error('invalid_catalog_repository_scope');
   const record=row(await query(
    `SELECT id,published_revision,subtotal_cents,discount_cents,total_cents,evidence
       FROM sabora.catalog_displayed_quotes
      WHERE table_id=$1 AND session_id=$2 AND visit_id=$3
        AND basket_id=$4 AND actor_id=$5 AND item_id=$6
        AND expires_at>clock_timestamp()
      ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE`,
    [context.tableId,context.sessionId,context.visitId,
     context.basketId,context.actorId,itemId]));
   if(!record)return null;
   const amountFields=['subtotal_cents','discount_cents','total_cents'];
   const amounts=amountFields.map(k=>Number(record[k]));
   const revision=Number(record.published_revision);
   if(!validItem(record.id)||!safeDbInteger(record.published_revision)||revision<1||
      amountFields.some(k=>!safeDbInteger(record[k]))||
      amounts.some(x=>!Number.isSafeInteger(x)||x<0)||
      amounts[1]>amounts[0]||amounts[0]-amounts[1]!==amounts[2])
    throw Error('invalid_catalog_repository_response');
   if(!record.evidence||typeof record.evidence!=='object'||Array.isArray(record.evidence))
    throw Error('invalid_catalog_repository_response');
   return {quoteId:record.id,evidence:record.evidence,publishedRevision:revision,
    subtotalCents:amounts[0],discountCents:amounts[1],totalCents:amounts[2]};
  }
 });
}
