import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaffReaderQuery } from '../apps/api/src/staff-reader-query.mjs';
import { createPostgresStaffLookup } from '../apps/api/src/postgres-staff-lookup.mjs';
const userId = '00000000-0000-0000-0000-000000000101';

test('reader executes only exact parameterized membership query', async () => {
  const calls = [];
  const query = createStaffReaderQuery({ pool: { query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ role: 'waiter', state: 'active' }] };
  } } });
  const lookup = createPostgresStaffLookup({ query });
  assert.deepEqual(await lookup(userId), { role: 'waiter', state: 'active' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [userId]);
});
test('reader denies SQL other than pinned membership lookup', async () => {
  let called = false;
  const query = createStaffReaderQuery({ pool: { query: async () => { called = true; } } });
  await assert.rejects(query('select * from sabora.orders', []), /staff_reader_query_not_allowed/);
  await assert.rejects(query('select role, state from sabora.staff_members where user_id = $1', ['a', 'b']), /staff_reader_query_not_allowed/);
  assert.equal(called, false);
});
test('reader requires an injected pool and propagates database failure', async () => {
  assert.throws(() => createStaffReaderQuery({}), /invalid_staff_reader_pool/);
  const query = createStaffReaderQuery({ pool: { query: async () => { throw new Error('offline'); } } });
  await assert.rejects(createPostgresStaffLookup({ query })(userId), /offline/);
});
