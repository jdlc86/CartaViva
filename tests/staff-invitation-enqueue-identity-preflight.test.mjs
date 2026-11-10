import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preflightStaffInvitationEnqueueIdentity,
  STAFF_INVITATION_ENQUEUE_ROUTINE,
} from '../apps/api/src/staff-invitation-enqueue-identity-preflight.mjs';

function pool(overrides = {}) {
  const state = {released: []};
  return {state, async connect() { return {
    async query(sql, parameters) {
      assert.match(sql, /session_user/);
      assert.equal(parameters[0], STAFF_INVITATION_ENQUEUE_ROUTINE);
      return {rows: [{
        current_role: 'staff_enqueue_ci', session_role: 'staff_enqueue_ci',
        superuser: false, bypass_rls: false, can_login: true, inherits_roles: false,
        can_create_role: false, can_create_db: false, can_replicate: false,
        schema_usage: true, schema_create: false, database_create: false,
        integrated_execute: true, lifecycle_execute: false,
        accessible_private_tables: 0, accessible_private_sequences: 0,
        accessible_private_definer_routines: 1, integrated_is_definer: true,
        integrated_owner: 'sabora_staff_invitation_enqueue_fn_owner',
        integrated_search_path_locked: true, enqueue_owner_is_sealed: true,
        enqueue_owner_memberships: 0, enqueue_owner_surface_exact: true,
        enqueue_owner_policies: 3, forced_rls_staff_tables: 5,
        has_role_memberships: false, ...overrides,
      }]};
    },
    release(error) { state.released.push(error); },
  }; }};
}

test('enqueue preflight accepts only the integrated restricted surface', async () => {
  const candidate = pool();
  assert.deepEqual(await preflightStaffInvitationEnqueueIdentity({
    pool: candidate, role: 'staff_enqueue_ci',
  }), {role: 'staff_enqueue_ci'});
  assert.deepEqual(candidate.state.released, [null]);
});

test('enqueue preflight rejects identity, privilege, owner and RLS drift', async () => {
  for (const override of [
    {current_role: 'postgres'}, {session_role: 'postgres'}, {superuser: true},
    {bypass_rls: true}, {inherits_roles: true}, {can_create_role: true},
    {can_create_db: true}, {can_replicate: true}, {schema_usage: false},
    {schema_create: true}, {database_create: true}, {integrated_execute: false},
    {lifecycle_execute: true}, {accessible_private_tables: 1},
    {accessible_private_sequences: 1}, {accessible_private_definer_routines: 2},
    {integrated_is_definer: false}, {integrated_owner: 'postgres'},
    {integrated_search_path_locked: false}, {enqueue_owner_is_sealed: false},
    {enqueue_owner_memberships: 1}, {enqueue_owner_surface_exact: false},
    {enqueue_owner_policies: 2}, {forced_rls_staff_tables: 4},
    {has_role_memberships: true},
  ]) await assert.rejects(preflightStaffInvitationEnqueueIdentity({
    pool: pool(override), role: 'staff_enqueue_ci',
  }), /staff_invitation_enqueue_sql_identity_rejected/);
});

test('enqueue preflight rejects privileged role names before connecting', async () => {
  const candidate = pool();
  for (const role of ['postgres', 'anon', 'authenticated', 'service_role', 'public']) {
    await assert.rejects(preflightStaffInvitationEnqueueIdentity({
      pool: candidate, role,
    }), /invalid_staff_invitation_enqueue_sql_identity/);
  }
  assert.deepEqual(candidate.state.released, []);
});
