// F12 sealed-RPC adapter candidate. No direct writes to protected tables.
// Not mounted in production: both RPCs deliberately have no runtime EXECUTE grant.
export const REQUEST_TABLE_CHANGE_H6_SQL=
 'SELECT request_id,request_status,expires_at FROM sabora.request_customer_table_change_h6_candidate($1::bytea,$2::uuid)';
export const REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL=
 'SELECT request_id,request_status,expires_at FROM sabora.request_customer_table_change_h6_resolved_candidate($1::bytea)';
export const READ_TABLE_CHANGE_H6_SQL=
 'SELECT bound_table_id,change_state,change_expires_at,server_time FROM sabora.read_customer_table_change_h6_candidate($1::bytea)';
export const DECIDE_TABLE_CHANGE_H6_SQL=
 'SELECT sabora.decide_customer_table_change_h6_candidate($1::uuid,$2::uuid,$3::boolean) AS status';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Translate only known SQLSTATE + exact database errors. Never trust a bare
// message: unrelated SQL failures must remain unavailable, not user conflicts.
const rpcFailure=(error,operation)=>{
 const code=error?.code;
 const message=error?.message;
 if(operation==='request'&&code==='23514'&&
  ['table_change_approval_active','table_change_cooldown'].includes(message))
  return Error('table_change_request_locked',{cause:error});
 if(operation==='request'&&code==='42501'&&
  ['customer_session_forbidden','table_change_account_forbidden',
   'table_change_visit_forbidden'].includes(message))
  return Error('table_change_account_forbidden',{cause:error});
 if(operation==='decide'&&code==='23514'&&message==='table_change_already_decided')
  return Error('table_change_request_not_pending',{cause:error});
 if(operation==='decide'&&code==='42501'&&message==='table_change_request_missing')
  return Error('table_change_request_not_found',{cause:error});
 if(operation==='decide'&&code==='42501'&&
  ['table_change_staff_forbidden','table_change_account_closed',
   'table_change_account_missing'].includes(message))
  return Error('table_change_unauthorized',{cause:error});
 return error;
};
const one=async(query,sql,params)=>{
 const result=await query(sql,params);
 if(!result||!Array.isArray(result.rows)||result.rows.length!==1)
  throw Error('invalid_table_change_rpc_result');
 return result.rows[0];
};
export function createSealedTableChangeRpcCandidate({
 withCustomerTransaction,withStaffTransaction,hashSession,resolveAccount,verifyStaff
}={}){
 if([withCustomerTransaction,withStaffTransaction,hashSession,verifyStaff]
  .some(fn=>typeof fn!=='function')||
  (resolveAccount!==undefined&&typeof resolveAccount!=='function'))
  throw Error('invalid_table_change_rpc_configuration');
 return Object.freeze({
  async readState({customerSessionToken}={}){
   if(typeof customerSessionToken!=='string'||!customerSessionToken)
    throw Error('table_change_unauthorized');
   const hash=await hashSession(customerSessionToken);
   if(!Buffer.isBuffer(hash)||hash.length!==32)
    throw Error('invalid_table_change_session_hash');
   let row;
   try{row=await withCustomerTransaction(query=>one(query,READ_TABLE_CHANGE_H6_SQL,[hash]));}
   catch(error){throw rpcFailure(error,'request');}
   const states=new Set(['unbound','bound','pending','approved','rejected']);
   const deadline=row.change_expires_at==null?null:new Date(row.change_expires_at).getTime();
   const serverNow=new Date(row.server_time).getTime();
   if(!states.has(row.change_state)||!Number.isFinite(serverNow)||
      (row.change_state==='unbound'?row.bound_table_id!==null:!UUID.test(row.bound_table_id??''))||
      (['pending','rejected'].includes(row.change_state)?
       !Number.isFinite(deadline)||deadline<=serverNow:deadline!==null))
    throw Error('invalid_table_change_rpc_result');
   return Object.freeze({state:row.change_state,boundTableId:row.bound_table_id,
    expiresAtMs:deadline,serverNowMs:serverNow});
  },
  async request({customerSessionToken}={}){
   if(typeof customerSessionToken!=='string'||!customerSessionToken)
    throw Error('table_change_unauthorized');
   return withCustomerTransaction(async query=>{
    const hash=await hashSession(customerSessionToken);
    if(!Buffer.isBuffer(hash)||hash.length!==32)
     throw Error('invalid_table_change_session_hash');
    // Preferred path: the SECURITY DEFINER RPC resolves the unique open
    // account; the API login needs EXECUTE only, never direct table SELECT.
    let sql=REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL;
    let params=[hash];
    if(resolveAccount){
     // Compatibility candidate; not suitable for least-privilege cutover.
     const account=await resolveAccount({query,customerSessionToken,lock:true});
     if(!account||!UUID.test(account.accountId??'')||account.closed)
      throw Error('table_change_account_forbidden');
     sql=REQUEST_TABLE_CHANGE_H6_SQL;
     params=[hash,account.accountId];
    }
    let row;
    try{row=await one(query,sql,params);}
    catch(error){throw rpcFailure(error,'request');}
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
    if(!staff||!UUID.test(staff.userId??'')||!['admin','waiter'].includes(staff.role))
     throw Error('table_change_unauthorized');
    let row;
    try{row=await one(query,DECIDE_TABLE_CHANGE_H6_SQL,
     [staff.userId,requestId,decision==='approved']);}
    catch(error){throw rpcFailure(error,'decide');}
    if(row.status!==decision)throw Error('table_change_request_not_pending');
    return Object.freeze({request:Object.freeze({id:requestId,status:decision})});
   });
  }
 });
}
