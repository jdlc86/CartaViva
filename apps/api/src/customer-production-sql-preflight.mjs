const ROLE=/^[a-z][a-z0-9_]{0,62}$/;
const roles=['sabora_customer_registration_runtime','sabora_customer_session_runtime',
 'sabora_customer_flow_runtime'];
const functions=Object.freeze({
 sabora_customer_registration_runtime:Object.freeze([
  'sabora.register_customer_profile_session_candidate(uuid,text,text,text,uuid,bytea,timestamp with time zone,timestamp with time zone)'
 ]),
 sabora_customer_session_runtime:Object.freeze([
  'sabora.revoke_customer_session_hash(bytea)','sabora.verify_customer_session_hash(bytea)'
 ]),
 sabora_customer_flow_runtime:Object.freeze([
  'sabora.authorize_customer_visit_candidate(bytea,uuid,text,text,text,timestamp with time zone)',
  'sabora.insert_customer_quote_candidate(bytea,uuid,text,text,text,uuid,uuid,bigint,jsonb,timestamp with time zone)',
  'sabora.lookup_customer_order_attempt_candidate(bytea,uuid,text,text,text,text)',
  'sabora.persist_customer_order_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean)',
  'sabora.prepare_customer_confirmation_line_candidate(bytea,uuid,text,text,text,uuid,uuid)',
  'sabora.prepare_customer_quote_candidate(bytea,uuid,text,text,text,uuid)'
 ])
});
export const CUSTOMER_PRODUCTION_PREFLIGHT_SQL=`SELECT current_user AS effective_role,
 session_user AS login_role, r.rolcanlogin AS can_login,r.rolinherit AS inherit_role,
 r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls,r.rolcreatedb AS create_db,
 r.rolcreaterole AS create_role,r.rolreplication AS replication,
 has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
 has_schema_privilege(current_user,'sabora','CREATE') AS schema_create,
 pg_has_role(current_user,$1::name,'SET') AS registration_set,
 pg_has_role(current_user,$2::name,'SET') AS session_set,
 pg_has_role(current_user,$3::name,'SET') AS flow_set,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind IN ('r','p')
   AND has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS direct_relation_access
 ,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind='S'
   AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')) AS direct_sequence_access
 FROM pg_roles r WHERE r.rolname=current_user`;
export const CUSTOMER_PRODUCTION_FUNCTION_PREFLIGHT_SQL=`SELECT
 EXISTS(SELECT 1
  FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
  LEFT JOIN pg_roles grantee ON grantee.oid=acl.grantee
  WHERE acl.privilege_type='EXECUTE'
   AND (acl.grantee=0 OR grantee.rolname=current_user)) AS login_execute,
 has_function_privilege($2::name,p.oid,'EXECUTE') AS capability_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')'=$1`;
export const CUSTOMER_PRODUCTION_EXACT_FUNCTIONS_SQL=`WITH expected(oid) AS (
 SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN unnest($2::text[]) signature
  ON n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')'=signature
), actual(oid) AS (
 SELECT DISTINCT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
 JOIN pg_roles grantee ON grantee.oid=acl.grantee
 WHERE n.nspname='sabora' AND grantee.rolname=$1 AND acl.privilege_type='EXECUTE'
) SELECT NOT EXISTS((SELECT oid FROM actual EXCEPT SELECT oid FROM expected)
 UNION ALL (SELECT oid FROM expected EXCEPT SELECT oid FROM actual)) AS exact`;

function rejected(stage){
 const error=Error(`invalid_customer_production_sql_capabilities:${stage}`);
 error.code='CUSTOMER_PRODUCTION_SQL_CAPABILITIES_REJECTED';
 error.stage=stage;
 return error;
}

async function inspect(pool,expectedLogin,expectedCapability){
 if(!pool||typeof pool.connect!=='function'||!ROLE.test(expectedLogin)||!roles.includes(expectedCapability))
  throw rejected('input');
 let client,valid=false,queryStage='connect';
 try{
   client=await pool.connect();
   if(!client||typeof client.query!=='function'||typeof client.release!=='function')
    throw rejected('client');
   queryStage='identity-query';
   const result=await client.query(CUSTOMER_PRODUCTION_PREFLIGHT_SQL,roles);
   if(!result||!Array.isArray(result.rows)||result.rows.length!==1)
    throw rejected('identity-result');
  const row=result.rows[0];
  const sets=[row.registration_set,row.session_set,row.flow_set];
  if(row.effective_role!==expectedLogin||row.login_role!==expectedLogin||row.can_login!==true||
     row.inherit_role!==false||row.superuser!==false||row.bypass_rls!==false||
     row.create_db!==false||row.create_role!==false||row.replication!==false||
     row.database_create!==false||row.schema_create!==false||row.direct_relation_access!==false||
      row.direct_sequence_access!==false||
      sets.some((value,index)=>value!==(roles[index]===expectedCapability)))
    throw rejected('identity-policy');
   for(const signature of functions[expectedCapability]){
    queryStage='function-query';
    const capability=await client.query(CUSTOMER_PRODUCTION_FUNCTION_PREFLIGHT_SQL,
     [signature,expectedCapability]);
    if(!capability||!Array.isArray(capability.rows)||capability.rows.length!==1||
       capability.rows[0].login_execute!==false||capability.rows[0].capability_execute!==true)
      throw rejected(`function-policy:${expectedCapability}:${capability?.rows?.length??'invalid'}:`+
       `${capability?.rows?.[0]?.login_execute??'missing'}:${capability?.rows?.[0]?.capability_execute??'missing'}`);
  }
   queryStage='function-surface-query';
   const exact=await client.query(CUSTOMER_PRODUCTION_EXACT_FUNCTIONS_SQL,
   [expectedCapability,functions[expectedCapability]]);
   if(!exact||!Array.isArray(exact.rows)||exact.rows.length!==1||exact.rows[0].exact!==true)
    throw rejected('function-surface');
   valid=true;
 }catch(error){
  if(error?.code==='CUSTOMER_PRODUCTION_SQL_CAPABILITIES_REJECTED')throw error;
  throw rejected(`${queryStage}:${typeof error?.code==='string'?error.code:'unknown'}`);
 }
 finally{if(client)try{client.release(!valid);}catch{}}
}

export async function assertCustomerProductionSqlCapabilities({
 registrationPool,sessionPool,flowPool,expectedRegistrationLogin,
 expectedSessionLogin,expectedFlowLogin
}={}){
 if(new Set([registrationPool,sessionPool,flowPool]).size!==3||
     new Set([expectedRegistrationLogin,expectedSessionLogin,expectedFlowLogin]).size!==3)
  throw rejected('isolation');
 await inspect(registrationPool,expectedRegistrationLogin,'sabora_customer_registration_runtime');
 await inspect(sessionPool,expectedSessionLogin,'sabora_customer_session_runtime');
 await inspect(flowPool,expectedFlowLogin,'sabora_customer_flow_runtime');
 return Object.freeze({validated:true});
}
