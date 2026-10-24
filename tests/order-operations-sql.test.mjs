import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql = readFileSync(new URL(
  '../supabase/migrations/20261023225024_sabora_kitchen_waiter_operations_candidate.sql',
  import.meta.url
), 'utf8');

test('operational transition persists correlation, notification and event atomically', () => {
  assert.match(sql, /create table sabora\.order_line_transition_requests/i);
  assert.match(sql, /primary key \(actor_user_id, correlation_id\)/i);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended/i);
  assert.match(sql, /from sabora\.order_line_transition_requests request[\s\S]*for update/i);
  assert.match(sql, /from sabora\.staff_members member[\s\S]*state = 'active'[\s\S]*for share/i);
  assert.match(sql, /from sabora\.order_lines line[\s\S]*for update/i);
  assert.match(sql, /insert into sabora\.pickup_notifications/i);
  assert.match(sql, /acknowledged_at = clock_timestamp\(\)/i);
  assert.match(sql, /insert into sabora\.order_line_events/i);
  assert.match(sql, /insert into sabora\.order_line_transition_requests/i);
});

test('operational history is append-only and the candidate remains private', () => {
  assert.match(sql, /sabora_order_line_events_append_only/i);
  assert.match(sql, /sabora_order_line_transition_requests_no_truncate/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all on function sabora\.transition_order_line_idempotent_candidate/i);
  assert.doesNotMatch(sql, /grant\s+(?:execute|select|insert|update|delete)/i);
  assert.doesNotMatch(sql, /security definer/i);
});

test('candidate does not invent delivery or cancellation transitions', () => {
  const functionBody = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION sabora.transition_order_line_idempotent_candidate'));
  assert.doesNotMatch(functionBody, /'delivered'|'cancelled'/i);
  assert.match(functionBody, /'preparing','ready','picked_up'/i);
});
