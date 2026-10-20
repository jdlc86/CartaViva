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
