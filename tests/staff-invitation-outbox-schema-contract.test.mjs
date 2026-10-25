import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const file = new URL('../docs/security/sql-candidates/staff_invitation_outbox_schema_pg17.sql', import.meta.url);

test('candidate outbox schema has explicit no-grant RLS boundary', async () => {
  const sql = await readFile(file, 'utf8');
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql, /CREATE TABLE sabora\.staff_invitation_outbox/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON sabora\.staff_invitation_outbox FROM PUBLIC/);
  assert.doesNotMatch(sql, /\bGRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE|EXECUTE)\b/i);
  assert.doesNotMatch(sql, /\bCREATE\s+ROLE\b/i);
});

test('candidate outbox schema has durable identity and replay uniqueness', async () => {
  const sql = await readFile(file, 'utf8');
  assert.match(sql, /REFERENCES sabora\.staff_enrollments\(id\)/);
  assert.match(sql, /UNIQUE INDEX staff_invitation_outbox_enrollment_version_unique/);
  assert.match(sql, /ON sabora\.staff_invitation_outbox\(enrollment_id, invite_version\)/);
  assert.match(sql, /CHECK \(octet_length\(invite_token_hash\) = 32\)/);
});

test('candidate schema is not in the operational migrations directory', () => {
  assert.match(file.pathname, /docs\/security\/sql-candidates\//);
});

test('candidate dispatch authorization is durable and fenced by schema constraints', async () => {
  const sql = await readFile(file, 'utf8');
  assert.match(sql, /'claimed', 'dispatching', 'delivered'/);
  assert.match(sql, /dispatch_authorized_at timestamptz/);
  assert.match(sql, /staff_invitation_outbox_dispatch_shape/);
  assert.match(sql, /state IN \('dispatching', 'delivered', 'failed'\) AND dispatch_authorized_at IS NOT NULL/);
  assert.match(sql, /dispatch_authorized_at >= claimed_at/);
});

test('failed dispatch preserves authorization timestamp and requires nonnull outcome', async () => {
  const sql = await readFile(file, 'utf8');
  assert.match(sql, /state IN \('dispatching', 'delivered', 'failed'\) AND dispatch_authorized_at IS NOT NULL/);
  assert.match(sql, /state = 'failed' AND provider_outcome IS NOT NULL/);
  assert.match(sql, /state = 'delivered' AND provider_outcome IS NOT NULL/);
});

test('candidate schema couples attempts, cancellation fence and updated timestamps', async () => {
  const sql = await readFile(file, 'utf8');
  assert.match(sql, /staff_invitation_outbox_attempt_shape/);
  assert.match(sql, /state IN \('pending', 'claimed', 'cancelled'\) AND attempts = 0/);
  assert.match(sql, /state IN \('dispatching', 'delivered', 'failed'\) AND attempts >= 1/);
  assert.match(sql, /state = 'cancelled'[\s\S]*fence IS NULL AND claimed_at IS NULL[\s\S]*fence IS NOT NULL AND claimed_at IS NOT NULL/);
  assert.match(sql, /updated_at >= claimed_at/);
  assert.match(sql, /updated_at >= dispatch_authorized_at/);
  assert.match(sql, /updated_at >= delivered_at/);
});
