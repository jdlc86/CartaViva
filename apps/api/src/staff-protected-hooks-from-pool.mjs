import { createStaffReaderQuery } from './staff-reader-query.mjs';
import { createPostgresProtectedRouteHooks } from './postgres-protected-route-hooks.mjs';

// Bootstrap dependency injection only: does not open a connection or expose routes.
// The caller must provide a separately provisioned, least-privilege PostgreSQL pool.
export function createStaffProtectedHooksFromPool({
  pool, issuer, getTrustedKeys, verify
} = {}) {
  const query = createStaffReaderQuery({ pool });
  return createPostgresProtectedRouteHooks({ query, issuer, getTrustedKeys, verify });
}
