import {createOrderOperationsRepository} from './order-operations-repository.mjs';
import {createStaffProtectedHooksFromPool} from './staff-protected-hooks-from-pool.mjs';
import {createPostgresTransaction} from './postgres-transaction.mjs';
import {createOrderOperationsCoordinator} from './order-operations-coordinator.mjs';
import {registerOrderOperationsHttp} from './order-operations-http.mjs';
import {
  preflightOrderOperationsIdentities,
  preflightOrderOperationsRuntimeIdentity,
  preflightOrderOperationsH6DeliveryIdentity,
  preflightOrderTransitionIdentity,
  preflightOrderTransitionStaffIdentity,
} from './order-operations-identity-preflight.mjs';

function assertIsolatedPools(staffPool, operationsPool) {
  if (!staffPool || !operationsPool || staffPool === operationsPool ||
      typeof staffPool.query !== 'function' || typeof staffPool.connect !== 'function' ||
      typeof operationsPool.query !== 'function' || typeof operationsPool.connect !== 'function' ||
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
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function' ||
      typeof app.hasRoute !== 'function' || [
        ['GET', '/api/v1/operations/order-lines'],
        ['POST', '/api/v1/operations/order-lines/:lineId/transitions'],
        ['GET', '/api/v1/operations/orders/:orderId/history'],
      ].some(([method, url]) => app.hasRoute({method, url}))) {
    throw Error('invalid_order_operations_route_registration');
  }
  if (staffRole === operationsRole) throw Error('invalid_order_operations_pool_isolation');
  if (typeof options.issuer !== 'string' || options.issuer.length === 0 ||
      typeof options.getTrustedKeys !== 'function' ||
      (options.verify !== undefined && typeof options.verify !== 'function') ||
      (options.observe !== undefined && typeof options.observe !== 'function')) {
    throw Error('invalid_order_operations_auth_config');
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
  // Validate authentication wiring before opening either SQL connection.
  // A misconfigured issuer/JWKS/verification hook must never leave a
  // partially mounted or apparently operational endpoint.
  if (typeof options.issuer !== 'string' || options.issuer.length === 0 ||
      typeof options.getTrustedKeys !== 'function' ||
      (options.verify !== undefined && typeof options.verify !== 'function') ||
      (options.observe !== undefined && typeof options.observe !== 'function')) {
    throw Error('invalid_order_transition_auth_config');
  }
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

// Explicit opt-in full H4 candidate. All three endpoints are mounted only after
// cryptographic HTTP authentication wiring and both least-privilege SQL LOGINs
// have passed their independent preflights. server.mjs never imports this path.
export async function registerVerifiedRestrictedOrderOperationsFromPools(app, options = {}) {
  const {
    staffPool, operationsPool, staffRole, operationsRole,
    issueTransitionCapability, issueReadCapability,
  } = options;
  assertIsolatedPools(staffPool, operationsPool);
  if (typeof issueTransitionCapability !== 'function' ||
      typeof issueReadCapability !== 'function') {
    throw Error('invalid_order_operation_capability_issuer');
  }
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function' ||
      typeof app.hasRoute !== 'function' || [
        ['GET', '/api/v1/operations/order-lines'],
        ['POST', '/api/v1/operations/order-lines/:lineId/transitions'],
        ['GET', '/api/v1/operations/orders/:orderId/history'],
      ].some(([method, url]) => app.hasRoute({method, url}))) {
    throw Error('invalid_order_operations_route_registration');
  }
  if (staffRole === operationsRole) throw Error('invalid_order_operations_pool_isolation');
  if (typeof options.issuer !== 'string' || options.issuer.length === 0 ||
      typeof options.getTrustedKeys !== 'function' ||
      (options.verify !== undefined && typeof options.verify !== 'function') ||
      (options.observe !== undefined && typeof options.observe !== 'function')) {
    throw Error('invalid_order_operations_auth_config');
  }
  await preflightOrderTransitionStaffIdentity({pool: staffPool, role: staffRole});
  await preflightOrderOperationsRuntimeIdentity({pool: operationsPool, role: operationsRole});
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
    issueReadCapability,
  });
  registerOrderOperationsHttp(app, {forRoles, operations});
}

// H6/B2 destination-aware staff board: explicit, isolated candidate.
// Not imported or mounted by the default server. Requires the extra
// function EXECUTE privilege and all three H4 wrappers, with no table access.
export async function registerVerifiedH6DeliveryOrderOperationsFromPools(app, options = {}) {
  const {
    staffPool, operationsPool, staffRole, operationsRole,
    issueTransitionCapability, issueReadCapability,
  } = options;
  assertIsolatedPools(staffPool, operationsPool);
  if (typeof issueTransitionCapability !== 'function' ||
      typeof issueReadCapability !== 'function') {
    throw Error('invalid_order_operation_capability_issuer');
  }
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function' ||
      typeof app.hasRoute !== 'function' || [
        ['GET', '/api/v1/operations/order-lines'],
        ['POST', '/api/v1/operations/order-lines/:lineId/transitions'],
        ['GET', '/api/v1/operations/orders/:orderId/history'],
      ].some(([method, url]) => app.hasRoute({method, url}))) {
    throw Error('invalid_order_operations_route_registration');
  }
  if (staffRole === operationsRole) throw Error('invalid_order_operations_pool_isolation');
  if (typeof options.issuer !== 'string' || options.issuer.length === 0 ||
      typeof options.getTrustedKeys !== 'function' ||
      (options.verify !== undefined && typeof options.verify !== 'function') ||
      (options.observe !== undefined && typeof options.observe !== 'function')) {
    throw Error('invalid_order_operations_auth_config');
  }
  await preflightOrderTransitionStaffIdentity({pool: staffPool, role: staffRole});
  await preflightOrderOperationsH6DeliveryIdentity({pool: operationsPool, role: operationsRole});
  const forRoles = createStaffProtectedHooksFromPool({
    pool: staffPool, issuer: options.issuer, getTrustedKeys: options.getTrustedKeys,
    verify: options.verify, observe: options.observe,
  });
  const operations = createOrderOperationsCoordinator({
    withTransaction: createPostgresTransaction({pool: operationsPool}),
    repository: createOrderOperationsRepository({deliveryBoardCandidate: true}),
    issueTransitionCapability, issueReadCapability,
  });
  registerOrderOperationsHttp(app, {forRoles, operations});
}
