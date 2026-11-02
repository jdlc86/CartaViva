// F12 candidate-only SQL identity gate. No role creation, grants or live calls.
// A successful check is necessary but not sufficient for an authorized cutover.
const ROLES=Object.freeze({
 sabora_f12_customer_runtime:'sabora.request_customer_table_change_h6_resolved_candidate(bytea)',
 sabora_f12_operations_runtime:'sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)'
});
const LOGIN=/^[a-z][a-z0-9_]{0,62}$/;
export const F12_IDENTITY_SQL=`SELECT current_user AS effective_role,session_user AS login_role,
 r.rolcanlogin AS can_login,r.rolinherit AS inherit_role,
 r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls,
 r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,
 r.rolreplication AS replication,
 has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
 has_schema_privilege(current_user,'sabora','CREATE') AS schema_create,
 ARRAY[pg_has_role(current_user,$1::name,'SET'),
       pg_has_role(current_user,$2::name,'SET')] AS role_set,
 (SELECT coalesce(array_agg(other.rolname::text ORDER BY other.rolname::text),
  '{}'::text[]) FROM pg_roles other
  WHERE other.rolname<>current_user AND
   pg_has_role(current_user,other.oid,'SET')) AS all_set_roles,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind IN ('r','p') AND
  has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS direct_relations,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind='S' AND
  has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')) AS direct_sequences
 FROM pg_roles r WHERE r.rolname=current_user`;
// Inspect both capability and LOGIN effective privileges: direct grants,
// PUBLIC and inherited grants must not bypass SET LOCAL ROLE.
export const F12_FUNCTION_SQL=`SELECT coalesce(array_agg(n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')'||')'
 ORDER BY p.oid),'{}'::text[]) AS names
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND
 has_function_privilege($1::name,p.oid,'EXECUTE')`;
const fail=stage=>Object.assign(Error('invalid_f12_sql_capabilities:'+stage),
 {code:'F12_SQL_CAPABILITIES_REJECTED',stage});
export async function assertF12SqlIdentity({pool,expectedLogin,capability}={}){
 if(!pool||typeof pool.connect!=='function'||!LOGIN.test(expectedLogin??'')||
  !Object.hasOwn(ROLES,capability))throw fail('input');
 let client,valid=false;
 try{
  client=await pool.connect();
  const identity=await client.query(F12_IDENTITY_SQL,Object.keys(ROLES));
  const row=identity?.rows?.length===1?identity.rows[0]:null;
  const expectedSets=Object.keys(ROLES).map(role=>role===capability);
  if(!row||row.effective_role!==expectedLogin||row.login_role!==expectedLogin||
   row.can_login!==true||row.inherit_role!==false||row.superuser!==false||
   row.bypass_rls!==false||row.create_db!==false||row.create_role!==false||
   row.replication!==false||row.database_create!==false||row.schema_create!==false||
   row.direct_relations!==false||row.direct_sequences!==false||
   !Array.isArray(row.role_set)||row.role_set.length!==expectedSets.length||
   row.role_set.some((value,index)=>value!==expectedSets[index])||
   !Array.isArray(row.all_set_roles)||row.all_set_roles.length!==1||
   row.all_set_roles[0]!==capability)throw fail('identity-policy');
  const surface=await client.query(F12_FUNCTION_SQL,[capability]);
  const actual=surface?.rows?.length===1?surface.rows[0].names:null;
  if(!Array.isArray(actual)||actual.length!==1||actual[0]!==ROLES[capability])
   throw fail('function-surface');
  // The login must not execute *any* Sabora RPC before SET LOCAL ROLE.
  // NOINHERIT alone is insufficient if PUBLIC or direct grants exist.
  const loginSurface=await client.query(F12_FUNCTION_SQL,[expectedLogin]);
  const loginFunctions=loginSurface?.rows?.length===1?loginSurface.rows[0].names:null;
  if(!Array.isArray(loginFunctions)||loginFunctions.length!==0)
   throw fail('login-function-surface');
  valid=true;
  return Object.freeze({validated:true,capability,login:expectedLogin});
 }catch(error){if(error?.code==='F12_SQL_CAPABILITIES_REJECTED')throw error;
  throw fail('query');
 }finally{if(client)try{client.release(!valid);}catch{}}
}
export async function assertF12SqlCapabilities({customerPool,operationsPool,
 expectedCustomerLogin,expectedOperationsLogin}={}){
 if(!customerPool||!operationsPool||customerPool===operationsPool||
  expectedCustomerLogin===expectedOperationsLogin)throw fail('isolation');
 await assertF12SqlIdentity({pool:customerPool,expectedLogin:expectedCustomerLogin,
  capability:'sabora_f12_customer_runtime'});
 await assertF12SqlIdentity({pool:operationsPool,expectedLogin:expectedOperationsLogin,
  capability:'sabora_f12_operations_runtime'});
 return Object.freeze({validated:true});
}
