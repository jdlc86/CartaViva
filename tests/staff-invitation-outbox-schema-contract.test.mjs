import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const file = new URL('../docs/security/sql-candidates/staff_invitation_outbox_schema_pg17.sql', import.meta.url);

test('candidate outbox schema exposes no runtime grants and keeps FORCE RLS', async () => {
  const sql = await readFile(file, 'utf8');
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql, /CREATE TABLE sabora\.staff_invitation_outbox/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON sabora\.staff_invitation_outbox FROM PUBLIC/);
  assert.match(sql, /CREATE ROLE sabora_staff_invitation_enqueue_fn_owner[\s\S]*NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS/);
  assert.doesNotMatch(sql, /CREATE ROLE\s+(?!sabora_staff_invitation_enqueue_fn_owner)/i);
  assert.doesNotMatch(sql, /CREATE ROLE sabora_staff_invitation_enqueue_fn_owner[\s\S]{0,120}\bLOGIN\b(?![\s\S]{0,20}NOLOGIN)/i);
  assert.doesNotMatch(sql, /GRANT EXECUTE[\s\S]*\bTO\s+(?:anon|authenticated|sabora_staff_reader|sabora_admin_writer)\b/i);
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

test('integrated wrapper is sealed, HMAC-delegating and atomic with outbox', async () => {
  const sql = await readFile(file, 'utf8');
  assert.match(sql, /transition_staff_lifecycle_with_outbox_candidate/);
  assert.match(sql, /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, pg_temp/);
  assert.match(sql, /transition_staff_lifecycle_authorized_candidate\(/);
  assert.match(sql, /OWNER TO sabora_staff_invitation_enqueue_fn_owner/);
  assert.match(sql, /REVOKE ALL ON FUNCTION sabora\.transition_staff_lifecycle_with_outbox_candidate\([\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /INSERT INTO sabora\.staff_invitation_outbox\(/);
  assert.match(sql, /staff_invitation_outbox_replay_missing/);
  const replayLookup = sql.match(/IF repeated THEN[\s\S]*?IF NOT FOUND THEN/i)?.[0];
  assert.ok(replayLookup);
  assert.match(replayLookup, /delivery\.enrollment_id = result_enrollment_id/);
  assert.match(replayLookup, /delivery\.invite_version = result_invite_version/);
  assert.doesNotMatch(replayLookup, /delivery\.invite_token_hash/);
  assert.match(sql, /state = 'cancelled'[\s\S]*p_action = 'resend'/);
  assert.doesNotMatch(sql,
    /GRANT EXECUTE ON FUNCTION sabora\.transition_staff_lifecycle_with_outbox_candidate/i);
});

test('enqueue owner receives only internal function and outbox column privileges', async () => {
  const sql = await readFile(file, 'utf8');
  assert.match(sql, /GRANT USAGE ON SCHEMA sabora TO sabora_staff_invitation_enqueue_fn_owner/);
  assert.match(sql, /GRANT SELECT \(id,enrollment_id,invite_version,invite_token_hash,state\),[\s\S]*INSERT \(id,enrollment_id,invite_version,invite_token_hash\),[\s\S]*UPDATE \(state,updated_at\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION sabora\.transition_staff_lifecycle_authorized_candidate\(/);
  assert.match(sql, /CREATE POLICY staff_invitation_enqueue_owner_select/);
  assert.match(sql, /CREATE POLICY staff_invitation_enqueue_owner_insert/);
  assert.match(sql, /CREATE POLICY staff_invitation_enqueue_owner_cancel/);
  assert.doesNotMatch(sql, /GRANT\s+(?:ALL|DELETE|TRUNCATE|TRIGGER|REFERENCES)\b/i);
});
