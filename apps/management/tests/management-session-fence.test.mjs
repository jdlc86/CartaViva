import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagementSessionFence} from '../src/management-session-fence.js';

function gateway() {
  let revoked=0;
  return {revoke(){revoked++;}, get revoked(){return revoked;}};
}

test('switching employee identity revokes old channel and fences stale logout', () => {
  const fence=createManagementSessionFence();
  const first=gateway(),second=gateway();
  const logoutFirst=fence.replace(first);
  assert.equal(fence.isCurrent(first),true);
  const logoutSecond=fence.replace(second);
  assert.equal(first.revoked,1);
  assert.equal(fence.isCurrent(first),false);
  assert.equal(fence.isCurrent(second),true);
  logoutFirst();
  assert.equal(second.revoked,0);
  assert.equal(fence.isCurrent(second),true);
  logoutSecond();
  assert.equal(second.revoked,1);
  assert.equal(fence.isCurrent(second),false);
  logoutSecond();
  assert.equal(second.revoked,1);
});

test('explicit global logout revokes only current session and clears ownership', () => {
  const fence=createManagementSessionFence();
  const first=gateway(),second=gateway();
  const disposeFirst=fence.replace(first);
  fence.revoke();
  assert.equal(first.revoked,1);
  assert.equal(fence.isCurrent(first),false);
  const disposeSecond=fence.replace(second);
  disposeFirst();
  assert.equal(second.revoked,0);
  fence.revoke();
  assert.equal(second.revoked,1);
  disposeSecond();
  assert.equal(second.revoked,1);
});

test('session fence rejects invalid gateways without revoking current identity', () => {
  const fence=createManagementSessionFence();
  const first=gateway();
  fence.replace(first);
  assert.throws(()=>fence.replace({}),/invalid_management_session_gateway/);
  assert.equal(first.revoked,0);
  assert.equal(fence.isCurrent(first),true);
});
