import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scripts/ci/catalog-postgres17-node-driver-smoke.sh',
 import.meta.url),'utf8');
const h6Source=readFileSync(new URL('../scripts/ci/h6-postgres17.test.mjs',import.meta.url),'utf8');

test('focused issue61 PG17 scope reuses one migrated cluster and exits before unrelated suites',()=>{
 assert.match(source,/SABORA_PG17_TEST_SCOPE:-full/);
 assert.match(source,/"\$scope" != full && "\$scope" != issue61/);
 assert.match(source,/workspace_pg=/);
 assert.match(source,/SABORA_CI_REUSE_WORKSPACE_PG=true/);
 assert.match(source,/RUNNER_TEMP="\$\(cygpath -w "\$tmp"\)"/);
 const migrations=source.indexOf('for migration in supabase/migrations/*.sql');
 const focused=source.indexOf('node --test scripts/ci/h6-postgres17.test.mjs');
 const unrelated=source.indexOf('node --test scripts/ci/catalog-postgres17-driver-integration.test.mjs');
 const playwright=source.indexOf('playwright@1.56.1');
 assert.ok(migrations>=0&&focused>migrations&&unrelated>focused&&playwright>unrelated);
 assert.match(source.slice(focused,unrelated),/exit 0/);
 assert.match(source.slice(migrations,unrelated),/r\.resolve\('@playwright\/test'\)/);
 assert.match(h6Source,/focusedWorkspaceDriver/);
 assert.match(h6Source,/apiRequire\('pg\/package\.json'\)\.version==='8\.16\.3'/);
});

test('default full PG17 gate retains Chromium and the complete integrated sequence',()=>{
 for(const command of [
  'node --test scripts/ci/h6-postgres17.test.mjs',
  'node --test scripts/ci/table-change-root-postgres17.test.mjs',
  'node --test scripts/ci/ownership-governance-postgres17.test.mjs'
 ])assert.ok(source.includes(command),command);
 assert.match(source,/playwright" install chromium/);
});
