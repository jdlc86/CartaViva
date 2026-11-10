import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../../../supabase/migrations/20261030124000_sabora_table_change_candidate.sql',import.meta.url),'utf8');
const h6=readFileSync(new URL('../../../supabase/migrations/20261027122858_sabora_h6_events_payments_operations_candidate.sql',import.meta.url),'utf8');
test('table change migration preserves one active grant and durable request cooldown indexes',()=>{
 assert.match(migration,/CREATE UNIQUE INDEX customer_table_change_one_pending[\s\S]*?WHERE status='pending'/);
 assert.match(migration,/CREATE UNIQUE INDEX customer_table_change_one_approval[\s\S]*?WHERE status='approved'/);
 assert.match(migration,/CREATE UNIQUE INDEX customer_table_change_one_grant_per_order[\s\S]*?WHERE consumed_order_id IS NOT NULL/);
 assert.match(migration,/decided_at < expires_at/);
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
});
test('H6 current lookup and confirmation are structurally incompatible with naive table_id transfer',()=>{
 const lookup=h6.slice(h6.indexOf('CREATE FUNCTION sabora.read_customer_round_h6_candidate('));
 assert.match(lookup,/a\.table_id=t\.id/);
 assert.match(lookup,/o\.table_id=t\.id/);
 const confirm=h6.slice(h6.indexOf('CREATE FUNCTION sabora.confirm_customer_round_h6_candidate('),
  h6.indexOf('$confirm_h6$;',h6.indexOf('CREATE FUNCTION sabora.confirm_customer_round_h6_candidate(')));
 assert.match(confirm,/INSERT INTO sabora\.customer_accounts\(table_id,session_id,visit_key,customer_id\)/);
 assert.match(confirm,/v_account\.id,v_round\.id,v_round\.amount_cents/);
});
