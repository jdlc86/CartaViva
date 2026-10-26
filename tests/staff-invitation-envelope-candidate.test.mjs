import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {sealStaffInvitationToken,openStaffInvitationToken} from '../apps/api/src/staff-invitation-envelope-candidate.mjs';

const token='T'.repeat(48);
const enrollmentId='a0000000-0000-4000-8000-000000000001';
const inviteVersion=2;
const tokenHashHex=createHash('sha256').update(token).digest('hex');
const key=randomBytes(32);
const keyId='candidate_key_001';
const args={token,enrollmentId,inviteVersion,tokenHashHex,key,keyId};
const open=(envelope,overrides={})=>openStaffInvitationToken({envelope,enrollmentId,inviteVersion,tokenHashHex,key,...overrides});

test('AES-GCM envelope roundtrips without exposing token in serializable fields',()=>{
  const envelope=sealStaffInvitationToken(args);
  assert.equal(open(envelope),token);
  assert.equal(JSON.stringify(envelope).includes(token),false);
  assert.equal(Object.isFrozen(envelope),true);
  assert.equal(envelope.version,1);
});
test('independent nonces produce distinct ciphertexts',()=>{
  const a=sealStaffInvitationToken(args),b=sealStaffInvitationToken(args);
  assert.notEqual(a.nonce,b.nonce);
  assert.notEqual(a.ciphertext,b.ciphertext);
});
test('authenticated context rejects version, enrollment and hash substitution',()=>{
  const envelope=sealStaffInvitationToken(args);
  for(const overrides of [
    {inviteVersion:3},
    {enrollmentId:'b0000000-0000-4000-8000-000000000001'},
    {tokenHashHex:'a'.repeat(64)},
    {key:randomBytes(32)},
  ]) assert.throws(()=>open(envelope,overrides),/staff_delivery_decryption_denied/);
});
test('tampered ciphertext, tag, nonce or extra metadata fail closed',()=>{
  const envelope=sealStaffInvitationToken(args);
  for(const field of ['nonce','tag','ciphertext']){
    const altered={...envelope,[field]:(envelope[field][0]==='A'?'B':'A')+envelope[field].slice(1)};
    assert.throws(()=>open(altered),/staff_delivery_(decryption_denied|envelope)/);
  }
  assert.throws(()=>open({...envelope,debug:token}),/invalid_staff_delivery_envelope/);
});
test('mismatched hash and malformed key are rejected before encryption',()=>{
  assert.throws(()=>sealStaffInvitationToken({...args,tokenHashHex:'b'.repeat(64)}),/staff_delivery_token_hash_mismatch/);
  assert.throws(()=>sealStaffInvitationToken({...args,key:Buffer.alloc(16)}),/invalid_staff_delivery_encryption_key/);
});

test('key identity is authenticated and an explicit expected key id is enforced',()=>{
  const envelope=sealStaffInvitationToken(args);
  assert.equal(open(envelope,{keyId}),token);
  assert.throws(()=>open({...envelope,keyId:'candidate_key_002'}),
    /staff_delivery_decryption_denied/);
  assert.throws(()=>open(envelope,{keyId:'candidate_key_002'}),
    /invalid_staff_delivery_envelope/);
});
test('malformed or undersized ciphertext fails before decrypt',()=>{
  const envelope=sealStaffInvitationToken(args);
  for(const ciphertext of ['', 'A', 'A'.repeat(2000),
    Buffer.alloc(20).toString('base64url')]){
    assert.throws(()=>open({...envelope,ciphertext}),
      /invalid_staff_delivery_envelope/);
  }
});

test('canonical envelopes roundtrip boundary and long token lengths',()=>{
  for(const length of [32,48,57,58,64,128,512]){
    const candidateToken=String.fromCharCode(65+(length%26)).repeat(length);
    const candidateHash=createHash('sha256').update(candidateToken).digest('hex');
    const candidateArgs={...args,token:candidateToken,tokenHashHex:candidateHash};
    const envelope=sealStaffInvitationToken(candidateArgs);
    for(const value of [envelope.nonce,envelope.ciphertext,envelope.tag]){
      assert.match(value,/^[A-Za-z0-9_-]+$/);
      assert.doesNotMatch(value,/\r|\n/);
    }
    assert.equal(openStaffInvitationToken({
      envelope,enrollmentId,inviteVersion,tokenHashHex:candidateHash,key,
    }),candidateToken);
  }
});

test('noncanonical wrapped base64url remains rejected',()=>{
  const envelope=sealStaffInvitationToken(args);
  const midpoint=Math.floor(envelope.ciphertext.length/2);
  assert.throws(()=>open({...envelope,
    ciphertext:`${envelope.ciphertext.slice(0,midpoint)}\n${envelope.ciphertext.slice(midpoint)}`}),
  /invalid_staff_delivery_envelope/);
});
