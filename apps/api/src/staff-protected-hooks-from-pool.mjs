import { createStaffReaderQuery } from './staff-reader-query.mjs';
import { createSafeStaffReaderQuery } from './safe-staff-reader-query.mjs';
import { createPostgresProtectedRouteHooks } from './postgres-protected-route-hooks.mjs';

// Bootstrap dependency injection only: does not open a connection or expose routes.
// The caller must provide a separately provisioned, least-privilege PostgreSQL pool.
export function createStaffProtectedHooksFromPool({
  pool, issuer, getTrustedKeys, verify, observe
} = {}) {
  const query = createSafeStaffReaderQuery({
    query: createStaffReaderQuery({ pool }), observe
  });
  return createPostgresProtectedRouteHooks({ query, issuer, getTrustedKeys, verify });
}
