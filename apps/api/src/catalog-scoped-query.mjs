import {createCatalogReaderSql} from './catalog-reader-query.mjs';
// Dedicated reader login must be NOINHERIT and provisioned independently.
// Each call uses SET LOCAL ROLE; never leak role state to pooled requests.
export function createCatalogScopedQuery({pool}={}){
 if(!pool||typeof pool.connect!=='function')throw Error('invalid_catalog_pool');
 const allowedSql=createCatalogReaderSql();
 return async (sql,parameters)=>{
  if(sql!==allowedSql||!Array.isArray(parameters)||parameters.length!==0)
   throw Error('catalog_sql_not_allowed');
  const client=await pool.connect();
  if(!client||typeof client.query!=='function'||typeof client.release!=='function'){
   try{client?.release?.(true);}catch{}
   throw Error('invalid_catalog_client');
  }
  let began=false,committed=false;
  try{
   await client.query('BEGIN');began=true;
   await client.query('SET LOCAL ROLE sabora_catalog_reader');
   const result=await client.query(sql,parameters);
   await client.query('COMMIT');committed=true;
   return result;
  }catch(error){
   if(began&&!committed)try{await client.query('ROLLBACK');}catch{}
   throw error;
  }finally{
   try{client.release(!committed);}catch{}
  }
 };
}
