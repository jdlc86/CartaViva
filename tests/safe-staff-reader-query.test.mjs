import test from 'node:test';
import assert from 'node:assert/strict';
import { createSafeStaffReaderQuery } from '../apps/api/src/safe-staff-reader-query.mjs';
import { createStaffPoolObserver } from '../apps/api/src/staff-pool-observer.mjs';

test('sanitizes driver error and emits only a bounded diagnostic', async () => {
  const events = [];
  const observe = createStaffPoolObserver({ emit: event => events.push(event) });
  const query = createSafeStaffReaderQuery({
    query: async () => { throw new Error('postgres://user:secret@private-host/production'); },
    observe
  });
  await assert.rejects(query('select role, state', ['id']), error => {
    assert.equal(error.message, 'staff_reader_unavailable');
    assert.equal(error.cause, undefined);
    assert.equal(JSON.stringify(error).includes('secret'), false);
    return true;
  });
  assert.deepEqual(events, [{ component: 'staff_reader_pool', event: 'staff_reader_query_failed' }]);
});

test('returns valid query results without modifying them', async () => {
  const rows = { rows: [{ role: 'kitchen', state: 'active' }] };
  const query = createSafeStaffReaderQuery({ query: async () => rows });
  assert.equal(await query('sql', []), rows);
});

test('observer failures do not reveal database error', async () => {
  const query = createSafeStaffReaderQuery({
    query: async () => { throw new Error('password=private'); },
    observe: () => { throw new Error('logger failed'); }
  });
  await assert.rejects(query('sql', []), /staff_reader_unavailable/);
});
