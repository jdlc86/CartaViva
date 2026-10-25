import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderOperationsCoordinator} from './order-operations-coordinator.mjs';

const actorId = '11111111-1111-4111-8111-111111111111';
const context = {verifiedIdentity: {userId: actorId}, verifiedStaff: {userId: actorId, role: 'kitchen'}};

for (const operation of ['listBoard', 'transitionLine', 'listHistory']) {
  for (const [name, makeInput] of [
    ['null', () => null],
    ['array', () => []],
    ['class instance', () => new (class Input {})()],
    ['accessor', () => Object.defineProperty({}, 'actorId', {enumerable: true, get() { throw Error('accessor_executed'); }})],
    ['symbol key', () => ({[Symbol('secret')]: 1})],
  ]) {
    test(`${operation} rejects ${name} input before SQL`, async () => {
      let transactions = 0;
      const coordinator = createOrderOperationsCoordinator({
        withTransaction: async () => { transactions++; },
        repository: {verifyMembership() {}, listBoard() {}, transitionLine() {}, listHistory() {}},
      });
      await assert.rejects(coordinator[operation](context, makeInput()), /invalid_order_operations_input/);
      assert.equal(transactions, 0);
    });
  }
}
