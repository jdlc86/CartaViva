import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('management bootstrap resets React identity tree synchronously on every mount', async () => {
  const source=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');
  assert.match(source,/import\s*\{flushSync\}\s*from\s*['"]react-dom['"]/);
  assert.match(source,/const key = \+\+managementRenderGeneration/);
  assert.match(source,/flushSync\(\(\) => managementRoot!\.render\(/);
  assert.match(source,/<ManagementApp key=\{key\} operationsGateway=\{gateway\}/);
  assert.match(source,/managementSessionFence\.replace\(operationsGateway\)/);
  assert.match(source,/if \(current && managementElement === element\) renderManagement\(element\)/);
});

test('default management preview stays without an operational gateway', async () => {
  const source=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');
  assert.match(source,/if \(element\) renderManagement\(element\);/);
  assert.doesNotMatch(source,/localStorage|sessionStorage/);
});
