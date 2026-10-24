import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadAdminTablesPage,
  mergeAdminTables,
  validateAdminTablesPage,
} from '../src/tables-read-model.js';

const table = (number, overrides = {}) => ({
  id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
  number,
  capacity: 4,
  description: null,
  orderingState: 'open',
  ...overrides,
});

test('validates the documented versioned table page and preserves only the allowlist', () => {
  const page = validateAdminTablesPage({
    version: 1,
    items: [table(1), table(2, {description: 'Terraza', orderingState: 'paused'})],
    nextAfterNumber: 2,
  }, {afterNumber: 0, limit: 2});

  assert.equal(page.version, 1);
  assert.equal(page.nextAfterNumber, 2);
  assert.deepEqual(page.items.map((item) => item.number), [1, 2]);
  assert.deepEqual(Object.keys(page.items[0]), ['id', 'number', 'capacity', 'description', 'orderingState']);
  assert.ok(Object.isFrozen(page));
  assert.ok(Object.isFrozen(page.items));
  assert.ok(Object.isFrozen(page.items[0]));
});

test('fails closed for extra fields, hostile descriptors and inconsistent cursors', () => {
  const extraSecret = table(1, {qrToken: 'must-not-cross-the-boundary'});
  assert.throws(() => validateAdminTablesPage({version: 1, items: [extraSecret], nextAfterNumber: null}),
    /invalid_admin_tables_page/);

  let getterCalls = 0;
  const hostile = table(1);
  Object.defineProperty(hostile, 'description', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'Interior';
    },
  });
  assert.throws(() => validateAdminTablesPage({version: 1, items: [hostile], nextAfterNumber: null}),
    /invalid_admin_tables_page/);
  assert.equal(getterCalls, 0);

  for (const payload of [
    {version: 1, items: [table(2), table(1)], nextAfterNumber: null},
    {version: 1, items: [table(1)], nextAfterNumber: 2},
    {version: 1, items: [], nextAfterNumber: 1},
    {version: 2, items: [], nextAfterNumber: null},
  ]) {
    assert.throws(() => validateAdminTablesPage(payload), /invalid_admin_tables_page/);
  }
});

test('loads one page through an injected gateway without hidden retries', async () => {
  const calls = [];
  const controller = new AbortController();
  const gateway = {
    async listTables(request) {
      calls.push(request);
      return {version: 1, items: [table(25)], nextAfterNumber: null};
    },
  };

  const page = await loadAdminTablesPage(gateway, {
    afterNumber: 24,
    limit: 1,
    signal: controller.signal,
  });
  assert.equal(page.items[0].number, 25);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {afterNumber: 24, limit: 1, signal: controller.signal});
  assert.ok(Object.isFrozen(calls[0]));

  let failedCalls = 0;
  await assert.rejects(loadAdminTablesPage({
    async listTables() {
      failedCalls += 1;
      throw new Error('network unavailable');
    },
  }), /network unavailable/);
  assert.equal(failedCalls, 1);
});

test('merges keyset pages in strict order and rejects duplicates', () => {
  const merged = mergeAdminTables([table(1), table(2)], [table(3), table(4)]);
  assert.deepEqual(merged.map((item) => item.number), [1, 2, 3, 4]);
  assert.ok(Object.isFrozen(merged));

  assert.throws(() => mergeAdminTables([table(1)], [table(1)]), /invalid_admin_tables_merge/);
  assert.throws(() => mergeAdminTables([table(2)], [table(1)]), /invalid_admin_tables_merge/);
});
