import type {OrderBoard, OrderHistory, OrderLineStatus, OrderLineTarget, OrderTransition} from './order-operations-model.js';
export type OrderOperationsSender = (path: string, init: RequestInit) => Promise<Response>;
export interface OrderOperationsGateway {
  listBoard(input?: {status?: OrderLineStatus | null; limit?: number}): Promise<OrderBoard>;
  transitionLine(input: {lineId: string; targetStatus: OrderLineTarget; correlationId: string}): Promise<OrderTransition>;
  listHistory(input: {orderId: string; limit?: number}): Promise<OrderHistory>;
}
export class OrderOperationsGatewayError extends Error { readonly code: string; }
export function createOrderOperationsGateway(input: {send: OrderOperationsSender}): OrderOperationsGateway;
