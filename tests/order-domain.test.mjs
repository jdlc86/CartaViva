import test from 'node:test';
import assert from 'node:assert/strict';
import { createRestaurantStore } from '../apps/api/src/domain.mjs';

test('first order starts a five-minute grouping window and late orders remain separate', () => {
 let time = 1000;
 const store = createRestaurantStore({ clock: () => time });
 const table = store.createTable({ number: 1, capacity: 4 });
 const args = (employeeNumber, idempotencyKey) => ({ tableId: table.id, qrToken: table.qrToken, company: 'Acme', employeeNumber, idempotencyKey, items: [{ category: 'main', name: 'Rice', quantity: 1 }] });
 const first = store.confirmOrder(args('100', 'request_0001'));
 assert.equal(first.order.grouping, 'first');
 time += 299999;
 assert.equal(store.confirmOrder(args('101', 'request_0002')).order.grouping, 'grouped');
 time += 1;
 assert.equal(store.confirmOrder(args('102', 'request_0003')).order.grouping, 'late');
 assert.equal(store.getTable(table.id).participantCount, 3);
 assert.equal(first.groupingDeadline, 301000);
});

test('idempotency prevents duplicate orders and conflicting retries', () => {
 const store = createRestaurantStore();
 const table = store.createTable({ number: 3, capacity: 2 });
 const input = { tableId: table.id, qrToken: table.qrToken, company: 'Acme', employeeNumber: '123', idempotencyKey: 'request_0004', items: [{ category: 'drink', name: 'Water', quantity: 1 }] };
 const first = store.confirmOrder(input);
 const repeated = store.confirmOrder(input);
 assert.equal(repeated.repeated, true);
 assert.equal(repeated.order.id, first.order.id);
 assert.equal(store.listOrders().length, 1);
 assert.throws(() => store.confirmOrder({ ...input, items: [{ category: 'drink', name: 'Tea', quantity: 1 }] }), /idempotency_conflict/);
});

test('QR rotation invalidates old token and resets grouping', () => {
 const store = createRestaurantStore();
 const table = store.createTable({ number: 2, capacity: 4 });
 const input = { tableId: table.id, qrToken: table.qrToken, company: 'Acme', employeeNumber: '123', idempotencyKey: 'request_0005', items: [{ category: 'starter', name: 'Soup', quantity: 1 }] };
 store.confirmOrder(input);
 const rotated = store.rotateQr(table.id);
 assert.throws(() => store.confirmOrder({ ...input, idempotencyKey: 'request_0006' }), /invalid_qr/);
 assert.equal(store.getTable(table.id).participantCount, 0);
 assert.equal(store.confirmOrder({ ...input, qrToken: rotated.qrToken, idempotencyKey: 'request_0007' }).order.grouping, 'first');
});

test('table configuration and input validation', () => {
 const store = createRestaurantStore();
 const table = store.createTable({ number: 5, capacity: 6, description: 'Terrace' });
 assert.equal(store.getTable(table.id).description, 'Terrace');
 assert.throws(() => store.createTable({ number: 5, capacity: 3 }), /duplicate/);
 assert.throws(() => store.confirmOrder({ tableId: table.id, qrToken: table.qrToken, company: 'A', employeeNumber: '1', idempotencyKey: 'request_0008', items: [{ category: 'other', name: 'X', quantity: 1 }] }), /invalid_items/);
});

test('customer identity encoding avoids delimiter collisions and idempotency cross-talk', () => {
 const store = createRestaurantStore();
 const table = store.createTable({ number: 10, capacity: 8 });
 const base = { tableId: table.id, qrToken: table.qrToken, idempotencyKey: 'same_request_123', items: [{ category: 'main', name: 'Rice', quantity: 1 }] };
 const a = store.confirmOrder({ ...base, company: 'A:B', employeeNumber: 'C' });
 const b = store.confirmOrder({ ...base, company: 'A', employeeNumber: 'B:C' });
 assert.notEqual(a.order.id, b.order.id);
 assert.equal(store.getTable(table.id).participantCount, 2);
});

test('idempotency replay is insulated from caller mutation', () => {
 const store = createRestaurantStore();
 const table = store.createTable({ number: 11, capacity: 2 });
 const input = { tableId: table.id, qrToken: table.qrToken, company: 'Acme', employeeNumber: '7', idempotencyKey: 'mutation_123', items: [{ category: 'drink', name: 'Water', quantity: 1 }] };
 const first = store.confirmOrder(input);
 first.order.items[0].name = 'Tampered';
 first.order.status = 'cancelled';
 const replay = store.confirmOrder(input);
 assert.equal(replay.repeated, true);
 assert.equal(replay.order.items[0].name, 'Water');
 assert.equal(replay.order.status, 'confirmed');
 assert.equal(store.listOrders()[0].items[0].name, 'Water');
});

test('reject malformed order items and oversized customer fields without writing orders', () => {
 const store = createRestaurantStore();
 const table = store.createTable({ number: 12, capacity: 2 });
 const base = { tableId: table.id, qrToken: table.qrToken, company: 'Acme', employeeNumber: '7', idempotencyKey: 'validate_123', items: [{ category: 'drink', name: 'Water', quantity: 1 }] };
 for (const items of [[null], [42], [true], [{ category: 'drink', name: 'x'.repeat(161), quantity: 1 }], [{ category: 'drink', name: 'Water', quantity: 1.5 }], [{ category: 'drink', name: 'Water', quantity: 21 }]]) {
  assert.throws(() => store.confirmOrder({ ...base, items }), /invalid_items/);
 }
 assert.throws(() => store.confirmOrder({ ...base, company: 'A'.repeat(161) }), /invalid_customer/);
 assert.throws(() => store.confirmOrder({ ...base, employeeNumber: '1'.repeat(81) }), /invalid_customer/);
 assert.throws(() => store.createTable({ number: 13, capacity: 2, description: null }), /invalid_description/);
 assert.equal(store.listOrders().length, 0);
});
