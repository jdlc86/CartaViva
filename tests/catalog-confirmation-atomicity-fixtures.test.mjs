import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const smoke=readFileSync(new URL('../scripts/ci/catalog-confirmation-atomicity-smoke.sql',import.meta.url),'utf8');

test('legacy atomicity fixtures select quotes from their original actor and basket',()=>{
 for(const block of ['failed_writer','duplicate_confirmation','scope_isolation','acceptance_integrity']){
  const start=smoke.indexOf('DO $'+block+'$');
  assert.ok(start>=0,block+' fixture missing');
  const end=smoke.indexOf('END $'+block+'$;',start);
  assert.ok(end>start,block+' fixture unterminated');
  const body=smoke.slice(start,end);
  assert.match(body,/FROM sabora\.catalog_displayed_quotes\s+WHERE table_id=v_table AND visit_id='visit-atomic'\s+AND basket_id='basket-atomic' AND actor_id='actor-atomic';/,
   block+' must not select cross-basket quotes');
 }
});

test('isolation fixtures assert three distinct orders for one reused request key',()=>{
 assert.match(smoke,/DO \$scope_isolation\$/);
 assert.match(smoke,/DO \$basket_isolation\$/);
 assert.match(smoke,/count\(DISTINCT order_id\)[\s\S]*?request_key='request-atomic'\)<>3/);
 assert.match(smoke,/ROLLBACK;\s*$/);
});
