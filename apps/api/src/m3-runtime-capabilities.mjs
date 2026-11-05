import {M2_RUNTIME_FUNCTIONS_SQL,M2_RUNTIME_IDENTITY_SQL} from './m2-runtime-capabilities.mjs';

const LOGIN=/^[a-z][a-z0-9_]{0,62}$/;
export const M3_TABLES_ROLE='sabora_m3_tables_runtime';
export const M3_CATALOG_ROLE='sabora_m3_catalog_runtime';
export const M3_TABLES_SIGNATURES=Object.freeze([
 'sabora.manage_table_m3_candidate(jsonb,text,text)',
 'sabora.read_admin_tables_m3_candidate(jsonb,integer,integer)',
 'sabora.transition_table_occupancy_m3_candidate(jsonb,text)'
]);
export const M3_CATALOG_SIGNATURES=Object.freeze([
 'sabora.manage_catalog_m3_candidate(jsonb,text,text)',
 'sabora.read_admin_catalog_m3_candidate(jsonb)'
]);

const rejected=stage=>Object.assign(Error('invalid_m3_runtime_capability:'+stage),
 {code:'M3_RUNTIME_CAPABILITY_REJECTED',stage});

async function assertExact({pool,expectedLogin,role,signatures}){
 if(!pool||typeof pool.connect!=='function'||!LOGIN.test(expectedLogin??'')||
    ![M3_TABLES_ROLE,M3_CATALOG_ROLE].includes(role))throw rejected('input');
 let client,valid=false;
 try{
  client=await pool.connect();
  const identity=await client.query(M2_RUNTIME_IDENTITY_SQL);
  const row=identity?.rows?.length===1?identity.rows[0]:null;
  if(!row||row.effective_role!==expectedLogin||row.login_role!==expectedLogin||
     row.can_login!==true||row.inherit_role!==false||row.superuser!==false||
     row.bypass_rls!==false||row.create_db!==false||row.create_role!==false||
     row.replication!==false||row.database_create!==false||row.schema_create!==false||
     row.direct_relations!==false||row.direct_sequences!==false||
     !Array.isArray(row.set_roles)||row.set_roles.length!==1||row.set_roles[0]!==role)
   throw rejected('identity-policy');
  const surface=await client.query(M2_RUNTIME_FUNCTIONS_SQL,[role]);
  const actual=surface?.rows?.length===1?surface.rows[0].names:null;
  const expected=[...signatures].sort();
  if(!Array.isArray(actual)||actual.length!==expected.length||
     actual.some((name,index)=>name!==expected[index]))throw rejected('function-surface');
  const login=await client.query(M2_RUNTIME_FUNCTIONS_SQL,[expectedLogin]);
  if(!Array.isArray(login?.rows?.[0]?.names)||login.rows[0].names.length!==0)
   throw rejected('login-function-surface');
  valid=true;return Object.freeze({validated:true,login:expectedLogin,capability:role});
 }catch(error){
  if(error?.code==='M3_RUNTIME_CAPABILITY_REJECTED')throw error;
  throw rejected('query');
 }finally{if(client)try{client.release(!valid);}catch{}}
}
export const assertM3TablesCapability=options=>assertExact({...options,
 role:M3_TABLES_ROLE,signatures:M3_TABLES_SIGNATURES});
export const assertM3CatalogCapability=options=>assertExact({...options,
 role:M3_CATALOG_ROLE,signatures:M3_CATALOG_SIGNATURES});
