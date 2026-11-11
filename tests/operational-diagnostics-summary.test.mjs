import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSaboraLogLines } from '../scripts/ops/sabora-diagnostics-summary.mjs';

const record = (event, more = {}) => JSON.stringify({ schema: 1, source: 'sabora_observability', service: 'sabora-api', event, ...more });

test('one-shot Sabora log summarizer accepts only structured approved diagnostics', async () => {
  const dangerous = 'Bearer_SENSITIVE_TOKEN_DO_NOT_ECHO';
  const lines = [
    'sabora-api-1 | ' + record('http_request', {route:'/health',statusClass:'2xx',query:dangerous}),
    record('http_request',{route:'other',statusClass:'5xx',password:dangerous}),
    record('operation',{component:'payments',outcome:'denied',query:dangerous}),
    record('dependency_failed',{component:'database'}),
    record('alert',{code:'http_5xx_burst'}),
    'other-app-1 | ' + JSON.stringify({schema:1,source:'sabora_observability',service:'foreign',event:'http_request'}),
    'sabora-api-1 | malformed ' + dangerous,
  ];
  const summary = await summarizeSaboraLogLines(lines);
  assert.deepEqual(summary, {
    schema:1,service:'sabora-api',scope:'supplied_sabora_log_stream_only',
    events:5,httpRequests:2,http5xx:1,http4xx:0,operations:1,operationProblems:1,
    dependencyFailures:1,alerts:1,routes:{'/health':1,'/ready':0,other:1},
  });
  assert.doesNotMatch(JSON.stringify(summary),new RegExp(dangerous));
});
