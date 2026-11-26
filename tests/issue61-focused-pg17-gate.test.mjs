import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scripts/ci/catalog-postgres17-node-driver-smoke.sh',
 import.meta.url),'utf8');
const h6Source=readFileSync(new URL('../scripts/ci/h6-postgres17.test.mjs',import.meta.url),'utf8');
const rootSource=readFileSync(new URL('../scripts/ci/table-change-root-postgres17.test.mjs',import.meta.url),'utf8');
const bootstrapSource=readFileSync(new URL('../scripts/ci/disposable-h6-runtime-bootstrap.mjs',import.meta.url),'utf8');

test('focused issue61 PG17 scope reuses one migrated cluster and exits before unrelated suites',()=>{
 assert.match(source,/SABORA_PG17_TEST_SCOPE:-full/);
 assert.match(source,/"\$scope" != full && "\$scope" != issue61/);
 assert.match(source,/SABORA_PG17_ISSUE61_TARGET:-all/);
 assert.match(source,/issue61_target" != all && "\$issue61_target" != h6 && "\$issue61_target" != i49/);
 assert.match(source,/workspace_pg=/);
 assert.match(source,/SABORA_CI_REUSE_WORKSPACE_PG=true/);
 assert.match(source,/RUNNER_TEMP="\$\(cygpath -w "\$tmp"\)"/);
 const migrations=source.indexOf('for migration in supabase/migrations/*.sql');
 const focused=source.indexOf('node --test scripts/ci/h6-postgres17.test.mjs');
 const unrelated=source.indexOf('node --test scripts/ci/catalog-postgres17-driver-integration.test.mjs');
 const focusedExit=source.indexOf(' exit 0\nfi',focused);
 const playwright=source.indexOf('playwright@1.56.1');
 const chromium=source.indexOf('playwright" install chromium',playwright);
 const genesis=source.indexOf('node --test scripts/ci/staff-root-bootstrap-postgres17.test.mjs');
 // Focused scope must exit before full-scope downloads AND every unrelated
 // suite. Full-scope Chromium is now required by the genesis PWA test.
 assert.ok(migrations>=0&&focused>migrations&&focusedExit>focused&&
  playwright>focusedExit&&chromium>playwright&&genesis>chromium&&unrelated>genesis);
 assert.equal(source.indexOf('playwright@1.56.1',playwright+1),-1);
 assert.match(source.slice(migrations,focusedExit),/r\.resolve\('@playwright\/test'\)/);
 assert.match(source.slice(focused,focusedExit),/--test-name-pattern/);
 assert.match(source.slice(focused,focusedExit),/PG17 B3 six isolated logins complete PWA customer A to waiter to economic B journey/);
 assert.match(h6Source,/focusedWorkspaceDriver/);
 assert.match(h6Source,/apiRequire\('pg\/package\.json'\)\.version==='8\.16\.3'/);
 assert.match(rootSource,/focusedWorkspaceDriver/);
 assert.match(rootSource,/apiRequire\('pg\/package\.json'\)\.version==='8\.16\.3'/);
 assert.match(bootstrapSource,/focusedWorkspaceDriver/);
 assert.match(bootstrapSource,/workspacePgVersion==='8\.16\.3'/);
 assert.match(bootstrapSource,/const expected=18\+/);
});

test('default full PG17 gate retains Chromium and the complete integrated sequence',()=>{
 for(const command of [
  'node --test scripts/ci/h6-postgres17.test.mjs',
  'node --test scripts/ci/table-change-root-postgres17.test.mjs',
  'node --test scripts/ci/ownership-governance-postgres17.test.mjs'
 ])assert.ok(source.includes(command),command);
 assert.match(source,/playwright" install chromium/);
});
