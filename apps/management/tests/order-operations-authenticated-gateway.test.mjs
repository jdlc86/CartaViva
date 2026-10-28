import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthenticatedOrderOperationsGateway} from '../src/order-operations-authenticated-gateway.js';

const token = 'ci_test_valid_token_with_sufficient_length';
test('authenticated gateway fails closed without an identity provider', () => {
  assert.throws(() => createAuthenticatedOrderOperationsGateway(), /invalid_order_operations_auth_transport/);
});
test('authenticated gateway refuses absent credentials before network access', async () => {
  let calls = 0;
  const gateway = createAuthenticatedOrderOperationsGateway({
    getAccessToken: async () => null,
    fetchImpl: async () => { calls++; throw Error('network_should_not_be_called'); },
  });
  await assert.rejects(gateway.listBoard(), /order_operations_auth_unavailable/);
  assert.equal(calls, 0);
});
test('authenticated gateway supplies a fresh bearer for every request and never sends cookies', async () => {
  const seen = [];
  let counter = 0;
  const gateway = createAuthenticatedOrderOperationsGateway({
    getAccessToken: async () => `${token}_${++counter}`,
    fetchImpl: async (path, options) => {
      seen.push({path, options});
      return new Response(JSON.stringify({error:'forbidden'}), {
        status:403, headers:{'Content-Type':'application/json'},
      });
    },
  });
  for (let i=0;i<2;i++) await assert.rejects(gateway.listBoard(), /forbidden/);
  assert.equal(seen.length,2);
  assert.equal(seen[0].options.headers.get('Authorization'), `Bearer ${token}_1`);
  assert.equal(seen[1].options.headers.get('Authorization'), `Bearer ${token}_2`);
  for (const {path,options} of seen) {
    assert.match(path,/^\/api\/v1\/operations\//);
    assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'error');
    assert.equal(options.cache,'no-store');
  }
});
