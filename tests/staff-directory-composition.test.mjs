import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedStaffDirectoryFromPool}
 from '../apps/api/src/staff-directory-composition.mjs';

const row={current_role:'sabora_staff_directory_ci',session_role:'sabora_staff_directory_ci',
 superuser:false,bypass_rls:false,can_login:true,inherits_roles:false,can_create_role:false,
 can_create_db:false,can_replicate:false,schema_usage:true,schema_create:false,database_create:false,
 directory_execute:true,accessible_private_tables:0,accessible_private_sequences:0,
 accessible_definer_routines:1,directory_is_definer:true,
 directory_owner:'sabora_staff_directory_fn_owner',search_path_locked:true,owner_is_sealed:true,
 owner_memberships:0,contact_rls_forced:true,has_role_memberships:false};

test('candidate directory composition preflights before exposing read methods',async()=>{
 let released=false;const pool={connect:async()=>({query:async()=>({rows:[row]}),
  release(){released=true;}})};
 const service=await createVerifiedStaffDirectoryFromPool({pool,role:'sabora_staff_directory_ci',
  issueCapability:()=>{throw Error('unused');}});
 assert.equal(typeof service.list,'function');assert.equal(typeof service.detail,'function');
 assert.equal(typeof service.self,'function');assert.equal(released,true);
});

test('candidate directory composition rejects unsafe SQL identity without a service',async()=>{
 const pool={connect:async()=>({query:async()=>({rows:[{...row,accessible_private_tables:1}]}),
  release(){}})};
 await assert.rejects(createVerifiedStaffDirectoryFromPool({pool,role:'sabora_staff_directory_ci',
  issueCapability:()=>{}}),/staff_directory_sql_identity_rejected/);
});
