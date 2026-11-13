import { randomUUID } from 'node:crypto';

// Deny-by-default diagnostics: never serialize URLs, query strings, headers,
// bodies, exceptions, actor IDs, table IDs or database connection details.
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const COMPONENTS = new Set(['catalog', 'customer_session', 'staff', 'kitchen', 'waiter', 'payments', 'events', 'governance', 'database']);
const OPERATIONS = new Set(['read', 'write', 'confirm', 'transition', 'deliver', 'dispatch', 'refund', 'authorize', 'connect', 'check']);
const OUTCOMES = new Set(['success', 'failure', 'denied', 'retry']);
const safeRoute = value => value === '/health' || value === '/ready' ? value : 'other';
const safeMillis = value => Number.isFinite(value) ? Math.min(600000, Math.max(0, Math.round(value))) : 0;
const safeTime = value => Number.isFinite(value) && value >= 0 ? new Date(value).toISOString() : new Date(0).toISOString();
const defaultEmit = record => process.stdout.write(JSON.stringify(record) + '\n');

export function createSaboraObservability({ emit = defaultEmit, alertSink = async () => {}, now = Date.now, monotonic = () => process.hrtime.bigint() } = {}) {
  if (typeof emit !== 'function' || typeof alertSink !== 'function' || typeof now !== 'function' || typeof monotonic !== 'function') {
    throw Error('invalid_sabora_observability_configuration');
  }
  const requests = new WeakMap();
  const totals = { requests: 0, failures5xx: 0, denied4xx: 0, operations: 0, operationFailures: 0, alerts: 0 };
  const byRoute = { '/health': 0, '/ready': 0, other: 0 };
  const durationBuckets = { under100ms: 0, under1000ms: 0, over1000ms: 0 };
  let failureWindowStarted = null;
  let failureWindowCount = 0;
  let failureWindowAlerted = false;

  function publish(level, event, fields = {}) {
    // Fields originate only from local, enumerated values, not user input.
    const output = Object.freeze({ schema: 1, source: 'sabora_observability', service: 'sabora-api', level, event, at: safeTime(now()), ...fields });
    try { emit(output); } catch { /* A diagnostics sink cannot break the app. */ }
  }
  function alertFor5xx() {
    const time = now();
    if (failureWindowStarted === null || time < failureWindowStarted || time - failureWindowStarted >= 60000) {
      failureWindowStarted = time;
      failureWindowCount = 0;
      failureWindowAlerted = false;
    }
    failureWindowCount += 1;
    if (failureWindowCount >= 3 && !failureWindowAlerted) {
      failureWindowAlerted = true;
      totals.alerts += 1;
      const alert = Object.freeze({ schema: 1, source: 'sabora_observability', service: 'sabora-api',
        code: 'http_5xx_burst', threshold: 3, windowSeconds: 60 });
      publish('error', 'alert', { code: alert.code, threshold: alert.threshold, windowSeconds: alert.windowSeconds });
      // Delivery is event-driven and deliberately detached from the request.
      // A failed receiver can never change an HTTP, SQL or economic outcome.
      Promise.resolve().then(() => alertSink(alert)).catch(() => {});
    }
  }
  return Object.freeze({
    async onRequest(request, reply) {
      const id = randomUUID(); // Intentionally ignore untrusted incoming request IDs.
      requests.set(request, { id, started: monotonic() });
      reply.header('x-sabora-request-id', id);
    },
    async onResponse(request, reply) {
      const started = requests.get(request);
      if (!started) return;
      requests.delete(request);
      const route = safeRoute(request.routeOptions?.url);
      const method = METHODS.has(request.method) ? request.method : 'OTHER';
      const code = Number.isInteger(reply.statusCode) && reply.statusCode >= 100 && reply.statusCode <= 599 ? reply.statusCode : 500;
      const statusClass = String(Math.floor(code / 100)) + 'xx';
      let duration = 0;
      try { duration = safeMillis(Number(monotonic() - started.started) / 1e6); } catch { /* No diagnostic exception. */ }
      totals.requests += 1;
      byRoute[route] += 1;
      if (duration < 100) durationBuckets.under100ms += 1;
      else if (duration < 1000) durationBuckets.under1000ms += 1;
      else durationBuckets.over1000ms += 1;
      if (code >= 500) { totals.failures5xx += 1; alertFor5xx(); }
      if (code >= 400 && code < 500) totals.denied4xx += 1;
      publish(code >= 500 ? 'error' : 'info', 'http_request', {
        requestId: started.id, route, method, statusClass, durationMs: duration,
      });
    },
    recordOperation({ component, operation, outcome, durationMs } = {}) {
      if (!COMPONENTS.has(component) || !OPERATIONS.has(operation) || !OUTCOMES.has(outcome)) {
        throw Error('invalid_sabora_diagnostic_category');
      }
      totals.operations += 1;
      if (outcome !== 'success') totals.operationFailures += 1;
      publish(outcome === 'success' ? 'info' : 'warn', 'operation', {
        component, operation, outcome, durationMs: safeMillis(durationMs),
      });
    },
    dependencyFailure(component) {
      if (!COMPONENTS.has(component)) throw Error('invalid_sabora_diagnostic_category');
      publish('error', 'dependency_failed', { component, code: 'dependency_unavailable' });
    },
    lifecycle(event) {
      if (!['started_health_only', 'stopped_health_only',
        'started_operational_candidate', 'stopped_operational_candidate'].includes(event)) {
        throw Error('invalid_sabora_diagnostic_lifecycle');
      }
      publish('info', 'lifecycle', { code: event });
    },
    snapshot() {
      return Object.freeze({
        ...totals,
        byRoute: Object.freeze({ ...byRoute }),
        durationBuckets: Object.freeze({ ...durationBuckets }),
      });
    },
  });
}
