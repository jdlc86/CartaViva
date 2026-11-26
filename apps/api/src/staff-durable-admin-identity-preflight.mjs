import {CV005_BOOTSTRAP_GRANT} from './order-operations-identity-preflight.mjs';

const ROLE=/^[a-z][a-z0-9_]{0,62}$/;
const ROUTINES=Object.freeze([
 ['sabora.transition_staff_lifecycle_with_directory_outbox_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text)','sabora_staff_invitation_enqueue_fn_owner'],
 ['sabora.store_staff_invitation_custody_restricted_candidate(uuid,uuid,integer,text,text,text,text,text)','sabora_staff_custody_fn_owner'],
 ['sabora.resolve_staff_admin_subject_candidate(text,uuid,uuid,text,text,bigint,bigint,text)','sabora_staff_lifecycle_fn_owner']
]);
const TABLES=['staff_enrollments','staff_lifecycle_requests','staff_lifecycle_audit','staff_lifecycle_signing_keys',
 'staff_employee_code_pool','staff_employee_code_events','staff_identity_requests','staff_code_maintenance_requests',
 'staff_directory_contacts','staff_invitation_outbox','staff_invitation_custody_candidate','staff_members','admin_write_ownership','staff_registration_receipts_candidate'];
const FIRST_LOGIN='sabora_staff_first_admin_login';
const rejected=()=>Error('staff_durable_admin_sql_identity_rejected');

// The physical login can execute exactly the three fenced routines, not
// the underlying directory writer or legacy token/custody entry points.
export async function preflightStaffDurableAdminIdentity({pool,role,firstAdminBootstrapOnly=false}={}){
 if(typeof firstAdminBootstrapOnly!=='boolean'||(role===FIRST_LOGIN)!==firstAdminBootstrapOnly||
    !ROLE.test(role??'')||['postgres','anon','authenticated','service_role','public','sabora_staff_enrollment_login'].includes(role)||
    typeof pool?.connect!=='function')throw rejected();
 const routines=firstAdminBootstrapOnly?ROUTINES.map(([signature,owner])=>[signature.replace('resolve_staff_admin_subject_candidate','resolve_staff_first_admin_subject_candidate'),owner]):ROUTINES;
 const tables=firstAdminBootstrapOnly?[...TABLES,'root_bootstrap_receipt','admin_ownership_audit']:TABLES;
 let client,discard;
 try{
  client=await pool.connect();
  if(typeof client?.query!=='function'||typeof client?.release!=='function')throw rejected();
  const result=await client.query(`SELECT current_user::text AS effective_role,session_user::text AS login_role,
   r.rolcanlogin AND NOT (r.rolsuper OR r.rolinherit OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication) AS restricted,
   has_schema_privilege(current_user,'sabora','USAGE') AND NOT has_schema_privilege(current_user,'sabora','CREATE')
    AND NOT has_database_privilege(current_user,current_database(),'CREATE') AS schema_safe,
   NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid) AS no_memberships,
   NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='sabora' AND c.relkind IN('r','p','v','m','f') AND
    (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AS no_relations,
   NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='sabora' AND c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')) AS no_sequences,
   (SELECT count(*)::integer FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='sabora' AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS routines,
   (SELECT count(*)::integer FROM unnest($1::text[],$2::text[]) AS expected(signature,owner_name)
    JOIN pg_catalog.pg_proc p ON p.oid=to_regprocedure(expected.signature)
    JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
    WHERE owner.rolname=expected.owner_name AND p.prosecdef
    AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
    AND NOT (owner.rolcanlogin OR owner.rolsuper OR owner.rolinherit OR owner.rolbypassrls OR
      owner.rolcreaterole OR owner.rolcreatedb OR owner.rolreplication)
    AND NOT has_schema_privilege(owner.oid,'sabora','CREATE')
    AND has_function_privilege(current_user,p.oid,'EXECUTE')
    AND NOT has_function_privilege(current_user,p.oid,'EXECUTE WITH GRANT OPTION')
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members membership
      WHERE (membership.roleid=owner.oid OR membership.member=owner.oid)
      AND NOT (membership.roleid=owner.oid AND (${CV005_BOOTSTRAP_GRANT})))) AS safe_routines,
   (SELECT count(*)::integer FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='sabora' AND c.relname=ANY($3::text[]) AND c.relkind IN('r','p')
    AND c.relrowsecurity AND c.relforcerowsecurity) AS forced_tables,
   EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid='sabora.staff_invitation_outbox'::regclass
    AND t.tgname='staff_invitation_custody_required' AND t.tgdeferrable AND t.tginitdeferred
    AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal) AS custody_guard
   FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`,
   [routines.map(r=>r[0]),routines.map(r=>r[1]),tables]);
  const row=result?.rows?.[0];
  if(result?.rows?.length!==1||row?.effective_role!==role||row.login_role!==role||
    !['restricted','schema_safe','no_memberships','no_relations','no_sequences','custody_guard'].every(key=>row[key]===true)||
    row.routines!==routines.length||row.safe_routines!==routines.length||row.forced_tables!==tables.length)throw rejected();
  return Object.freeze({role});
 }catch(error){discard=error;throw rejected();}
 finally{if(typeof client?.release==='function')client.release(discard);}
}
