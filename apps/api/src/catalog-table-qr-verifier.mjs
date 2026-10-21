// Candidate table/QR verification only. It does NOT authorize a customer
// visit, actor, basket or order. The future lockContext must also verify a
// customer session and durable visit membership before returning canOrder.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createCatalogTableQrVerifier(){
 return Object.freeze({
  async verifyTableQr(query,{tableId,qrToken,expectedSessionId}={}){
   if(typeof query!=='function'||!uuid.test(tableId)||
      typeof qrToken!=='string'||qrToken.length<32||qrToken.length>512||
      !uuid.test(expectedSessionId))
    throw Error('invalid_catalog_qr_scope');
   const response=await query(
    `SELECT id,session_id,qr_version
       FROM sabora.dining_tables
      WHERE id=$1 AND session_id=$2
        AND qr_token_hash=sha256(convert_to($3,'UTF8'))
      FOR SHARE`,
    [tableId,expectedSessionId,qrToken]
   );
   if(!response||!Array.isArray(response.rows)||response.rows.length>1)
    throw Error('invalid_catalog_qr_response');
   const row=response.rows[0];
   if(!row)return Object.freeze({valid:false});
   if(typeof row.id!=='string'||row.id.toLowerCase()!==tableId.toLowerCase()||
      typeof row.session_id!=='string'||
      row.session_id.toLowerCase()!==expectedSessionId.toLowerCase()||
      !Number.isSafeInteger(Number(row.qr_version))||Number(row.qr_version)<1)
    throw Error('invalid_catalog_qr_response');
   return Object.freeze({valid:true,tableId:row.id,
    sessionId:row.session_id,qrVersion:Number(row.qr_version)});
  }
 });
}
