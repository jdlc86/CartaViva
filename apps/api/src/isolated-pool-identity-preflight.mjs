// Explicit offline-only identity preflight for independently provisioned pools.
// Never logs or returns connection strings, secrets or SQL error details.
const roleName=value=>typeof value==='string'&&/^[a-z][a-z0-9_]{0,62}$/.test(value);
async function identity(pool){
 if(!pool||typeof pool.connect!=='function')throw Error('invalid_pool_identity_preflight');
 let client;
 try{
  client=await pool.connect();
  if(!client||typeof client.query!=='function'||typeof client.release!=='function')
   throw Error('invalid_pool_identity_preflight');
  const result=await client.query('SELECT current_user AS role_name, session_user AS login_name');
  if(!result||!Array.isArray(result.rows)||result.rows.length!==1)
   throw Error('invalid_pool_identity_preflight');
  const row=result.rows[0];
  if(!row||!roleName(row.role_name)||!roleName(row.login_name))
   throw Error('invalid_pool_identity_preflight');
  return {role:row.role_name,login:row.login_name};
 }catch{
  throw Error('invalid_pool_identity_preflight');
 }finally{
  if(client)try{client.release();}catch{}
 }
}
export async function assertIsolatedCustomerPoolIdentities({
 catalogReaderPool,orderWriterPool,expectedCatalogLogin,expectedOrderLogin
}={}){
 if(!roleName(expectedCatalogLogin)||!roleName(expectedOrderLogin)||
    expectedCatalogLogin===expectedOrderLogin||
    !catalogReaderPool||!orderWriterPool||
    catalogReaderPool===orderWriterPool)
  throw Error('invalid_pool_identity_preflight');
 // Sequential checks avoid unnecessary writer connections if reader fails.
 const reader=await identity(catalogReaderPool);
 if(reader.login!==expectedCatalogLogin||reader.role!==expectedCatalogLogin)
  throw Error('invalid_pool_identity_preflight');
 const writer=await identity(orderWriterPool);
 if(writer.login!==expectedOrderLogin||writer.role!==expectedOrderLogin||
    reader.login===writer.login)
  throw Error('invalid_pool_identity_preflight');
 return Object.freeze({validated:true});
}
