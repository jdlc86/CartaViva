import { createPostgresStaffLookup } from './postgres-staff-lookup.mjs';
import { createProtectedRouteHooks } from './protected-route-hooks.mjs';

// Composition boundary only. The backend caller owns the database connection,
// lifecycle and credentials. Never instantiate with a browser or service-role key.
// No routes are registered here or in server.mjs.
export function createPostgresProtectedRouteHooks({
  issuer, getTrustedKeys, query, verify
} = {}) {
  const lookupStaff = createPostgresStaffLookup({ query });
  return createProtectedRouteHooks({ issuer, getTrustedKeys, lookupStaff, verify });
}
