import test from 'node:test';
import assert from 'node:assert/strict';
import { issueCustomerSession, hashCustomerSessionToken } from '../apps/api/src/customer-session.mjs';

test('session token is opaque, hashed and time-bounded',()=>{
 const session=issueCustomerSession({random:()=>Buffer.alloc(32,42),now:()=>new Date('2026-10-21T00:00:00Z')});
 assert.match(session.token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(session.tokenHash.length,32);
 assert.deepEqual(hashCustomerSessionToken(session.token),session.tokenHash);
 assert.notEqual(session.tokenHash.toString('hex'),Buffer.alloc(32,42).toString('hex'));
 assert.equal(session.expiresAt.toISOString(),'2026-11-20T00:00:00.000Z');
});
test('malformed or noncanonical bearer tokens fail closed',()=>{
 for(const token of [null,'', 'SB-222222222222', 'x'.repeat(43), 'a'.repeat(44), 'a'.repeat(42)+'!',42]){
  assert.equal(hashCustomerSessionToken(token),null);
 }
});
test('invalid entropy, clock and lifetime are rejected',()=>{
 assert.throws(()=>issueCustomerSession({random:()=>Buffer.alloc(12)}),/invalid_session_entropy/);
 assert.throws(()=>issueCustomerSession({now:()=>new Date(NaN)}),/invalid_session_clock/);
 assert.throws(()=>issueCustomerSession({lifetimeSeconds:0}),/invalid_session_configuration/);
 assert.throws(()=>issueCustomerSession({lifetimeSeconds:60*60*24*91}),/invalid_session_configuration/);
});
