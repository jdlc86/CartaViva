// Exact SQL allowlist for the candidate administrative tables reader.
// Pool must use a dedicated read-only identity, not the staff authorization pool.
export const ADMIN_TABLES_SQL=`SELECT id,number,capacity,description,ordering_state
       FROM sabora.dining_tables WHERE number>$1
      ORDER BY number,id LIMIT $2`;
export function createAdminTablesReaderQuery({pool}={}){
 if(!pool||typeof pool.query!=='function')throw Error('invalid_admin_tables_reader_pool');
 return async(sql,params)=>{
  if(sql!==ADMIN_TABLES_SQL||!Array.isArray(params)||params.length!==2||
     !Number.isSafeInteger(params[0])||params[0]<0||
     !Number.isSafeInteger(params[1])||params[1]<2||params[1]>101)
   throw Error('admin_tables_query_not_allowed');
  return pool.query(sql,params);
 };
}
