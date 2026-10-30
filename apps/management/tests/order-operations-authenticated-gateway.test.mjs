import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthenticatedOrderOperationsGateway} from '../src/order-operations-authenticated-gateway.js';

const token = 'ci_test_valid_token_with_sufficient_length';
test('authenticated gateway fails closed without an identity provider', () => {
  assert.throws(() => createAuthenticatedOrderOperationsGateway(), /invalid_order_operations_auth_transport/);
});
test('authenticated gateway refuses absent credentials before network access', async () => {
  let calls = 0;
  const gateway = createAuthenticatedOrderOperationsGateway({
    getAccessToken: async () => null,
    fetchImpl: async () => { calls++; throw Error('network_should_not_be_called'); },
  });
  await assert.rejects(gateway.listBoard(), /order_operations_auth_unavailable/);
  assert.equal(calls, 0);
});
test('authenticated gateway supplies a fresh bearer for every request and never sends cookies', async () => {
  const seen = [];
  let counter = 0;
  const gateway = createAuthenticatedOrderOperationsGateway({
    getAccessToken: async () => `${token}_${++counter}`,
    fetchImpl: async (path, options) => {
      seen.push({path, options});
      return new Response(JSON.stringify({error:'forbidden'}), {
        status:403, headers:{'Content-Type':'application/json'},
      });
    },
  });
  for (let i=0;i<2;i++) await assert.rejects(gateway.listBoard(), /forbidden/);
  assert.equal(seen.length,2);
  assert.equal(seen[0].options.headers.get('Authorization'), `Bearer ${token}_1`);
  assert.equal(seen[1].options.headers.get('Authorization'), `Bearer ${token}_2`);
  for (const {path,options} of seen) {
    assert.match(path,/^\/api\/v1\/operations\//);
    assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'error');
    assert.equal(options.cache,'no-store');
  }
});

test('revoking management identity denies new operations without network access', async () => {
  let calls=0, reads=0;
  const gateway=createAuthenticatedOrderOperationsGateway({
    getAccessToken: async()=>{reads++;return token;},
    fetchImpl: async()=>{calls++;throw Error('unexpected_network');},
  });
  gateway.revoke();
  await assert.rejects(gateway.listBoard(),/order_operations_auth_unavailable/);
  assert.equal(reads,0);
  assert.equal(calls,0);
});
test('revocation during token acquisition prevents late requests', async () => {
  let release, calls=0;
  const pending=new Promise(resolve=>{release=resolve;});
  const gateway=createAuthenticatedOrderOperationsGateway({
    getAccessToken: async()=>pending,
    fetchImpl: async()=>{calls++;throw Error('unexpected_network');},
  });
  const request=gateway.listBoard();
  gateway.revoke();
  release(token);
  await assert.rejects(request,/order_operations_auth_unavailable/);
  assert.equal(calls,0);
});
test('revocation aborts active management HTTP requests', async () => {
  let started;
  const pending=new Promise(resolve=>{started=resolve;});
  const gateway=createAuthenticatedOrderOperationsGateway({
    getAccessToken: async()=>token,
    fetchImpl: async(_path,options)=>{
      started(options.signal);
      return new Promise((_resolve,reject)=>{
        options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});
      });
    },
  });
  const request=gateway.listBoard();
  const signal=await pending;
  assert.equal(signal.aborted,false);
  gateway.revoke();
  assert.equal(signal.aborted,true);
  await assert.rejects(request,/aborted/);
});

test('authenticated gateway normalizes network failures without exposing transport details', async () => {
  const gateway=createAuthenticatedOrderOperationsGateway({
    getAccessToken:async()=>token,
    fetchImpl:async()=>{throw Error('private_host_connection_refused');},
  });
  await assert.rejects(gateway.listBoard(),error=>
    error?.name==='OrderOperationsGatewayError'&&error?.code==='network_error'&&
    !String(error).includes('private_host'));
});

test('management logout closes event stream and forbids resubscription', async () => {
  let started;
  const observed=new Promise(resolve=>{started=resolve;});
  let aborted=false;
  const gateway=createAuthenticatedOrderOperationsGateway({
    getAccessToken: async()=>token,
    fetchImpl: async(_path,options)=>{
      if(_path==='/api/v1/operations/events') {
        options.signal.addEventListener('abort',()=>{aborted=true;},{once:true});
        started();
        return new Response(new ReadableStream({
          start(controller) { controller.close(); },
          cancel() {},
        }),{headers:{'Content-Type':'text/event-stream'}});
      }
      throw Error('unexpected_request');
    },
  });
  const unsubscribe=gateway.subscribeEvents({
    onEvent(){},onResync(){},onUnavailable(){},
  });
  await observed;
  gateway.revoke();
  assert.equal(aborted,true);
  assert.doesNotThrow(unsubscribe);
  assert.throws(()=>gateway.subscribeEvents({
    onEvent(){},onResync(){},onUnavailable(){},
  }),/order_operations_auth_unavailable/);
});

