const ROLE=/^[a-z][a-z0-9_]{0,62}$/;

// A connection login receives only SET membership in one dormant NOLOGIN
// capability. The role is local to the transaction and cannot leak through a
// reused pool connection. The caller can additionally pin every SQL statement.
export function createRoleScopedPostgresTransaction({pool,role,allowedSql}={}){
 if(!pool||typeof pool.connect!=='function'||!ROLE.test(role??'')||
    !(allowedSql instanceof Set)||allowedSql.size===0||
    [...allowedSql].some(sql=>typeof sql!=='string'||!sql.trim()))
  throw Error('invalid_role_scoped_transaction');
 const setRole=`SET LOCAL ROLE ${role}`;
 return async function withTransaction(callback){
  if(typeof callback!=='function')throw Error('invalid_role_scoped_callback');
  let client,completed=false;
  try{
   client=await pool.connect();
   if(!client||typeof client.query!=='function'||typeof client.release!=='function')
    throw Error('invalid_role_scoped_connection');
   await client.query('BEGIN');
   await client.query(setRole);
   const query=(sql,parameters=[])=>{
    if(!allowedSql.has(sql)||!Array.isArray(parameters))
     throw Error('role_scoped_sql_not_allowed');
    return client.query(sql,parameters);
   };
   const result=await callback(query);
   await client.query('COMMIT');
   completed=true;
   return result;
  }catch(error){
   if(client&&!completed){try{await client.query('ROLLBACK');}catch{}}
   throw error;
  }finally{
   if(client){try{client.release(!completed);}catch{}}
  }
 };
}
