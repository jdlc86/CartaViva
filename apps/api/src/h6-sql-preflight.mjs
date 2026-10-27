const ROLE=/^[a-z][a-z0-9_]{0,62}$/;
const CAPABILITIES=Object.freeze({
 sabora_h6_customer_runtime:Object.freeze([
  'confirm_customer_round_h6_candidate','read_customer_payment_policy_h6_candidate',
  'read_customer_round_h6_candidate','read_customer_event_backlog_h6_candidate'
 ]),
 sabora_h6_provider_runtime:Object.freeze([
  'record_h6_authorization_outcome_candidate','request_h6_capture_dispatch_candidate',
  'record_h6_capture_outcome_candidate','record_h6_capture_compensation_candidate',
  'ingest_stripe_webhook_h6_candidate','record_h6_refund_outcome_candidate',
  'request_h6_refund_candidate','request_h6_release_candidate','record_h6_release_outcome_candidate'
 ]),
 sabora_h6_operations_runtime:Object.freeze([
  'acknowledge_kitchen_dispatch_h6_candidate','report_h6_incident_authorized_candidate',
  'resolve_h6_incident_authorized_candidate','settle_h6_account_cash_authorized_candidate',
  'refund_h6_cash_authorized_candidate','read_staff_event_backlog_h6_candidate',
  'manage_pickup_task_h6_candidate'
 ])
});
const ROLES=Object.freeze(Object.keys(CAPABILITIES));

export const H6_IDENTITY_PREFLIGHT_SQL=`SELECT current_user AS effective_role,session_user AS login_role,
 r.rolcanlogin AS can_login,r.rolinherit AS inherit_role,r.rolsuper AS superuser,
 r.rolbypassrls AS bypass_rls,r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,
 r.rolreplication AS replication,has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
 has_schema_privilege(current_user,'sabora','CREATE') AS schema_create,
 ARRAY[pg_has_role(current_user,$1::name,'SET'),pg_has_role(current_user,$2::name,'SET'),
  pg_has_role(current_user,$3::name,'SET')] AS role_set,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind IN ('r','p')
   AND has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS direct_relations,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind='S'
   AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')) AS direct_sequences
 FROM pg_roles r WHERE r.rolname=current_user`;
export const H6_FUNCTION_SURFACE_PREFLIGHT_SQL=`SELECT coalesce(array_agg(p.proname::text ORDER BY p.proname::text)
 FILTER(WHERE p.proname IS NOT NULL),'{}'::text[]) AS names
 FROM pg_roles role
 LEFT JOIN LATERAL (
  SELECT DISTINCT proc.proname FROM pg_proc proc JOIN pg_namespace n ON n.oid=proc.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(proc.proacl,acldefault('f',proc.proowner))) acl
  WHERE n.nspname='sabora' AND acl.grantee=role.oid AND acl.privilege_type='EXECUTE'
 ) p ON true WHERE role.rolname=$1`;

function rejected(stage){const error=Error(`invalid_h6_sql_capabilities:${stage}`);
 error.code='H6_SQL_CAPABILITIES_REJECTED';error.stage=stage;return error;}

export async function assertH6RuntimeIdentity({pool,expectedLogin,capability}={}){
 if(!pool||typeof pool.connect!=='function'||!ROLE.test(expectedLogin??'')||!CAPABILITIES[capability])
  throw rejected('input');
 let client,valid=false;
 try{
  client=await pool.connect();
  const identity=await client.query(H6_IDENTITY_PREFLIGHT_SQL,ROLES);
  const row=identity?.rows?.length===1?identity.rows[0]:null;
  const expectedSets=ROLES.map(role=>role===capability);
  if(!row||row.effective_role!==expectedLogin||row.login_role!==expectedLogin||row.can_login!==true||
     row.inherit_role!==false||row.superuser!==false||row.bypass_rls!==false||row.create_db!==false||
     row.create_role!==false||row.replication!==false||row.database_create!==false||row.schema_create!==false||
     row.direct_relations!==false||row.direct_sequences!==false||
     !Array.isArray(row.role_set)||row.role_set.some((value,index)=>value!==expectedSets[index]))
   throw rejected('identity-policy');
  const functions=await client.query(H6_FUNCTION_SURFACE_PREFLIGHT_SQL,[capability]);
  const actual=functions?.rows?.length===1?functions.rows[0].names:null;
  const expected=[...CAPABILITIES[capability]].sort();
  const normalized=Array.isArray(actual)?[...actual].sort():null;
  if(!normalized||normalized.length!==expected.length||normalized.some((name,index)=>name!==expected[index]))
   throw rejected(`function-surface:${capability}`);
  valid=true;return Object.freeze({validated:true,login:expectedLogin,capability});
 }catch(error){if(error?.code==='H6_SQL_CAPABILITIES_REJECTED')throw error;
  throw rejected(`query:${typeof error?.code==='string'?error.code:'unknown'}`);
 }finally{if(client)try{client.release(!valid);}catch{}}
}

export async function assertH6SqlCapabilities({customerPool,providerPool,operationsPool,
 expectedCustomerLogin,expectedProviderLogin,expectedOperationsLogin}={}){
 if(new Set([customerPool,providerPool,operationsPool]).size!==3||
    new Set([expectedCustomerLogin,expectedProviderLogin,expectedOperationsLogin]).size!==3)
  throw rejected('isolation');
 await assertH6RuntimeIdentity({pool:customerPool,expectedLogin:expectedCustomerLogin,
  capability:'sabora_h6_customer_runtime'});
 await assertH6RuntimeIdentity({pool:providerPool,expectedLogin:expectedProviderLogin,
  capability:'sabora_h6_provider_runtime'});
 await assertH6RuntimeIdentity({pool:operationsPool,expectedLogin:expectedOperationsLogin,
  capability:'sabora_h6_operations_runtime'});
 return Object.freeze({validated:true});
}
