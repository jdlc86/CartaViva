import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  groupOrderBoard,
  nextOrderLineAction,
  normalizeOrderBoard,
  normalizeOrderHistory,
  normalizeOrderTransition,
} from '../src/order-operations-model.js';
import {createOrderOperationsGateway, OrderOperationsGatewayError} from '../src/order-operations-gateway.js';

const orderId = '10000000-0000-4000-8000-000000000001';
const lineId = '20000000-0000-4000-8000-000000000002';
const eventId = '30000000-0000-4000-8000-000000000003';
const notificationId = '40000000-0000-4000-8000-000000000004';

function board(status = 'ready') {
  return {
    version: 1,
    role: status === 'picked_up' ? 'waiter' : 'kitchen',
    items: [{
      orderId,
      lineId,
      tableNumber: 8,
      customerLabel: 'Ana',
      confirmedAt: '2026-10-24T10:00:00.000Z',
      grouping: 'first',
      lineNumber: 1,
      category: 'main',
      name: 'Arroz',
      quantity: 1,
      status,
      notification: status === 'ready' || status === 'picked_up' ? {
        id: notificationId,
        createdAt: '2026-10-24T10:05:00.000Z',
        acknowledgedAt: status === 'picked_up' ? '2026-10-24T10:06:00.000Z' : null,
      } : null,
    }],
    nextCursor: null,
  };
}

test('board validation groups persisted lines and preserves ready notifications', () => {
  const normalized = normalizeOrderBoard(board());
  const grouped = groupOrderBoard(normalized.items);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].tableNumber, 8);
  assert.equal(grouped[0].lines[0].notification.acknowledgedAt, null);
  assert.throws(() => normalizeOrderBoard({...board(), items: [...board().items, ...board().items]}),
    /invalid_order_board/);
  assert.throws(() => normalizeOrderBoard({...board(), items: [{...board().items[0], notification: null}]}),
    /invalid_order_board/);
});

test('local action policy mirrors the documented kitchen and waiter transitions', () => {
  assert.deepEqual(nextOrderLineAction('kitchen', 'confirmed'),
    {targetStatus: 'preparing', label: 'Iniciar preparación'});
  assert.deepEqual(nextOrderLineAction('kitchen', 'preparing'),
    {targetStatus: 'ready', label: 'Marcar lista'});
  assert.deepEqual(nextOrderLineAction('waiter', 'ready'),
    {targetStatus: 'picked_up', label: 'Confirmar recogida'});
  assert.equal(nextOrderLineAction('waiter', 'preparing'), null);
  assert.equal(nextOrderLineAction('kitchen', 'ready'), null);
  assert.equal(nextOrderLineAction('admin', 'picked_up'), null);
});

test('gateway sends a minimal transition once and validates the durable result', async () => {
  const calls = [];
  const gateway = createOrderOperationsGateway({send: async (path, init) => {
    calls.push({path, init});
    return new Response(JSON.stringify({
      version: 1,
      orderId,
      lineId,
      previousStatus: 'preparing',
      currentStatus: 'ready',
      repeated: false,
      eventId,
      notificationId,
    }), {status: 201, headers: {'content-type': 'application/json'}});
  }});
  const result = await gateway.transitionLine({
    lineId, targetStatus: 'ready', correlationId: 'ui_transition_001',
  });
  assert.equal(result.currentStatus, 'ready');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, `/api/v1/operations/order-lines/${lineId}/transitions`);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    targetStatus: 'ready', correlationId: 'ui_transition_001',
  });
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.cache, 'no-store');
});

test('gateway recovers board state on a fresh load without browser persistence', async () => {
  let calls = 0;
  const gateway = createOrderOperationsGateway({send: async () => {
    calls += 1;
    return new Response(JSON.stringify(board(calls === 1 ? 'ready' : 'picked_up')), {
      status: 200,
      headers: {'content-type': 'application/json'},
    });
  }});
  assert.equal((await gateway.listBoard()).items[0].status, 'ready');
  assert.equal((await gateway.listBoard()).items[0].status, 'picked_up');
  assert.equal(calls, 2);
});

