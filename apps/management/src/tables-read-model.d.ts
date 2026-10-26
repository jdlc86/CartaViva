export type TableOrderingState = 'open' | 'paused' | 'closed';

export type AdminTable = Readonly<{
  id: string;
  number: number;
  capacity: number;
  description: string | null;
  orderingState: TableOrderingState;
}>;

export type AdminTablesPage = Readonly<{
  version: 1;
  items: readonly AdminTable[];
  nextAfterNumber: number | null;
}>;

export type AdminTablesPageRequest = Readonly<{
  afterNumber: number;
  limit: number;
  signal?: AbortSignal;
}>;

export type AdminTablesGateway = Readonly<{
  listTables(request: AdminTablesPageRequest): Promise<unknown>;
}>;

export const TABLE_PAGE_SIZE: number;
export const TABLE_ORDERING_STATES: readonly TableOrderingState[];
export function validateAdminTablesPage(payload: unknown, request?: Partial<AdminTablesPageRequest>): AdminTablesPage;
export function loadAdminTablesPage(gateway: AdminTablesGateway, request?: Partial<AdminTablesPageRequest>): Promise<AdminTablesPage>;
export function mergeAdminTables(currentItems: readonly AdminTable[], nextItems: readonly AdminTable[]): readonly AdminTable[];
