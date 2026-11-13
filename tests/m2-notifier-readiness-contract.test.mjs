import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../apps/api/src/m2-restaurant-candidate.mjs',import.meta.url),'utf8');

test('M2 startup cannot overwrite an observed notifier loss with ready=true',()=>{
 assert.match(source,/notificationDependencyLost=true;operational=false/g);
 assert.equal((source.match(/notificationDependencyLost=true;operational=false/g)??[]).length,2);
 assert.match(source,/await app\.ready\(\);operational=!notificationDependencyLost;/);
 assert.doesNotMatch(source,/await app\.ready\(\);operational=true;/);
});
