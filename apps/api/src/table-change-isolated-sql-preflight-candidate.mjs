// F12 candidate-only SQL identity gate. No role creation, grants or live calls.
// A successful check is necessary but not sufficient for an authorized cutover.
const ROLES=Object.freeze({
 sabora_f12_customer_runtime:'request_customer_table_change_h6_resolved_candidate',
 sabora_f12_operations_runtime:'decide_customer_table_change_h6_candidate'
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
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind IN ('r','p') AND
  has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS direct_relations,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind='S' AND
  has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')) AS direct_sequences
 FROM pg_roles r WHERE r.rolname=current_user`;
export const F12_FUNCTION_SQL=`SELECT coalesce(array_agg(p.proname::text ORDER BY p.proname::text)
 FILTER(WHERE p.proname IS NOT NULL),'{}'::text[]) AS names
 FROM pg_roles role LEFT JOIN LATERAL (
 SELECT DISTINCT proc.proname FROM pg_proc proc
 JOIN pg_namespace n ON n.oid=proc.pronamespace
 CROSS JOIN LATERAL aclexplode(COALESCE(proc.proacl,acldefault('f',proc.proowner))) acl
 WHERE n.nspname='sabora' AND acl.grantee=role.oid AND acl.privilege_type='EXECUTE'
 ) p ON true WHERE role.rolname=$1`;
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
   row.role_set.some((value,index)=>value!==expectedSets[index]))throw fail('identity-policy');
  const surface=await client.query(F12_FUNCTION_SQL,[capability]);
  const actual=surface?.rows?.length===1?surface.rows[0].names:null;
  if(!Array.isArray(actual)||actual.length!==1||actual[0]!==ROLES[capability])
   throw fail('function-surface');
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
