import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightStaffDirectoryIdentity,STAFF_DIRECTORY_READ_ROUTINE}
 from '../apps/api/src/staff-directory-identity-preflight.mjs';

const valid={current_role:'sabora_staff_directory_ci',session_role:'sabora_staff_directory_ci',
 superuser:false,bypass_rls:false,can_login:true,inherits_roles:false,can_create_role:false,
 can_create_db:false,can_replicate:false,schema_usage:true,schema_create:false,database_create:false,
 directory_execute:true,accessible_private_tables:0,accessible_private_sequences:0,
 accessible_definer_routines:1,directory_is_definer:true,
 directory_owner:'sabora_staff_directory_fn_owner',search_path_locked:true,owner_is_sealed:true,
 owner_memberships:0,contact_rls_forced:true,has_role_memberships:false};
const pool=(row=valid)=>({connect:async()=>({query:async(sql,values)=>{
 assert.match(sql,/accessible_private_tables/);assert.deepEqual(values,[STAFF_DIRECTORY_READ_ROUTINE]);
 return {rows:[row]};},release(){}})});

test('directory preflight accepts only the exact restricted login',async()=>{
 assert.deepEqual(await preflightStaffDirectoryIdentity({pool:pool(),role:'sabora_staff_directory_ci'}),
  {role:'sabora_staff_directory_ci'});
});

test('directory preflight rejects privilege, identity, RLS and owner drift',async()=>{
 for(const change of [{superuser:true},{accessible_private_tables:1},{accessible_definer_routines:2},
  {contact_rls_forced:false},{owner_memberships:1},{current_role:'other'}])
  await assert.rejects(preflightStaffDirectoryIdentity({pool:pool({...valid,...change}),
   role:'sabora_staff_directory_ci'}),/staff_directory_sql_identity_rejected/);
 await assert.rejects(preflightStaffDirectoryIdentity({pool:pool(),role:'postgres'}),
  /invalid_staff_directory_sql_identity/);
});
