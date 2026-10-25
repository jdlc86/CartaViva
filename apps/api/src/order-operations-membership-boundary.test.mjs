import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderOperationsCoordinator} from './order-operations-coordinator.mjs';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const context = {verifiedIdentity: {userId: ACTOR}, verifiedStaff: {userId: ACTOR, role: 'kitchen'}};

for (const operation of ['listBoard', 'transitionLine', 'listHistory']) {
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
      repository, withTransaction: async callback => callback(async () => {}),
    });
    assert.equal(await coordinator[operation](context, {}), 'ok');
    assert.equal(executed, true);
  });
}
