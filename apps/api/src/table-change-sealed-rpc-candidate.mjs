// F12 sealed-RPC adapter candidate. No direct writes to protected tables.
// Not mounted in production: both RPCs deliberately have no runtime EXECUTE grant.
export const REQUEST_TABLE_CHANGE_H6_SQL=
 'SELECT request_id,request_status,expires_at FROM sabora.request_customer_table_change_h6_candidate($1::bytea,$2::uuid)';
export const DECIDE_TABLE_CHANGE_H6_SQL=
 'SELECT sabora.decide_customer_table_change_h6_candidate($1::uuid,$2::uuid,$3::boolean) AS status';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one=async(query,sql,params)=>{
 const result=await query(sql,params);
 if(!result||!Array.isArray(result.rows)||result.rows.length!==1)
  throw Error('invalid_table_change_rpc_result');
 return result.rows[0];
};
export function createSealedTableChangeRpcCandidate({
 withCustomerTransaction,withStaffTransaction,hashSession,resolveAccount,verifyStaff
}={}){
 if([withCustomerTransaction,withStaffTransaction,hashSession,resolveAccount,verifyStaff]
  .some(fn=>typeof fn!=='function'))
  throw Error('invalid_table_change_rpc_configuration');
 return Object.freeze({
  async request({customerSessionToken}={}){
   if(typeof customerSessionToken!=='string'||!customerSessionToken)
    throw Error('table_change_unauthorized');
   return withCustomerTransaction(async query=>{
    const hash=await hashSession(customerSessionToken);
    if(!Buffer.isBuffer(hash)||hash.length!==32)
     throw Error('invalid_table_change_session_hash');
    const account=await resolveAccount({query,customerSessionToken,lock:true});
    if(!account||!UUID.test(account.accountId??'')||account.closed)
     throw Error('table_change_account_forbidden');
    const row=await one(query,REQUEST_TABLE_CHANGE_H6_SQL,[hash,account.accountId]);
    const expiry=Date.parse(row.expires_at);
    if(!UUID.test(row.request_id??'')||row.request_status!=='pending'||
     !Number.isFinite(expiry))throw Error('invalid_table_change_rpc_result');
    return Object.freeze({id:row.request_id,status:'pending',expiresAtMs:expiry});
   });
  },
  async decide({verifiedIdentity,verifiedStaff,requestId,decision}={}){
   if(!verifiedIdentity||!verifiedStaff||!UUID.test(requestId??'')||
    !['approved','rejected'].includes(decision))
    throw Error('invalid_table_change_decision');
   return withStaffTransaction(async query=>{
    const staff=await verifyStaff({query,verifiedIdentity,verifiedStaff});
    if(!staff||!UUID.test(staff.id??'')||!['admin','waiter'].includes(staff.role))
     throw Error('table_change_unauthorized');
    const row=await one(query,DECIDE_TABLE_CHANGE_H6_SQL,
     [staff.id,requestId,decision==='approved']);
    if(row.status!==decision)throw Error('table_change_request_not_pending');
    return Object.freeze({request:Object.freeze({id:requestId,status:decision})});
   });
  }
 });
}
