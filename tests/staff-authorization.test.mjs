import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaffAuthorization } from '../apps/api/src/staff-authorization.mjs';

const reply = () => ({ status: null, body: null, code(n) { this.status = n; return this; }, send(x) { this.body = x; return this; } });
const request = (userId = 'verified-user') => ({ verifiedIdentity: { userId }, body: { actorUserId: 'attacker', role: 'admin' } });

test('allows only current active membership and ignores spoofed body role', async () => {
  const seen = [];
  const authorize = createStaffAuthorization({ lookupStaff: async id => { seen.push(id); return { role: 'waiter', state: 'active' }; } });
  const req = request(), res = reply();
  await authorize(req, res, ['waiter', 'admin']);
  assert.equal(res.status, null);
  assert.deepEqual(seen, ['verified-user']);
  assert.deepEqual(req.verifiedStaff, { userId: 'verified-user', role: 'waiter' });
  const denied = reply();
  await authorize(request(), denied, ['admin']);
  assert.equal(denied.status, 403);
});
test('revoked or missing memberships are rejected on every request', async () => {
  let state = 'active';
  const authorize = createStaffAuthorization({ lookupStaff: async () => ({ role: 'kitchen', state }) });
  await authorize(request(), reply(), ['kitchen']);
  state = 'revoked';
  const req = request(), res = reply();
  await authorize(req, res, ['kitchen']);
  assert.equal(res.status, 403);
  assert.equal(req.verifiedStaff, undefined);
});
test('missing verified identity and invalid role policy fail closed', async () => {
  const authorize = createStaffAuthorization({ lookupStaff: async () => ({ role: 'admin', state: 'active' }) });
  for (const [req, roles] of [[{}, ['admin']], [request(), []], [request(), ['superuser']]]) {
    const res = reply();
    await authorize(req, res, roles);
    assert.equal(res.status, 403);
  }
});
test('database failure returns 503 without granting access', async () => {
  const authorize = createStaffAuthorization({ lookupStaff: async () => { throw new Error('db-secret'); } });
  const req = request(), res = reply();
  await authorize(req, res, ['waiter']);
  assert.equal(res.status, 503);
  assert.deepEqual(res.body, { error: 'authorization_unavailable' });
  assert.equal(req.verifiedStaff, undefined);
});
