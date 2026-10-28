import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261028120000_sabora_staff_directory_read_candidate.sql',import.meta.url),'utf8');
test('directory contacts require forced RLS and unique email',()=>{
 assert.match(sql,/CREATE TABLE sabora\.staff_directory_contacts\s*\(/);
 assert.match(sql,/email text NOT NULL UNIQUE CHECK/);
 assert.match(sql,/ALTER TABLE sabora\.staff_directory_contacts FORCE ROW LEVEL SECURITY/);
});
test('directory contact write is restricted to signed invite path',()=>{
 const start=sql.indexOf('CREATE FUNCTION sabora.transition_staff_lifecycle_with_directory_candidate(');
 const end=sql.indexOf('$directory_write$;',start);
 assert.ok(start>=0&&end>start);
 const fn=sql.slice(start,end);
 assert.match(fn,/p_action='invite'/);
 assert.match(fn,/INSERT INTO sabora\.staff_directory_contacts\(enrollment_id,email\)/);
 assert.doesNotMatch(fn,/UPDATE\s+sabora\.staff_directory_contacts\s+SET/i);
 assert.doesNotMatch(fn,/DELETE\s+FROM\s+sabora\.staff_directory_contacts/i);
});
test('directory reads do not fabricate missing historic contact',()=>{
 const start=sql.indexOf('CREATE FUNCTION sabora.read_staff_directory_authorized_candidate(');
 const end=sql.indexOf('$directory_read$;',start);
 assert.ok(start>=0&&end>start);
 const fn=sql.slice(start,end);
 assert.match(fn,/JOIN sabora\.staff_directory_contacts contact ON contact\.enrollment_id=enrollment\.id/);
 assert.doesNotMatch(fn,/LEFT JOIN sabora\.staff_directory_contacts/);
});
