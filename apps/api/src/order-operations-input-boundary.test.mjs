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

for (const operation of ['listBoard', 'transitionLine', 'listHistory']) {
  test(`${operation} snapshots caller input before asynchronous SQL`, async () => {
    const original = {limit: 10};
    const observed = [];
    const repository = {
      verifyMembership: async (_query, staff) => {
        original.limit = 200;
        original.actorId = '22222222-2222-4222-8222-222222222222';
        original.role = 'admin';
        return staff;
      },
      listBoard: async (_query, input) => { observed.push(input); return 'ok'; },
      transitionLine: async (_query, input) => { observed.push(input); return 'ok'; },
      listHistory: async (_query, input) => { observed.push(input); return 'ok'; },
    };
    const coordinator = createOrderOperationsCoordinator({
      repository, withTransaction: async callback => callback(async () => {}),
    });
    assert.equal(await coordinator[operation](context, original), 'ok');
    assert.equal(observed.length, 1);
    assert.equal(observed[0].limit, 10);
    assert.equal(observed[0].actorId, actorId);
    assert.equal(observed[0].role, 'kitchen');
  });
}

for (const operation of ['listBoard', 'transitionLine', 'listHistory']) {
  test(`${operation} rejects own __proto__ before SQL`, async () => {
    let transactions = 0;
    const input = JSON.parse('{"__proto__":{"admin":true},"limit":10}');
    const coordinator = createOrderOperationsCoordinator({
      withTransaction: async () => { transactions++; },
      repository: {verifyMembership() {}, listBoard() {}, transitionLine() {}, listHistory() {}},
    });
    await assert.rejects(coordinator[operation](context, input), /invalid_order_operations_input/);
    assert.equal(transactions, 0);
    assert.equal({}.admin, undefined);
  });

  test(`${operation} ignores forged actor and role even when supplied as own properties`, async () => {
    const observed = [];
    const repository = {
      verifyMembership: async (_query, staff) => staff,
      listBoard: async (_query, input) => { observed.push(input); return 'ok'; },
      transitionLine: async (_query, input) => { observed.push(input); return 'ok'; },
      listHistory: async (_query, input) => { observed.push(input); return 'ok'; },
    };
    const coordinator = createOrderOperationsCoordinator({
      repository, withTransaction: async callback => callback(async () => {}),
    });
    assert.equal(await coordinator[operation](context, {
      actorId: '22222222-2222-4222-8222-222222222222',
      role: 'admin', limit: 10,
    }), 'ok');
    assert.equal(observed[0].actorId, actorId);
    assert.equal(observed[0].role, 'kitchen');
  });
}
