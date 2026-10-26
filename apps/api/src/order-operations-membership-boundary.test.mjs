import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderOperationsCoordinator} from './order-operations-coordinator.mjs';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const context = {verifiedIdentity: {userId: ACTOR}, verifiedStaff: {userId: ACTOR, role: 'kitchen'}};

for (const operation of ['listBoard', 'listHistory']) {
  for (const [label, verified] of [
    ['missing', undefined],
    ['wrong actor', {actorId: OTHER, role: 'kitchen'}],
    ['wrong role', {actorId: ACTOR, role: 'admin'}],
    ['malformed actor', {actorId: 'invalid', role: 'kitchen'}],
  ]) {
    test(`${operation} rejects ${label} membership before operational SQL`, async () => {
      let executed = false;
      const repository = {
        verifyMembership: async () => verified,
        listBoard: async () => { executed = true; },
        transitionLine: async () => { executed = true; },
        listHistory: async () => { executed = true; },
      };
      const coordinator = createOrderOperationsCoordinator({
        issueTransitionCapability: () => Object.freeze({keyId: 'test'}),
        repository, withTransaction: async callback => callback(async () => {}),
      });
      await assert.rejects(coordinator[operation](context, {}), /order_operations_forbidden/);
      assert.equal(executed, false);
    });
  }
  test(`${operation} accepts matching verified membership`, async () => {
    let executed = false;
    const repository = {
      verifyMembership: async () => ({actorId: ACTOR.toUpperCase(), role: 'kitchen'}),
      listBoard: async () => { executed = true; return 'ok'; },
      transitionLine: async () => { executed = true; return 'ok'; },
      listHistory: async () => { executed = true; return 'ok'; },
    };
    const coordinator = createOrderOperationsCoordinator({
      issueTransitionCapability: () => Object.freeze({keyId: 'test'}),
      repository, withTransaction: async callback => callback(async () => {}),
    });
    assert.equal(await coordinator[operation](context, {}), 'ok');
    assert.equal(executed, true);
  });
}


test('transition does not require a direct membership read: SQL capability wrapper owns locked revalidation', async () => {
  let reads = 0;
  let writes = 0;
  const repository = {
    verifyMembership: async () => { reads++; throw Error('private_staff_read_forbidden'); },
    listBoard: async () => {}, listHistory: async () => {},
    transitionLine: async (_query, input) => {
      writes++;
      assert.equal(input.actorId, ACTOR);
      assert.deepEqual(input.capability, {keyId: 'test'});
      return 'ok';
    },
  };
  const coordinator = createOrderOperationsCoordinator({
    repository,
    issueTransitionCapability: () => Object.freeze({keyId: 'test'}),
    withTransaction: async callback => callback(async () => {}),
  });
  assert.equal(await coordinator.transitionLine(context, {}), 'ok');
  assert.equal(reads, 0);
  assert.equal(writes, 1);
});
