// Candidate authorization read: one transaction, current QR and customer
// bearer token, durable visit, table session, QR version and expiry.
// This is NOT a runtime writer and grants no database permissions.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const opaque=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function createCatalogVisitContextRepository(){
 return Object.freeze({
  async lockContext(query,{tableId,visitId,actorId,basketId,qrToken,customerSessionToken}={}){
   if(typeof query!=='function'||!uuid.test(tableId)||!opaque(visitId)||
      !opaque(actorId)||!opaque(basketId)||
      typeof qrToken!=='string'||qrToken.length<32||qrToken.length>512||
      typeof customerSessionToken!=='string'||
      customerSessionToken.length<32||customerSessionToken.length>512)
    throw Error('invalid_catalog_visit_context');
   const response=await query(
    `SELECT t.id AS table_id,t.session_id AS session_id,
            v.visit_key AS visit_id,v.actor_id AS actor_id,
            p.alias AS customer_alias,p.public_id AS customer_identifier
       FROM sabora.dining_tables AS t
       JOIN sabora.customer_table_visits AS v
         ON v.table_id=t.id AND v.session_id=t.session_id
       JOIN sabora.customer_sessions AS s ON s.customer_id=v.customer_id
       JOIN sabora.customer_profiles AS p ON p.id=v.customer_id
      WHERE t.id=$1 AND v.visit_key=$2 AND v.actor_id=$3
        AND t.qr_token_hash=sha256(convert_to($4,'UTF8'))
        AND s.token_hash=sha256(convert_to($5,'UTF8'))
        AND (t.ordering_state='open' OR
             (t.ordering_state='paused' AND t.pause_until IS NOT NULL
              AND t.pause_until<=clock_timestamp()))
        AND v.authorized_qr_version=t.qr_version
        AND v.revoked_at IS NULL AND v.expires_at>clock_timestamp()
        AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
      FOR UPDATE OF t FOR SHARE OF v,s`,
    [tableId,visitId,actorId,qrToken,customerSessionToken]);
   if(!response||!Array.isArray(response.rows)||response.rows.length>1)
    throw Error('invalid_catalog_visit_response');
   const record=response.rows[0];
   if(!record)return Object.freeze({authorized:false,canOrder:false});
   if(!uuid.test(record.table_id)||!uuid.test(record.session_id)||
      record.table_id.toLowerCase()!==tableId.toLowerCase()||
      record.visit_id!==visitId||record.actor_id!==actorId||
      typeof record.customer_alias!=='string'||!record.customer_alias.trim()||
      typeof record.customer_identifier!=='string'||
      !/^SB-[2-9A-HJ-NP-Y]{12}$/.test(record.customer_identifier))
    throw Error('invalid_catalog_visit_response');
   return Object.freeze({authorized:true,canOrder:true,
    tableId:record.table_id,sessionId:record.session_id,
    visitId,basketId,actorId,customerAlias:record.customer_alias,
    customerIdentifier:record.customer_identifier});
  }
 });
}
