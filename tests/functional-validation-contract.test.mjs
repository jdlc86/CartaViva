import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
 FUNCTIONAL_VALIDATION_MATRIX,
 inspectFunctionalValidation,
} from '../scripts/ci/functional-validation-contract.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=relative=>readFileSync(new URL(`../${relative}`,import.meta.url),'utf8');

test('functional validation matrix binds every P3 block-4 flow to executable evidence',()=>{
 assert.deepEqual(inspectFunctionalValidation(root),[]);
 assert.deepEqual(FUNCTIONAL_VALIDATION_MATRIX.map(item=>item.id),[
  'qr','visit','catalog','order','grouping','kitchen','waiter','notifications',
  'error_states','offline','revocations',
 ]);
 assert.ok(FUNCTIONAL_VALIDATION_MATRIX.every(item=>item.evidence.length>=2));
});

test('functional gate detects removed waiter browser coverage and missing CI execution',()=>{
 const smoke=read('scripts/ci/management-authenticated-browser-smoke.mjs').replaceAll('Voy a recoger','Recoger');
 const workflow=read('.github/workflows/ci.yml').replace('node scripts/ci/functional-validation-contract.mjs','');
 const violations=inspectFunctionalValidation(root,{overrides:{
  'scripts/ci/management-authenticated-browser-smoke.mjs':smoke,
  '.github/workflows/ci.yml':workflow,
 }});
 assert.ok(violations.some(value=>value.startsWith('functional_marker_missing:waiter:')));
 assert.ok(violations.includes('functional_ci_marker_missing:functional-validation-contract.mjs'));
});

test('functional gate rejects periodic polling and privileged client routes',()=>{
 const source=read('apps/client/src/App.tsx');
 assert.doesNotMatch(source,/setInterval\s*\(/);
 assert.doesNotMatch(source,/\/api\/v1\/(?:operations|admin|staff)/);
 assert.deepEqual(inspectFunctionalValidation(root),[]);
});
