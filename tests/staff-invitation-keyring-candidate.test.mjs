import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {createStaffInvitationKeyringCandidate} from '../apps/api/src/staff-invitation-keyring-candidate.mjs';
import {sealStaffInvitationToken,openStaffInvitationToken} from '../apps/api/src/staff-invitation-envelope-candidate.mjs';

const enrollmentId='11111111-2222-4333-8444-555555555555';
const token='T'.repeat(48);
const tokenHashHex=createHash('sha256').update(token).digest('hex');
function key(id,state,key=randomBytes(32)){return {id,state,key};}
function ring(activeKeyId,keys){return createStaffInvitationKeyringCandidate({activeKeyId,keys});}
test('keyring permits one active key and rejects ambiguous/invalid key material',()=>{
  const old=key('staff_old_001','decrypt_only');
  const current=key('staff_new_002','active');
  assert.throws(()=>ring('staff_new_002',[old,key('staff_new_002','active',Buffer.alloc(4))]),
    /invalid_staff_key_material/);
  assert.throws(()=>ring('staff_new_002',[current,current]),/invalid_staff_keyring_config/);
  assert.throws(()=>ring('staff_new_002',[current,key('staff_extra_003','active')]),
    /invalid_staff_keyring_config/);
  assert.throws(()=>ring('staff_old_001',[old,current]),/invalid_staff_keyring_config/);
  assert.throws(()=>ring('staff_new_002',[current,key('staff_new_002','disabled')]),
    /invalid_staff_keyring_config/);
});
test('rotation retains historical decryption, but disabled keys fail closed',()=>{
  const previous=key('staff_old_001','active');
  const first=ring(previous.id,[previous]);
  const context={enrollmentId,inviteVersion:1,tokenHashHex};
  const envelope=sealStaffInvitationToken({token,...context,
    keyId:first.active().keyId,key:first.active().key});
  first.close();
  const next=ring('staff_new_002',[
    key('staff_old_001','decrypt_only',previous.key),
    key('staff_new_002','active'),
    key('staff_dead_003','disabled'),
  ]);
  assert.equal(openStaffInvitationToken({envelope,...context,
    key:next.resolveKey(envelope.keyId)}),token);
  const nextEnvelope=sealStaffInvitationToken({token,...context,
    keyId:next.active().keyId,key:next.active().key});
  assert.equal(nextEnvelope.keyId,'staff_new_002');
  assert.throws(()=>next.resolveKey('staff_dead_003'),/staff_key_unavailable/);
  assert.throws(()=>next.resolveKey('staff_missing_004'),/staff_key_unavailable/);
  const retired=ring('staff_new_002',[
    key('staff_old_001','disabled',previous.key),
    key('staff_new_002','active'),
  ]);
  assert.throws(()=>retired.resolveKey(envelope.keyId),/staff_key_unavailable/);
  next.close();retired.close();
});
test('keyring does not retain caller buffer and does not expose internal buffer',()=>{
  const source=randomBytes(32),saved=Buffer.from(source);
  const selected=ring('staff_live_001',[key('staff_live_001','active',source)]);
  source.fill(0);
  const exported=selected.active().key;
  assert.deepEqual(exported,saved);
  exported.fill(0);
  assert.deepEqual(selected.resolveKey('staff_live_001'),saved);
  selected.close();
  assert.throws(()=>selected.active(),/staff_keyring_closed/);
  assert.throws(()=>selected.resolveKey('staff_live_001'),/staff_keyring_closed/);
  selected.close();
});
