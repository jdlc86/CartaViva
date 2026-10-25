import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffInvitationEnqueueCandidate, STAFF_INVITATION_ENQUEUE_SQL} from '../apps/api/src/staff-invitation-enqueue-candidate.mjs';

const id = 'a0000000-0000-4000-8000-000000000001';
const job = 'b0000000-0000-4000-8000-000000000002';
const hash = 'a'.repeat(64);
const capability = Object.freeze({action:'invite', enrollmentId:id, inviteTokenHashHex:hash});
const transition = Object.freeze({enrollmentId:id, inviteVersion:1, currentState:'invited', repeated:false});
function harness({repeated=false, insertRows=[{id:job}], failTransition=false}={}) {
  const calls=[];
  let committed=false;
  const repository={async transition(query) {
    calls.push('transition');
    if (failTransition) throw Error('transition_failure');
    return {...transition,repeated};
  }};
  const coordinator=createStaffInvitationEnqueueCandidate({
    lifecycleRepository:repository,uuid:()=>job,
    withTransaction:async callback=>{
      const result=await callback(async (sql,params)=>{
        calls.push('insert');
        assert.equal(sql,STAFF_INVITATION_ENQUEUE_SQL);
        assert.deepEqual(params,[job,id,1,hash]);
        return {rows:insertRows};
      });
      committed=true;
      return result;
    },
  });
  return {coordinator,calls,wasCommitted:()=>committed};
}
test('invitation and enqueue use one transaction in order',async()=>{
  const h=harness();
  const result=await h.coordinator.transitionAndEnqueue(capability);
  assert.equal(result.enqueued,true);
  assert.deepEqual(h.calls,['transition','insert']);
  assert.equal(h.wasCommitted(),true);
});
test('replay does not create another outbox job',async()=>{
  const h=harness({repeated:true});
  assert.deepEqual(await h.coordinator.transitionAndEnqueue(capability),{
    transition:{...transition,repeated:true},enqueued:false,repeated:true,
  });
  assert.deepEqual(h.calls,['transition']);
});
test('missing insert result fails closed and transaction does not commit',async()=>{
  const h=harness({insertRows:[]});
  await assert.rejects(h.coordinator.transitionAndEnqueue(capability),/staff_enqueue_atomicity_violation/);
  assert.equal(h.wasCommitted(),false);
});
test('conflicting SQL rows fail closed',async()=>{
  const h=harness({insertRows:[{id:job},{id:job}]});
  await assert.rejects(h.coordinator.transitionAndEnqueue(capability),/staff_enqueue_atomicity_violation/);
  assert.equal(h.wasCommitted(),false);
});
test('lifecycle failure never enqueues',async()=>{
  const h=harness({failTransition:true});
  await assert.rejects(h.coordinator.transitionAndEnqueue(capability),/transition_failure/);
  assert.deepEqual(h.calls,['transition']);
});
test('reject invalid action, hash and uuid before any transaction',async()=>{
  const h=harness();
  for(const input of [{...capability,action:'revoke'},{...capability,inviteTokenHashHex:'secret'},{...capability,enrollmentId:'bad'}])
    await assert.rejects(h.coordinator.transitionAndEnqueue(input),/invalid_staff_enqueue_input/);
  assert.deepEqual(h.calls,[]);
});
test('SQL enforces current enrollment version and hash, with no token plaintext',()=>{
  assert.match(STAFF_INVITATION_ENQUEUE_SQL,/e\.invite_version = \$3::integer/);
  assert.match(STAFF_INVITATION_ENQUEUE_SQL,/encode\(e\.invite_token_hash, 'hex'\) = \$4::text/);
  assert.match(STAFF_INVITATION_ENQUEUE_SQL,/ON CONFLICT \(enrollment_id, invite_version\) DO NOTHING/);
  assert.doesNotMatch(STAFF_INVITATION_ENQUEUE_SQL,/token_plaintext|secret_material/i);
});
