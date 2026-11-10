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

const transferCandidate=readFileSync(new URL('../../../supabase/migrations/20261031010000_sabora_h6_transfer_confirmation_integration_candidate.sql',import.meta.url),'utf8');
const activeFlow=readFileSync(new URL('./customer-production-flow.mjs',import.meta.url),'utf8');
const sealedRpc=readFileSync(new URL('./table-change-sealed-rpc-candidate.mjs',import.meta.url),'utf8');
test('B3 transfer candidate remains sealed until atomic customer and staff cutover',()=>{
 const signature='sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)';
 assert.match(transferCandidate,/CREATE OR REPLACE FUNCTION sabora\.confirm_customer_round_h6_transfer_integration_candidate\(/);
 assert.ok(transferCandidate.includes('ALTER FUNCTION '+signature));
 assert.ok(transferCandidate.includes('REVOKE ALL ON FUNCTION '+signature));
 assert.doesNotMatch(transferCandidate,/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+sabora\.confirm_customer_round_h6_transfer_integration_candidate/i);
 assert.match(activeFlow,/export const PERSIST_H6_ORDER_SQL=[\s\S]*?FROM sabora\.confirm_customer_round_h6_candidate\(/);
 assert.doesNotMatch(activeFlow,/FROM sabora\.confirm_customer_round_h6_transfer_integration_candidate\(/);
 assert.match(sealedRpc,/Not mounted in production/);
 assert.match(sealedRpc,/REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL/);
 assert.match(sealedRpc,/DECIDE_TABLE_CHANGE_H6_SQL/);
});
