const PATH = '/release-postcheck';
const MAX_BYTES = 1024;
const FRESH_MS = 30_000;
const RETAIN_MS = 7 * 86400_000;
const HOUR_MS = 3600_000;
const MAX_RECEIPTS = 256;
const MAX_PER_MINUTE = 12;
const SHA = /^[a-f0-9]{40}$/;
const CORRELATION = /^[a-f0-9]{64}$/;
const EVENT_KEYS = ['at', 'correlation', 'project', 'releaseSha', 'schema'];

const respond = (status, data) => Response.json(data, {
  status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
});
const failed = status => respond(status, {received: false});

async function readEvent(request) {
  if (request.headers.get('content-type') !== 'application/json' ||
      request.headers.has('content-encoding') || !request.body) return null;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(MAX_BYTES);
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
    const body = bytes.subarray(0, size);
    const text = new TextDecoder('utf-8', {fatal: true}).decode(body);
    const event = JSON.parse(text);
    if (!event || typeof event !== 'object' ||
        Object.keys(event).sort().join('|') !== EVENT_KEYS.join('|') ||
        event.schema !== 'sabora-release-postcheck/v1' || event.project !== 'sabora' ||
        typeof event.releaseSha !== 'string' || !SHA.test(event.releaseSha) ||
        typeof event.correlation !== 'string' || !CORRELATION.test(event.correlation) ||
        typeof event.at !== 'string' ||
        text !== JSON.stringify(Object.fromEntries(EVENT_KEYS.map(key => [key, event[key]])))) return null;
    const timestamp = Date.parse(event.at);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== event.at ||
        Math.abs(Date.now() - timestamp) > FRESH_MS) return null;
    const digest = await crypto.subtle.digest('SHA-256', body);
    const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    return {event, sha256, timestamp};
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.hostname !== env.RECEIVER_HOST ||
        url.port || url.pathname !== PATH || url.search || request.method !== 'POST') return failed(404);
    if (!env.SABORA_SOURCE_IPV4 || !request.cf ||
        request.headers.get('cf-connecting-ip') !== env.SABORA_SOURCE_IPV4) return failed(403);
    try {
      return await env.SABORA_RECEIPTS.get(env.SABORA_RECEIPTS.idFromName('sabora-release')).fetch(request);
    } catch {
      return failed(503);
    }
  }
};

export class SaboraReceipts {
  constructor(ctx) {
    this.storage = ctx.storage;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS receipts (
      correlation TEXT PRIMARY KEY, release_sha TEXT NOT NULL,
      received_sha256 TEXT NOT NULL, received_ms INTEGER NOT NULL
    )`);
  }

  async fetch(request) {
    const parsed = await readEvent(request);
    if (!parsed) return failed(400);
    const {event, sha256, timestamp} = parsed;
    try {
      if (await this.storage.getAlarm() === null) await this.storage.setAlarm(Date.now() + HOUR_MS);
      const now = Date.now();
      if (Math.abs(now - timestamp) > FRESH_MS) return failed(400);
      const status = this.storage.transactionSync(() => {
        this.sql.exec('DELETE FROM receipts WHERE received_ms <= ?', now - RETAIN_MS);
        if (this.sql.exec('SELECT 1 FROM receipts WHERE correlation = ?', event.correlation).toArray().length) return 409;
        const {total, recent} = this.sql.exec(
          'SELECT count(*) AS total, count(CASE WHEN received_ms > ? THEN 1 END) AS recent FROM receipts',
          now - 60_000
        ).one();
        if (total >= MAX_RECEIPTS || recent >= MAX_PER_MINUTE) return 429;
        this.sql.exec('INSERT INTO receipts VALUES (?, ?, ?, ?)', event.correlation, event.releaseSha, sha256, now);
        return 200;
      });
      if (status !== 200) return failed(status);
      await this.storage.sync();
      return respond(200, {
        schema: 'sabora-alert-reception/v2', project: 'sabora', releaseSha: event.releaseSha,
        correlation: event.correlation, receivedSha256: sha256, receivedAt: new Date(now).toISOString()
      });
    } catch {
      return failed(503);
    }
  }

  async alarm() {
    this.sql.exec('DELETE FROM receipts WHERE received_ms <= ?', Date.now() - RETAIN_MS);
    if (this.sql.exec('SELECT 1 FROM receipts LIMIT 1').toArray().length) {
      await this.storage.setAlarm(Date.now() + HOUR_MS);
    }
    await this.storage.sync();
  }
}
