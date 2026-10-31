import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REQUEST_TABLE_CHANGE_H6_SQL,DECIDE_TABLE_CHANGE_H6_SQL,REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL} from './table-change-sealed-rpc-candidate.mjs';
const migration=name=>readFileSync(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8');
const request=migration('20261030190000_sabora_h6_table_change_request_decision_candidate.sql');
const decision=migration('20261030210000_sabora_h6_table_change_decision_lock_order_candidate.sql');
const confirmation=migration('20261031070000_sabora_h6_transfer_session_lock_order_candidate.sql');

test('F12 sealed RPC SQL signatures match the final candidate migrations',()=>{
 assert.match(request,/CREATE FUNCTION sabora\.request_customer_table_change_h6_candidate\(\s*p_session_hash bytea,p_account_id uuid/);
 assert.match(request,/RETURNS TABLE\(request_id uuid,request_status text,expires_at timestamptz\)/);
 assert.match(REQUEST_TABLE_CHANGE_H6_SQL,/request_customer_table_change_h6_candidate\(\$1::bytea,\$2::uuid\)/);
 assert.match(decision,/CREATE OR REPLACE FUNCTION sabora\.decide_customer_table_change_h6_candidate\(\s*p_staff_id uuid,p_request_id uuid,p_approve boolean/);
 assert.match(decision,/m\.user_id=p_staff_id AND m\.role IN \('waiter','admin'\) AND m\.state='active'/);
 assert.match(DECIDE_TABLE_CHANGE_H6_SQL,/decide_customer_table_change_h6_candidate\(\$1::uuid,\$2::uuid,\$3::boolean\)/);
});
test('F12 decision serializes on customer before account and request locks',()=>{
 const advisory=decision.indexOf('pg_advisory_xact_lock');
 const account=decision.indexOf("a.state='open' FOR UPDATE");
 const requestLock=decision.indexOf('q.account_id=v_account_id FOR UPDATE');
 assert.ok(advisory>=0&&account>advisory&&requestLock>account);
 assert.match(decision,/v_now>=v_request\.expires_at/);
 assert.match(decision,/RETURN 'expired'/);
});
test('F12 request keeps server deadline, same-session ownership and one active approval',()=>{
 assert.match(request,/s\.token_hash=p_session_hash AND s\.revoked_at IS NULL/);
 assert.match(request,/a\.id=p_account_id AND a\.customer_id=v_customer AND a\.state='open'/);
 assert.match(request,/q\.status='approved'/);
 assert.match(request,/RAISE EXCEPTION 'table_change_cooldown' USING errcode='23514'/);
 assert.match(request,/make_interval\(secs=>v_seconds\)/);
});
test('F12 RPCs remain ungranted to H6 runtime and confirmation remains sealed',()=>{
 assert.match(decision,/REVOKE ALL ON FUNCTION sabora\.decide_customer_table_change_h6_candidate\(uuid,uuid,boolean\)[\s\S]*?sabora_h6_operations_runtime,sabora_h6_provider_runtime/);
 assert.match(confirmation,/REVOKE ALL ON FUNCTION sabora\.confirm_customer_round_h6_transfer_integration_candidate\([\s\S]*?sabora_h6_customer_runtime,sabora_h6_operations_runtime/);
 assert.doesNotMatch(request,/GRANT EXECUTE ON FUNCTION sabora\.request_customer_table_change_h6_candidate/);
 assert.doesNotMatch(decision,/GRANT EXECUTE ON FUNCTION sabora\.decide_customer_table_change_h6_candidate/);
});

test('F12 resolved request is sealed, checks unique account and delegates ownership validation',()=>{
 const source=migration('20261031190000_sabora_h6_table_change_resolved_request_candidate.sql');
 assert.match(source,/CREATE FUNCTION sabora\.request_customer_table_change_h6_resolved_candidate\(\s*p_session_hash bytea/);
 assert.match(source,/SECURITY DEFINER SET search_path=pg_catalog,pg_temp/);
 assert.match(source,/s\.token_hash=p_session_hash AND s\.revoked_at IS NULL/);
 assert.match(source,/WHERE a\.customer_id=v_customer AND a\.state='open'/);
 assert.match(source,/IF v_open_count<>1 THEN/);
 assert.ok(source.indexOf('pg_advisory_xact_lock')<source.indexOf('SELECT count(*)'),
  'account uniqueness must be checked after the customer advisory lock');
 assert.match(source,/sabora\.request_customer_table_change_h6_candidate\(\s*p_session_hash,v_account_id\)/);
 assert.match(source,/REVOKE ALL ON FUNCTION sabora\.request_customer_table_change_h6_resolved_candidate\(bytea\)/);
 assert.doesNotMatch(source,/GRANT EXECUTE ON FUNCTION/);
 assert.match(REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL,/resolved_candidate\(\$1::bytea\)/);
});
