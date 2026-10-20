import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminWriteGate } from '../apps/api/src/admin-write-gate.mjs';

const owner = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
async function check(role, userId, lookupOwner) {
  const reply = { status: 200, body: null, code(n) { this.status = n; return this; }, send(v) { this.body = v; return this; } };
  const gate = createAdminWriteGate({ lookupOwner });
  await gate({ verifiedStaff: { role, userId } }, reply);
  return reply;
}
test('only current admin writer can mutate', async () => {
  let current = owner;
  const lookupOwner = async () => current;
  assert.equal((await check('admin', owner, lookupOwner)).status, 200);
  assert.equal((await check('admin', other, lookupOwner)).status, 403);
  current = other;
  assert.equal((await check('admin', owner, lookupOwner)).status, 403);
  assert.equal((await check('admin', other, lookupOwner)).status, 200);
});
test('ROOT authority is independent of admin ownership', async () => {
  let called = 0;
  assert.equal((await check('root', owner, async () => { called++; throw Error('offline'); })).status, 200);
  assert.equal(called, 0);
});
test('operational roles and malformed identities never acquire admin writing', async () => {
  for (const role of ['waiter', 'kitchen', 'anonymous', 'admin']) {
    const result = await check(role, role === 'admin' ? 'bad-id' : owner, async () => owner);
    assert.equal(result.status, 403);
  }
});
test('missing, invalid and failed ownership lookup fail closed', async () => {
  for (const lookupOwner of [async () => null, async () => 'bad-id', async () => { throw Error('secret db failure'); }]) {
    const result = await check('admin', owner, lookupOwner);
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { error: 'authorization_unavailable' });
    assert.equal(JSON.stringify(result.body).includes('secret'), false);
  }
});
test('owner UUID comparison is case insensitive', async () => {
  const result = await check('admin', 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', async () => 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(result.status, 200);
});
