export type TableOrderingState = 'open' | 'paused' | 'closed';
export type TableReadinessState = 'EN_PREPARACION' | 'LISTA' | 'BLOQUEADA';

export type AdminTable = Readonly<{
  id: string;
  number: number;
  capacity: number;
  description: string | null;
  orderingState: TableOrderingState;
  readinessState?: TableReadinessState;
  pauseUntil?: string | null;
  qrVersion?: number;
  qrEnabled?: boolean;
  revision?: number;
}>;

export type TableManagementPermissions=Readonly<{
  configure:boolean;
  qr:boolean;
  readiness:boolean;
  occupancy:boolean;
}>;

export type AdminTablesPage = Readonly<{
  version: 1 | 2;
  items: readonly AdminTable[];
  nextAfterNumber: number | null;
  permissions:TableManagementPermissions|null;
}>;

export type AdminTablesPageRequest = Readonly<{
  afterNumber: number;
  limit: number;
  signal?: AbortSignal;
}>;

export type AdminTablesGateway = Readonly<{
  listTables(request: AdminTablesPageRequest): Promise<unknown>;
  manageTable?(request: Readonly<{requestId:string;operation:'create'|'update'|'readiness'|'qr_rotate'|'qr_revoke';payload:Readonly<Record<string,unknown>>;signal?:AbortSignal}>): Promise<unknown>;
  transitionOccupancy?(request: Readonly<{requestId:string;tableId:string;target:TableOrderingState;pauseUntil:string|null;signal?:AbortSignal}>): Promise<unknown>;
}>;

export const TABLE_PAGE_SIZE: number;
export const TABLE_ORDERING_STATES: readonly TableOrderingState[];
export const TABLE_READINESS_STATES: readonly TableReadinessState[];
export function validateAdminTablesPage(payload: unknown, request?: Partial<AdminTablesPageRequest>): AdminTablesPage;
export function loadAdminTablesPage(gateway: AdminTablesGateway, request?: Partial<AdminTablesPageRequest>): Promise<AdminTablesPage>;
export function mergeAdminTables(currentItems: readonly AdminTable[], nextItems: readonly AdminTable[]): readonly AdminTable[];
