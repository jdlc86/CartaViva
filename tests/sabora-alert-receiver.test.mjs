import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {stableStringify} from '../scripts/ci/sabora-release-governor.mjs';
import {verifyAlertReceptionV2} from '../scripts/ops/sabora-release-readiness.mjs';
import worker, {SaboraReceipts} from '../deploy/sabora-alert-receiver/worker.mjs';

test('alert receiver validates the ingress, ACKs only durable inserts, and rejects replay', async t => {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  let alarm = null;
  let commitFailure = false;
  let syncCount = 0;
  const storage = {
    sql: {
      exec(sql, ...params) {
        const statement = database.prepare(sql);
        if (sql.startsWith('SELECT')) return {toArray: () => statement.all(...params), one: () => statement.get(...params)};
        statement.run(...params);
      }
    },
    getAlarm: async () => alarm,
    setAlarm: async time => { alarm = time; },
    sync: async () => { syncCount++; },
    transactionSync(body) {
      database.exec('BEGIN');
      try {
        const result = body();
        if (commitFailure) throw Error('fixture_storage_failed');
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
  const receiver = new SaboraReceipts({storage});
  const host = 'sabora-alert-receiver.sabora.workers.dev';
  const allowed = '192.0.2.10';
  const env = {
    RECEIVER_HOST: host, SABORA_SOURCE_IPV4: allowed,
    SABORA_RECEIPTS: {idFromName: name => name, get: () => receiver}
  };
  const event = {
    schema: 'sabora-release-postcheck/v1', project: 'sabora', releaseSha: 'a'.repeat(40),
    correlation: 'b'.repeat(64), at: new Date().toISOString()
  };
  const request = (body, {ip = allowed, scheme = 'https', trusted = true} = {}) => {
    const req = new Request(scheme + '://' + host + '/release-postcheck', {
      method: 'POST', body, headers: {'Content-Type': 'application/json', 'CF-Connecting-IP': ip}
    });
    if (trusted) Object.defineProperty(req, 'cf', {value: {}});
    return worker.fetch(req, env);
  };
  const body = stableStringify(event);
  assert.equal((await request(body, {scheme: 'http'})).status, 404);
  assert.equal((await request(body, {ip: '192.0.2.11'})).status, 403);
  assert.equal((await request(body, {trusted: false})).status, 403);
  assert.equal((await request(' '.repeat(1025))).status, 400);
  assert.equal((await request(' '+body)).status, 400);
  assert.equal((await request(stableStringify({...event, at: new Date(Date.now() - 60000).toISOString()}))).status, 400);

  commitFailure = true;
  assert.equal((await request(body)).status, 503);
  assert.equal(database.prepare('SELECT count(*) AS count FROM receipts').get().count, 0);
  commitFailure = false;
  const response = await request(body);
  assert.equal(response.status, 200);
  assert.equal(syncCount, 1);
  const ack = await response.json();
  verifyAlertReceptionV2(JSON.stringify(ack), event, body);
  const record = database.prepare('SELECT * FROM receipts WHERE correlation = ?').get(event.correlation);
  assert.equal(record.received_sha256, ack.receivedSha256);
  assert.equal(record.received_ms, Date.parse(ack.receivedAt));
  assert.equal((await request(body)).status, 409);
  for (const patch of [
    {receivedSha256: 'c'.repeat(64)}, {correlation: 'c'.repeat(64)}, {releaseSha: 'd'.repeat(40)},
    {receivedAt: new Date(Date.now() - 60000).toISOString()}
  ]) assert.throws(() => verifyAlertReceptionV2(JSON.stringify({...ack, ...patch}), event, body), /alert_reception_unproven/);

  for (let i = 1; i < 12; i++) {
    const fresh = {...event, correlation: i.toString(16).padStart(64, '0')};
    assert.equal((await request(stableStringify(fresh))).status, 200);
  }
  assert.equal((await request(stableStringify({...event, correlation: 'd'.repeat(64)}))).status, 429);
  database.prepare('UPDATE receipts SET received_ms = ?').run(Date.now() - 8 * 86400_000);
  await receiver.alarm();
  assert.equal(database.prepare('SELECT count(*) AS count FROM receipts').get().count, 0);
});
