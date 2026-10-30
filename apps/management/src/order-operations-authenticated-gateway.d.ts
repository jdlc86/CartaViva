import type {OrderOperationsGateway} from './order-operations-gateway.js';

export declare function createAuthenticatedOrderOperationsGateway(options: {
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  reconnectDelayMs?: number;
}): OrderOperationsGateway & {revoke(): void};
