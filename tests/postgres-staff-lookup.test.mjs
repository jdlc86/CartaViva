import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresStaffLookup } from '../apps/api/src/postgres-staff-lookup.mjs';

const uid = '00000000-0000-0000-0000-000000000101';
test('queries durable staff membership using a positional parameter', async () => {
  const calls = [];
  const lookup = createPostgresStaffLookup({ query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [{ role: 'kitchen', state: 'active' }] };
  } });
  assert.deepEqual(await lookup(uid), { role: 'kitchen', state: 'active' });
  assert.deepEqual(calls, [{ sql: 'select role, state from sabora.staff_members where user_id = $1', values: [uid] }]);
});
test('returns null for absent staff and preserves nonactive state', async () => {
  const missing = createPostgresStaffLookup({ query: async () => ({ rows: [] }) });
  assert.equal(await missing(uid), null);
  const revoked = createPostgresStaffLookup({ query: async () => ({ rows: [{ role: 'admin', state: 'revoked' }] }) });
  assert.deepEqual(await revoked(uid), { role: 'admin', state: 'revoked' });
});
test('rejects invalid identities, malformed results and unexpected roles', async () => {
  const lookup = createPostgresStaffLookup({ query: async () => ({ rows: [{ role: 'superuser', state: 'active' }] }) });
  await assert.rejects(lookup(uid), /invalid_staff_membership/);
  await assert.rejects(lookup("x' OR true --"), /invalid_verified_user_id/);
  const malformed = createPostgresStaffLookup({ query: async () => ({ rows: [{ role: 'admin', state: 'active' }, { role: 'admin', state: 'active' }] }) });
  await assert.rejects(malformed(uid), /invalid_staff_lookup_result/);
});
test('database errors propagate for upstream 503 fail-closed response', async () => {
  const lookup = createPostgresStaffLookup({ query: async () => { throw new Error('db-down'); } });
  await assert.rejects(lookup(uid), /db-down/);
});

test('accepts active ROOT from the durable staff table', async () => {
  const lookup = createPostgresStaffLookup({ query: async () => ({ rows: [{ role: 'root', state: 'active' }] }) });
  assert.deepEqual(await lookup(uid), { role: 'root', state: 'active' });
});
