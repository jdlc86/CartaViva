import {createStaffProtectedHooksFromPool} from './staff-protected-hooks-from-pool.mjs';
import {createAdminTablesReaderQuery} from './admin-tables-reader-query.mjs';
import {registerAdminTablesReadRoute} from './admin-tables-read-route.mjs';

// Explicit bootstrap composition candidate. No network, credentials or global hooks.
// The two pools MUST use independently provisioned minimum-privilege SQL identities.
export function registerProtectedAdminTablesReadFromPools(app,{
 staffPool,adminTablesPool,issuer,getTrustedKeys,verify,observe
}={}){
 if(!staffPool||!adminTablesPool||staffPool===adminTablesPool)
  throw Error('invalid_admin_tables_pool_isolation');
 const forRoles=createStaffProtectedHooksFromPool({
  pool:staffPool,issuer,getTrustedKeys,verify,observe
 });
 const query=createAdminTablesReaderQuery({pool:adminTablesPool});
 registerAdminTablesReadRoute(app,{forRoles,query});
}
