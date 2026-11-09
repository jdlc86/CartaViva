import type {OrderOperationsGateway} from './order-operations-gateway.js';
import type {TableChangeQueueGateway} from './views/TableChangeRequestsPanel';

export declare function createAuthenticatedOrderOperationsGateway(options: {
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  reconnectDelayMs?: number;
  enableWaiterCalls?: boolean;
}): OrderOperationsGateway & TableChangeQueueGateway & {revoke(): void};
