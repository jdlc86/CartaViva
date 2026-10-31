import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const guard=readFileSync(new URL('../../../supabase/migrations/20261030143000_sabora_h6_cross_table_account_guard_candidate.sql',import.meta.url),'utf8');
test('H6 cross-table guard serializes by customer and rejects before order persistence',()=>{
 const lock=guard.indexOf('pg_advisory_xact_lock(');
 const check=guard.indexOf("a.table_id<>p_table_id");
 const reject=guard.indexOf("RAISE EXCEPTION 'table_change_transfer_not_integrated'");
 const persist=guard.indexOf('SELECT * INTO v_persist FROM sabora.persist_customer_order_candidate(');
 assert.ok(lock>0&&check>lock&&reject>check&&persist>reject);
 assert.match(guard,/a\.customer_id=v_session\.customer_id/);
 assert.doesNotMatch(guard,/a\.session_id=v_visit\.session_id/);
 assert.match(guard,/a\.state='open' AND a\.table_id<>p_table_id/);
 assert.ok(guard.indexOf('customer_visit_forbidden')<guard.indexOf('a.table_id<>p_table_id'));
 assert.match(guard,/CREATE OR REPLACE FUNCTION sabora\.confirm_customer_round_h6_candidate/);
 assert.match(guard,/OWNER TO sabora_h6_fn_owner/);
 assert.match(guard,/GRANT EXECUTE ON FUNCTION sabora\.confirm_customer_round_h6_candidate/);
});
