import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightStaffLifecycleIdentity} from '../apps/api/src/staff-lifecycle-identity-preflight.mjs';

function pool(overrides = {}) {
  const state = {released: []};
  return {state, async connect() { return {
    async query(sql) {
      assert.match(sql, /session_user/);
      assert.match(sql, /transition_staff_lifecycle_authorized_candidate/);
      return {rows: [{
        current_role: 'staff_lifecycle_ci', session_role: 'staff_lifecycle_ci',
        superuser: false, bypass_rls: false, can_login: true, inherits_roles: false,
        can_create_role: false, can_create_db: false, can_replicate: false,
        schema_usage: true, schema_create: false, database_create: false,
        lifecycle_execute: true, accessible_private_tables: 0,
        accessible_private_sequences: 0, accessible_private_definer_routines: 1,
        lifecycle_is_definer: true, lifecycle_owner: 'sabora_staff_lifecycle_fn_owner',
        lifecycle_search_path_locked: true, lifecycle_owner_is_sealed: true,
        lifecycle_owner_memberships: 0, forced_rls_lifecycle_tables: 4,
        has_role_memberships: false, ...overrides,
      }]};
    }, release(error) { state.released.push(error); },
  }; }};
}

test('staff lifecycle preflight accepts only its sealed wrapper surface', async () => {
  const candidate = pool();
  assert.deepEqual(await preflightStaffLifecycleIdentity({
    pool: candidate, role: 'staff_lifecycle_ci',
  }), {role: 'staff_lifecycle_ci'});
  assert.deepEqual(candidate.state.released, [null]);
});
test('staff lifecycle preflight rejects privilege, identity and RLS drift', async () => {
  for (const override of [
    {current_role: 'postgres'}, {session_role: 'postgres'}, {superuser: true},
    {bypass_rls: true}, {inherits_roles: true}, {can_create_role: true},
    {can_create_db: true}, {database_create: true}, {schema_create: true},
    {lifecycle_execute: false}, {accessible_private_tables: 1},
    {accessible_private_sequences: 1}, {accessible_private_definer_routines: 2},
    {lifecycle_is_definer: false}, {lifecycle_owner: 'postgres'},
    {lifecycle_search_path_locked: false}, {lifecycle_owner_is_sealed: false},
    {lifecycle_owner_memberships: 1}, {forced_rls_lifecycle_tables: 3},
    {has_role_memberships: true},
  ]) await assert.rejects(preflightStaffLifecycleIdentity({
    pool: pool(override), role: 'staff_lifecycle_ci',
  }), /staff_lifecycle_sql_identity_rejected/);
});
