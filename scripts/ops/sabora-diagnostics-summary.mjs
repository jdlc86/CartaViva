#!/usr/bin/env node
// One-shot report for an explicitly scoped Sabora log stream. No fetching,
// polling, Docker control, file writes, secret values or raw-line echo.
import { createInterface } from 'node:readline';

const ROUTES = new Set(['/health', '/ready', 'other']);
const EVENTS = new Set(['http_request', 'operation', 'dependency_failed', 'lifecycle', 'alert']);
export async function summarizeSaboraLogLines(lines) {
  const totals = { events: 0, httpRequests: 0, http5xx: 0, http4xx: 0, operations: 0, operationProblems: 0, dependencyFailures: 0, alerts: 0 };
  const routes = { '/health': 0, '/ready': 0, other: 0 };
  for await (const raw of lines) {
    if (typeof raw !== 'string' || raw.length > 16384) continue;
    const start = raw.indexOf('{');
    if (start === -1) continue;
    let record;
    try { record = JSON.parse(raw.slice(start)); } catch { continue; }
    if (record?.schema !== 1 || record.source !== 'sabora_observability' ||
        record.service !== 'sabora-api' || !EVENTS.has(record.event)) continue;
    totals.events += 1;
    if (record.event === 'http_request') {
      totals.httpRequests += 1;
      if (record.statusClass === '5xx') totals.http5xx += 1;
      if (record.statusClass === '4xx') totals.http4xx += 1;
      if (ROUTES.has(record.route)) routes[record.route] += 1;
    }
    if (record.event === 'operation') {
      totals.operations += 1;
      if (record.outcome !== 'success') totals.operationProblems += 1;
    }
    if (record.event === 'dependency_failed') totals.dependencyFailures += 1;
    if (record.event === 'alert') totals.alerts += 1;
  }
  return Object.freeze({ schema: 1, service: 'sabora-api', scope: 'supplied_sabora_log_stream_only', ...totals, routes });
}

if (process.argv[1] && new URL('file://' + process.argv[1]).href === import.meta.url) {
  if (process.argv.length !== 2) {
    process.stderr.write('sabora_diagnostics_summary_arguments_forbidden\n');
    process.exitCode = 1;
  } else {
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
    const summary = await summarizeSaboraLogLines(lines);
    process.stdout.write(JSON.stringify(summary) + '\n');
  }
}
