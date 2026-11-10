import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createVerifiedStaffLifecycleFromPool} from '../apps/api/src/staff-lifecycle-composition.mjs';

const issuer = {
  issueCapability: () => ({}),
  issueInvitationToken: () => 'token',
  hashInviteeEmail: () => 'hash',
  verifyCredentialRegistration: async () => new Uint8Array(32),
  uuid: () => '30000000-0000-4000-8000-000000000003',
};

test('missing issuer dependencies fail before SQL connection or route registration', async () => {
  let connections = 0;
  const pool = {connect() {connections++; throw Error('should_not_connect');}};
  for (const missing of Object.keys(issuer)) {
    const options = {...issuer, pool, role: 'staff_lifecycle_ci'};
    delete options[missing];
    await assert.rejects(createVerifiedStaffLifecycleFromPool(options),
      /invalid_staff_lifecycle_composition/);
  }
  assert.equal(connections, 0);
});

test('invalid SQL role rejects before opening a connection', async () => {
  let connections = 0;
  const pool = {connect() {connections++; throw Error('should_not_connect');}};
  await assert.rejects(createVerifiedStaffLifecycleFromPool({
    ...issuer, pool, role: 'postgres',
  }), /invalid_staff_lifecycle_sql_identity/);
  assert.equal(connections, 0);
});

test('failed SQL preflight does not expose a coordinator', async () => {
  let releases = 0;
  const pool = {async connect() {return {
    async query() {return {rows: []};},
    release() {releases++;},
  };}};
  await assert.rejects(createVerifiedStaffLifecycleFromPool({
    ...issuer, pool, role: 'staff_lifecycle_ci',
  }), /staff_lifecycle_sql_identity_rejected/);
  assert.equal(releases, 1);
});

test('candidate composition cannot be mounted implicitly by the runtime server', async () => {
  const server = await readFile(new URL('../apps/api/src/server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /staff-lifecycle-composition|createVerifiedStaffLifecycleFromPool/);
});
