import {createStaffProtectedHooksFromPool} from './staff-protected-hooks-from-pool.mjs';
import {createPostgresTransaction} from './postgres-transaction.mjs';
import {createOrderOperationsCoordinator} from './order-operations-coordinator.mjs';
import {registerOrderOperationsHttp} from './order-operations-http.mjs';

// Opt-in only. The application bootstrap must supply independently provisioned
// staff-reader and operational pools. This module opens no connection, reads no
// environment variable and is deliberately not imported by server.mjs.
export function registerOrderOperationsFromPools(app, {
  staffPool,
  operationsPool,
  issuer,
  getTrustedKeys,
  verify,
  observe,
} = {}) {
  if (!staffPool || !operationsPool || staffPool === operationsPool ||
      typeof staffPool.query !== 'function' || typeof operationsPool.connect !== 'function' ||
      (staffPool.options?.user && staffPool.options.user === operationsPool.options?.user) ||
      (staffPool.options?.connectionString &&
        staffPool.options.connectionString === operationsPool.options?.connectionString)) {
    throw Error('invalid_order_operations_pool_isolation');
  }
  const forRoles = createStaffProtectedHooksFromPool({
    pool: staffPool,
    issuer,
    getTrustedKeys,
    verify,
    observe,
  });
  const operations = createOrderOperationsCoordinator({
    withTransaction: createPostgresTransaction({pool: operationsPool}),
  });
  registerOrderOperationsHttp(app, {forRoles, operations});
}
