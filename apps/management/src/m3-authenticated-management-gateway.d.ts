import type {AdminTablesGateway} from './tables-read-model.js';
import type {M3CatalogGateway} from './m3-catalog-management-model.js';
export type M3AuthenticatedManagementGateway=AdminTablesGateway&M3CatalogGateway&Readonly<{revoke():void}>;
export function createM3AuthenticatedManagementGateway(options:Readonly<{
 getAccessToken:()=>Promise<string>;fetchImpl?:typeof fetch;
}>):M3AuthenticatedManagementGateway;
