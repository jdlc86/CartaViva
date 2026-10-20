import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
const root = new URL('../', import.meta.url);
test('three independently named apps exist',()=>{
 for(const name of ['client','management','api']) assert.ok(existsSync(new URL(`apps/${name}/package.json`,root)));
});
test('deployment does not reference Fleetia resources',()=>{
 const compose=readFileSync(new URL('deploy/compose.sabora.yml',root),'utf8');
 assert.doesNotMatch(compose,/fleetia|3000|3001|5027|container_name:\s*[^\n]*fleet/i);
});
