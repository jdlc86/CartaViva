import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migrationPath = new URL(
  '../supabase/migrations/20261025081318_staff_identity_lifecycle_candidate.sql',
  import.meta.url,
);

test('staff lifecycle migration makes the first enrollment durable and revocable', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE sabora\.staff_enrollments/i);
  assert.match(sql, /state text NOT NULL DEFAULT 'invited'/i);
  assert.match(sql, /'invited','accepted','registered','active','suspended','revoked'/i);
  assert.match(sql, /p_action IN \('invite','activate','resend','suspend','revoke'\)/i);
  assert.match(sql, /p_action = 'revoke'[\s\S]*state = 'revoked'/i);
  assert.match(sql, /invite_token_hash = sha256\(invite_token_hash\)/i);
  assert.match(sql, /UPDATE sabora\.staff_members SET state = 'revoked'/i);
  assert.match(sql, /v_enrollment\.auth_user_id = v_owner_user_id[\s\S]*protected_admin_owner/i);
  assert.doesNotMatch(sql, /requested_role IN \([^)]*root/i);
});

test('staff lifecycle SQL boundary is sealed, append-only and dormant', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const table of [
    'staff_enrollments', 'staff_lifecycle_requests',
    'staff_lifecycle_audit', 'staff_lifecycle_signing_keys',
  ]) {
    assert.match(sql, new RegExp(`ALTER TABLE sabora\\.${table} FORCE ROW LEVEL SECURITY`, 'i'));
  }
  assert.match(sql, /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, pg_temp/i);
  assert.match(sql, /p_database_role <> session_user::text/i);
  assert.match(sql, /extensions\.hmac\(/i);
  assert.match(sql, /NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS/i);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON sabora\.staff_lifecycle_audit/i);
  assert.match(sql, /BEFORE TRUNCATE ON sabora\.staff_lifecycle_requests/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION sabora\.transition_staff_lifecycle_authorized_candidate/i);
  assert.doesNotMatch(sql,
    /GRANT EXECUTE ON FUNCTION sabora\.transition_staff_lifecycle_authorized_candidate[\s\S]* TO (?!sabora_staff_lifecycle_fn_owner)/i);
});

test('staff lifecycle locks suspend and revoke target membership before final expiry check', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const boundary = sql.match(/SELECT enrollment\.\* INTO v_enrollment[\s\S]*?IF p_action = 'invite' THEN/i)?.[0];
  assert.ok(boundary);
  assert.match(boundary,
    /IF p_action = 'suspend'[\s\S]*FROM sabora\.staff_members[\s\S]*FOR UPDATE/i);
  assert.match(boundary,
    /ELSIF p_action = 'revoke'[\s\S]*FROM sabora\.staff_members[\s\S]*FOR UPDATE/i);
  assert.match(boundary,
    /FOR UPDATE;[\s\S]*clock_timestamp\(\)[\s\S]*p_expires_at_ms <= v_now_ms/i);
});

test('production server does not mount candidate staff lifecycle operations', async () => {
  const server = await readFile(new URL('../apps/api/src/server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /staff-lifecycle|staff_enrollments|transition_staff_lifecycle/i);
  assert.doesNotMatch(server, /api\/v1\/.*staff/i);
});
