import type {AdminTablesGateway} from './tables-read-model.js';
import type {M3CatalogGateway} from './m3-catalog-management-model.js';
import type {FinanceDashboardGateway} from './finance-dashboard-model.js';
export type M3AuthenticatedManagementGateway=AdminTablesGateway&M3CatalogGateway&FinanceDashboardGateway&Readonly<{revoke():void}>;
export function createM3AuthenticatedManagementGateway(options:Readonly<{
 getAccessToken:()=>Promise<string>;fetchImpl?:typeof fetch;
}>):M3AuthenticatedManagementGateway;
