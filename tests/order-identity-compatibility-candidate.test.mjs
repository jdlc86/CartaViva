import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261022120000_sabora_order_identity_compatibility_candidate.sql',import.meta.url),'utf8');

test('candidate identity bridge preserves legacy line source and adds new identity fields',()=>{
 for(const column of ['customer_alias','customer_identifier','customer_visit_key','economic_snapshot'])
  assert.match(sql,new RegExp('ADD COLUMN '+column+' '));
 assert.match(sql,/ALTER COLUMN company DROP NOT NULL/);
 assert.match(sql,/ALTER COLUMN employee_number DROP NOT NULL/);
 assert.match(sql,/company IS NOT NULL AND employee_number IS NOT NULL/);
 assert.match(sql,/company IS NULL AND employee_number IS NULL/);
 assert.match(sql,/customer_alias IS NOT NULL AND customer_identifier IS NOT NULL/);
 assert.match(sql,/customer_visit_key IS NOT NULL AND economic_snapshot IS NOT NULL/);
 assert.doesNotMatch(sql,/DROP COLUMN|DROP TABLE|DROP TRIGGER|CREATE POLICY|GRANT\s/i);
 assert.doesNotMatch(sql,/ALTER\s+COLUMN\s+items/i);
 assert.match(sql,/REVOKE ALL ON sabora\.orders FROM PUBLIC, anon, authenticated/);
});

test('candidate identity bridge keeps transaction atomic and disallows mixed identity modes',()=>{
 assert.match(sql,/^BEGIN;/m);
 assert.match(sql,/^COMMIT;/m);
 assert.match(sql,/ADD CONSTRAINT sabora_order_identity_mode CHECK/);
 assert.match(sql,/customer_alias IS NULL AND customer_identifier IS NULL/);
 assert.match(sql,/economic_snapshot->>'schemaVersion' = '1'/);
});
