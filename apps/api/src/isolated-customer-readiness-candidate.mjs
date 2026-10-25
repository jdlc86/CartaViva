// Runtime readiness probe: never trusts a stale startup preflight.
// Both independent logins must still be reachable and match expected identities.
// Caller owns pools; no new credentials, global state, or production wiring.
const role=/^[a-z][a-z0-9_]{0,62}$/;
async function probe(pool,expected){
 let client;
 let healthy=false;
 try{
  client=await pool.connect();
  if(typeof client?.query!=='function'||typeof client?.release!=='function')
   return false;
  const result=await client.query(
   'SELECT current_user AS role_name, session_user AS login_name');
  healthy=result?.rows?.length===1&&
   result.rows[0]?.role_name===expected&&
   result.rows[0]?.login_name===expected;
  return healthy;
 }catch{return false;}
 finally{
  if(client&&typeof client.release==='function'){
   try{client.release(!healthy);}catch{}
  }
 }
}
export function createIsolatedCustomerReadinessCandidate({
 catalogReaderPool,orderWriterPool,expectedCatalogLogin,expectedOrderLogin
}={}){
 if(!catalogReaderPool||!orderWriterPool||
    catalogReaderPool===orderWriterPool||
    typeof catalogReaderPool.connect!=='function'||
    typeof orderWriterPool.connect!=='function'||
    !role.test(expectedCatalogLogin??'')||!role.test(expectedOrderLogin??'')||
    expectedCatalogLogin===expectedOrderLogin)
  throw Error('invalid_customer_readiness_configuration');
 return async()=> {
  // Sequential probes avoid opening a writer connection when reader fails.
  if(!await probe(catalogReaderPool,expectedCatalogLogin))return false;
  return probe(orderWriterPool,expectedOrderLogin);
 };
}
