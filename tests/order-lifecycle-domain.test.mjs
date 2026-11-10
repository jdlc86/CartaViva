import test from 'node:test';
import assert from 'node:assert/strict';
import { createRestaurantStore } from '../apps/api/src/domain.mjs';

function setup() {
 const store = createRestaurantStore();
 const table = store.createTable({ number: 1, capacity: 4 });
 const input = { tableId: table.id, qrToken: table.qrToken, company: 'Acme', employeeNumber: '100', idempotencyKey: 'lifecycle_001', items: [{ category: 'main', name: 'Rice', quantity: 1 }] };
 const order = store.confirmOrder(input).order;
 store.assignMember({ userId: 'cook', role: 'kitchen' });
 store.assignMember({ userId: 'server', role: 'waiter' });
 store.assignMember({ userId: 'boss', role: 'admin' });
 return { store, order, table };
}
test('kitchen advances preparation and readiness without claiming delivery', () => {
 const { store, order } = setup();
 assert.equal(store.transitionOrder({ orderId: order.id, actorUserId: 'cook', nextStatus: 'preparing' }).order.status, 'preparing');
 assert.equal(store.transitionOrder({ orderId: order.id, actorUserId: 'cook', nextStatus: 'ready' }).order.status, 'ready');
 assert.deepEqual(store.listOrderEvents(order.id).map(e => [e.previousStatus, e.currentStatus]), [['confirmed', 'preparing'], ['preparing', 'ready']]);
 assert.throws(() => store.transitionOrder({ orderId: order.id, actorUserId: 'server', nextStatus: 'delivered' }), /invalid_order_transition/);
});
test('no role may cancel an entire order without incident arbitration', () => {
 const { store, order } = setup();
 for (const actorUserId of ['cook', 'server', 'boss']) {
  assert.throws(() => store.transitionOrder({ orderId: order.id, actorUserId, nextStatus: 'cancelled', reason: 'Out of stock' }), /invalid_order_transition/);
 }
 assert.equal(store.listOrderEvents(order.id).length, 0);
 assert.equal(store.listOrders()[0].status, 'confirmed');
});
test('unauthorized or out-of-order transitions cannot create audit events', () => {
 const { store, order } = setup();
 assert.throws(() => store.transitionOrder({ orderId: order.id, actorUserId: 'stranger', nextStatus: 'preparing' }), /actor_not_authorized/);
 assert.throws(() => store.transitionOrder({ orderId: order.id, actorUserId: 'server', nextStatus: 'preparing' }), /role_not_allowed/);
 assert.throws(() => store.transitionOrder({ orderId: order.id, actorUserId: 'cook', nextStatus: 'ready' }), /invalid_order_transition/);
 assert.equal(store.listOrderEvents(order.id).length, 0);
});
test('QR rotation retains existing audit and visit', () => {
 const { store, order, table } = setup();
 const before = store.listOrders()[0].sessionId;
 const result = store.transitionOrder({ orderId: order.id, actorUserId: 'cook', nextStatus: 'preparing' });
 result.event.currentStatus = 'tampered';
 store.rotateQr(table.id);
 assert.equal(store.listOrderEvents(order.id)[0].currentStatus, 'preparing');
 assert.equal(store.listOrders()[0].sessionId, before);
 assert.equal(store.getTable(table.id).participantCount, 1);
});