test('revocation cancels an already-open SSE body reader even without fetch abort support', async () => {
  let notifyStarted;
  const started = new Promise(resolve => { notifyStarted = resolve; });
  let canceled = 0;
  const gateway = createAuthenticatedOrderOperationsGateway({
    getAccessToken: async () => token,
    fetchImpl: async (path) => {
      assert.equal(path, '/api/v1/operations/events');
      return new Response(new ReadableStream({
        start() { notifyStarted(); },
        cancel() { canceled++; },
      }), {headers: {'Content-Type':'text/event-stream'}});
    },
  });
  const unsubscribe = gateway.subscribeEvents({
    onEvent(){}, onResync(){}, onUnavailable(){},
  });
  await started;
  gateway.revoke();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(canceled, 1);
  unsubscribe();
});

test('oversized SSE frames fail closed, report unavailability and do not emit events', async () => {
  let notifyUnavailable;
  const unavailable = new Promise(resolve => { notifyUnavailable = resolve; });
  let connections = 0, delivered = 0;
  const gateway = createAuthenticatedOrderOperationsGateway({
    getAccessToken: async () => token,
    reconnectDelayMs: 30000,
    fetchImpl: async (path) => {
      assert.equal(path, '/api/v1/operations/events');
      connections++;
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: ' + 'x'.repeat(65537)));
        },
      }), {headers: {'Content-Type':'text/event-stream'}});
    },
  });
  const unsubscribe = gateway.subscribeEvents({
    onEvent() { delivered++; },
    onResync() { delivered++; },
    onUnavailable() { notifyUnavailable(); },
  });
  try {
    await unavailable;
    assert.equal(connections, 1);
    assert.equal(delivered, 0);
  } finally {
    unsubscribe();
    gateway.revoke();
  }
});

test('oversized complete SSE event frames cannot bypass the buffer cap', async () => {
  let notifyUnavailable;
  const unavailable = new Promise(resolve => { notifyUnavailable = resolve; });
  let delivered = 0;
  const gateway = createAuthenticatedOrderOperationsGateway({
    getAccessToken: async () => token,
    reconnectDelayMs: 30000,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'event: sabora.order.ready\nid: 1\ndata: ' + 'x'.repeat(65537) + '\n\n'
        ));
      },
    }), {headers: {'Content-Type':'text/event-stream'}}),
  });
  const unsubscribe = gateway.subscribeEvents({
    onEvent() { delivered++; },
    onResync() { delivered++; },
    onUnavailable() { notifyUnavailable(); },
  });
  try {
    await unavailable;
    assert.equal(delivered, 0);
  } finally {
    unsubscribe();
    gateway.revoke();
  }
});

test('SSE CRLF framing split across reads still delivers a single event', async () => {
  let received;
  const event = new Promise(resolve => { received = resolve; });
  const gateway = createAuthenticatedOrderOperationsGateway({
    getAccessToken: async () => token,
    reconnectDelayMs: 30000,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        const frame = 'event: sabora.order.ready\r\nid: 1\r\ndata: {"payload":{"lineId":"test"},"createdAt":"2026-10-30T00:00:00.000Z"}\r\n\r\n';
        const bytes = new TextEncoder().encode(frame);
        for (let i = 0; i < bytes.length; i++) controller.enqueue(bytes.slice(i, i + 1));
      },
    }), {headers: {'Content-Type':'text/event-stream'}}),
  });
  const unsubscribe = gateway.subscribeEvents({
    onEvent(value) { received(value); },
    onResync() {},
    onUnavailable() {},
  });
  try {
    const value = await event;
    assert.equal(value.id, 1);
    assert.equal(value.type, 'sabora.order.ready');
    assert.equal(value.payload.lineId, 'test');
  } finally {
    unsubscribe();
    gateway.revoke();
  }
});

test('multiple valid SSE frames in one large read are delivered without false overflow', async () => {
  const received = [];
  let resolveBatch;
  const batch = new Promise(resolve => { resolveBatch = resolve; });
  const gateway = createAuthenticatedOrderOperationsGateway({
    getAccessToken: async () => token,
    reconnectDelayMs: 30000,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        const events = Array.from({length: 800}, (_, i) =>
          'event: sabora.order.ready\nid: ' + (i + 1) +
          '\ndata: {"payload":{"lineId":"test","padding":"' + 'x'.repeat(80) +
          '"},"createdAt":"2026-10-30T00:00:00.000Z"}\n\n'
        ).join('');
        assert.ok(events.length > 65536);
        controller.enqueue(new TextEncoder().encode(events));
      },
    }), {headers: {'Content-Type':'text/event-stream'}}),
  });
  const unsubscribe = gateway.subscribeEvents({
    onEvent(value) {
      received.push(value);
      if(received.length === 800) resolveBatch();
    },
    onResync() {},
    onUnavailable() {},
  });
  try {
    await batch;
    assert.equal(received[0].id, 1);
    assert.equal(received[799].id, 800);
  } finally {
    unsubscribe();
    gateway.revoke();
  }
});
