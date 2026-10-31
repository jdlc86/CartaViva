import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../../supabase/migrations/20261027122858_sabora_h6_events_payments_operations_candidate.sql',import.meta.url),'utf8');
const candidate=readFileSync(new URL('../../../supabase/migrations/20261030124000_sabora_table_change_candidate.sql',import.meta.url),'utf8');
const extract=(start,end)=>{
 const a=sql.indexOf(start);
 assert.ok(a>=0,'missing H6 function: '+start);
 const b=sql.indexOf(end,a);
 assert.ok(b>a,'missing function terminator: '+end);
 return sql.slice(a,b);
};
const confirmation=extract('FUNCTION sabora.confirm_customer_round_h6_candidate(', '$confirm_h6$;');

test.skip('table transfer H6 readiness: account must be located before order persistence',()=>{
 const persist=confirmation.indexOf('FROM sabora.persist_customer_order_candidate(');
 const account=confirmation.indexOf('FROM sabora.customer_accounts a');
 assert.ok(persist>=0&&account>=0);
 assert.ok(account<persist,'H6 persists an order before resolving the original account; destination confirmation may split financial identity');
});
test.skip('table transfer H6 readiness: confirmation must consume an approved grant atomically',()=>{
 assert.match(confirmation,/customer_table_change_requests/,'H6 does not yet consume table-change authorization inside its transaction');
});
test('table transfer H6 readiness: candidate grant records destination and consuming order',()=>{
 assert.match(candidate,/destination_table_id/);
 assert.match(candidate,/consumed_order_id/);
});

test('table transfer schema rejects approval at or beyond response deadline',()=>{
 assert.match(candidate,/status NOT IN \('approved','rejected','consumed'\) OR decided_at < expires_at/);
});
