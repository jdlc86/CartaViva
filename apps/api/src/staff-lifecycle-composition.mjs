import {createPostgresTransaction} from './postgres-transaction.mjs';
import {createStaffLifecycleCoordinator} from './staff-lifecycle-coordinator.mjs';
import {createStaffLifecycleRepository} from './staff-lifecycle-repository.mjs';
import {preflightStaffLifecycleIdentity} from './staff-lifecycle-identity-preflight.mjs';

// This is a candidate-only composition. It deliberately does not register HTTP
// routes, provision credentials, read environment variables or deliver invitations.
// The caller must provide a separately verified HTTP identity and staff context.
export async function createVerifiedStaffLifecycleFromPool({
  pool, role, issueCapability, issueInvitationToken, hashInviteeEmail,
  verifyCredentialRegistration, uuid,
} = {}) {
  if (typeof issueCapability !== 'function' ||
      typeof issueInvitationToken !== 'function' ||
      typeof hashInviteeEmail !== 'function' ||
      typeof verifyCredentialRegistration !== 'function' ||
      typeof uuid !== 'function') {
    throw Error('invalid_staff_lifecycle_composition');
  }
  // A failed preflight must never expose a coordinator that can issue SQL.
  await preflightStaffLifecycleIdentity({pool, role});
  return createStaffLifecycleCoordinator({
    withTransaction: createPostgresTransaction({pool}),
    repository: createStaffLifecycleRepository(),
    issueCapability, issueInvitationToken, hashInviteeEmail,
    verifyCredentialRegistration, uuid,
  });
}
