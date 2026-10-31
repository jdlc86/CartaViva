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

const transferSql=readFileSync(new URL('../../../supabase/migrations/20261031010000_sabora_h6_transfer_confirmation_integration_candidate.sql',import.meta.url),'utf8');
const transferStart=transferSql.indexOf('FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(');
const transferEnd=transferSql.indexOf('$confirm_h6$;',transferStart);
assert.ok(transferStart>=0&&transferEnd>transferStart,'missing isolated F12 confirmation candidate');
const transferConfirmation=transferSql.slice(transferStart,transferEnd);

test('F12 candidate resolves the economic account and approval before order persistence',()=>{
 const account=transferConfirmation.indexOf('FROM sabora.customer_accounts a');
 const approval=transferConfirmation.indexOf('FROM sabora.customer_table_change_requests q');
 const persist=transferConfirmation.indexOf('FROM sabora.persist_customer_order_candidate(');
 assert.ok(account>=0&&approval>account&&persist>approval,
  'account and destination-independent approval must be checked before persisting a new order');
});

test('F12 candidate consumes grant after round and delivery projection within one transaction',()=>{
 const round=transferConfirmation.indexOf('INSERT INTO sabora.order_rounds(');
 const destination=transferConfirmation.indexOf('INSERT INTO sabora.order_line_delivery_destinations');
 const consume=transferConfirmation.indexOf('sabora.consume_customer_table_change_h6_candidate(');
 assert.ok(round>=0&&destination>round&&consume>destination,
  'grant must be consumed atomically after the economic round and pending delivery projection');
});

test('F12 candidate stays isolated from customer runtime until B3 acceptance',()=>{
 assert.match(transferSql,/REVOKE ALL ON FUNCTION sabora\.confirm_customer_round_h6_transfer_integration_candidate\([\s\S]*?FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_h6_provider_runtime,sabora_h6_customer_runtime,sabora_h6_operations_runtime;/);
 const flow=readFileSync(new URL('./customer-production-flow.mjs',import.meta.url),'utf8');
 assert.match(flow,/FROM sabora\.confirm_customer_round_h6_candidate\(/);
 assert.doesNotMatch(flow,/FROM sabora\.confirm_customer_round_h6_transfer_integration_candidate\(/);
});

test('F12 cutover gate keeps runtime composition, SQL allowlist and preflight disconnected until B3 is complete',()=>{
 const composition=readFileSync(new URL('./customer-production-composition.mjs',import.meta.url),'utf8');
 const preflight=readFileSync(new URL('./h6-sql-preflight.mjs',import.meta.url),'utf8');
 const flow=readFileSync(new URL('./customer-production-flow.mjs',import.meta.url),'utf8');
 const h6Sql=composition.match(/const h6FlowSql=new Set\(\[([^\]]+)\]\)/);
 assert.ok(h6Sql,'H6 SQL allowlist must remain explicit');
 assert.doesNotMatch(h6Sql[1],/TRANSFER|TABLE_CHANGE/i,
  'F12 transfer SQL must not enter customer runtime allowlist without full B3 cutover');
 assert.doesNotMatch(composition,/registerTableChangeStaffHttp\s*\(/,
  'staff decisions must not be mounted without authenticated operational composition');
 assert.doesNotMatch(composition,/tableChange\s*:\s*createTableChangeService/,
  'customer requests must not be mounted without an authorized PostgreSQL adapter');
 assert.doesNotMatch(preflight,/confirm_customer_round_h6_transfer_integration_candidate/,
  'preflight must be updated with exact grants as part of a coordinated cutover');
 assert.match(flow,/FROM sabora\.confirm_customer_round_h6_candidate\(/,
  'active H6 confirmation remains the existing function');
});
