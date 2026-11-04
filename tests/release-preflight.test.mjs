import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
test('Docker Compose owns an isolated project, bridge network and loopback-only port', () => {
  const c = read('deploy/compose.sabora.yml');
  assert.match(c, /^name:\s*sabora\s*$/m);
  assert.match(c, /^\s+sabora_private:\s*$/m);
  assert.match(c, /driver:\s*bridge/);
  assert.match(c, /127\.0\.0\.1:4100:4100/);
  assert.doesNotMatch(c, /(?:^|\n)\s*(?:container_name|network_mode|pid|ipc|volumes_from):/);
});
test('CI remains read-only and never requests deployment credentials', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /contents:\s*read/);
  assert.doesNotMatch(ci, /(?:id-token|packages|actions):\s*write|secrets\.|workflow_dispatch|ssh-action|appleboy|docker login/);
});
test('no fabricated dependency lockfile is shipped', () => {
  const p = new URL('pnpm-lock.yaml', root);
  if (existsSync(p)) {
    assert.match(read('pnpm-lock.yaml'), /^lockfileVersion:/);
  }
});

test('H6 failure packet extracts TAP failures without treating green output as failure',async()=>{
 const {extractH6Failures,createH6DiagnosticReport}=await import('../scripts/ci/h6-failure-diagnostics.mjs');
 const log=['ok 1 - passed','not ok 2 - signed reader rejects revoked staff',
  '  ---','  location: /tmp/test.mjs:25:1','  error: invalid capability',
  '  ...','##[error]Process completed with exit code 1'].join('\n');
 const findings=extractH6Failures(log);
 assert.equal(findings.length,2);
 assert.equal(findings[0].kind,'tap');
 assert.equal(findings[0].title,'signed reader rejects revoked staff');
 assert.equal(findings[0].location,'/tmp/test.mjs:25:1');
 assert.deepEqual(extractH6Failures('ok 1 - passed\n# pass 1\n# fail 0'),[]);
 const report=createH6DiagnosticReport({runId:'123',commit:'abcdef',block:'contracts',
  exitCode:1,log});
 assert.equal(report.status,'fail');
 assert.equal(report.repairPolicy.maxAttempts,3);
 assert.equal(report.repairPolicy.allowDeploy,false);
 assert.equal(report.repairPolicy.automaticCodeModification,false);
 assert.equal(createH6DiagnosticReport({runId:'123',commit:'abc',block:'contracts',
  exitCode:0,log:'ok 1 - passed'}).status,'pass');
});
test('H6 acceptance is bounded to a disposable runner and cannot modify production',()=>{
 const gate=read('scripts/ci/h6-acceptance-gate.sh');
 const ci=read('.github/workflows/ci.yml');
 assert.match(gate,/GITHUB_ACTIONS/);
 assert.match(gate,/h6-failure-diagnostics\.mjs/);
 assert.match(ci,/h6-acceptance-gate\.sh/);
 assert.doesNotMatch(ci,/contents:\s*write|workflow_dispatch|secrets\./);
});
