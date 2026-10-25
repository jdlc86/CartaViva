// Candidate only: invoke only after signature and scope verification.
// The supplied query must use a dedicated restricted SQL principal.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const STAFF_CUSTODY_NONCE_CONSUME_SQL=
  'SELECT sabora.consume_staff_custody_approval_nonce_candidate($1::uuid,$2::timestamptz,$3::text) AS consumed';
export function createStaffCustodyNonceConsumerCandidate({query}={}){
  if(typeof query!=='function')throw Error('invalid_staff_custody_nonce_consumer_config');
  return async function consumeNonce(nonce,expiresAt,actorId){
    if(!UUID.test(nonce??'')||typeof expiresAt!=='string'||
      !Number.isFinite(Date.parse(expiresAt))||
      typeof actorId!=='string'||!/^[A-Za-z0-9_-]{8,96}$/.test(actorId))
      throw Error('invalid_staff_custody_nonce_consumer_input');
    const result=await query(STAFF_CUSTODY_NONCE_CONSUME_SQL,[nonce,expiresAt,actorId]);
    if(result?.rows?.length!==1||typeof result.rows[0]?.consumed!=='boolean')
      throw Error('invalid_staff_custody_nonce_consumer_result');
    return result.rows[0].consumed;
  };
}
