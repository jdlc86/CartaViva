import type {AdminTablesGateway} from './tables-read-model.js';
import type {M3CatalogGateway} from './m3-catalog-management-model.js';
import type {FinanceDashboardGateway} from './finance-dashboard-model.js';
import type {M5CommunicationsGateway} from './m5-communications-model.js';
import type {StaffGatewayAuth} from './staff-gateway-auth.js';
export type M3AuthenticatedManagementGateway=AdminTablesGateway&M3CatalogGateway&FinanceDashboardGateway&M5CommunicationsGateway&Readonly<{
 readTableChangeWindow?(options?:{signal?:AbortSignal}):Promise<{seconds:number;canWrite:boolean}>;
 saveTableChangeWindow?(options:{requestId:string;expectedSeconds:number;seconds:number;signal?:AbortSignal}):Promise<void>;
 revoke():void;
}>;
export function createM3AuthenticatedManagementGateway(options:Readonly<StaffGatewayAuth & {
 fetchImpl?:typeof fetch;
 tableChangeWindow?:boolean;
}>):M3AuthenticatedManagementGateway;
