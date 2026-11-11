import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaboraObservability } from '../apps/api/src/operational-observability.mjs';
import { createApiApp } from '../apps/api/src/server.mjs';

const secret = 'DO_NOT_ECHO_MY_SECRET_XYZ_123456789';

test('health-only Fastify request telemetry is correlated, bounded and does not echo attacker-controlled text', async t => {
  const output = [];
  const diagnostics = createSaboraObservability({ emit: value => output.push(value) });
  const app = createApiApp({ observability: diagnostics });
  t.after(() => app.close());
  const header = { authorization: 'Bearer ' + secret, 'x-request-id': secret, cookie: 's=' + secret };
  const first = await app.inject({ method: 'GET', url: '/health?token=' + secret, headers: header });
  const second = await app.inject({ method: 'GET', url: '/ready', headers: header });
  const missed = await app.inject({ method: 'GET', url: '/not-an-endpoint/' + secret + '?qr=' + secret, headers: header });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(missed.statusCode, 404);
  assert.match(first.headers['x-sabora-request-id'], /^[a-f0-9-]{36}$/);
  assert.notEqual(first.headers['x-sabora-request-id'], second.headers['x-sabora-request-id']);
  assert.notEqual(first.headers['x-sabora-request-id'], secret);
  assert.equal(output.length, 3);
  assert.deepEqual(output.map(value => value.route), ['/health', '/ready', 'other']);
  assert.deepEqual(output.map(value => value.statusClass), ['2xx', '2xx', '4xx']);
  assert.equal(output[0].source, 'sabora_observability');
  assert.equal(diagnostics.snapshot().requests, 3);
  assert.equal(diagnostics.snapshot().denied4xx, 1);
  assert.equal(diagnostics.snapshot().byRoute.other, 1);
  assert.doesNotMatch(JSON.stringify(output), new RegExp(secret));
  assert.deepEqual(await app.inject({ method: 'GET', url: '/ready' }).then(r => r.json()), {
    status: 'ready', service: 'sabora-api', mode: 'health-only',
  });
});

test('metrics and operations never accept arbitrary categories or private fields', () => {
  const output = [];
  const diag = createSaboraObservability({ emit: value => output.push(value) });
  diag.recordOperation({ component: 'catalog', operation: 'read', outcome: 'success', durationMs: 12 });
  diag.recordOperation({ component: 'payments', operation: 'confirm', outcome: 'denied', durationMs: 45 });
  diag.dependencyFailure('database');
  assert.equal(diag.snapshot().operations, 2);
  assert.equal(diag.snapshot().operationFailures, 1);
  assert.throws(() => diag.recordOperation({ component: secret, operation: 'read', outcome: 'success' }), /invalid_sabora_diagnostic_category/);
  assert.throws(() => diag.recordOperation({ component: 'catalog', operation: secret, outcome: 'success' }), /invalid_sabora_diagnostic_category/);
  assert.throws(() => diag.dependencyFailure(secret), /invalid_sabora_diagnostic_category/);
  assert.doesNotMatch(JSON.stringify(output), new RegExp(secret));
  assert.ok(Object.isFrozen(diag.snapshot()));
  assert.ok(Object.isFrozen(diag.snapshot().byRoute));
});

test('emitter faults do not affect HTTP responses and burst alerts are event-driven, not polling', async t => {
  const diag = createSaboraObservability({ emit: () => { throw Error(secret); } });
  const app = createApiApp({ observability: diag });
  t.after(() => app.close());
  assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
  const alerts = [];
  let time = 10000;
  let tick = 1n;
  const monitor = createSaboraObservability({ emit: value => alerts.push(value), now: () => time, monotonic: () => tick++ });
  for (let i = 0; i < 5; i++) {
    const request = { method: 'GET', routeOptions: { url: '/not-an-approved-url' } };
    const reply = { header() {}, statusCode: 500 };
    await monitor.onRequest(request, reply);
    await monitor.onResponse(request, reply);
  }
  assert.equal(alerts.filter(x => x.event === 'alert').length, 1);
  assert.equal(monitor.snapshot().alerts, 1);
  time += 61000;
  for (let i = 0; i < 3; i++) {
    const request = { method: 'GET' };
    const reply = { header() {}, statusCode: 503 };
    await monitor.onRequest(request, reply);
    await monitor.onResponse(request, reply);
  }
  assert.equal(monitor.snapshot().alerts, 2);
  assert.equal(alerts.filter(x => x.event === 'alert').length, 2);
});
