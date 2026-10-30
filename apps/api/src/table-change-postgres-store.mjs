// Candidate PostgreSQL adapter: requires an existing transaction runner.
// Never instantiate against a production connection without authorization.
export function createTableChangePostgresStore({withTransaction,resolveAccount,verifyStaff}={}){
 if([withTransaction,resolveAccount,verifyStaff].some(x=>typeof x!=='function'))
  throw Error('invalid_table_change_store');
 const single=async(query,sql,args)=>{
  const result=await query(sql,args);
  if(result.rows.length!==1)throw Error('invalid_table_change_sql_result');
  return result.rows[0];
 };
 const map=r=>r&&({id:r.id,status:r.status,sourceTableId:r.source_table_id,
  createdAtMs:+new Date(r.created_at),expiresAtMs:+new Date(r.expires_at),
  decidedAtMs:r.decided_at==null?null:+new Date(r.decided_at),
  destinationTableId:r.destination_table_id??null,
  consumedOrderId:r.consumed_order_id??null});
 return Object.freeze({transaction:async(operation,handler)=>{
  if(!['request','decide'].includes(operation))throw Error('invalid_table_change_operation');
  return withTransaction(async query=>handler({
   serverNowMs:async()=>+new Date((await single(query,'SELECT clock_timestamp() AS now',[])).now),
   lockCustomerAccount:token=>resolveAccount({query,customerSessionToken:token,lock:true}),
   expirePendingRequests:async(accountId,nowMs)=>query(
    "UPDATE sabora.customer_table_change_requests SET status='expired' WHERE account_id=$1 AND status='pending' AND expires_at<=to_timestamp($2::double precision/1000)",
    [accountId,nowMs]),
   lockApprovedRequest:async accountId=>map((await query(
    "SELECT * FROM sabora.customer_table_change_requests WHERE account_id=$1 AND status='approved' FOR UPDATE",[accountId])).rows[0]),
   latestRequest:async accountId=>map((await query(
    "SELECT * FROM sabora.customer_table_change_requests WHERE account_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE",[accountId])).rows[0]),
   configuredWindowMs:async()=>1000*(await single(query,
    'SELECT table_change_response_seconds FROM sabora.restaurant_settings WHERE singleton=true',[])).table_change_response_seconds,
   insertRequest:async v=>map(await single(query,
    "INSERT INTO sabora.customer_table_change_requests (account_id,customer_id,visit_key,source_table_id,created_at,expires_at) VALUES($1,$2,$3,$4,to_timestamp($5::double precision/1000),to_timestamp($6::double precision/1000)) RETURNING *",
    [v.accountId,v.customerId,v.visitId,v.sourceTableId,v.createdAtMs,v.expiresAtMs])),
   // Called only inside the same H6 order-confirmation transaction.
   // Locks the account first to serialize against requests and decisions.
   applyTransfer:async({accountId,orderId,request})=>{
    const account=await single(query,
     "SELECT id,table_id,state FROM sabora.customer_accounts WHERE id=$1 FOR UPDATE",[accountId]);
    if(account.state!=='open'||account.table_id!==request.sourceTableId)
     throw Error('table_change_origin_conflict');
    const result=await query(
     "UPDATE sabora.customer_table_change_requests SET status='consumed',destination_table_id=$2,consumed_order_id=$3,consumed_at=clock_timestamp() WHERE id=$1 AND account_id=$4 AND status='approved' RETURNING id",
     [request.id,request.destinationTableId,orderId,accountId]);
    if(result.rows.length!==1)throw Error('table_change_transfer_forbidden');
    await query("UPDATE sabora.customer_accounts SET table_id=$2,updated_at=clock_timestamp() WHERE id=$1",
     [accountId,request.destinationTableId]);
    return result.rows[0];
   },
   requireWaiter:identity=>verifyStaff({query,...identity}),
   lockRequest:async id=>map((await query(
    'SELECT * FROM sabora.customer_table_change_requests WHERE id=$1 FOR UPDATE',[id])).rows[0]),
   recordDecision:async({request,staffId})=>({request:map(await single(query,
    "UPDATE sabora.customer_table_change_requests SET status=$2,decided_at=to_timestamp($3::double precision/1000),decided_by=$4 WHERE id=$1 AND status='pending' RETURNING *",
    [request.id,request.status,request.decidedAtMs,staffId]))})
  }));
 }});
}