test('gateway fails closed on private, non-json or contradictory responses without retrying', async () => {
  let calls = 0;
  const gateway = createOrderOperationsGateway({send: async () => {
    calls += 1;
    return new Response('<html>private error</html>', {
      status: 503,
      headers: {'content-type': 'text/html'},
    });
  }});
  await assert.rejects(gateway.listBoard(), (error) =>
    error instanceof OrderOperationsGatewayError && error.code === 'invalid_response');
  assert.equal(calls, 1);
  assert.throws(() => normalizeOrderTransition({version: 1}), /invalid_order_transition/);
  assert.throws(() => normalizeOrderHistory({version: 1, orderId, events: [{actorRole: 'root'}]}),
    /invalid_order_history/);
});

test('connected view blocks duplicate clicks and keeps final delivery unavailable', () => {
  const source = readFileSync(new URL('../src/views/OrdersView.tsx', import.meta.url), 'utf8');
  assert.match(source, /pendingLines\.has\(line\.lineId\)/);
  assert.match(source, /disabled=\{pending\}/);
  assert.match(source, /await load\(\)/);
  assert.match(source, /La recogida no acredita entrega al comensal/);
  assert.doesNotMatch(source, /targetStatus:\s*['"]delivered['"]|targetStatus:\s*['"]cancelled['"]/);
});

test('H6 gateway streams durable events without polling and exposes contracted operations', () => {
  const gateway = readFileSync(new URL('../src/order-operations-gateway.js', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/views/OrdersView.tsx', import.meta.url), 'utf8');
  assert.match(gateway, /text\/event-stream/);
  assert.match(gateway, /Last-Event-ID/);
  assert.match(gateway, /acknowledgeDispatch/);
  assert.match(gateway, /reportIncident/);
  assert.match(gateway, /resolveIncident/);
  assert.doesNotMatch(gateway, /setInterval\s*\(/);
  assert.match(source, /gateway\.subscribeEvents/);
  assert.match(source, /Confirmar recepción/);
  assert.match(source, /Incidencias pendientes/);
});

test('H6 gateway parses a durable SSE frame and preserves restricted mutation bodies', async () => {
  const calls=[];
  const stream=`id: 41\nevent: sabora.kitchen.dispatch_requested\ndata: {"eventKey":"50000000-0000-4000-8000-000000000005","payload":{"orderId":"${orderId}","dispatchId":"${notificationId}"},"createdAt":"2026-10-27T12:00:00.000Z"}\n\n`;
  const gateway=createOrderOperationsGateway({reconnectDelayMs:100,send:async(path,init)=>{
    calls.push({path,init});
    if(path==='/api/v1/operations/events')return new Response(stream,{status:200,
      headers:{'content-type':'text/event-stream; charset=utf-8'}});
    return new Response(JSON.stringify({dispatchId:notificationId,state:'acknowledged',repeated:false}),
      {status:200,headers:{'content-type':'application/json'}});
  }});
  const received=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('event timeout')),1000);
    const stop=gateway.subscribeEvents({onEvent:event=>{clearTimeout(timeout);stop();resolve(event);},
      onResync:()=>reject(Error('unexpected resync')),onUnavailable:()=>{}});
  });
  assert.equal(received.id,41);
  assert.equal(received.type,'sabora.kitchen.dispatch_requested');
  await gateway.acknowledgeDispatch({dispatchId:notificationId,correlationId:'ui_ack_test_0001'});
  assert.deepEqual(JSON.parse(calls.at(-1).init.body),{correlationId:'ui_ack_test_0001'});
  assert.equal(calls.at(-1).init.credentials,'omit');
});

test('kitchen UI preserves correlation for an uncertain transition retry and guards stale reads', () => {
  const source = readFileSync(new URL('../src/views/OrdersView.tsx', import.meta.url), 'utf8');
  assert.match(source, /previousAttempt\?\.targetStatus === action\.targetStatus/);
  assert.match(source, /previousAttempt\.correlationId/);
  assert.match(source, /transitionAttempts\.current\.set\(line\.lineId/);
  assert.match(source, /transitionAttempts\.current\.delete\(line\.lineId\)/);
  assert.match(source, /epoch !== readEpoch\.current/);
  assert.match(source, /epoch === historyEpoch\.current/);
});
