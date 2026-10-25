import {createStaffProtectedHooksFromPool} from './staff-protected-hooks-from-pool.mjs';
import {createPostgresTransaction} from './postgres-transaction.mjs';
import {createOrderOperationsCoordinator} from './order-operations-coordinator.mjs';
import {registerOrderOperationsHttp} from './order-operations-http.mjs';
import {preflightOrderOperationsIdentities, preflightOrderTransitionIdentity, preflightOrderTransitionStaffIdentity} from './order-operations-identity-preflight.mjs';

function assertIsolatedPools(staffPool, operationsPool) {
  if (!staffPool || !operationsPool || staffPool === operationsPool ||
      typeof staffPool.query !== 'function' || typeof operationsPool.connect !== 'function' ||
      (staffPool.options?.user && staffPool.options.user === operationsPool.options?.user) ||
      (staffPool.options?.connectionString &&
        staffPool.options.connectionString === operationsPool.options?.connectionString)) {
    throw Error('invalid_order_operations_pool_isolation');
  }
}

// Opt-in only. The application bootstrap must supply independently provisioned
// staff-reader and operational pools. This module opens no connection, reads no
// environment variable and is deliberately not imported by server.mjs.
function registerOrderOperationsFromPools(app, {
  staffPool,
  operationsPool,
  issuer,
  getTrustedKeys,
  verify,
  observe,
  issueTransitionCapability,
} = {}) {
  assertIsolatedPools(staffPool, operationsPool);
  const forRoles = createStaffProtectedHooksFromPool({
    pool: staffPool,
    issuer,
    getTrustedKeys,
    verify,
    observe,
  });
  const operations = createOrderOperationsCoordinator({
    withTransaction: createPostgresTransaction({pool: operationsPool}),
    issueTransitionCapability,
  });
  registerOrderOperationsHttp(app, {forRoles, operations});
}

// Separate asynchronous gate: never mount routes before identity verification.
// The existing synchronous composition remains unmounted by server.mjs.
export async function registerVerifiedOrderOperationsFromPools(app, options = {}) {
  const {
    staffPool, operationsPool, staffRole, operationsRole, issueTransitionCapability,
  } = options;
  assertIsolatedPools(staffPool, operationsPool);
  if (typeof issueTransitionCapability !== 'function') {
    throw Error('invalid_order_operation_capability_issuer');
  }
  await preflightOrderOperationsIdentities({
    staffPool, operationsPool, staffRole, operationsRole,
  });
  return registerOrderOperationsFromPools(app, options);
}

// Explicit opt-in, mutation-only candidate. This gate NEVER mounts board or
// history: the operations SQL login is forbidden from reading private tables.
// Caller supplies independently authenticated staff hooks and both pools;
// neither server.mjs nor a default bootstrap imports this registration.
export async function registerVerifiedOrderTransitionsOnlyFromPools(app, options = {}) {
  const {
    staffPool, operationsPool, staffRole, operationsRole,
    issueTransitionCapability,
  } = options;
  assertIsolatedPools(staffPool, operationsPool);
  if (typeof issueTransitionCapability !== 'function') {
    throw Error('invalid_order_operation_capability_issuer');
  }
  if (!app || typeof app.post !== 'function' || typeof app.hasRoute !== 'function' ||
      app.hasRoute({method: 'POST',
        url: '/api/v1/operations/order-lines/:lineId/transitions'})) {
    throw Error('invalid_order_transition_route_registration');
  }
  if (staffRole === operationsRole) throw Error('invalid_order_operations_pool_isolation');
  await preflightOrderTransitionStaffIdentity({pool: staffPool, role: staffRole});
  await preflightOrderTransitionIdentity({pool: operationsPool, role: operationsRole});
  const forRoles = createStaffProtectedHooksFromPool({
    pool: staffPool,
    issuer: options.issuer,
    getTrustedKeys: options.getTrustedKeys,
    verify: options.verify,
    observe: options.observe,
  });
  const operations = createOrderOperationsCoordinator({
    withTransaction: createPostgresTransaction({pool: operationsPool}),
    issueTransitionCapability,
  });
  registerOrderOperationsHttp(app, {forRoles, operations, transitionOnly: true});
}
