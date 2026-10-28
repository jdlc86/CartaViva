const ROLE=/^[a-z][a-z0-9_]{0,62}$/;
const ROUTINE='sabora.read_staff_directory_authorized_candidate(text,text,uuid,text,text,uuid,text,integer,integer,bigint,bigint,text)';

function expectedRole(value){
 if(typeof value!=='string'||!ROLE.test(value)||
    ['postgres','anon','authenticated','service_role','public'].includes(value))
  throw Error('invalid_staff_directory_sql_identity');
 return value;
}

export async function preflightStaffDirectoryIdentity({pool,role}={}){
 const expected=expectedRole(role);
 if(!pool||typeof pool.connect!=='function')throw Error('invalid_staff_directory_sql_pool');
 const client=await pool.connect();
 if(!client||typeof client.query!=='function'||typeof client.release!=='function'){
  try{client?.release?.(Error('invalid_staff_directory_sql_client'));}catch{}
  throw Error('invalid_staff_directory_sql_client');
 }
 let discard=null;
 try{
  const result=await client.query(`SELECT current_user::text AS current_role,
   session_user::text AS session_role,role.rolsuper AS superuser,
   role.rolbypassrls AS bypass_rls,role.rolcanlogin AS can_login,
   role.rolinherit AS inherits_roles,role.rolcreaterole AS can_create_role,
   role.rolcreatedb AS can_create_db,role.rolreplication AS can_replicate,
   has_schema_privilege(current_user,'sabora','USAGE') AS schema_usage,
   has_schema_privilege(current_user,'sabora','CREATE') AS schema_create,
   has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
   has_function_privilege(current_user,$1,'EXECUTE') AS directory_execute,
   (SELECT count(*)::integer FROM pg_catalog.pg_class resource
    JOIN pg_catalog.pg_namespace ns ON ns.oid=resource.relnamespace
    WHERE ns.nspname='sabora' AND resource.relkind IN('r','p','v','m','f') AND
     (has_table_privilege(current_user,resource.oid,'SELECT') OR
      has_table_privilege(current_user,resource.oid,'INSERT') OR
      has_table_privilege(current_user,resource.oid,'UPDATE') OR
      has_table_privilege(current_user,resource.oid,'DELETE') OR
      has_table_privilege(current_user,resource.oid,'TRUNCATE') OR
      has_any_column_privilege(current_user,resource.oid,'SELECT') OR
      has_any_column_privilege(current_user,resource.oid,'INSERT') OR
      has_any_column_privilege(current_user,resource.oid,'UPDATE'))) AS accessible_private_tables,
   (SELECT count(*)::integer FROM pg_catalog.pg_class resource
    JOIN pg_catalog.pg_namespace ns ON ns.oid=resource.relnamespace
    WHERE ns.nspname='sabora' AND resource.relkind='S' AND
     (has_sequence_privilege(current_user,resource.oid,'USAGE') OR
      has_sequence_privilege(current_user,resource.oid,'SELECT') OR
      has_sequence_privilege(current_user,resource.oid,'UPDATE'))) AS accessible_private_sequences,
   (SELECT count(*)::integer FROM pg_catalog.pg_proc routine
    JOIN pg_catalog.pg_namespace ns ON ns.oid=routine.pronamespace
    WHERE ns.nspname='sabora' AND routine.prosecdef AND
     has_function_privilege(current_user,routine.oid,'EXECUTE')) AS accessible_definer_routines,
   (SELECT routine.prosecdef FROM pg_catalog.pg_proc routine
    WHERE routine.oid=$1::regprocedure) AS directory_is_definer,
   (SELECT owner.rolname FROM pg_catalog.pg_proc routine
    JOIN pg_catalog.pg_roles owner ON owner.oid=routine.proowner
    WHERE routine.oid=$1::regprocedure) AS directory_owner,
   (SELECT routine.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
    FROM pg_catalog.pg_proc routine WHERE routine.oid=$1::regprocedure) AS search_path_locked,
   (SELECT NOT owner.rolcanlogin AND NOT owner.rolinherit AND NOT owner.rolsuper AND
      NOT owner.rolbypassrls AND NOT owner.rolcreatedb AND NOT owner.rolcreaterole AND
      NOT owner.rolreplication FROM pg_catalog.pg_roles owner
    WHERE owner.rolname='sabora_staff_directory_fn_owner') AS owner_is_sealed,
   (SELECT count(*)::integer FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles owner ON owner.oid=membership.roleid OR owner.oid=membership.member
    WHERE owner.rolname='sabora_staff_directory_fn_owner') AS owner_memberships,
   (SELECT resource.relrowsecurity AND resource.relforcerowsecurity
    FROM pg_catalog.pg_class resource JOIN pg_catalog.pg_namespace ns ON ns.oid=resource.relnamespace
    WHERE ns.nspname='sabora' AND resource.relname='staff_directory_contacts') AS contact_rls_forced,
   EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members membership
    WHERE membership.member=role.oid) AS has_role_memberships
   FROM pg_catalog.pg_roles role WHERE role.rolname=current_user`,[ROUTINE]);
  if(!Array.isArray(result?.rows)||result.rows.length!==1)
   throw Error('staff_directory_sql_identity_rejected');
  const row=result.rows[0];
  if(row.current_role!==expected||row.session_role!==expected||row.superuser!==false||
     row.bypass_rls!==false||row.can_login!==true||row.inherits_roles!==false||
     row.can_create_role!==false||row.can_create_db!==false||row.can_replicate!==false||
     row.schema_usage!==true||row.schema_create!==false||row.database_create!==false||
     row.directory_execute!==true||row.accessible_private_tables!==0||
     row.accessible_private_sequences!==0||row.accessible_definer_routines!==1||
     row.directory_is_definer!==true||row.directory_owner!=='sabora_staff_directory_fn_owner'||
     row.search_path_locked!==true||row.owner_is_sealed!==true||row.owner_memberships!==0||
     row.contact_rls_forced!==true||row.has_role_memberships!==false)
   throw Error('staff_directory_sql_identity_rejected');
  return Object.freeze({role:expected});
 }catch(error){discard=error;throw error;}finally{client.release(discard);}
}

export const STAFF_DIRECTORY_READ_ROUTINE=ROUTINE;
