import type {OrderBoard, OrderHistory, OrderLineStatus, OrderLineTarget, OrderTransition} from './order-operations-model.js';
export type OrderOperationsSender = (path: string, init: RequestInit) => Promise<Response>;
export type H6OperationEvent = Readonly<{id: number; type: string; payload: Readonly<Record<string, unknown>>; createdAt: string}>;
export type EconomicSettlement=Readonly<{intentId:string;channel:'stripe'|'external';
 state:string;allocatedCents:number;providerConfirmed:boolean;externalVerified:boolean}>;
export type EconomicAccount=Readonly<{accountId:string;tableId:string;sessionId:string;customerCode:string;customerAlias:string;
 paymentTiming:'pay_now'|'pay_at_end'|null;grossConsumptionCents:number;cancelledCents:number;
 netConsumptionCents:number;stripeCapturedCents:number;stripeRefundedCents:number;stripeNetCents:number;
 outstandingCents:number;operationalState:string;settlementIntentId:string|null;
 settlementChannel:'stripe'|'external'|null;settlementState:string|null;
 providerConfirmed:boolean;externalVerified:boolean;settlements:readonly EconomicSettlement[]}>;
export type EconomicAccountSnapshot=Readonly<{version:2;notice:string;items:readonly EconomicAccount[]}>;
export type PendingWaiterCall=Readonly<{id:string;tableNumber:number;createdAt:string}>;
export interface OrderOperationsGateway {
 listWaiterCalls?():Promise<readonly PendingWaiterCall[]>;
 attendWaiterCall?(input:{callId:string;requestId:string}):Promise<Readonly<Record<string,unknown>>>;
 listEconomicAccounts():Promise<EconomicAccountSnapshot>;
 verifyExternalSettlement(input:{intentId:string;correlationId:string}):Promise<Readonly<Record<string,unknown>>>;
 closeEconomicTable(input:{tableId:string;sessionId:string;correlationId:string}):Promise<Readonly<Record<string,unknown>>>;
 closeOperationalAccount(input:{accountId:string;correlationId:string}):Promise<Readonly<Record<string,unknown>>>;
  listBoard(input?: {status?: OrderLineStatus | null; limit?: number; cursor?: OrderBoard['nextCursor']}): Promise<OrderBoard>;
  transitionLine(input: {lineId: string; targetStatus: OrderLineTarget; correlationId: string}): Promise<OrderTransition>;
  listHistory(input: {orderId: string; limit?: number}): Promise<OrderHistory>;
  acknowledgeDispatch(input: {dispatchId: string; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  reportIncident(input: {roundId: string; lineId: string | null; origin: 'kitchen' | 'waiter_customer' | 'waiter_restaurant'; reason: string; affectedCents: number; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  resolveIncident(input: {incidentId: string; resolution: 'approve' | 'reject'; reason: string; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  setCatalogSoldOut(input: {itemId: string; soldOut: boolean; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  claimPickup(input: {lineId: string; expectedVersion: number; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  cancelPickup(input: {lineId: string; expectedVersion: number; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  correctReady(input: {lineId: string; expectedVersion: number; correlationId: string}): Promise<Readonly<Record<string, unknown>>>;
  subscribeEvents(input: {onEvent: (event: H6OperationEvent) => void; onResync: () => void;
    onUnavailable: (reason?: 'access-revoked' | 'transport') => void; onReconnected?:()=>void}): () => void;
}
export class OrderOperationsGatewayError extends Error { readonly code: string; readonly details: unknown; }
export function createOrderOperationsGateway(input: {send: OrderOperationsSender; reconnectDelayMs?: number}): OrderOperationsGateway;
