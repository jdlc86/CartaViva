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
 return { store, order, table, input };
}
test('kitchen and waiter advance an order and record a durable sequence of events', () => {
 const { store, order } = setup();
 assert.equal(store.transitionOrder({ orderId: order.id, actorUserId: 'cook', nextStatus: 'preparing' }).order.status, 'preparing');
 assert.equal(store.transitionOrder({ orderId: order.id, actorUserId: 'cook', nextStatus: 'ready' }).order.status, 'ready');
 assert.equal(store.transitionOrder({ orderId: order.id, actorUserId: 'server', nextStatus: 'delivered' }).order.status, 'delivered');
 assert.deepEqual(store.listOrderEvents(order.id).map(e => [e.previousStatus, e.currentStatus]), [['confirmed', 'preparing'], ['preparing', 'ready'], ['ready', 'delivered']]);
 assert.throws(() => store.transitionOrder({ orderId: order.id, actorUserId: 'boss', nextStatus: 'cancelled', reason: 'Too late' }), /invalid_order_transition/);
});
test('unauthorized or out-of-order transitions do not write audit history', () => {
 const { store, order } = setup();
 for (const [actorUserId,nextStatus,error] of [['stranger','preparing',/actor_not_authorized/],['server','preparing',/role_not_allowed/],['cook','delivered',/invalid_order_transition/]]) {
  assert.throws(() => store.transitionOrder({ orderId: order.id, actorUserId, nextStatus }), error);
 }
 assert.equal(store.listOrderEvents(order.id).length, 0);
 assert.equal(store.listOrders()[0].status, 'confirmed');
});
test('cancellation requires reason and keeps historical order immutable across QR rotation', () => {
 const { store, order, table } = setup();
 assert.throws(() => store.transitionOrder({ orderId: order.id, actorUserId: 'boss', nextStatus: 'cancelled' }), /cancellation_reason_required/);
 const result = store.transitionOrder({ orderId: order.id, actorUserId: 'boss', nextStatus: 'cancelled', reason: '  Sold out  ' });
 assert.equal(result.event.reason, 'Sold out');
 result.event.reason = 'Tampered';
 store.rotateQr(table.id);
 assert.equal(store.listOrderEvents(order.id)[0].reason, 'Sold out');
 assert.equal(store.listOrders()[0].status, 'cancelled');
 assert.throws(() => store.transitionOrder({ orderId: order.id, actorUserId: 'cook', nextStatus: 'preparing' }), /invalid_order_transition/);
});
