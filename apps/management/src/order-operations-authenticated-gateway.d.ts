import type {OrderOperationsGateway} from './order-operations-gateway.js';
import type {TableChangeQueueGateway} from './views/TableChangeRequestsPanel';
import type {StaffGatewayAuth} from './staff-gateway-auth.js';

export declare function createAuthenticatedOrderOperationsGateway(options: StaffGatewayAuth & {
  fetchImpl?: typeof fetch;
  reconnectDelayMs?: number;
  enableWaiterCalls?: boolean;
}): OrderOperationsGateway & TableChangeQueueGateway & {revoke(): void};
