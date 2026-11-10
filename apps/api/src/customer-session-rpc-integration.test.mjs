import test from 'node:test';
import assert from 'node:assert/strict';
import { issueCustomerSession } from './customer-session.mjs';
import { createCustomerSessionQueryBoundary, SESSION_REVOKE_SQL } from './customer-session-query-boundary.mjs';
import { createCustomerSessionVerifier, SESSION_LOOKUP_SQL } from './customer-session-verifier.mjs';
import { createCustomerSessionRevoker } from './customer-session-revoker.mjs';

test('session boundary only allows versioned restricted RPC calls', async () => {
  const issued = issueCustomerSession();
  const seen = [];
  const query = createCustomerSessionQueryBoundary({
    pool: { async query(sql, params) {
      seen.push({ sql, params });
      if (sql === SESSION_LOOKUP_SQL) return { rows: [{ customer_id:'00000000-0000-0000-0000-000000000001', public_id:'SB-ABCDEFGHJKLM', alias:'Guest', company:null }] };
      if (sql === SESSION_REVOKE_SQL) return { rows:[{ revoked:true }], rowCount:1 };
      throw Error('unexpected_query');
    } }
  });
  assert.match(SESSION_LOOKUP_SQL, /sabora\.verify_customer_session_hash\(\$1::bytea\)/);
  assert.match(SESSION_REVOKE_SQL, /sabora\.revoke_customer_session_hash\(\$1::bytea\)/);
  const verify = createCustomerSessionVerifier({ query });
  const revoke = createCustomerSessionRevoker({ query });
  assert.equal((await verify(issued.token)).alias, 'Guest');
  assert.equal(await revoke(issued.token), true);
  assert.equal(seen.length, 2);
  for (const item of seen) assert.deepEqual(item.params, [issued.tokenHash]);
  await assert.rejects(query('SELECT * FROM sabora.customer_sessions', [issued.tokenHash]), /not_allowed/);
  await assert.rejects(query(SESSION_LOOKUP_SQL, [Buffer.alloc(31)]), /invalid_customer_session_parameters/);
});
test('RPC revocation fails closed on malformed or ambiguous results', async () => {
  const issued = issueCustomerSession();
  for (const rows of [[], [{ revoked:1 }], [{ revoked:true },{ revoked:false }], null]) {
    const revoke = createCustomerSessionRevoker({ query: async () => ({ rows }) });
    await assert.rejects(revoke(issued.token), /invalid_customer_revocation_result/);
  }
  const revoke = createCustomerSessionRevoker({ query: async () => ({ rows:[{ revoked:false }] }) });
  assert.equal(await revoke(issued.token), false);
  assert.equal(await revoke('invalid-token'), false);
});
