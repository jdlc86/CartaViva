// F12 pending-reader capability gate. This role is distinct from the
// decision-only operations role and has exactly one SQL EXECUTE privilege.
import {F12_IDENTITY_SQL,F12_FUNCTION_SQL}
 from './table-change-isolated-sql-preflight-candidate.mjs';
import {PENDING_READER_ROLE} from './table-change-pending-reader-candidate.mjs';
export const PENDING_READER_SIGNATURE=
 'sabora.list_pending_table_changes_h6_candidate(uuid)';
const LOGIN=/^[a-z][a-z0-9_]{0,62}$/;
export async function assertPendingReaderCapabilities({pool,expectedLogin}={}){
 if(!pool||typeof pool.connect!=='function'||!LOGIN.test(expectedLogin??'')||
  expectedLogin===PENDING_READER_ROLE)
  throw Error('invalid_pending_reader_capabilities:input');
 let client,valid=false;
 try{
  client=await pool.connect();
  const identity=await client.query(F12_IDENTITY_SQL,[PENDING_READER_ROLE,PENDING_READER_ROLE]);
  const row=identity?.rows?.length===1?identity.rows[0]:null;
  if(!row||row.effective_role!==expectedLogin||row.login_role!==expectedLogin||
   row.can_login!==true||row.inherit_role!==false||row.superuser!==false||
   row.bypass_rls!==false||row.create_db!==false||row.create_role!==false||
   row.replication!==false||row.database_create!==false||row.schema_create!==false||
   row.direct_relations!==false||row.direct_sequences!==false||
   !Array.isArray(row.role_set)||row.role_set.length!==2||
   row.role_set[0]!==true||row.role_set[1]!==true||
   !Array.isArray(row.all_set_roles)||row.all_set_roles.length!==1||
   row.all_set_roles[0]!==PENDING_READER_ROLE)
   throw Error('invalid_pending_reader_capabilities:identity');
  const login=await client.query(F12_FUNCTION_SQL,[expectedLogin]);
  const loginFunctions=login?.rows?.length===1?login.rows[0].names:null;
  if(!Array.isArray(loginFunctions)||loginFunctions.length!==0)
   throw Error('invalid_pending_reader_capabilities:login');
  const capability=await client.query(F12_FUNCTION_SQL,[PENDING_READER_ROLE]);
  const names=capability?.rows?.length===1?capability.rows[0].names:null;
  if(!Array.isArray(names)||names.length!==1||names[0]!==PENDING_READER_SIGNATURE)
   throw Error('invalid_pending_reader_capabilities:function');
  valid=true;
  return Object.freeze({validated:true,login:expectedLogin});
 }catch(error){
  if(error?.message?.startsWith('invalid_pending_reader_capabilities:'))throw error;
  throw Error('invalid_pending_reader_capabilities:query');
 }finally{if(client)try{client.release(!valid);}catch{}}
}
