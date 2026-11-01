// B3 transfer-confirmation identity gate. Candidate only: no grants, role creation,
// HTTP mounting or production pool reuse. Requires a dedicated least-privilege login.
const ROLE='sabora_b3_confirmation_runtime';
const SIGNATURE='sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
const LOGIN=/^[a-z][a-z0-9_]{0,62}$/;
export const B3_CONFIRMATION_IDENTITY_SQL=`SELECT current_user AS effective_role,
 session_user AS login_role,r.rolcanlogin AS can_login,r.rolinherit AS inherit_role,
 r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls,
 r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,
 r.rolreplication AS replication,
 has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
 has_schema_privilege(current_user,'sabora','CREATE') AS schema_create,
 pg_has_role(current_user,$1::name,'SET') AS can_set_confirmation,
 (SELECT coalesce(array_agg(other.rolname::text ORDER BY other.rolname::text),
  '{}'::text[]) FROM pg_roles other
  WHERE other.rolname<>current_user AND
   pg_has_role(current_user,other.oid,'SET')) AS all_set_roles,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind IN ('r','p') AND
  CASE WHEN c.relkind IN ('r','p') THEN
   has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   ELSE false END) AS direct_relations,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind='S' AND
  CASE WHEN c.relkind='S' THEN
   has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')
   ELSE false END) AS direct_sequences
 FROM pg_roles r WHERE r.rolname=current_user`;
export const B3_CONFIRMATION_FUNCTION_SQL=`SELECT coalesce(array_agg(n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')'
 ORDER BY p.oid),'{}'::text[]) AS names
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND
 has_function_privilege($1::name,p.oid,'EXECUTE')`;
const fail=stage=>Object.assign(Error('invalid_b3_confirmation_capabilities:'+stage),
 {code:'B3_CONFIRMATION_CAPABILITIES_REJECTED',stage});
export async function assertB3ConfirmationCapabilities({pool,expectedLogin}={}){
 if(!pool||typeof pool.connect!=='function'||!LOGIN.test(expectedLogin??'')||
  expectedLogin===ROLE)throw fail('input');
 let client,valid=false;
 try{
  client=await pool.connect();
  const result=await client.query(B3_CONFIRMATION_IDENTITY_SQL,[ROLE]);
  const row=result?.rows?.length===1?result.rows[0]:null;
  if(!row||row.effective_role!==expectedLogin||row.login_role!==expectedLogin||
   row.can_login!==true||row.inherit_role!==false||row.superuser!==false||
   row.bypass_rls!==false||row.create_db!==false||row.create_role!==false||
   row.replication!==false||row.database_create!==false||row.schema_create!==false||
   row.can_set_confirmation!==true||row.direct_relations!==false||
   row.direct_sequences!==false||
   !Array.isArray(row.all_set_roles)||row.all_set_roles.length!==1||
   row.all_set_roles[0]!==ROLE)throw fail('identity-policy');
  const capability=await client.query(B3_CONFIRMATION_FUNCTION_SQL,[ROLE]);
  const names=capability?.rows?.length===1?capability.rows[0].names:null;
  if(!Array.isArray(names)||names.length!==1||names[0]!==SIGNATURE)
   throw fail('function-surface');
  const login=await client.query(B3_CONFIRMATION_FUNCTION_SQL,[expectedLogin]);
  const loginNames=login?.rows?.length===1?login.rows[0].names:null;
  if(!Array.isArray(loginNames)||loginNames.length!==0)
   throw fail('login-function-surface');
  valid=true;
  return Object.freeze({validated:true,login:expectedLogin,capability:ROLE});
 }catch(error){
  if(error?.code==='B3_CONFIRMATION_CAPABILITIES_REJECTED')throw error;
  throw fail('query');
 }finally{if(client)try{client.release(!valid);}catch{}}
}
