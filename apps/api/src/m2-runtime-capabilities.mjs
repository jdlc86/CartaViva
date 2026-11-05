const LOGIN=/^[a-z][a-z0-9_]{0,62}$/;

export const M2_CUSTOMER_EVENT_ROLE='sabora_m2_customer_event_runtime';
export const M2_ACCOUNT_CLOSE_ROLE='sabora_h6_account_close_runtime';
export const M2_H4_OPERATIONS_ROLE='sabora_b3_h4_transition_runtime';
export const M2_CUSTOMER_EVENT_SIGNATURE=
 'sabora.read_customer_event_backlog_h6_candidate(bytea,uuid,text,uuid,bigint,integer)';
export const M2_ACCOUNT_CLOSE_SIGNATURE=
 'sabora.close_h6_account_authorized_candidate(text,text,uuid,text,uuid,text,bigint,bigint,text)';
export const M2_H4_OPERATIONS_SIGNATURES=Object.freeze([
 'sabora.read_order_operations_delivery_pickup_board_h6_candidate(text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)',
 'sabora.read_order_operations_history_authorized_candidate(text,text,uuid,text,uuid,integer,bigint,bigint,text)',
 'sabora.transition_order_line_authorized_candidate(text,text,uuid,uuid,text,text,bigint,bigint,text)'
]);

export const M2_RUNTIME_IDENTITY_SQL=`SELECT current_user AS effective_role,
 session_user AS login_role,r.rolcanlogin AS can_login,r.rolinherit AS inherit_role,
 r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls,r.rolcreatedb AS create_db,
 r.rolcreaterole AS create_role,r.rolreplication AS replication,
 has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
 has_schema_privilege(current_user,'sabora','CREATE') AS schema_create,
 (SELECT coalesce(array_agg(other.rolname::text ORDER BY other.rolname::text),'{}'::text[])
  FROM pg_roles other WHERE other.rolname<>current_user AND
   pg_has_role(current_user,other.oid,'SET')) AS set_roles,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind IN ('r','p') AND
   has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS direct_relations,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sabora' AND c.relkind='S' AND
   has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')) AS direct_sequences
 FROM pg_roles r WHERE r.rolname=current_user`;

export const M2_RUNTIME_FUNCTIONS_SQL=`SELECT coalesce(array_agg(
 p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text),'{}'::text[]) AS names
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND has_function_privilege($1::name,p.oid,'EXECUTE')`;

function rejected(stage){
 const error=Error('invalid_m2_runtime_capability:'+stage);
 error.code='M2_RUNTIME_CAPABILITY_REJECTED';error.stage=stage;return error;
}

async function assertM2ExactFunctionCapability({pool,expectedLogin,role,signatures}={}){
 if(!pool||typeof pool.connect!=='function'||!LOGIN.test(expectedLogin??'')||
    ![M2_CUSTOMER_EVENT_ROLE,M2_ACCOUNT_CLOSE_ROLE,M2_H4_OPERATIONS_ROLE].includes(role)||
    !Array.isArray(signatures)||signatures.length===0||
    signatures.some(value=>typeof value!=='string'))throw rejected('input');
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
  const capability=await client.query(M2_RUNTIME_FUNCTIONS_SQL,[role]);
  const names=capability?.rows?.length===1?capability.rows[0].names:null;
  const expected=[...signatures].sort();
  if(!Array.isArray(names)||names.length!==expected.length||
     names.some((name,index)=>name!==expected[index]))
   throw rejected('function-surface');
  const login=await client.query(M2_RUNTIME_FUNCTIONS_SQL,[expectedLogin]);
  const loginNames=login?.rows?.length===1?login.rows[0].names:null;
  if(!Array.isArray(loginNames)||loginNames.length!==0)
   throw rejected('login-function-surface');
  valid=true;return Object.freeze({validated:true,login:expectedLogin,capability:role});
 }catch(error){
  if(error?.code==='M2_RUNTIME_CAPABILITY_REJECTED')throw error;
  throw rejected('query');
 }finally{if(client)try{client.release(!valid);}catch{}}
}

export async function assertM2SingleFunctionCapability({pool,expectedLogin,role,signature}={}){
 const expected=role===M2_CUSTOMER_EVENT_ROLE?M2_CUSTOMER_EVENT_SIGNATURE:
  role===M2_ACCOUNT_CLOSE_ROLE?M2_ACCOUNT_CLOSE_SIGNATURE:null;
 if(signature!==expected)throw rejected('input');
 return assertM2ExactFunctionCapability({pool,expectedLogin,role,signatures:[signature]});
}

export const assertM2CustomerEventCapability=options=>assertM2SingleFunctionCapability({
 ...options,role:M2_CUSTOMER_EVENT_ROLE,signature:M2_CUSTOMER_EVENT_SIGNATURE
});
export const assertM2AccountCloseCapability=options=>assertM2SingleFunctionCapability({
 ...options,role:M2_ACCOUNT_CLOSE_ROLE,signature:M2_ACCOUNT_CLOSE_SIGNATURE
});
export const assertM2H4OperationsCapability=options=>assertM2ExactFunctionCapability({
 ...options,role:M2_H4_OPERATIONS_ROLE,signatures:M2_H4_OPERATIONS_SIGNATURES
});
