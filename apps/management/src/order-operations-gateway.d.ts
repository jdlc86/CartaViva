import type {OrderBoard, OrderHistory, OrderLineStatus, OrderLineTarget, OrderTransition} from './order-operations-model.js';
export type OrderOperationsSender = (path: string, init: RequestInit) => Promise<Response>;
export type H6OperationEvent = Readonly<{id: number; type: string; payload: Readonly<Record<string, unknown>>; createdAt: string}>;
export interface OrderOperationsGateway {
  listBoard(input?: {status?: OrderLineStatus | null; limit?: number}): Promise<OrderBoard>;
  transitionLine(input: {lineId: string; targetStatus: OrderLineTarget; correlationId: string}): Promise<OrderTransition>;
  listHistory(input: {orderId: string; limit?: number}): Promise<OrderHistory>;
  acknowledgeDispatch(input: {dispatchId: string; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  reportIncident(input: {roundId: string; lineId: string | null; origin: 'kitchen' | 'waiter_customer' | 'waiter_restaurant'; reason: string; affectedCents: number; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  resolveIncident(input: {incidentId: string; resolution: 'approve' | 'reject'; reason: string; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  settleCash(input: {accountId: string; amountCents: number; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  refundCash(input: {incidentId: string; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  claimPickup(input: {lineId: string; expectedVersion: number; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  cancelPickup(input: {lineId: string; expectedVersion: number; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  correctReady(input: {lineId: string; expectedVersion: number; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  subscribeEvents(input: {onEvent: (event: H6OperationEvent) => void; onResync: () => void; onUnavailable: () => void}): () => void;
}
export class OrderOperationsGatewayError extends Error { readonly code: string; readonly details: unknown; }
export function createOrderOperationsGateway(input: {send: OrderOperationsSender; reconnectDelayMs?: number}): OrderOperationsGateway;
